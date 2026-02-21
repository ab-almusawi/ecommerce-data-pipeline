"""
Canonical data models for the product ingestion pipeline.
These models represent the normalized structure used throughout the system.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class LocalizedString(BaseModel):
    """Localized string with Arabic and English versions."""
    ar: Optional[str] = None
    en: str


class Category(BaseModel):
    """Product category in the hierarchy."""
    id: str
    name: LocalizedString
    slug: str
    parent_id: Optional[str] = Field(None, alias="parentId")
    level: int = 0
    is_leaf: bool = Field(False, alias="isLeaf")

    class Config:
        populate_by_name = True


class Attribute(BaseModel):
    """Product attribute (e.g., color, material, style)."""
    id: str
    name: LocalizedString
    value: LocalizedString
    type: str = "text"


class Price(BaseModel):
    """Price information with currency details."""
    amount: float
    currency: str = "SAR"
    original_amount: Optional[float] = Field(None, alias="originalAmount")
    discount_percent: Optional[float] = Field(None, alias="discountPercent")
    usd_amount: Optional[float] = Field(None, alias="usdAmount")

    class Config:
        populate_by_name = True


class Image(BaseModel):
    """Product image reference."""
    url: str
    type: str = "gallery"
    variant_id: Optional[str] = Field(None, alias="variantId")
    sort_order: int = Field(0, alias="sortOrder")

    class Config:
        populate_by_name = True


class Variant(BaseModel):
    """Product variant (size/color combination)."""
    id: str
    sku: str
    color: Optional[dict] = None
    size: Optional[str] = None
    price: Price
    stock: int = 0
    images: list[str] = Field(default_factory=list)


class ProductMetadata(BaseModel):
    """Metadata about product source and import."""
    source: str = "shein"
    source_id: str = Field(..., alias="sourceId")
    imported_at: datetime = Field(default_factory=datetime.utcnow, alias="importedAt")
    product_relation_id: Optional[str] = Field(None, alias="productRelationId")

    class Config:
        populate_by_name = True


class CanonicalProduct(BaseModel):
    """
    Canonical product model - the normalized representation
    used throughout the pipeline.
    """
    id: str
    sku: str
    name: LocalizedString
    description: Optional[LocalizedString] = None
    categories: list[Category] = Field(default_factory=list)
    attributes: list[Attribute] = Field(default_factory=list)
    variants: list[Variant] = Field(default_factory=list)
    images: list[Image] = Field(default_factory=list)
    metadata: ProductMetadata

    def to_event_detail(self) -> dict:
        """Convert to EventBridge event detail format."""
        return self.model_dump(mode="json", by_alias=True)
