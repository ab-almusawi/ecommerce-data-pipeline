# AWS Deployment Guide

This guide covers deploying the Product Data Pipeline to a real AWS account.

## Prerequisites

- AWS Account (Free Tier is sufficient)
- AWS CLI v2 configured with credentials
- Serverless Framework (`npm install -g serverless`)
- Docker (for building Lambda container)
- Node.js 20+
- Python 3.11+

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐    ┌─────────┐     │
│  │   S3    │───>│ Lambda  │───>│ EventBridge │───>│   SQS   │     │
│  │ Bucket  │    │ (Python)│    │             │    │  Queue  │     │
│  └─────────┘    └─────────┘    └─────────────┘    └────┬────┘     │
│                                                         │          │
│  ┌─────────────────────────────────────────────────────┼──────┐   │
│  │                      ECS Cluster                     │      │   │
│  │  ┌───────────────┐   ┌─────────────┐   ┌───────────┐│      │   │
│  │  │    NestJS     │<──┤   Pimcore   │<──┤  Medusa   ││      │   │
│  │  │   Service     │   │    (ECS)    │   │  (ECS)    ││      │   │
│  │  └───────────────┘   └─────────────┘   └───────────┘│      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐                                │
│  │     RDS     │    │ ElastiCache │                                │
│  │ PostgreSQL  │    │   Redis     │                                │
│  └─────────────┘    └─────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Step 1: Set Up AWS Infrastructure

### 1.1 Create S3 Bucket

```bash
# Create the ingestion bucket
aws s3 mb s3://product-ingestion-bucket-prod --region us-east-1

# Enable EventBridge notifications
aws s3api put-bucket-notification-configuration \
    --bucket product-ingestion-bucket-prod \
    --notification-configuration '{
        "EventBridgeConfiguration": {}
    }'
```

### 1.2 Create SQS Queues

```bash
# Create Dead Letter Queue
aws sqs create-queue --queue-name product-ingestion-dlq-prod

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
    --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/product-ingestion-dlq-prod \
    --attribute-names QueueArn \
    --query 'Attributes.QueueArn' \
    --output text)

# Create main queue with DLQ
aws sqs create-queue \
    --queue-name product-ingestion-queue-prod \
    --attributes '{
        "VisibilityTimeout": "300",
        "MessageRetentionPeriod": "1209600",
        "RedrivePolicy": "{\"deadLetterTargetArn\":\"'$DLQ_ARN'\",\"maxReceiveCount\":\"3\"}"
    }'
```

### 1.3 Create EventBridge Event Bus and Rule

```bash
# Create event bus
aws events create-event-bus --name product-events

# Create rule for ProductIngested events
aws events put-rule \
    --name product-ingested-to-sqs \
    --event-bus-name product-events \
    --event-pattern '{
        "source": ["com.challenge.ingestion"],
        "detail-type": ["ProductIngested"]
    }'

# Add SQS target
aws events put-targets \
    --rule product-ingested-to-sqs \
    --event-bus-name product-events \
    --targets '[{
        "Id": "sqs-target",
        "Arn": "arn:aws:sqs:us-east-1:YOUR_ACCOUNT_ID:product-ingestion-queue-prod"
    }]'
```

## Step 2: Deploy Lambda Function

### 2.1 Using Serverless Framework

```bash
cd infrastructure/aws/lambda

# Install dependencies
npm install

# Deploy to AWS
serverless deploy --stage prod --region us-east-1
```

### 2.2 Manual Deployment (Alternative)

```bash
cd services/ingestion-lambda

# Create deployment package
pip install -r requirements.txt -t package/
cp -r src/ package/
cd package && zip -r ../deployment.zip . && cd ..

# Create Lambda function
aws lambda create-function \
    --function-name product-ingestion-lambda \
    --runtime python3.11 \
    --handler src.handler.handler \
    --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
    --zip-file fileb://deployment.zip \
    --timeout 300 \
    --memory-size 512 \
    --environment '{
        "Variables": {
            "EVENT_BUS_NAME": "product-events",
            "LOG_LEVEL": "INFO"
        }
    }'

# Add S3 trigger
aws lambda add-permission \
    --function-name product-ingestion-lambda \
    --statement-id s3-trigger \
    --action lambda:InvokeFunction \
    --principal s3.amazonaws.com \
    --source-arn arn:aws:s3:::product-ingestion-bucket-prod

aws s3api put-bucket-notification-configuration \
    --bucket product-ingestion-bucket-prod \
    --notification-configuration '{
        "LambdaFunctionConfigurations": [{
            "LambdaFunctionArn": "arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:function:product-ingestion-lambda",
            "Events": ["s3:ObjectCreated:*"],
            "Filter": {
                "Key": {
                    "FilterRules": [{"Name": "suffix", "Value": ".json"}]
                }
            }
        }]
    }'
```

## Step 3: Set Up RDS PostgreSQL

```bash
# Create RDS instance
aws rds create-db-instance \
    --db-instance-identifier challenge-postgres \
    --db-instance-class db.t3.micro \
    --engine postgres \
    --engine-version 15 \
    --master-username postgres \
    --master-user-password YOUR_SECURE_PASSWORD \
    --allocated-storage 20 \
    --publicly-accessible \
    --backup-retention-period 7

# Wait for instance to be available
aws rds wait db-instance-available --db-instance-identifier challenge-postgres

# Get endpoint
aws rds describe-db-instances \
    --db-instance-identifier challenge-postgres \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text
```

## Step 4: Set Up ElastiCache Redis

