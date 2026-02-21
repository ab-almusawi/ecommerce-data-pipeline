"""
Product Ingestion Lambda - AWS Serverless data processing.

This module provides production-grade data ingestion capabilities
for transforming raw e-commerce product data into canonical format
and publishing to EventBridge for downstream processing.
"""

from exceptions import (
    AWSServiceError,
    ConfigurationError,
    DataQualityError,
    EventBridgeError,
    IngestionError,
    S3Error,
    TransformationError,
    ValidationError,
)
from handler import handler, step_function_handler
from models import CanonicalProduct
from transformer import ProductTransformer, TransformationResult

__all__ = [
    "handler",
    "step_function_handler",
    "CanonicalProduct",
    "ProductTransformer",
    "TransformationResult",
    "IngestionError",
    "ValidationError",
    "TransformationError",
    "DataQualityError",
    "AWSServiceError",
    "S3Error",
    "EventBridgeError",
    "ConfigurationError",
]

__version__ = "1.0.0"
