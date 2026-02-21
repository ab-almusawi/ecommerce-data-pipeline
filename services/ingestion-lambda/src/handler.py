"""
AWS Lambda handler for product data ingestion.
Triggered by S3 upload events, processes JSON and publishes to EventBridge.

This module implements production-grade error handling, retry logic,
and comprehensive logging for enterprise reliability.
"""

import json
import os
import time
import uuid
from datetime import datetime
from typing import Any, Optional

import boto3
from botocore.config import Config

from exceptions import (
    AWSServiceError,
    ConfigurationError,
    ErrorContext,
    EventBridgeError,
    IngestionError,
    S3Error,
)
from logging_config import (
    configure_logging,
    get_correlation_id,
    set_batch_id,
    set_correlation_id,
)
from retry import RetryConfig, retry_with_backoff
from transformer import ProductTransformer, TransformationResult

logger = configure_logging(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    service_name="ingestion-lambda",
)

EVENT_BUS_NAME = os.environ.get("EVENT_BUS_NAME", "product-events")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
LOCALSTACK_ENDPOINT = os.environ.get("LOCALSTACK_ENDPOINT")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "10"))

boto_config = Config(
    retries={"max_attempts": 3, "mode": "adaptive"},
    connect_timeout=10,
    read_timeout=60,
)


class AWSClientFactory:
    """Factory for creating AWS clients with proper configuration."""
    
    _s3_client = None
    _eventbridge_client = None

    @classmethod
    def get_s3_client(cls):
        """Get or create S3 client."""
        if cls._s3_client is None:
            kwargs = {"config": boto_config, "region_name": AWS_REGION}
            if LOCALSTACK_ENDPOINT:
                kwargs["endpoint_url"] = LOCALSTACK_ENDPOINT
            cls._s3_client = boto3.client("s3", **kwargs)
        return cls._s3_client

    @classmethod
    def get_eventbridge_client(cls):
        """Get or create EventBridge client."""
        if cls._eventbridge_client is None:
            kwargs = {"config": boto_config, "region_name": AWS_REGION}
            if LOCALSTACK_ENDPOINT:
                kwargs["endpoint_url"] = LOCALSTACK_ENDPOINT
            cls._eventbridge_client = boto3.client("events", **kwargs)
        return cls._eventbridge_client

    @classmethod
    def reset(cls):
        """Reset clients (useful for testing)."""
        cls._s3_client = None
        cls._eventbridge_client = None


@retry_with_backoff(
    max_attempts=3,
    base_delay=1.0,
    retryable_exceptions=(Exception,),
)
def download_from_s3(bucket: str, key: str) -> str:
    """
    Download file content from S3 with retry logic.
    
    Args:
        bucket: S3 bucket name
        key: Object key
        
    Returns:
        File content as string
        
    Raises:
        S3Error: If download fails after retries
    """
    try:
        s3 = AWSClientFactory.get_s3_client()
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response["Body"].read().decode("utf-8")
        
        logger.info(
            f"Downloaded {len(content)} bytes from S3",
            extra={"s3_bucket": bucket, "s3_key": key},
        )
        return content
    except Exception as e:
        raise S3Error(
            message=f"Failed to download from S3: {e}",
            bucket=bucket,
            key=key,
            original_exception=e,
        )


