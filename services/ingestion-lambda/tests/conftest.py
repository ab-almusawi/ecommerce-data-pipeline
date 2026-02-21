"""Pytest fixtures and configuration."""

import json
import os
import pytest

os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["EVENT_BUS_NAME"] = "test-event-bus"


@pytest.fixture
def sample_valid_product():
    """Return a valid SHEIN product structure."""
    return {
        "code": "0",
        "msg": "ok",
        "info": {
            "productInfo": {
                "goods_id": "12345678",
                "goods_sn": "sz12345678901234567",
                "goods_name": "INAWLY فستان نسائي أنيق",
                "productRelationID": "z250321518454",
                "cateIds": "12478,12472,2030",
                "cateInfos": {
                    "12478": {
                        "category_id": "12723",
                        "mall_category_id": "12478",
                        "category_name": "فساتين ميدي نسائية",
                        "category_url_name": "Women Midi Dresses",
                        "parent_ids": ["4436", "2030", "12472"],
                        "category_name_en": "Women Midi Dresses",
                        "is_leaf": "1",
                    },
                    "2030": {
                        "category_id": "2028",
                        "mall_category_id": "2030",
                        "category_name": "ملابس نسائية",
                        "category_url_name": "Women Clothing",
                        "parent_ids": ["4436"],
                        "category_name_en": "Women Clothing",
                        "is_leaf": "0",
                    },
                },
                "productDescriptionInfo": {
                    "productDetails": [
                        {
                            "attr_name": "لون",
                            "attr_value": "أحمر",
                            "attr_name_en": "Color",
                            "attr_id": 27,
                            "attr_value_id": "144",
                            "attr_value_en": "Red",
                        },
                        {
                            "attr_name": "أسلوب",
                            "attr_value": "أنيقة",
                            "attr_name_en": "Style",
                            "attr_id": 101,
                            "attr_value_id": "257",
                            "attr_value_en": "Elegant",
                        },
                        {
                            "attr_name": "نوع",
                            "attr_value": "فستان",
                            "attr_name_en": "Type",
                            "attr_id": 109,
                            "attr_value_id": "123",
                            "attr_value_en": "Dress",
                        },
                    ]
                },
                "currentSkcImgInfo": {
                    "skcImages": [
                        "//img.example.com/image1.webp",
                        "//img.example.com/image2.webp",
                    ]
                },
                "allColorDetailImages": {
                    "12345678": [
                        {"origin_image": "//img.example.com/color1.webp"},
                        {"origin_image": "//img.example.com/color2.webp"},
                    ]
                },
                "skuList": [
                    {
                        "sku_code": "SKU001",
                        "goods_id": "12345678",
                        "stock": "10",
                        "price": {
                            "salePrice": {
                                "amount": "23.80",
                                "usdAmount": "6.35",
                            },
                            "retailPrice": {
                                "amount": "28.00",
                            },
                            "discountValue": "15",
                        },
                        "sku_sale_attr": [
                            {
                                "attr_id": 87,
                                "attr_value_name": "Red",
                                "attr_value_id": "144",
                            }
                        ],
                    },
                    {
                        "sku_code": "SKU002",
                        "goods_id": "12345679",
                        "stock": "5",
                        "price": {
                            "salePrice": {"amount": "25.00"},
                            "retailPrice": {"amount": "30.00"},
                        },
                    },
                ],
            }
        },
    }


@pytest.fixture
def sample_invalid_product():
    """Return an invalid product (non-success code)."""
    return {
        "code": "1",
        "msg": "error",
        "info": {},
    }


@pytest.fixture
def sample_minimal_product():
    """Return a minimal valid product."""
    return {
        "code": "0",
        "msg": "ok",
        "info": {
            "productInfo": {
                "goods_id": "99999999",
                "goods_name": "Test Product",
            }
        },
    }


@pytest.fixture
def sample_s3_event():
    """Return a sample S3 event."""
    return {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "test-bucket"},
                    "object": {"key": "products.json"},
                }
            }
        ]
    }


@pytest.fixture
def sample_products_batch(sample_valid_product, sample_invalid_product, sample_minimal_product):
    """Return a batch of mixed products."""
    return [sample_valid_product, sample_invalid_product, sample_minimal_product]
