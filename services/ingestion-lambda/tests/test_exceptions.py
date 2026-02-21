"""Tests for custom exceptions."""

import pytest
from src.exceptions import (
    ErrorCategory,
    ErrorContext,
    ErrorSeverity,
    EventBridgeError,
    IngestionError,
    S3Error,
    TransformationError,
    ValidationError,
)


class TestErrorContext:
    """Tests for ErrorContext."""

    def test_error_context_defaults(self):
        """Test ErrorContext has sensible defaults."""
        ctx = ErrorContext()
        assert ctx.correlation_id is None
        assert ctx.product_id is None
        assert ctx.timestamp is not None

    def test_error_context_to_dict(self):
        """Test ErrorContext serialization."""
        ctx = ErrorContext(
            correlation_id="test-123",
            product_id="prod-456",
            field_name="price",
        )
        result = ctx.to_dict()

        assert result["correlation_id"] == "test-123"
        assert result["product_id"] == "prod-456"
        assert result["field_name"] == "price"


class TestIngestionError:
    """Tests for IngestionError base class."""

    def test_ingestion_error_creation(self):
        """Test IngestionError can be created."""
        error = IngestionError(
            message="Test error",
            severity=ErrorSeverity.HIGH,
            category=ErrorCategory.TRANSFORMATION,
            retryable=True,
        )

        assert str(error) == "Test error"
        assert error.severity == ErrorSeverity.HIGH
        assert error.category == ErrorCategory.TRANSFORMATION
        assert error.retryable is True

    def test_ingestion_error_to_dict(self):
        """Test IngestionError serialization."""
        error = IngestionError(
            message="Test error",
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.VALIDATION,
        )
        result = error.to_dict()

        assert result["error_type"] == "IngestionError"
        assert result["message"] == "Test error"
        assert result["severity"] == "medium"
        assert result["category"] == "validation"


class TestValidationError:
    """Tests for ValidationError."""

    def test_validation_error_fields(self):
        """Test ValidationError captures field info."""
        error = ValidationError(
            message="Invalid field",
            field_name="price",
            expected="number",
            actual="string",
        )

        assert error.field_name == "price"
        assert error.expected == "number"
        assert error.actual == "string"
        assert error.category == ErrorCategory.VALIDATION
        assert error.retryable is False


class TestTransformationError:
    """Tests for TransformationError."""

    def test_transformation_error_with_product_id(self):
        """Test TransformationError captures product ID."""
        error = TransformationError(
            message="Transform failed",
            product_id="12345",
            field_name="variants",
        )

        assert error.context.product_id == "12345"
        assert error.context.field_name == "variants"


class TestAWSErrors:
    """Tests for AWS-related errors."""

    def test_s3_error(self):
        """Test S3Error captures bucket and key."""
        error = S3Error(
            message="Failed to download",
            bucket="test-bucket",
            key="products.json",
        )

        assert error.context.s3_bucket == "test-bucket"
        assert error.context.s3_key == "products.json"
        assert error.retryable is True

    def test_eventbridge_error(self):
        """Test EventBridgeError captures event bus info."""
        error = EventBridgeError(
            message="Failed to publish",
            event_bus="product-events",
            failed_count=5,
        )

        assert error.context.additional_data["event_bus"] == "product-events"
        assert error.context.additional_data["failed_count"] == 5