class EventPublisher:
    """Publishes events to EventBridge with batching and error handling."""

    def __init__(self, event_bus_name: str = EVENT_BUS_NAME):
        self.event_bus_name = event_bus_name
        self.eventbridge = AWSClientFactory.get_eventbridge_client()
        self.published_count = 0
        self.failed_count = 0

    @retry_with_backoff(
        max_attempts=3,
        base_delay=0.5,
        max_delay=10.0,
    )
    def _put_events(self, entries: list[dict]) -> dict:
        """Put events to EventBridge with retry."""
        return self.eventbridge.put_events(Entries=entries)

    def publish_products(
        self,
        products: list,
        batch_id: str,
        source_bucket: str,
        source_key: str,
    ) -> dict:
        """
        Publish products to EventBridge in batches.
        
        Args:
            products: List of CanonicalProduct objects
            batch_id: Unique batch identifier
            source_bucket: Source S3 bucket
            source_key: Source S3 key
            
        Returns:
            Publishing statistics
        """
        total_products = len(products)
        self.published_count = 0
        self.failed_count = 0

        for i in range(0, total_products, BATCH_SIZE):
            batch = products[i:i + BATCH_SIZE]
            self._publish_batch(
                batch,
                batch_id=batch_id,
                source_bucket=source_bucket,
                source_key=source_key,
                batch_start_index=i,
                total_products=total_products,
            )

        logger.info(
            f"Event publishing complete",
            extra={
                "metrics": {
                    "published": self.published_count,
                    "failed": self.failed_count,
                    "total": total_products,
                }
            },
        )

        return {
            "published": self.published_count,
            "failed": self.failed_count,
            "total": total_products,
        }

    def _publish_batch(
        self,
        products: list,
        batch_id: str,
        source_bucket: str,
        source_key: str,
        batch_start_index: int,
        total_products: int,
    ) -> None:
        """Publish a batch of products (max 10 per EventBridge call)."""
        entries = []

        for idx, product in enumerate(products):
            event_detail = {
                "eventId": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "correlationId": get_correlation_id(),
                "product": product.to_event_detail(),
                "metadata": {
                    "s3Bucket": source_bucket,
                    "s3Key": source_key,
                    "batchId": batch_id,
                    "itemIndex": batch_start_index + idx,
                    "totalItems": total_products,
                },
            }

            entries.append({
                "Source": "com.challenge.ingestion",
                "DetailType": "ProductIngested",
                "Detail": json.dumps(event_detail, default=str),
                "EventBusName": self.event_bus_name,
            })

        try:
            response = self._put_events(entries)
            failed = response.get("FailedEntryCount", 0)
            
            self.published_count += len(entries) - failed
            self.failed_count += failed

            if failed > 0:
                logger.warning(
                    f"Failed to publish {failed} events in batch",
                    extra={
                        "failed_entries": [
                            e for e in response.get("Entries", [])
                            if e.get("ErrorCode")
                        ]
                    },
                )
        except Exception as e:
            self.failed_count += len(entries)
            logger.error(f"Batch publish failed: {e}")
            raise EventBridgeError(
                message=f"Failed to publish batch: {e}",
                event_bus=self.event_bus_name,
                failed_count=len(entries),
                original_exception=e,
            )


def handler(event: dict, context: Any) -> dict:
    """
    Main Lambda handler for S3 trigger.
    
    This handler implements:
    - Correlation ID tracking for distributed tracing
    - Structured logging for observability
    - Comprehensive error handling
    - Graceful degradation on partial failures
    
    Args:
        event: S3 event notification
        context: Lambda context
        
    Returns:
        Processing result summary
    """
    start_time = time.perf_counter()
    
    correlation_id = set_correlation_id()
    batch_id = str(uuid.uuid4())
    set_batch_id(batch_id)

    logger.info(
        "Lambda invocation started",
        extra={
            "event_type": "lambda_start",
            "aws_request_id": getattr(context, "aws_request_id", None) if context else None,
        },
    )

    try:
        if "Records" not in event or not event["Records"]:
            raise ConfigurationError(
                message="Invalid event structure: missing Records",
                config_key="event.Records",
            )

        s3_record = event["Records"][0]["s3"]
        bucket = s3_record["bucket"]["name"]
        key = s3_record["object"]["key"]

        logger.info(
            f"Processing S3 object",
            extra={"s3_bucket": bucket, "s3_key": key},
        )

        raw_data = download_from_s3(bucket, key)
        
        try:
            products = json.loads(raw_data)
        except json.JSONDecodeError as e:
            raise ConfigurationError(
                message=f"Invalid JSON in S3 object: {e}",
                config_key=f"s3://{bucket}/{key}",
            )

        if not isinstance(products, list):
            products = [products]

        logger.info(
            f"Loaded {len(products)} products from S3",
            extra={"metrics": {"raw_product_count": len(products)}},
        )

        transformer = ProductTransformer(correlation_id=correlation_id)
        result = transformer.transform_batch(products)

        if result.success_count == 0:
            logger.warning("No products successfully transformed")
            return build_response(
                200,
                {
                    "message": "No valid products to process",
                    "correlationId": correlation_id,
                    "batchId": batch_id,
                    "transformation": result.to_dict(),
                },
                start_time,
            )

        publisher = EventPublisher()
        publish_result = publisher.publish_products(
            products=result.successful,
            batch_id=batch_id,
            source_bucket=bucket,
            source_key=key,
        )

        return build_response(
            200,
            {
                "message": "Processing complete",
                "correlationId": correlation_id,
                "batchId": batch_id,
                "source": {"bucket": bucket, "key": key},
                "transformation": result.to_dict(),
                "publishing": publish_result,
            },
            start_time,
        )

    except IngestionError as e:
        logger.error(
            f"Ingestion error: {e.message}",
            extra={"error": e.to_dict()},
        )
        return build_response(
            500 if e.retryable else 400,
            {
                "error": e.to_dict(),
                "correlationId": correlation_id,
                "batchId": batch_id,
            },
            start_time,
        )

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return build_response(
            500,
            {
                "error": {"type": type(e).__name__, "message": str(e)},
                "correlationId": correlation_id,
                "batchId": batch_id,
            },
            start_time,
        )


