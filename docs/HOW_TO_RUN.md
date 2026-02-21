# How to Run - E-Commerce Data Pipeline

This guide provides step-by-step instructions for running the E-Commerce Data Pipeline in both **local development** and **AWS production** environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development (Docker)](#local-development-docker)
3. [AWS Production Deployment](#aws-production-deployment)
4. [Testing the Pipeline](#testing-the-pipeline)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### For Local Development

| Tool | Version | Installation |
|------|---------|--------------|
| Docker | 20.10+ | [docker.com](https://docs.docker.com/get-docker/) |
| Docker Compose | 2.0+ | Included with Docker Desktop |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) (optional, for running tests) |
| Python | 3.11+ | [python.org](https://python.org/) (optional, for Lambda tests) |

### For AWS Production

| Tool | Version | Installation |
|------|---------|--------------|
| AWS CLI | 2.0+ | [AWS CLI Install](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| AWS Account | - | Free Tier sufficient |
| Docker | 20.10+ | For building container images |

---

## Local Development (Docker)

### Quick Start (One Command Setup)

For a **fresh machine**, run the setup script that handles everything:

```powershell
# Windows (PowerShell)
cd challenge
.\setup.ps1
```

```bash
# Linux/Mac (Bash)
cd challenge
chmod +x setup.sh
./setup.sh
```

This script automatically:
1. Starts all Docker containers
2. Waits for services to be healthy
3. Initializes LocalStack (S3, SQS, EventBridge)
4. Deploys the Lambda function
5. Creates the MedusaJS admin user

### Manual Setup (Step by Step)

If you prefer manual control or the setup script fails:

```bash
# 1. Clone and navigate to project
cd challenge

# 2. Start all services (runs in background)
docker-compose up -d

# 3. Wait for services to be healthy (~2-3 minutes for first run)
docker-compose ps

# 4. Verify all services are running
curl http://localhost:3000/health   # NestJS
curl http://localhost:9000/health   # MedusaJS
curl http://localhost:8080/api/health  # Pimcore
```

### Detailed Steps

#### Step 1: Start Infrastructure

```bash
# Start all services
docker-compose up -d

# View logs (optional)
docker-compose logs -f
```

This starts 6 containers:

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Database for MedusaJS |
| Redis | 6379 | Cache and idempotency store |
| LocalStack | 4566 | AWS services emulation (S3, SQS, EventBridge) |
| Pimcore API | 8080 | PIM DataHub REST API service |
| MedusaJS | 9000 | Headless Commerce backend |
| NestJS | 3000 | Integration Service (SQS Consumer) |

**Note:** First startup takes 2-3 minutes for MedusaJS database initialization.

#### Step 2: Initialize LocalStack AWS Resources

After services are healthy, initialize LocalStack with S3, SQS, and EventBridge:

```bash
# Copy init script to LocalStack container and run
docker cp init-localstack.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/init-localstack.sh > /tmp/init.sh && chmod +x /tmp/init.sh && /tmp/init.sh"
```

This creates:
- S3 Bucket: `product-ingestion-bucket`
- SQS Queue: `product-ingestion-queue`
- SQS DLQ: `product-ingestion-dlq`
- EventBridge Bus: `product-events`
- EventBridge Rule: Routes `ProductIngested` events to SQS

#### Step 2b: Deploy Lambda Function to LocalStack

Deploy the ingestion Lambda function that transforms SHEIN products and publishes to EventBridge:

```bash
# Copy Lambda source and deployment script to LocalStack
docker cp services/ingestion-lambda challenge-localstack:/lambda-src
docker cp deploy-lambda.sh challenge-localstack:/tmp/

# Run deployment script (fixes Windows line endings automatically)
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/deploy-lambda.sh > /tmp/deploy.sh && chmod +x /tmp/deploy.sh && /tmp/deploy.sh"
```

Alternatively, deploy a minimal Lambda for testing:

```bash
# Copy minimal Lambda handler
docker cp lambda-minimal.py challenge-localstack:/tmp/handler.py

# Create and deploy Lambda
docker exec challenge-localstack sh -c "cd /tmp && zip -j lambda.zip handler.py && \
awslocal lambda create-function \
    --function-name product-ingestion-lambda \
    --runtime python3.11 \
    --role arn:aws:iam::000000000000:role/lambda-execution-role \
    --handler handler.handler \
    --zip-file fileb:///tmp/lambda.zip \
    --timeout 60 \
    --environment 'Variables={EVENT_BUS_NAME=product-events,LOCALSTACK_ENDPOINT=http://localhost.localstack.cloud:4566}'"
```

Verify Lambda deployment:

```bash
docker exec challenge-localstack awslocal lambda get-function --function-name product-ingestion-lambda --query 'Configuration.{Name:FunctionName,State:State}'
```

#### Step 3: Verify Services

```powershell
# PowerShell
(Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing).Content
(Invoke-WebRequest -Uri http://localhost:9000/health -UseBasicParsing).Content
(Invoke-WebRequest -Uri http://localhost:8080/api/health -UseBasicParsing).Content

# Bash/curl
curl http://localhost:3000/health
curl http://localhost:9000/health
curl http://localhost:8080/api/health
```

Expected responses:
- **NestJS**: `{"status":"ok","timestamp":"...","service":"nestjs-integration","version":"1.0.0"}`
- **MedusaJS**: `OK`
- **Pimcore API**: `{"status":"healthy","service":"pimcore-datahub-api",...}`

**Pimcore API Endpoints:**
- Health: http://localhost:8080/api/health
- Products: http://localhost:8080/api/objects

#### Step 4: Test the Data Pipeline with SHEIN Products

The pipeline expects products in the **Canonical Product Format**. Use the provided `send-event.sh` script or send events directly:

```bash
# Option 1: Use the pre-built test script
docker cp send-event.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/send-event.sh > /tmp/send.sh && chmod +x /tmp/send.sh && /tmp/send.sh"
```

```bash
# Option 2: Send a test event manually via EventBridge
docker exec challenge-localstack awslocal events put-events --entries '[
  {
    "Source": "com.challenge.ingestion",
    "DetailType": "ProductIngested",
    "EventBusName": "product-events",
    "Detail": "{\"eventId\":\"evt-test-001\",\"timestamp\":\"2026-02-19T12:00:00Z\",\"correlationId\":\"test-run\",\"product\":{\"id\":\"shein-test-001\",\"sku\":\"SHEIN-TEST-001\",\"name\":{\"en\":\"SHEIN Test Dress\",\"ar\":\"فستان تجريبي\"},\"description\":{\"en\":\"Test product\"},\"categories\":[{\"id\":\"cat-1\",\"name\":{\"en\":\"Women\"},\"slug\":\"women\",\"level\":1}],\"attributes\":[{\"name\":{\"en\":\"Brand\"},\"value\":{\"en\":\"SHEIN\"},\"type\":\"text\"}],\"variants\":[{\"sku\":\"SHEIN-TEST-001-M\",\"color\":{\"name\":\"Blue\",\"code\":\"#0000FF\"},\"size\":\"M\",\"price\":{\"amount\":29.99,\"currency\":\"USD\"},\"stock\":50,\"images\":[]}],\"images\":[{\"url\":\"https://img.shein.com/test.jpg\",\"type\":\"main\",\"sortOrder\":1}],\"metadata\":{\"source\":\"shein\",\"sourceId\":\"SHEIN-TEST-001\",\"importedAt\":\"2026-02-19T12:00:00Z\",\"productRelationId\":\"rel-1\"}},\"metadata\":{\"s3Bucket\":\"product-ingestion-bucket\",\"s3Key\":\"test/\",\"batchId\":\"batch-1\",\"itemIndex\":0,\"totalItems\":1}}"
  }
]'
```

**Verify product was created in Pimcore:**

```powershell
# PowerShell
(Invoke-WebRequest -Uri http://localhost:8080/api/objects -UseBasicParsing).Content

# Bash/curl
curl http://localhost:8080/api/objects
```

**Using shein_products.json with Lambda:**

The `shein_products.json` file contains real product data from SHEIN. Upload it to S3 to trigger the Lambda, or invoke the Lambda directly:

```bash
# Option 3a: Upload SHEIN products to S3 (triggers Lambda automatically if S3 notification is configured)
docker cp shein_products.json challenge-localstack:/tmp/shein_products.json
docker exec challenge-localstack awslocal s3 cp /tmp/shein_products.json s3://product-ingestion-bucket/shein/products.json

# Option 3b: Invoke Lambda directly with test product file
docker cp test-product.json challenge-localstack:/tmp/test-product.json
docker exec challenge-localstack awslocal s3 cp /tmp/test-product.json s3://product-ingestion-bucket/test/products.json

# Invoke Lambda manually (PowerShell)
$payload = '{"Records":[{"s3":{"bucket":{"name":"product-ingestion-bucket"},"object":{"key":"test/products.json"}}}]}'
$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
docker exec challenge-localstack sh -c "echo $base64 | base64 -d > /tmp/payload.json && awslocal lambda invoke --function-name product-ingestion-lambda --payload file:///tmp/payload.json /tmp/result.json && cat /tmp/result.json"
```

```bash
# Bash/Linux - Invoke Lambda manually
docker exec challenge-localstack sh -c 'echo "{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"product-ingestion-bucket\"},\"object\":{\"key\":\"test/products.json\"}}}]}" | base64 -d > /tmp/payload.json && awslocal lambda invoke --function-name product-ingestion-lambda --payload file:///tmp/payload.json /tmp/result.json && cat /tmp/result.json'
```

Expected Lambda response:
```json
{"statusCode": 200, "body": {"message": "Processing complete", "source": {"bucket": "product-ingestion-bucket", "key": "test/products.json"}, "published": 1, "total": 1}}
```

**Verify products in both PIM systems:**

```bash
# Check Pimcore
curl http://localhost:8080/api/objects

# Check MedusaJS (requires authentication)
# Login first, then use session cookie
curl -X POST http://localhost:9000/admin/auth \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@challenge.com","password":"admin123"}' \
  -c cookies.txt
curl http://localhost:9000/admin/products -b cookies.txt
```

#### Step 5: Monitor the Pipeline

```bash
# View NestJS logs (SQS consumer) - shows message processing
docker-compose logs -f nestjs-integration

# View Pimcore logs - shows API requests
docker logs challenge-pimcore -f

# View all service logs
docker-compose logs -f

# Check SQS queue messages (via LocalStack)
docker exec challenge-localstack awslocal sqs get-queue-attributes \
    --queue-url http://localhost:4566/000000000000/product-ingestion-queue \
    --attribute-names ApproximateNumberOfMessages

# Check Dead Letter Queue for failed messages
docker exec challenge-localstack awslocal sqs get-queue-attributes \
    --queue-url http://localhost:4566/000000000000/product-ingestion-dlq \
    --attribute-names ApproximateNumberOfMessages
```

**What to look for in NestJS logs:**
- `SqsConsumerService] Received X messages from SQS` - Messages being polled
- `Processing product: <id>` - Product being processed
- `Successfully pushed to Pimcore` - Product synced to PIM
- `Successfully pushed to MedusaJS` - Product synced to Commerce

### Stopping Services

```bash
# Stop all services (preserves data)
docker-compose down

# Stop and remove all data volumes (clean restart)
docker-compose down -v
```

### Development Tips

**Rebuild a specific service after code changes:**
```bash
docker-compose build nestjs-integration
docker-compose up -d nestjs-integration
```

**View service logs:**
```bash
docker-compose logs -f <service-name>
# Examples:
docker-compose logs -f nestjs-integration
docker-compose logs -f medusa
docker-compose logs -f localstack
```

**Access container shell:**
```bash
docker exec -it challenge-nestjs sh
docker exec -it challenge-medusa sh
docker exec -it challenge-postgres psql -U postgres
```

---

## AWS Production Deployment

### Prerequisites

1. AWS CLI configured with credentials:
   ```bash
   aws configure
   # Enter: Access Key ID, Secret Access Key, Region (us-east-1)
   ```

2. Verify AWS access:
   ```bash
   aws sts get-caller-identity
   ```

### Deployed Resources

All resources have been deployed to AWS. See `aws-resources.env` for resource identifiers:

| Resource | Name/ARN |
|----------|----------|
| S3 Bucket | `product-ingestion-bucket-147847019615` |
| Lambda | `product-ingestion-lambda` |
| EventBridge | `product-events` |
| SQS Queue | `product-ingestion-queue` |
| SQS DLQ | `product-ingestion-dlq` |
| ECS Cluster | `challenge-cluster` |
| RDS PostgreSQL | `challenge-postgres.csjw4qawm0ph.us-east-1.rds.amazonaws.com` |
| ElastiCache Redis | `challenge-redis.7yl2oj.0001.use1.cache.amazonaws.com` |

### Testing AWS Pipeline

#### Step 1: Upload Product Data to S3

```bash
# Upload test file
aws s3 cp test-product.json s3://product-ingestion-bucket-147847019615/test/

# Upload full dataset
aws s3 cp shein_products.json s3://product-ingestion-bucket-147847019615/products/
```

#### Step 2: Monitor Lambda Execution

```bash
# View Lambda logs
aws logs tail /aws/lambda/product-ingestion-lambda --follow

# Check Lambda invocation
aws lambda get-function --function-name product-ingestion-lambda
```

#### Step 3: Check SQS Queue

```bash
# Check messages in queue
aws sqs get-queue-attributes \
    --queue-url https://sqs.us-east-1.amazonaws.com/147847019615/product-ingestion-queue \
    --attribute-names ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible

# Check Dead Letter Queue
aws sqs get-queue-attributes \
    --queue-url https://sqs.us-east-1.amazonaws.com/147847019615/product-ingestion-dlq \
    --attribute-names ApproximateNumberOfMessages
```

#### Step 4: Check ECS Services

```bash
# List running tasks
aws ecs list-tasks --cluster challenge-cluster

# Describe services
aws ecs describe-services --cluster challenge-cluster \
    --services nestjs-service pimcore-service medusajs-service

# View service logs
aws logs tail /ecs/challenge-nestjs --follow
```

### Redeploying Services

If you need to redeploy after code changes:

```bash
# 1. Build and push Docker image
docker build -t challenge/nestjs-integration ./services/nestjs-integration
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 147847019615.dkr.ecr.us-east-1.amazonaws.com
docker tag challenge/nestjs-integration:latest 147847019615.dkr.ecr.us-east-1.amazonaws.com/challenge/nestjs-integration:latest
docker push 147847019615.dkr.ecr.us-east-1.amazonaws.com/challenge/nestjs-integration:latest

# 2. Force new deployment
aws ecs update-service --cluster challenge-cluster --service nestjs-service --force-new-deployment
```

---

## Canonical Product Format

The pipeline uses a standardized product format for data exchange. When sending events via EventBridge or processing SHEIN data, products must follow this structure:

```json
{
  "eventId": "evt-unique-id",
  "timestamp": "2026-02-19T12:00:00Z",
  "correlationId": "tracking-id",
  "product": {
    "id": "product-unique-id",
    "sku": "SKU-001",
    "name": { "en": "Product Name", "ar": "اسم المنتج" },
    "description": { "en": "Description", "ar": "الوصف" },
    "categories": [
      { "id": "cat-1", "name": { "en": "Category" }, "slug": "category", "level": 1 }
    ],
    "attributes": [
      { "name": { "en": "Brand" }, "value": { "en": "SHEIN" }, "type": "text" }
    ],
    "variants": [
      {
        "sku": "SKU-001-M-BLUE",
        "color": { "name": "Blue", "code": "#0000FF" },
        "size": "M",
        "price": { "amount": 29.99, "currency": "USD", "originalAmount": 39.99, "discountPercent": 25 },
        "stock": 100,
        "images": ["https://example.com/image.jpg"]
      }
    ],
    "images": [
      { "url": "https://example.com/main.jpg", "type": "main", "sortOrder": 1 }
    ],
    "metadata": {
      "source": "shein",
      "sourceId": "original-id",
      "importedAt": "2026-02-19T12:00:00Z",
      "productRelationId": "relation-id"
    }
  },
  "metadata": {
    "s3Bucket": "product-ingestion-bucket",
    "s3Key": "path/to/file.json",
    "batchId": "batch-001",
    "itemIndex": 0,
    "totalItems": 1
  }
}
```

**Key Fields:**
- `name` and `description` use localized strings (`{en: "...", ar: "..."}`)
- `categories`, `attributes`, `variants`, and `images` are required arrays
- The Lambda function transforms raw SHEIN data into this canonical format

---

## Testing the Pipeline

### Unit Tests

#### Python Lambda Tests

```bash
cd services/ingestion-lambda

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest -v

# Run with coverage
pytest --cov=src --cov-report=term-missing
```

#### NestJS Tests

```bash
cd services/nestjs-integration

# Install dependencies
npm install

# Run unit tests
npm test

# Run with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

### End-to-End Tests

#### Local E2E Test

```powershell
# PowerShell script
.\scripts\test-e2e.ps1
```

Or manually:

```bash
# 1. Ensure services are running
docker-compose up -d

# 2. Wait for health checks
sleep 60

# 3. Upload test data
aws --endpoint-url http://localhost:4566 s3 cp test-product.json s3://product-ingestion-bucket/e2e-test.json

# 4. Wait for processing
sleep 10

# 5. Check NestJS logs for processing
docker-compose logs nestjs-integration | grep "ProductIngested"

# 6. Verify SQS queue is processed
aws --endpoint-url http://localhost:4566 sqs get-queue-attributes \
    --queue-url http://localhost:4566/000000000000/product-ingestion-queue \
    --attribute-names ApproximateNumberOfMessages
```

#### AWS E2E Test

```bash
# 1. Upload test data
aws s3 cp test-product.json s3://product-ingestion-bucket-147847019615/e2e-test/test.json

# 2. Check Lambda CloudWatch logs
aws logs tail /aws/lambda/product-ingestion-lambda --since 5m

# 3. Verify SQS processing
aws sqs get-queue-attributes \
    --queue-url https://sqs.us-east-1.amazonaws.com/147847019615/product-ingestion-queue \
    --attribute-names ApproximateNumberOfMessages

# 4. Check NestJS ECS logs
aws logs tail /ecs/challenge-nestjs --since 5m
```

---

## Troubleshooting

### Common Issues

#### Docker: Port Already in Use

```bash
# Find process using port
netstat -ano | findstr :3000   # Windows
lsof -i :3000                   # Linux/Mac

# Stop conflicting container
docker stop <container_name>
```

#### MedusaJS: TypeORM Error on Startup

This usually indicates stale database state:

```bash
# Remove all volumes and restart fresh
docker-compose down -v
docker-compose up -d
```

#### LocalStack: AWS Commands Fail

Ensure you're using the LocalStack endpoint:

```bash
# Correct (local)
aws --endpoint-url http://localhost:4566 s3 ls

# Wrong (tries real AWS)
aws s3 ls
```

#### NestJS: Cannot Connect to SQS

Check LocalStack is healthy:

```bash
curl http://localhost:4566/_localstack/health

# Verify queue exists
docker exec challenge-localstack awslocal sqs list-queues
```

#### Pimcore API: Connection Refused

If the Pimcore API is not responding:

```bash
# Check Pimcore API logs
docker logs challenge-pimcore

# Verify the service is running
docker exec challenge-pimcore wget -q -O- http://127.0.0.1:80/api/health

# Restart the container
docker restart challenge-pimcore
```

#### Pimcore API: Product Not Created

If products are not being created in Pimcore, check:
1. The event format matches the canonical product format
2. All required fields are present (name, categories, variants, images, metadata)
3. NestJS logs for error details: `docker logs challenge-nestjs`

#### Services Not Starting

Check container logs:

```bash
docker-compose logs <service-name>

# Common issues:
# - Database not ready: wait longer or restart
# - Port conflict: stop conflicting process
# - Build failed: check Dockerfile errors
```

### Health Check Commands

```bash
# All services health check
docker-compose ps

# Individual service health
curl http://localhost:3000/health          # NestJS
curl http://localhost:9000/health          # MedusaJS
curl http://localhost:8080/api/health      # Pimcore API
curl http://localhost:4566/_localstack/health  # LocalStack

# Database/Cache connectivity
docker exec challenge-postgres pg_isready -U postgres
docker exec challenge-redis redis-cli ping

# Check products in Pimcore
curl http://localhost:8080/api/objects
```

### Logs Location

| Environment | Service | Log Location |
|-------------|---------|--------------|
| Local | All | `docker-compose logs <service>` |
| AWS | Lambda | CloudWatch: `/aws/lambda/product-ingestion-lambda` |
| AWS | NestJS | CloudWatch: `/ecs/challenge-nestjs` |
| AWS | Pimcore | CloudWatch: `/ecs/challenge-pimcore` |
| AWS | MedusaJS | CloudWatch: `/ecs/challenge-medusajs` |

---

## Quick Reference

### Local Development Commands

```bash
# Start everything
docker-compose up -d

# Initialize LocalStack (after services are healthy)
docker cp init-localstack.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/init-localstack.sh > /tmp/init.sh && chmod +x /tmp/init.sh && /tmp/init.sh"

# Stop everything
docker-compose down

# Clean restart (removes data)
docker-compose down -v && docker-compose up -d

# Rebuild and restart a service
docker-compose build <service> && docker-compose up -d <service>

# View logs
docker-compose logs -f

# Upload SHEIN products
docker cp shein_products.json challenge-localstack:/tmp/
docker exec challenge-localstack awslocal s3 cp /tmp/shein_products.json s3://product-ingestion-bucket/

# Send test event manually
docker exec challenge-localstack awslocal events put-events --entries '[{"Source":"com.challenge.ingestion","DetailType":"ProductIngested","EventBusName":"product-events","Detail":"{\"product\":{\"id\":\"test-001\",\"sku\":\"SKU-001\",\"name\":\"Test Product\",\"price\":19.99},\"eventId\":\"evt-001\"}"}]'
```

### AWS Production Commands

```bash
# Upload data
aws s3 cp shein_products.json s3://product-ingestion-bucket-147847019615/

# Check Lambda logs
aws logs tail /aws/lambda/product-ingestion-lambda --follow

# Check ECS service status
aws ecs describe-services --cluster challenge-cluster --services nestjs-service

# Force redeploy
aws ecs update-service --cluster challenge-cluster --service nestjs-service --force-new-deployment
```

---

## Support

For questions about this implementation, see:
- [ASSUMPTIONS.md](../ASSUMPTIONS.md) - Technical decisions
- [docs/aws-deployment.md](aws-deployment.md) - Detailed AWS setup
- [aws-resources.env](../aws-resources.env) - Resource identifiers
