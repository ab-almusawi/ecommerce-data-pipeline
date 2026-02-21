"""
Structured logging configuration with correlation ID support.
Provides JSON logging format suitable for CloudWatch and log aggregation.
"""

import json
import logging
import os
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime
from typing import Any, Optional

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")
batch_id_var: ContextVar[str] = ContextVar("batch_id", default="")


def generate_correlation_id() -> str:
    """Generate a new correlation ID."""
    return str(uuid.uuid4())


def set_correlation_id(correlation_id: Optional[str] = None) -> str:
    """Set correlation ID for the current context."""
    cid = correlation_id or generate_correlation_id()
    correlation_id_var.set(cid)
    return cid


def get_correlation_id() -> str:
    """Get correlation ID for the current context."""
    return correlation_id_var.get()


def set_batch_id(batch_id: str) -> None:
    """Set batch ID for the current context."""
    batch_id_var.set(batch_id)


def get_batch_id() -> str:
    """Get batch ID for the current context."""
    return batch_id_var.get()


class StructuredJsonFormatter(logging.Formatter):
    """
    JSON formatter for structured logging.
    Outputs logs in a format suitable for CloudWatch Logs Insights and log aggregation.
    """

    def __init__(self, service_name: str = "ingestion-lambda"):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service_name,
            "correlation_id": get_correlation_id(),
            "batch_id": get_batch_id(),
        }

        if record.funcName:
            log_data["function"] = record.funcName
        if record.lineno:
            log_data["line"] = record.lineno

        if hasattr(record, "product_id"):
            log_data["product_id"] = record.product_id
        if hasattr(record, "event_id"):
            log_data["event_id"] = record.event_id
        if hasattr(record, "s3_bucket"):
            log_data["s3_bucket"] = record.s3_bucket
        if hasattr(record, "s3_key"):
            log_data["s3_key"] = record.s3_key

        if hasattr(record, "extra_data") and isinstance(record.extra_data, dict):
            log_data["data"] = record.extra_data

        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "message": str(record.exc_info[1]) if record.exc_info[1] else None,
            }

        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms
        if hasattr(record, "metrics"):
            log_data["metrics"] = record.metrics

        return json.dumps(log_data, default=str)


class ContextualLogger(logging.LoggerAdapter):
    """
    Logger adapter that automatically includes contextual information.
    """

    def process(self, msg, kwargs):
        extra = kwargs.get("extra", {})
        extra["correlation_id"] = get_correlation_id()
        extra["batch_id"] = get_batch_id()
        kwargs["extra"] = extra
        return msg, kwargs

    def with_product(self, product_id: str) -> "ContextualLogger":
        """Return a logger bound to a specific product."""
        return ProductLogger(self.logger, {"product_id": product_id})


class ProductLogger(logging.LoggerAdapter):
    """Logger adapter bound to a specific product."""

    def process(self, msg, kwargs):
        extra = kwargs.get("extra", {})
        extra.update(self.extra)
        extra["correlation_id"] = get_correlation_id()
        extra["batch_id"] = get_batch_id()
        kwargs["extra"] = extra
        return msg, kwargs


def configure_logging(
    level: str = "INFO",
    service_name: str = "ingestion-lambda",
) -> ContextualLogger:
    """
    Configure structured logging for Lambda.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        service_name: Name of the service for log identification
        
    Returns:
        Configured contextual logger
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        handler.setFormatter(StructuredJsonFormatter(service_name))
    else:
        handler.setFormatter(
            logging.Formatter(
                "[%(levelname)s] %(asctime)s - %(name)s - %(message)s"
            )
        )
    
    root_logger.addHandler(handler)
    
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    return ContextualLogger(root_logger, {})


class LogContext:
    """
    Context manager for adding temporary logging context.
    
    Example:
        with LogContext(product_id="123", operation="transform"):
            logger.info("Processing product")
    """

    def __init__(self, **context):
        self.context = context
        self.previous_correlation_id = None

    def __enter__(self):
        if "correlation_id" in self.context:
            self.previous_correlation_id = get_correlation_id()
            set_correlation_id(self.context["correlation_id"])
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.previous_correlation_id is not None:
            set_correlation_id(self.previous_correlation_id)
        return False


def log_execution_time(logger: logging.Logger):
    """
    Decorator to log function execution time.
    
    Example:
        @log_execution_time(logger)
        def process_product(product):
            ...
    """
    import functools
    import time

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.info(
                    f"{func.__name__} completed",
                    extra={"duration_ms": round(duration_ms, 2)},
                )
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.error(
                    f"{func.__name__} failed after {duration_ms:.2f}ms: {e}",
                    extra={"duration_ms": round(duration_ms, 2)},
                    exc_info=True,
                )
                raise
        return wrapper
    return decorator