```bash
# Create Redis cluster
aws elasticache create-cache-cluster \
    --cache-cluster-id challenge-redis \
    --cache-node-type cache.t3.micro \
    --engine redis \
    --num-cache-nodes 1
```

## Step 5: Deploy NestJS to ECS

### 5.1 Create ECR Repository

```bash
# Create ECR repository
aws ecr create-repository --repository-name nestjs-integration

# Get login
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin \
    YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
```

### 5.2 Build and Push Docker Image

```bash
cd services/nestjs-integration

# Build image
docker build -t nestjs-integration .

# Tag image
docker tag nestjs-integration:latest \
    YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/nestjs-integration:latest

# Push to ECR
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/nestjs-integration:latest
```

### 5.3 Create ECS Task Definition

Create `ecs-task-definition.json`:

```json
{
  "family": "nestjs-integration",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "nestjs-integration",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/nestjs-integration:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "AWS_REGION", "value": "us-east-1"},
        {"name": "SQS_QUEUE_URL", "value": "https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/product-ingestion-queue-prod"},
        {"name": "PIMCORE_API_URL", "value": "http://pimcore-service:80/api"},
        {"name": "MEDUSA_API_URL", "value": "http://medusa-service:9000"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/nestjs-integration",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

# Create ECS cluster
aws ecs create-cluster --cluster-name challenge-cluster

# Create service
aws ecs create-service \
    --cluster challenge-cluster \
    --service-name nestjs-integration \
    --task-definition nestjs-integration \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration '{
        "awsvpcConfiguration": {
            "subnets": ["subnet-xxx"],
            "securityGroups": ["sg-xxx"],
            "assignPublicIp": "ENABLED"
        }
    }'
```

## Step 6: Deploy Pimcore and MedusaJS

For Pimcore and MedusaJS, you have two options:

### Option A: ECS Deployment (Recommended)

Follow similar steps as NestJS:
1. Build Docker images
2. Push to ECR
3. Create task definitions
4. Deploy to ECS cluster

### Option B: EC2 Deployment

1. Launch EC2 instance (t3.medium recommended)
2. Install Docker and Docker Compose
3. Copy docker-compose.yml
4. Run `docker-compose up -d pimcore medusa`

## Step 7: Configure IAM Roles

### Lambda Execution Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::product-ingestion-bucket-prod",
        "arn:aws:s3:::product-ingestion-bucket-prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "events:PutEvents"
      ],
      "Resource": [
        "arn:aws:events:us-east-1:*:event-bus/product-events"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### ECS Task Role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:sqs:us-east-1:*:product-ingestion-queue-prod"
      ]
    }
  ]
}
```

## Step 8: Test Deployment

```bash
# Upload test file to S3
aws s3 cp shein_products.json s3://product-ingestion-bucket-prod/

# Check Lambda logs
aws logs tail /aws/lambda/product-ingestion-lambda --follow

# Check SQS queue
aws sqs get-queue-attributes \
    --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/product-ingestion-queue-prod \
    --attribute-names ApproximateNumberOfMessages

# Check ECS service
aws ecs describe-services \
    --cluster challenge-cluster \
    --services nestjs-integration
```

## Cost Estimation (Free Tier)

| Service | Free Tier | Expected Usage |
|---------|-----------|----------------|
| Lambda | 1M requests/month | ~1000 requests |
| S3 | 5GB storage | ~100MB |
| SQS | 1M requests/month | ~10K messages |
| EventBridge | Free | N/A |
| RDS | 750 hours/month | 24/7 = 720 hours |
| ElastiCache | 750 hours/month | 24/7 = 720 hours |
| ECS Fargate | 750 hours/month | ~200 hours |

**Estimated Monthly Cost: $0 (within Free Tier)**

## Cleanup

```bash
# Delete ECS services
aws ecs delete-service --cluster challenge-cluster --service nestjs-integration --force

# Delete ECS cluster
aws ecs delete-cluster --cluster challenge-cluster

# Delete Lambda
aws lambda delete-function --function-name product-ingestion-lambda

# Delete SQS queues
aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/product-ingestion-queue-prod
aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/YOUR_ACCOUNT_ID/product-ingestion-dlq-prod

# Delete EventBridge
aws events remove-targets --rule product-ingested-to-sqs --event-bus-name product-events --ids sqs-target
aws events delete-rule --name product-ingested-to-sqs --event-bus-name product-events
aws events delete-event-bus --name product-events

# Delete S3 bucket (must be empty first)
aws s3 rm s3://product-ingestion-bucket-prod --recursive
aws s3 rb s3://product-ingestion-bucket-prod

# Delete RDS
aws rds delete-db-instance --db-instance-identifier challenge-postgres --skip-final-snapshot

# Delete ElastiCache
aws elasticache delete-cache-cluster --cache-cluster-id challenge-redis

# Delete ECR repository
aws ecr delete-repository --repository-name nestjs-integration --force
```

## Monitoring & Alerts

### CloudWatch Alarms

```bash
# Lambda errors alarm
aws cloudwatch put-metric-alarm \
    --alarm-name lambda-errors \
    --metric-name Errors \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 300 \
    --threshold 5 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=FunctionName,Value=product-ingestion-lambda \
    --evaluation-periods 1

# SQS DLQ alarm
aws cloudwatch put-metric-alarm \
    --alarm-name dlq-messages \
    --metric-name ApproximateNumberOfMessagesVisible \
    --namespace AWS/SQS \
    --statistic Sum \
    --period 300 \
    --threshold 1 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=QueueName,Value=product-ingestion-dlq-prod \
    --evaluation-periods 1
```
