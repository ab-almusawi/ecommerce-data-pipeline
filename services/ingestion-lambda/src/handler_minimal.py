"""
Minimal Lambda handler for LocalStack testing.
Transforms SHEIN JSON and publishes to EventBridge.
"""
import json
import uuid
import boto3
from datetime import datetime

import os
LOCALSTACK_ENDPOINT = os.environ.get("LOCALSTACK_ENDPOINT", "http://localhost.localstack.cloud:4566")
EVENT_BUS_NAME = "product-events"

def handler(event, context):
    """Process S3 upload and publish to EventBridge."""
    print(f"Lambda invoked with event: {json.dumps(event)[:500]}")
    
    s3 = boto3.client("s3", endpoint_url=LOCALSTACK_ENDPOINT)
    events = boto3.client("events", endpoint_url=LOCALSTACK_ENDPOINT)
    
    try:
        s3_record = event["Records"][0]["s3"]
        bucket = s3_record["bucket"]["name"]
        key = s3_record["object"]["key"]
        
        print(f"Processing s3://{bucket}/{key}")
        
        response = s3.get_object(Bucket=bucket, Key=key)
        content = response["Body"].read().decode("utf-8")
        products = json.loads(content)
        
        if not isinstance(products, list):
            products = [products]
        
        published = 0
        for idx, raw_product in enumerate(products):
            if raw_product.get("code") != "0":
                print(f"Skipping product with code: {raw_product.get('code')}")
                continue
            
            info = raw_product.get("info", {})
            product_info = info.get("productInfo", {})
            
            if not product_info.get("goods_id"):
                print(f"Skipping product without goods_id")
                continue
            
            canonical = transform_product(product_info)
            
            event_detail = {
                "eventId": str(uuid.uuid4()),
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "correlationId": str(uuid.uuid4()),
                "product": canonical,
                "metadata": {
                    "s3Bucket": bucket,
                    "s3Key": key,
                    "batchId": str(uuid.uuid4()),
                    "itemIndex": idx,
                    "totalItems": len(products),
                },
            }
            
            events.put_events(Entries=[{
                "Source": "com.challenge.ingestion",
                "DetailType": "ProductIngested",
                "Detail": json.dumps(event_detail),
                "EventBusName": EVENT_BUS_NAME,
            }])
            
            published += 1
            print(f"Published product: {canonical['id']}")
        
        return {
            "statusCode": 200,
            "body": {
                "message": "Processing complete",
                "source": {"bucket": bucket, "key": key},
                "published": published,
                "total": len(products),
            }
        }
        
    except Exception as e:
        print(f"Error: {e}")
        return {"statusCode": 500, "body": {"error": str(e)}}


def transform_product(info):
    """Transform SHEIN productInfo to canonical format."""
    goods_id = str(info.get("goods_id", ""))
    goods_sn = info.get("goods_sn", goods_id)
    
    name_ar = info.get("goods_name", "")
    name_en = name_ar
    
    desc = info.get("detail", {}).get("goods_desc", "")
    
    sale_price = float(info.get("salePrice", {}).get("amount", 0) or 0)
    retail_price = float(info.get("retailPrice", {}).get("amount", sale_price) or sale_price)
    
    categories = []
    if info.get("currentCat"):
        cat = info["currentCat"]
        categories.append({
            "id": str(cat.get("cat_id", "cat-1")),
            "name": {"en": cat.get("cat_name", "Category"), "ar": cat.get("cat_name", "")},
            "slug": cat.get("cat_name", "category").lower().replace(" ", "-"),
            "level": 1,
        })
    
    attributes = []
    for attr in info.get("productDetails", []):
        attributes.append({
            "name": {"en": attr.get("attr_name", ""), "ar": ""},
            "value": {"en": attr.get("attr_value", ""), "ar": ""},
            "type": "text",
        })
    
    variants = []
    for sku in info.get("skuList", []):
        sku_attrs = sku.get("sku_sale_attr", [])
        size = sku_attrs[0].get("attr_value_name", "M") if len(sku_attrs) > 0 else "M"
        color = sku_attrs[1].get("attr_value_name", "Default") if len(sku_attrs) > 1 else "Default"
        
        variants.append({
            "sku": sku.get("sku_code", f"{goods_sn}-{size}"),
            "color": {"name": color, "code": "#000000"},
            "size": size,
            "price": {
                "amount": float(sku.get("mall_price", sale_price) or sale_price),
                "currency": "USD",
                "originalAmount": float(sku.get("retail_price", retail_price) or retail_price),
                "discountPercent": 0,
            },
            "stock": int(sku.get("stock", 0) or 0),
            "images": [],
        })
    
    if not variants:
        variants.append({
            "sku": goods_sn,
            "color": {"name": "Default", "code": "#000000"},
            "size": "M",
            "price": {"amount": sale_price, "currency": "USD", "originalAmount": retail_price, "discountPercent": 0},
            "stock": 10,
            "images": [],
        })
    
    images = []
    main_img = info.get("goods_imgs", {}).get("main_image", {}).get("origin_image")
    if main_img:
        images.append({"url": main_img, "type": "main", "sortOrder": 1})
    
    return {
        "id": f"shein-{goods_id}",
        "sku": goods_sn,
        "name": {"en": name_en, "ar": name_ar},
        "description": {"en": desc, "ar": ""},
        "categories": categories or [{"id": "cat-1", "name": {"en": "Products"}, "slug": "products", "level": 1}],
        "attributes": attributes,
        "variants": variants,
        "images": images or [{"url": "https://placeholder.com/product.jpg", "type": "main", "sortOrder": 1}],
        "metadata": {
            "source": "shein",
            "sourceId": goods_id,
            "importedAt": datetime.utcnow().isoformat() + "Z",
            "productRelationId": f"rel-{goods_id}",
        },
    }
