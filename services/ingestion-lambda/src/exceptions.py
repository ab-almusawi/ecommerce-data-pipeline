"""
Custom exceptions for the product ingestion pipeline.
Provides structured error handling with rich context for debugging and monitoring.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from enum import Enum


class ErrorSeverity(Enum):
    """Severity levels for errors."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ErrorCategory(Enum):
    """Categories of errors for routing and handling."""
    VALIDATION = "validation"
    TRANSFORMATION = "transformation"
    NETWORK = "network"
    AWS_SERVICE = "aws_service"
    CONFIGURATION = "configuration"
    DATA_QUALITY = "data_quality"


@dataclass
class ErrorContext:
    """Rich context for error tracking and debugging."""
    correlation_id: Optional[str] = None
    product_id: Optional[str] = None
    field_name: Optional[str] = None
    expected_type: Optional[str] = None
    actual_value: Optional[Any] = None
    batch_id: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_key: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    additional_data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert context to dictionary for logging."""
        return {
            "correlation_id": self.correlation_id,
            "product_id": self.product_id,
            "field_name": self.field_name,
            "expected_type": self.expected_type,
            "actual_value": str(self.actual_value) if self.actual_value else None,
            "batch_id": self.batch_id,
            "s3_bucket": self.s3_bucket,
            "s3_key": self.s3_key,
            "timestamp": self.timestamp,
            **self.additional_data,
        }


class IngestionError(Exception):
    """Base exception for all ingestion pipeline errors."""

    def __init__(
        self,
        message: str,
        context: Optional[ErrorContext] = None,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        category: ErrorCategory = ErrorCategory.TRANSFORMATION,
        retryable: bool = False,
        original_exception: Optional[Exception] = None,
    ):
        super().__init__(message)
        self.message = message
        self.context = context or ErrorContext()
        self.severity = severity
        self.category = category
        self.retryable = retryable
        self.original_exception = original_exception

    def to_dict(self) -> dict:
        """Serialize exception for logging and monitoring."""
        return {
            "error_type": self.__class__.__name__,
            "message": self.message,
            "severity": self.severity.value,
            "category": self.category.value,
            "retryable": self.retryable,
            "context": self.context.to_dict(),
            "original_exception": str(self.original_exception) if self.original_exception else None,
        }


class ValidationError(IngestionError):
    """Raised when input data fails validation."""

    def __init__(
        self,
        message: str,
        field_name: str,
        expected: str,
        actual: Any,
        context: Optional[ErrorContext] = None,
    ):
        ctx = context or ErrorContext()
        ctx.field_name = field_name
        ctx.expected_type = expected
        ctx.actual_value = actual
        
        super().__init__(
            message=message,
            context=ctx,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.VALIDATION,
            retryable=False,
        )
        self.field_name = field_name
        self.expected = expected
        self.actual = actual


class TransformationError(IngestionError):
    """Raised when data transformation fails."""

    def __init__(
        self,
        message: str,
        product_id: str,
        field_name: Optional[str] = None,
        context: Optional[ErrorContext] = None,
        original_exception: Optional[Exception] = None,
    ):
        ctx = context or ErrorContext()
        ctx.product_id = product_id
        ctx.field_name = field_name
        
        super().__init__(
            message=message,
            context=ctx,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.TRANSFORMATION,
            retryable=False,
            original_exception=original_exception,
        )


class DataQualityError(IngestionError):
    """Raised when data quality issues are detected."""

    def __init__(
        self,
        message: str,
        product_id: str,
        issues: list[str],
        context: Optional[ErrorContext] = None,
    ):
        ctx = context or ErrorContext()
        ctx.product_id = product_id
        ctx.additional_data["quality_issues"] = issues
        
        super().__init__(
            message=message,
            context=ctx,
            severity=ErrorSeverity.LOW,
            category=ErrorCategory.DATA_QUALITY,
            retryable=False,
        )
        self.issues = issues


class AWSServiceError(IngestionError):
    """Raised when AWS service calls fail."""

    def __init__(
        self,
        message: str,
        service_name: str,
        operation: str,
        context: Optional[ErrorContext] = None,
        original_exception: Optional[Exception] = None,
    ):
        ctx = context or ErrorContext()
        ctx.additional_data["aws_service"] = service_name
        ctx.additional_data["operation"] = operation
        
        super().__init__(
            message=message,
            context=ctx,
            severity=ErrorSeverity.HIGH,
            category=ErrorCategory.AWS_SERVICE,
            retryable=True,
            original_exception=original_exception,
        )
        self.service_name = service_name
        self.operation = operation


class S3Error(AWSServiceError):
    """Raised when S3 operations fail."""

    def __init__(
        self,
        message: str,
        bucket: str,
        key: str,
        operation: str = "GetObject",
        context: Optional[ErrorContext] = None,
        original_exception: Optional[Exception] = None,
    ):
        ctx = context or ErrorContext()
        ctx.s3_bucket = bucket
        ctx.s3_key = key
        
        super().__init__(
            message=message,
            service_name="S3",
            operation=operation,
            context=ctx,
            original_exception=original_exception,
        )


class EventBridgeError(AWSServiceError):
    """Raised when EventBridge operations fail."""

    def __init__(
        self,
        message: str,
        event_bus: str,
        failed_count: int = 0,
        context: Optional[ErrorContext] = None,
        original_exception: Optional[Exception] = None,
    ):
        ctx = context or ErrorContext()
        ctx.additional_data["event_bus"] = event_bus
        ctx.additional_data["failed_count"] = failed_count
        
        super().__init__(
            message=message,
            service_name="EventBridge",
            operation="PutEvents",
            context=ctx,
            original_exception=original_exception,
        )


class ConfigurationError(IngestionError):
    """Raised when configuration is invalid or missing."""

    def __init__(
        self,
        message: str,
        config_key: str,
        context: Optional[ErrorContext] = None,
    ):
        ctx = context or ErrorContext()
        ctx.additional_data["config_key"] = config_key
        
        super().__init__(
            message=message,
            context=ctx,
            severity=ErrorSeverity.CRITICAL,
            category=ErrorCategory.CONFIGURATION,
            retryable=False,
        )
        self.config_key = config_key
