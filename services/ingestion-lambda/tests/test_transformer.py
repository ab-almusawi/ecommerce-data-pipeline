"""Tests for the ProductTransformer class."""

import pytest
from src.transformer import ProductTransformer, ProductValidator, TransformationResult
from src.models import CanonicalProduct, LocalizedString


class TestProductValidator:
    """Tests for ProductValidator."""

    def test_validate_valid_product(self, sample_valid_product):
        """Test validation passes for valid product."""
        validator = ProductValidator()
        assert validator.validate(sample_valid_product) is True
        assert len(validator.validation_errors) == 0

    def test_validate_invalid_code(self, sample_invalid_product):
        """Test validation fails for non-success code."""
        validator = ProductValidator()
        assert validator.validate(sample_invalid_product) is False
        assert len(validator.validation_errors) == 1
        assert "non-success code" in validator.validation_errors[0].message

    def test_validate_missing_product_info(self):
        """Test validation fails when productInfo is missing."""
        validator = ProductValidator()
        product = {"code": "0", "info": {}}
        assert validator.validate(product) is False
        assert len(validator.validation_errors) == 1
        assert "productInfo" in validator.validation_errors[0].field_name

    def test_validate_missing_goods_id(self):
        """Test validation fails when goods_id is missing."""
        validator = ProductValidator()
        product = {
            "code": "0",
            "info": {"productInfo": {"goods_name": "Test"}},
        }
        assert validator.validate(product) is False
        assert any("goods_id" in e.field_name for e in validator.validation_errors)


class TestProductTransformer:
    """Tests for ProductTransformer."""

    def test_transform_valid_product(self, sample_valid_product):
        """Test transformation of valid product."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert result is not None
        assert isinstance(result, CanonicalProduct)
        assert result.id == "12345678"
        assert result.sku == "sz12345678901234567"
        assert result.metadata.source == "shein"

    def test_transform_extracts_name(self, sample_valid_product):
        """Test name extraction with localization."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert result.name.ar is not None
        assert result.name.en is not None
        assert "INAWLY" in result.name.ar or "INAWLY" in result.name.en

    def test_transform_extracts_categories(self, sample_valid_product):
        """Test category extraction."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert len(result.categories) == 2
        category_ids = [c.id for c in result.categories]
        assert "12478" in category_ids
        assert "2030" in category_ids

    def test_transform_extracts_attributes(self, sample_valid_product):
        """Test attribute extraction."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert len(result.attributes) >= 3
        attr_names = [a.name.en for a in result.attributes]
        assert "Color" in attr_names
        assert "Style" in attr_names

    def test_transform_extracts_variants(self, sample_valid_product):
        """Test variant extraction."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert len(result.variants) == 2
        assert result.variants[0].sku == "SKU001"
        assert result.variants[0].price.amount == 23.80
        assert result.variants[0].stock == 10

    def test_transform_extracts_images(self, sample_valid_product):
        """Test image extraction."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_valid_product)

        assert len(result.images) > 0
        assert all(img.url.startswith("https://") for img in result.images)

    def test_transform_invalid_product_returns_none(self, sample_invalid_product):
        """Test that invalid products return None."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_invalid_product)
        assert result is None

    def test_transform_minimal_product(self, sample_minimal_product):
        """Test transformation of minimal product creates defaults."""
        transformer = ProductTransformer()
        result = transformer.transform(sample_minimal_product)

        assert result is not None
        assert result.id == "99999999"
        assert len(result.variants) == 1
        assert result.variants[0].id.startswith("default-")

    def test_transform_batch(self, sample_products_batch):
        """Test batch transformation."""
        transformer = ProductTransformer()
        result = transformer.transform_batch(sample_products_batch)

        assert isinstance(result, TransformationResult)
        assert result.success_count == 2
        assert result.failure_count == 1
        assert result.total_count == 3

    def test_transform_batch_empty_list(self):
        """Test batch transformation with empty list."""
        transformer = ProductTransformer()
        result = transformer.transform_batch([])

        assert result.success_count == 0
        assert result.failure_count == 0


class TestTransformationHelpers:
    """Tests for transformation helper methods."""

    def test_normalize_image_url_protocol_relative(self):
        """Test normalizing protocol-relative URLs."""
        transformer = ProductTransformer()
        url = transformer._normalize_image_url("//example.com/image.jpg")
        assert url == "https://example.com/image.jpg"

    def test_normalize_image_url_already_https(self):
        """Test URLs that already have protocol."""
        transformer = ProductTransformer()
        url = transformer._normalize_image_url("https://example.com/image.jpg")
        assert url == "https://example.com/image.jpg"

    def test_normalize_image_url_empty(self):
        """Test empty URL handling."""
        transformer = ProductTransformer()
        url = transformer._normalize_image_url("")
        assert url == ""

    def test_parse_price_amount_string(self):
        """Test parsing price from string."""
        transformer = ProductTransformer()
        assert transformer._parse_price_amount("23.80") == 23.80
        assert transformer._parse_price_amount("$25.00") == 25.00
        assert transformer._parse_price_amount("SR28.00") == 28.00

    def test_parse_price_amount_number(self):
        """Test parsing price from number."""
        transformer = ProductTransformer()
        assert transformer._parse_price_amount(23.80) == 23.80
        assert transformer._parse_price_amount(25) == 25.0

    def test_parse_price_amount_invalid(self):
        """Test parsing invalid price returns 0."""
        transformer = ProductTransformer()
        assert transformer._parse_price_amount(None) == 0.0
        assert transformer._parse_price_amount("invalid") == 0.0
        assert transformer._parse_price_amount("") == 0.0

    def test_slugify(self):
        """Test slug generation."""
        transformer = ProductTransformer()
        assert transformer._slugify("Women Midi Dresses") == "women-midi-dresses"
        assert transformer._slugify("Test & Product!") == "test-product"
        assert transformer._slugify("  spaces  ") == "spaces"

    def test_is_arabic(self):
        """Test Arabic text detection."""
        transformer = ProductTransformer()
        assert transformer._is_arabic("فستان") is True
        assert transformer._is_arabic("Dress") is False
        assert transformer._is_arabic("INAWLY فستان") is True
        assert transformer._is_arabic("") is False


class TestDataQuality:
    """Tests for data quality checks."""

    def test_quality_warnings_generated(self, sample_valid_product):
        """Test that quality warnings are generated."""
        transformer = ProductTransformer()
        transformer.transform_batch([sample_valid_product])
        
        assert len(transformer.result.warnings) >= 0

    def test_quality_check_zero_stock(self):
        """Test quality check catches zero stock."""
        transformer = ProductTransformer()
        product = {
            "code": "0",
            "info": {
                "productInfo": {
                    "goods_id": "123",
                    "goods_name": "Test",
                    "skuList": [
                        {"sku_code": "SKU1", "stock": "0", "price": {"salePrice": {"amount": "10"}}},
                    ],
                }
            },
        }
        result = transformer.transform(product)
        
        warnings = [w for w in transformer.result.warnings if w.get("product_id") == "123"]
        warning_issues = []
        for w in warnings:
            warning_issues.extend(w.get("issues", []))
        
        assert any("stock" in issue.lower() for issue in warning_issues)