def build_response(status_code: int, body: dict, start_time: float) -> dict:
    """Build Lambda response with timing metadata."""
    duration_ms = (time.perf_counter() - start_time) * 1000
    
    body["durationMs"] = round(duration_ms, 2)
    
    logger.info(
        "Lambda invocation complete",
        extra={
            "event_type": "lambda_complete",
            "status_code": status_code,
            "duration_ms": round(duration_ms, 2),
        },
    )

    return {
        "statusCode": status_code,
        "body": body,
    }


def step_function_handler(event: dict, context: Any) -> dict:
    """
    Handler for Step Functions state machine.
    Provides granular control for orchestrated workflows.
    """
    correlation_id = event.get("correlationId") or set_correlation_id()
    task_type = event.get("taskType", "transform")

    logger.info(
        f"Step Function task: {task_type}",
        extra={"task_type": task_type},
    )

    try:
        if task_type == "validate":
            return validate_input(event)
        elif task_type == "transform":
            return transform_products(event, correlation_id)
        elif task_type == "publish":
            return publish_batch(event)
        else:
            raise ConfigurationError(
                message=f"Unknown task type: {task_type}",
                config_key="taskType",
            )
    except IngestionError as e:
        return {"error": e.to_dict(), "success": False}
    except Exception as e:
        return {
            "error": {"type": type(e).__name__, "message": str(e)},
            "success": False,
        }


def validate_input(event: dict) -> dict:
    """Validate input JSON structure."""
    products = event.get("products", [])

    if not products:
        return {"valid": False, "reason": "No products provided", "products": []}

    valid_count = 0
    invalid_count = 0

    for product in products:
        if (
            product.get("code") == "0"
            and product.get("info", {}).get("productInfo", {}).get("goods_id")
        ):
            valid_count += 1
        else:
            invalid_count += 1

    return {
        "valid": valid_count > 0,
        "validCount": valid_count,
        "invalidCount": invalid_count,
        "products": products,
    }


def transform_products(event: dict, correlation_id: str) -> dict:
    """Transform products to canonical format."""
    products = event.get("products", [])
    transformer = ProductTransformer(correlation_id=correlation_id)

    result = transformer.transform_batch(products)

    return {
        "canonicalProducts": [p.to_event_detail() for p in result.successful],
        "transformedCount": result.success_count,
        "errorCount": result.failure_count,
        "warnings": result.warnings,
        "success": True,
    }


def publish_batch(event: dict) -> dict:
    """Publish a batch of canonical products to EventBridge."""
    from models import CanonicalProduct

    products_data = event.get("canonicalProducts", [])
    batch_id = event.get("batchId", str(uuid.uuid4()))
    set_batch_id(batch_id)

    products = []
    for p in products_data:
        try:
            products.append(CanonicalProduct.model_validate(p))
        except Exception as e:
            logger.warning(f"Failed to validate product: {e}")

    if not products:
        return {"published": 0, "batchId": batch_id, "success": True}

    publisher = EventPublisher()
    result = publisher.publish_products(
        products=products,
        batch_id=batch_id,
        source_bucket=event.get("sourceBucket", "unknown"),
        source_key=event.get("sourceKey", "unknown"),
    )

    return {**result, "batchId": batch_id, "success": True}
