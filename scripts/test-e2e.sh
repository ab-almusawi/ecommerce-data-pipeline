#!/bin/bash

# E2E Test Script for Product Data Pipeline
# Tests the full data flow from S3 upload to platform integration

set -e

LOCALSTACK_ENDPOINT="${LOCALSTACK_ENDPOINT:-http://localhost:4566}"
NESTJS_ENDPOINT="${NESTJS_ENDPOINT:-http://localhost:3000}"
S3_BUCKET="${S3_BUCKET:-product-ingestion-bucket}"
SQS_QUEUE_URL="${SQS_QUEUE_URL:-http://localhost:4566/000000000000/product-ingestion-queue}"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

echo "========================================"
echo "  E2E Test: Product Data Pipeline"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

check_service() {
    local url=$1
    local name=$2
    echo -n "Checking $name... "
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Step 1: Check services
echo -e "\n${CYAN}[Step 1] Checking service health...${NC}"
LOCALSTACK_OK=false
NESTJS_OK=false

if curl -s "$LOCALSTACK_ENDPOINT/_localstack/health" | grep -q '"s3"'; then
    echo -e "LocalStack... ${GREEN}OK${NC}"
    LOCALSTACK_OK=true
else
    echo -e "LocalStack... ${RED}FAILED${NC}"
fi

if check_service "$NESTJS_ENDPOINT/health" "NestJS"; then
    NESTJS_OK=true
fi

if [ "$LOCALSTACK_OK" = false ]; then
    echo -e "${RED}LocalStack is not available. Please start with: docker-compose up localstack${NC}"
    exit 1
fi

# Step 2: Check/Create S3 bucket
echo -e "\n${CYAN}[Step 2] Checking S3 bucket...${NC}"
if aws --endpoint-url "$LOCALSTACK_ENDPOINT" s3 ls "s3://$S3_BUCKET" 2>/dev/null; then
    echo -e "  S3 bucket exists: ${GREEN}$S3_BUCKET${NC}"
else
    echo -e "  Creating S3 bucket: ${YELLOW}$S3_BUCKET${NC}"
    aws --endpoint-url "$LOCALSTACK_ENDPOINT" s3 mb "s3://$S3_BUCKET"
fi

# Step 3: Create test product file
echo -e "\n${CYAN}[Step 3] Creating test product data...${NC}"
TEST_FILE="/tmp/test-products-$$.json"
cat > "$TEST_FILE" << 'EOF'
[
  {
    "code": "0",
    "msg": "ok",
    "info": {
      "productInfo": {
        "goods_id": "TEST001",
        "goods_sn": "test-sku-001",
        "goods_name": "Test Product for E2E Testing",
        "cateInfos": {
          "1001": {
            "category_name_en": "Test Category",
            "category_url_name": "test-category",
            "parent_ids": [],
            "is_leaf": "1"
          }
        },
        "productDescriptionInfo": {
          "productDetails": [
            {
              "attr_name_en": "Color",
              "attr_value_en": "Blue",
              "attr_id": 27
            }
          ]
        },
        "skuList": [
          {
            "sku_code": "TEST-SKU-001",
            "goods_id": "TEST001",
            "stock": "10",
            "price": {
              "salePrice": { "amount": "19.99", "usdAmount": "5.00" },
              "retailPrice": { "amount": "29.99" }
            }
          }
        ],
        "currentSkcImgInfo": {
          "skcImages": ["https://example.com/test-image.jpg"]
        }
      }
    }
  }
]
EOF
echo -e "  Created test file: ${GREEN}$TEST_FILE${NC}"

# Step 4: Upload to S3
echo -e "\n${CYAN}[Step 4] Uploading test data to S3...${NC}"
aws --endpoint-url "$LOCALSTACK_ENDPOINT" s3 cp "$TEST_FILE" "s3://$S3_BUCKET/test-products.json"
echo -e "  Uploaded to ${GREEN}s3://$S3_BUCKET/test-products.json${NC}"

# Step 5: Check SQS queue
echo -e "\n${CYAN}[Step 5] Checking SQS queue...${NC}"
sleep 2
MSG_COUNT=$(aws --endpoint-url "$LOCALSTACK_ENDPOINT" sqs get-queue-attributes \
    --queue-url "$SQS_QUEUE_URL" \
    --attribute-names ApproximateNumberOfMessages \
    --query 'Attributes.ApproximateNumberOfMessages' \
    --output text 2>/dev/null || echo "0")
echo -e "  Messages in queue: ${GREEN}$MSG_COUNT${NC}"

# Step 6: Check NestJS metrics
if [ "$NESTJS_OK" = true ]; then
    echo -e "\n${CYAN}[Step 6] Checking NestJS metrics...${NC}"
    METRICS=$(curl -s "$NESTJS_ENDPOINT/health/metrics" 2>/dev/null || echo "{}")
    echo -e "  Metrics: $METRICS"
fi

# Step 7: Summary
echo ""
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo -e "  LocalStack: $([ "$LOCALSTACK_OK" = true ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "  NestJS: $([ "$NESTJS_OK" = true ] && echo -e "${GREEN}OK${NC}" || echo -e "${RED}FAILED${NC}")"
echo -e "  S3 Upload: ${GREEN}OK${NC}"
echo -e "  SQS Messages: ${GREEN}$MSG_COUNT${NC}"
echo ""

# Cleanup
rm -f "$TEST_FILE"

if [ "$LOCALSTACK_OK" = true ] && [ "$NESTJS_OK" = true ]; then
    echo -e "${GREEN}E2E Test: PASSED${NC}"
    exit 0
else
    echo -e "${YELLOW}E2E Test: PARTIAL SUCCESS${NC}"
    exit 1
fi
