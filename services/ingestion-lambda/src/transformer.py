"""
Transformer module for converting raw SHEIN JSON to canonical product model.
Handles data normalization, validation, and field mapping with comprehensive error handling.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

from exceptions import (
    DataQualityError,
    ErrorContext,
    TransformationError,
    ValidationError,
)
from logging_config import get_correlation_id, log_execution_time
from models import (
    Attribute,
    CanonicalProduct,
    Category,
    Image,
    LocalizedString,
    Price,
    ProductMetadata,
    Variant,
)

logger = logging.getLogger(__name__)


@dataclass
class TransformationResult:
    """Result of a batch transformation operation."""
    successful: list[CanonicalProduct] = field(default_factory=list)
    failed: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)

    @property
    def success_count(self) -> int:
        return len(self.successful)

    @property
    def failure_count(self) -> int:
        return len(self.failed)

    @property
    def total_count(self) -> int:
        return self.success_count + self.failure_count

    def to_dict(self) -> dict:
        return {
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "total_count": self.total_count,
            "failed_product_ids": [f.get("product_id") for f in self.failed],
            "warning_count": len(self.warnings),
        }


class ProductValidator:
    """Validates raw product data before transformation."""

    REQUIRED_FIELDS = ["goods_id"]
    
    def __init__(self):
        self.validation_errors: list[ValidationError] = []

    def validate(self, raw_product: dict) -> bool:
        """
        Validate raw product structure.
        
        Args:
            raw_product: Raw product dictionary
            
        Returns:
            True if valid, False otherwise
        """
        self.validation_errors.clear()

        if raw_product.get("code") != "0":
            self.validation_errors.append(
                ValidationError(
                    message=f"Product has non-success code: {raw_product.get('code')}",
                    field_name="code",
                    expected="0",
                    actual=raw_product.get("code"),
                )
            )
            return False

        info = raw_product.get("info", {})
        product_info = info.get("productInfo", {})

        if not product_info:
            self.validation_errors.append(
                ValidationError(
                    message="Missing productInfo in raw product",
                    field_name="info.productInfo",
                    expected="object",
                    actual=None,
                )
            )
            return False

        for field_name in self.REQUIRED_FIELDS:
            if not product_info.get(field_name):
                self.validation_errors.append(
                    ValidationError(
                        message=f"Missing required field: {field_name}",
                        field_name=field_name,
                        expected="non-empty value",
                        actual=product_info.get(field_name),
                    )
                )

        return len(self.validation_errors) == 0


class ProductTransformer:
    """
    Transforms raw SHEIN product data into canonical format.
    
    Implements defensive coding with comprehensive error handling
    and data quality checks.
    """

    ATTRIBUTE_TYPE_MAP = {
        27: "color",
        90: "size", 
        62: "material",
        101: "style",
        39: "material",
        66: "neckline",
        109: "type",
        128: "occasion",
    }

    def __init__(self, correlation_id: Optional[str] = None):
        self.correlation_id = correlation_id or get_correlation_id()
        self.validator = ProductValidator()
        self.result = TransformationResult()

    @log_execution_time(logger)
    def transform_batch(self, raw_products: list[dict]) -> TransformationResult:
        """
        Transform a batch of raw products.
        
        Args:
            raw_products: List of raw product dictionaries
            
        Returns:
            TransformationResult with successful and failed products
        """
        self.result = TransformationResult()
        
        logger.info(
            f"Starting batch transformation of {len(raw_products)} products",
            extra={"metrics": {"input_count": len(raw_products)}},
        )

        for idx, raw_product in enumerate(raw_products):
            try:
                product = self.transform(raw_product)
                if product:
                    self.result.successful.append(product)
            except TransformationError as e:
                self.result.failed.append({
                    "product_id": e.context.product_id,
                    "error": e.to_dict(),
                    "index": idx,
                })
            except Exception as e:
                product_id = self._extract_product_id(raw_product)
                self.result.failed.append({
                    "product_id": product_id,
                    "error": {"type": type(e).__name__, "message": str(e)},
                    "index": idx,
                })
                logger.error(
                    f"Unexpected error transforming product at index {idx}: {e}",
                    exc_info=True,
                )

        logger.info(
            f"Batch transformation complete",
            extra={
                "metrics": {
                    "success_count": self.result.success_count,
                    "failure_count": self.result.failure_count,
                }
            },
        )

        return self.result

    def transform(self, raw_product: dict) -> Optional[CanonicalProduct]:
        """
        Transform a single raw SHEIN product to canonical format.
        
        Args:
            raw_product: Raw product dict from SHEIN JSON
            
        Returns:
            CanonicalProduct or None if validation fails
            
        Raises:
            TransformationError: If transformation fails
        """
        if not self.validator.validate(raw_product):
            for error in self.validator.validation_errors:
                logger.warning(f"Validation failed: {error.message}")
            return None

        product_info = raw_product["info"]["productInfo"]
        goods_id = str(product_info["goods_id"])
        
        context = ErrorContext(
            correlation_id=self.correlation_id,
            product_id=goods_id,
        )

        try:
            name = self._extract_name(product_info)
            sku = self._extract_sku(product_info)
            categories = self._extract_categories(product_info)
            attributes = self._extract_attributes(product_info)
            variants = self._extract_variants(product_info)
            images = self._extract_images(product_info)
            description = self._extract_description(product_info)

            quality_issues = self._check_data_quality(
                name, sku, variants, images, goods_id
            )
            if quality_issues:
                self.result.warnings.append({
                    "product_id": goods_id,
                    "issues": quality_issues,
                })

            return CanonicalProduct(
                id=goods_id,
                sku=sku,
                name=name,
                description=description,
                categories=categories,
                attributes=attributes,
                variants=variants,
                images=images,
                metadata=ProductMetadata(
                    source="shein",
                    source_id=goods_id,
                    imported_at=datetime.utcnow(),
                    product_relation_id=product_info.get("productRelationID"),
                ),
            )
        except Exception as e:
            raise TransformationError(
                message=f"Failed to transform product {goods_id}: {str(e)}",
                product_id=goods_id,
                context=context,
                original_exception=e,
            )

    def _check_data_quality(
        self,
        name: LocalizedString,
        sku: str,
        variants: list[Variant],
        images: list[Image],
        product_id: str,
    ) -> list[str]:
        """Check for data quality issues and return warnings."""
        issues = []

        if not name.en or len(name.en) < 5:
            issues.append("Product name is too short or missing English translation")

        if not sku or sku.startswith("SHEIN-"):
            issues.append("SKU appears to be auto-generated")

        if not variants:
            issues.append("No variants found, using default variant")
        elif all(v.stock == 0 for v in variants):
            issues.append("All variants have zero stock")

        if not images:
            issues.append("No images found for product")

        zero_price_variants = [v for v in variants if v.price.amount == 0]
        if zero_price_variants:
            issues.append(f"{len(zero_price_variants)} variants have zero price")

        return issues

    def _extract_product_id(self, raw_product: dict) -> Optional[str]:
        """Safely extract product ID from raw product."""
        try:
            return str(
                raw_product.get("info", {})
                .get("productInfo", {})
                .get("goods_id", "unknown")
            )
        except Exception:
            return "unknown"

    def _extract_sku(self, product_info: dict) -> str:
        """Extract SKU with fallback."""
        sku = product_info.get("goods_sn")
        if sku and isinstance(sku, str) and len(sku) > 0:
            return sku
        return f"SHEIN-{product_info.get('goods_id', 'UNKNOWN')}"

    def _extract_name(self, product_info: dict) -> LocalizedString:
        """Extract localized product name with smart English extraction."""
        goods_name = product_info.get("goods_name", "")
        
        if not goods_name:
            goods_name = "Untitled Product"

        en_name = self._extract_english_name(product_info, goods_name)
        ar_name = goods_name if self._is_arabic(goods_name) else None

        return LocalizedString(ar=ar_name, en=en_name)

    def _extract_english_name(self, product_info: dict, goods_name: str) -> str:
        """Extract English name from product data."""
        desc_info = product_info.get("productDescriptionInfo", {})
        details = desc_info.get("productDetails", [])

        brand_match = re.match(r'^([A-Z][A-Za-z0-9]+)\s', goods_name)
        brand = brand_match.group(1) if brand_match else ""

        type_attr = next(
            (d for d in details if d.get("attr_name_en") == "Type"),
            None
        )
        style_attr = next(
            (d for d in details if d.get("attr_name_en") == "Style"),
            None
        )
        color_attr = next(
            (d for d in details if d.get("attr_name_en") == "Color"),
            None
        )

        parts = []
        if brand:
            parts.append(brand)
        if style_attr:
            parts.append(style_attr.get("attr_value_en", ""))
        if color_attr:
            parts.append(color_attr.get("attr_value_en", ""))
        if type_attr:
            parts.append(type_attr.get("attr_value_en", ""))

        if parts:
            return " ".join(filter(None, parts))

        ascii_parts = re.findall(r'[A-Za-z0-9]+', goods_name)
        if ascii_parts:
            return " ".join(ascii_parts[:5])

        return goods_name

    def _extract_description(self, product_info: dict) -> Optional[LocalizedString]:
        """Extract product description from attributes."""
        desc_info = product_info.get("productDescriptionInfo", {})
        details = desc_info.get("productDetails", [])

        if not details:
            return None

        desc_parts_en = []
        desc_parts_ar = []

        for detail in details:
            attr_name_en = detail.get("attr_name_en", "")
            attr_value_en = detail.get("attr_value_en", "")
            attr_name_ar = detail.get("attr_name", "")
            attr_value_ar = detail.get("attr_value", "")

            if attr_name_en and attr_value_en:
                desc_parts_en.append(f"{attr_name_en}: {attr_value_en}")
            if attr_name_ar and attr_value_ar:
                desc_parts_ar.append(f"{attr_name_ar}: {attr_value_ar}")

        if desc_parts_en:
            return LocalizedString(
                ar="\n".join(desc_parts_ar) if desc_parts_ar else None,
                en="\n".join(desc_parts_en),
            )
        return None

    def _extract_categories(self, product_info: dict) -> list[Category]:
        """Extract and build category hierarchy."""
        categories = []
        cate_infos = product_info.get("cateInfos", {})

        if not cate_infos:
            return categories

        for cate_id, cate_data in cate_infos.items():
            if not isinstance(cate_data, dict):
                continue

            parent_ids = cate_data.get("parent_ids", [])
            parent_id = parent_ids[-1] if parent_ids else None

            cat_name_en = cate_data.get("category_name_en") or cate_data.get("category_name", "")
            cat_name_ar = cate_data.get("category_name")

            categories.append(Category(
                id=str(cate_id),
                name=LocalizedString(ar=cat_name_ar, en=cat_name_en),
                slug=self._slugify(cate_data.get("category_url_name", cat_name_en)),
                parent_id=str(parent_id) if parent_id else None,
                level=len(parent_ids),
                is_leaf=cate_data.get("is_leaf") == "1",
            ))

        return sorted(categories, key=lambda c: c.level)

    def _extract_attributes(self, product_info: dict) -> list[Attribute]:
        """Extract product attributes with proper typing."""
        attributes = []
        desc_info = product_info.get("productDescriptionInfo", {})
        details = desc_info.get("productDetails", [])

        seen_attrs = set()

        for detail in details:
            if not isinstance(detail, dict):
                continue

            attr_id = detail.get("attr_id")
            attr_value_id = detail.get("attr_value_id", attr_id)
            
            unique_key = f"{attr_id}:{attr_value_id}"
            if unique_key in seen_attrs:
                continue
            seen_attrs.add(unique_key)

            attr_type = self.ATTRIBUTE_TYPE_MAP.get(attr_id, "text")
            attr_name_en = detail.get("attr_name_en") or detail.get("attr_name", "")
            attr_value_en = detail.get("attr_value_en") or detail.get("attr_value", "")

            if not attr_name_en or not attr_value_en:
                continue

            attributes.append(Attribute(
                id=str(attr_value_id),
                name=LocalizedString(
                    ar=detail.get("attr_name"),
                    en=attr_name_en,
                ),
                value=LocalizedString(
                    ar=detail.get("attr_value"),
                    en=attr_value_en,
                ),
                type=attr_type,
            ))

        return attributes

    def _extract_variants(self, product_info: dict) -> list[Variant]:
        """Extract product variants with pricing and stock."""
        variants = []
        
        sku_list = product_info.get("skuList")
        if not sku_list:
            attr_size_list = product_info.get("attrSizeList", {})
            sku_list = attr_size_list.get("allSizeSkuList", [])

        all_color_images = product_info.get("allColorDetailImages", {})

        if not sku_list:
            return [self._create_default_variant(product_info)]

        for sku_item in sku_list:
            if not isinstance(sku_item, dict):
                continue

            variant = self._parse_sku_item(sku_item, all_color_images)
            if variant:
                variants.append(variant)

        return variants if variants else [self._create_default_variant(product_info)]

    def _parse_sku_item(
        self,
        sku_item: dict,
        all_color_images: dict,
    ) -> Optional[Variant]:
        """Parse a single SKU item into a Variant with robust error handling."""
        try:
            sku_code = sku_item.get("sku_code", "")
            goods_id = str(sku_item.get("goods_id", ""))

            price_info = sku_item.get("price") or sku_item.get("priceInfo", {})
            if not price_info:
                price_info = {}

            sale_price = price_info.get("salePrice", {})
            retail_price = price_info.get("retailPrice", {})

            amount = self._parse_price_amount(sale_price.get("amount", "0"))
            original = self._parse_price_amount(retail_price.get("amount", "0"))
            usd = self._parse_price_amount(sale_price.get("usdAmount", "0"))
            discount = price_info.get("discountValue") or price_info.get("unit_discount", 0)

            variant_images = []
            if goods_id in all_color_images:
                for img in all_color_images[goods_id]:
                    img_url = img.get("origin_image", "")
                    if img_url:
                        variant_images.append(self._normalize_image_url(img_url))

            stock = sku_item.get("stock", 0)
            if isinstance(stock, str):
                stock = int(stock) if stock.isdigit() else 0

            return Variant(
                id=sku_code or goods_id or f"variant-{hash(str(sku_item))}",
                sku=sku_code,
                color=self._extract_color_from_sku(sku_item),
                size=self._extract_size_from_sku(sku_item),
                price=Price(
                    amount=amount,
                    currency="SAR",
                    original_amount=original if original > amount else None,
                    discount_percent=float(discount) if discount else None,
                    usd_amount=usd if usd else None,
                ),
                stock=int(stock),
                images=variant_images,
            )
        except Exception as e:
            logger.warning(
                f"Failed to parse SKU item: {e}",
                extra={"sku_item": str(sku_item)[:200]},
            )
            return None

    def _create_default_variant(self, product_info: dict) -> Variant:
        """Create a default variant when no SKU list is available."""
        goods_id = product_info.get("goods_id", "unknown")
        return Variant(
            id=f"default-{goods_id}",
            sku=product_info.get("goods_sn", ""),
            price=Price(amount=0, currency="SAR"),
            stock=0,
            images=[],
        )

    def _extract_images(self, product_info: dict) -> list[Image]:
        """Extract all product images with deduplication."""
        images = []
        seen_urls = set()

        img_info = product_info.get("currentSkcImgInfo", {})
        skc_images = img_info.get("skcImages", [])
        
        for idx, img_url in enumerate(skc_images):
            if not img_url:
                continue
            normalized_url = self._normalize_image_url(img_url)
            if normalized_url in seen_urls:
                continue
            seen_urls.add(normalized_url)
            
            images.append(Image(
                url=normalized_url,
                type="main" if idx == 0 else "gallery",
                sort_order=idx,
            ))

        all_color_images = product_info.get("allColorDetailImages", {})
        for variant_id, variant_images in all_color_images.items():
            if not isinstance(variant_images, list):
                continue
            for idx, img in enumerate(variant_images):
                img_url = img.get("origin_image", "") if isinstance(img, dict) else ""
                if not img_url:
                    continue
                normalized_url = self._normalize_image_url(img_url)
                if normalized_url in seen_urls:
                    continue
                seen_urls.add(normalized_url)
                
                images.append(Image(
                    url=normalized_url,
                    type="gallery",
                    variant_id=str(variant_id),
                    sort_order=len(images),
                ))

        return images

    def _extract_color_from_sku(self, sku_item: dict) -> Optional[dict]:
        """Extract color information from SKU item."""
        attr_list = sku_item.get("sku_sale_attr", [])
        if not isinstance(attr_list, list):
            return None

        for attr in attr_list:
            if not isinstance(attr, dict):
                continue
            if attr.get("attr_id") == 87:
                return {
                    "name": attr.get("attr_value_name", ""),
                    "code": str(attr.get("attr_value_id", "")),
                }
        return None

    def _extract_size_from_sku(self, sku_item: dict) -> Optional[str]:
        """Extract size from SKU item."""
        attr_list = sku_item.get("sku_sale_attr", [])
        if not isinstance(attr_list, list):
            return None

        for attr in attr_list:
            if not isinstance(attr, dict):
                continue
            if attr.get("attr_id") == 87:
                continue
            attr_name = str(attr.get("attr_name", "")).lower()
            if "size" in attr_name or "مقاس" in attr_name:
                return attr.get("attr_value_name", "")
        return None

    def _normalize_image_url(self, url: str) -> str:
        """Ensure image URL has proper protocol."""
        if not url:
            return ""
        if url.startswith("//"):
            return f"https:{url}"
        if not url.startswith(("http://", "https://")):
            return f"https://{url}"
        return url

    def _parse_price_amount(self, amount: Any) -> float:
        """Parse price amount from various formats with validation."""
        if amount is None:
            return 0.0
        if isinstance(amount, (int, float)):
            return max(0.0, float(amount))
        if isinstance(amount, str):
            cleaned = re.sub(r'[^\d.]', '', amount)
            try:
                return max(0.0, float(cleaned)) if cleaned else 0.0
            except ValueError:
                return 0.0
        return 0.0

    def _slugify(self, text: str) -> str:
        """Convert text to URL-friendly slug."""
        if not text:
            return ""
        slug = text.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug.strip('-')

    def _is_arabic(self, text: str) -> bool:
        """Check if text contains Arabic characters."""
        if not text:
            return False
        return bool(re.search(r'[\u0600-\u06FF]', text))
