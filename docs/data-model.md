# Data Models

## Overview

This document defines the canonical data model used throughout the pipeline. The raw SHEIN JSON is transformed into this canonical format, which is then adapted for each target platform (Pimcore, MedusaJS).

## JSON Schema: Canonical Product Model

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CanonicalProduct",
  "description": "Normalized product data model for the pipeline",
  "type": "object",
  "required": ["id", "sku", "name", "categories", "variants"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique product identifier (goods_id from SHEIN)"
    },
    "sku": {
      "type": "string",
      "description": "Stock Keeping Unit (goods_sn from SHEIN)"
    },
    "name": {
      "type": "object",
      "description": "Localized product names",
      "properties": {
        "ar": { "type": "string" },
        "en": { "type": "string" }
      },
      "required": ["en"]
    },
    "description": {
      "type": "object",
      "description": "Localized product descriptions",
      "properties": {
        "ar": { "type": "string" },
        "en": { "type": "string" }
      }
    },
    "categories": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/Category"
      }
    },
    "attributes": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/Attribute"
      }
    },
    "variants": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/definitions/Variant"
      }
    },
    "images": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/Image"
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "source": { "type": "string", "const": "shein" },
        "sourceId": { "type": "string" },
        "importedAt": { "type": "string", "format": "date-time" },
        "productRelationId": { "type": "string" }
      }
    }
  },
  "definitions": {
    "Category": {
      "type": "object",
      "required": ["id", "name"],
      "properties": {
        "id": { "type": "string" },
        "name": {
          "type": "object",
          "properties": {
            "ar": { "type": "string" },
            "en": { "type": "string" }
          }
        },
        "slug": { "type": "string" },
        "parentId": { "type": ["string", "null"] },
        "level": { "type": "integer" },
        "isLeaf": { "type": "boolean" }
      }
    },
    "Attribute": {
      "type": "object",
      "required": ["name", "value"],
      "properties": {
        "id": { "type": "string" },
        "name": {
          "type": "object",
          "properties": {
            "ar": { "type": "string" },
            "en": { "type": "string" }
          }
        },
        "value": {
          "type": "object",
          "properties": {
            "ar": { "type": "string" },
            "en": { "type": "string" }
          }
        },
        "type": {
          "type": "string",
          "enum": ["text", "color", "size", "material", "style", "other"]
        }
      }
    },
    "Variant": {
      "type": "object",
      "required": ["id", "sku", "price"],
      "properties": {
        "id": { "type": "string" },
        "sku": { "type": "string" },
        "color": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "code": { "type": "string" }
          }
        },
        "size": { "type": "string" },
        "price": {
          "$ref": "#/definitions/Price"
        },
        "stock": { "type": "integer", "minimum": 0 },
        "images": {
          "type": "array",
          "items": { "type": "string", "format": "uri" }
        }
      }
    },
    "Price": {
      "type": "object",
      "required": ["amount", "currency"],
      "properties": {
        "amount": { "type": "number" },
        "currency": { "type": "string" },
        "originalAmount": { "type": "number" },
        "discountPercent": { "type": "number" },
        "usdAmount": { "type": "number" }
      }
    },
    "Image": {
      "type": "object",
      "required": ["url"],
      "properties": {
        "url": { "type": "string", "format": "uri" },
        "type": {
          "type": "string",
          "enum": ["main", "gallery", "swatch", "size_guide"]
        },
        "variantId": { "type": "string" },
        "sortOrder": { "type": "integer" }
      }
    }
  }
}
```

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CANONICAL PRODUCT MODEL                            │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       1:N       ┌──────────────────┐
│     Product      │────────────────>│     Category     │
├──────────────────┤                 ├──────────────────┤
│ id (PK)          │                 │ id (PK)          │
│ sku              │                 │ name_ar          │
│ name_ar          │                 │ name_en          │
│ name_en          │                 │ slug             │
│ description_ar   │                 │ parent_id (FK)   │
│ description_en   │                 │ level            │
│ source           │                 │ is_leaf          │
│ source_id        │                 └──────────────────┘
│ imported_at      │
└──────────────────┘
        │
        │ 1:N
        ▼
┌──────────────────┐       1:N       ┌──────────────────┐
│     Variant      │────────────────>│      Image       │
├──────────────────┤                 ├──────────────────┤
│ id (PK)          │                 │ id (PK)          │
│ product_id (FK)  │                 │ variant_id (FK)  │
│ sku_code         │                 │ url              │
│ color_name       │                 │ type             │
│ color_code       │                 │ sort_order       │
│ size             │                 └──────────────────┘
│ stock            │
│ price_amount     │
│ price_currency   │
│ original_price   │
│ discount_percent │
│ usd_amount       │
└──────────────────┘
        │
        │ 1:N
        ▼
┌──────────────────┐
│    Attribute     │
├──────────────────┤
│ id (PK)          │
│ product_id (FK)  │
│ name_ar          │
│ name_en          │
│ value_ar         │
│ value_en         │
│ type             │
└──────────────────┘
```

