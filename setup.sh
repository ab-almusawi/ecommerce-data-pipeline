#!/bin/bash
# =============================================================================
# E-Commerce Data Pipeline - Complete Setup Script
# =============================================================================
# Run this script once after cloning the project on a fresh machine.
# Prerequisites: Docker and Docker Compose installed
# =============================================================================

set -e

echo "============================================"
echo "E-Commerce Data Pipeline - Setup"
echo "============================================"
echo ""

# Step 1: Start Docker services
echo "[1/5] Starting Docker services..."
docker-compose up -d

# Step 2: Wait for services to be healthy
echo "[2/5] Waiting for services to be healthy (this may take 2-3 minutes)..."
echo "      Waiting for PostgreSQL..."
until docker exec challenge-postgres pg_isready -U postgres > /dev/null 2>&1; do
    sleep 2
done
echo "      PostgreSQL ready."

echo "      Waiting for Redis..."
until docker exec challenge-redis redis-cli ping > /dev/null 2>&1; do
    sleep 2
done
echo "      Redis ready."

echo "      Waiting for LocalStack..."
until docker exec challenge-localstack awslocal sts get-caller-identity > /dev/null 2>&1; do
    sleep 2
done
echo "      LocalStack ready."

echo "      Waiting for MedusaJS (may take up to 2 minutes)..."
until curl -s http://localhost:9000/health > /dev/null 2>&1; do
    sleep 5
done
echo "      MedusaJS ready."

echo "      Waiting for Pimcore API..."
until curl -s http://localhost:8080/api/health > /dev/null 2>&1; do
    sleep 2
done
echo "      Pimcore API ready."

echo "      Waiting for NestJS..."
until curl -s http://localhost:3000/health > /dev/null 2>&1; do
    sleep 2
done
echo "      NestJS ready."

# Step 3: Initialize LocalStack AWS resources
echo "[3/5] Initializing LocalStack (S3, SQS, EventBridge)..."
docker cp init-localstack.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/init-localstack.sh > /tmp/init.sh && chmod +x /tmp/init.sh && /tmp/init.sh"

# Step 4: Deploy Lambda function
echo "[4/5] Deploying Lambda function..."
docker cp services/ingestion-lambda challenge-localstack:/lambda-src
docker cp deploy-lambda.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/deploy-lambda.sh > /tmp/deploy.sh && chmod +x /tmp/deploy.sh && /tmp/deploy.sh" || echo "Lambda deployment completed (may show warnings)"

# Step 5: Create MedusaJS admin user
echo "[5/5] Creating MedusaJS admin user..."
docker exec challenge-medusa npx medusa user -e admin@challenge.com -p admin123 2>/dev/null || echo "Admin user may already exist"

echo ""
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo ""
echo "Services running:"
echo "  - NestJS Integration: http://localhost:3000/health"
echo "  - MedusaJS:           http://localhost:9000/health"
echo "  - Pimcore API:        http://localhost:8080/api/health"
echo "  - LocalStack:         http://localhost:4566"
echo ""
echo "MedusaJS Admin:"
echo "  - Email:    admin@challenge.com"
echo "  - Password: admin123"
echo ""
echo "To test the pipeline:"
echo "  1. Upload a product file to S3:"
echo "     docker cp test-product.json challenge-localstack:/tmp/"
echo "     docker exec challenge-localstack awslocal s3 cp /tmp/test-product.json s3://product-ingestion-bucket/test/products.json"
echo ""
echo "  2. Invoke Lambda:"
echo "     docker exec challenge-localstack awslocal lambda invoke --function-name product-ingestion-lambda --payload '{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"product-ingestion-bucket\"},\"object\":{\"key\":\"test/products.json\"}}}]}' /tmp/out.json"
echo ""
echo "  3. Check products:"
echo "     curl http://localhost:8080/api/objects"
echo ""