## Field Mapping: SHEIN → Canonical

| SHEIN Field                                    | Canonical Field           | Notes                        |
|------------------------------------------------|---------------------------|------------------------------|
| `info.productInfo.goods_id`                    | `id`                      | Primary identifier           |
| `info.productInfo.goods_sn`                    | `sku`                     | SKU code                     |
| `info.productInfo.goods_name`                  | `name.ar`                 | Arabic name from source      |
| `info.productInfo.goods_name` (translated)     | `name.en`                 | Use attr_name_en fields      |
| `info.productInfo.cateInfos`                   | `categories[]`            | Map hierarchy                |
| `info.productInfo.productDescriptionInfo`      | `attributes[]`            | Product attributes           |
| `info.productInfo.currentSkcImgInfo.skcImages` | `images[]`                | Main images                  |
| `info.productInfo.allColorDetailImages`        | `variants[].images`       | Per-variant images           |
| `skuList[].sku_code`                           | `variants[].sku`          | Variant SKU                  |
| `skuList[].price.salePrice.amount`             | `variants[].price.amount` | Sale price                   |
| `skuList[].price.retailPrice.amount`           | `variants[].price.originalAmount` | Original price       |
| `skuList[].stock`                              | `variants[].stock`        | Inventory count              |

## Platform-Specific Models

### Pimcore Data Object Class

```yaml
# Pimcore Product Class Definition
Product:
  fields:
    - name: sku
      type: input
      mandatory: true
      unique: true
    - name: name
      type: localizedfields
      children:
        - name: nameLocalized
          type: input
    - name: description
      type: localizedfields
      children:
        - name: descriptionLocalized
          type: wysiwyg
    - name: categories
      type: manyToManyObjectRelation
      classes: [Category]
    - name: attributes
      type: fieldcollections
      allowedTypes: [ProductAttribute]
    - name: variants
      type: objectbricks
      allowedTypes: [ProductVariant]
    - name: images
      type: imageGallery
    - name: sourceSystem
      type: input
      defaultValue: "shein"
    - name: externalId
      type: input
      index: true
```

### MedusaJS Product Format

```typescript
interface MedusaProduct {
  title: string;
  subtitle?: string;
  description?: string;
  handle: string; // URL-friendly slug
  is_giftcard: boolean;
  status: 'draft' | 'proposed' | 'published' | 'rejected';
  images: Array<{ url: string }>;
  thumbnail?: string;
  options: Array<{
    title: string; // e.g., "Size", "Color"
  }>;
  variants: Array<{
    title: string;
    sku: string;
    barcode?: string;
    ean?: string;
    upc?: string;
    inventory_quantity: number;
    allow_backorder: boolean;
    manage_inventory: boolean;
    prices: Array<{
      amount: number; // in cents
      currency_code: string;
    }>;
    options: Array<{
      value: string; // e.g., "M", "Red"
    }>;
  }>;
  collection_id?: string;
  type_id?: string;
  tags?: Array<{ value: string }>;
  metadata?: Record<string, unknown>;
}
```

## EventBridge Event Schema

```json
{
  "version": "0",
  "id": "12345678-1234-1234-1234-123456789012",
  "detail-type": "ProductIngested",
  "source": "com.challenge.ingestion",
  "account": "123456789012",
  "time": "2026-02-19T12:00:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventId": "evt-uuid",
    "timestamp": "2026-02-19T12:00:00Z",
    "product": {
      "id": "90854097",
      "sku": "sz25052011736343794",
      "name": {
        "ar": "فستان نسائي أنيق...",
        "en": "INAWLY Women's Elegant Dress..."
      }
      // ... full canonical product object
    },
    "metadata": {
      "s3Bucket": "product-ingestion-bucket",
      "s3Key": "shein_products.json",
      "batchId": "batch-123",
      "itemIndex": 0,
      "totalItems": 100
    }
  }
}
```
