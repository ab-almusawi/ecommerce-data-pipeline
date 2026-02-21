#!/bin/bash
set -e

echo "============================================"
echo "Initializing LocalStack AWS resources..."
echo "============================================"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

echo "[1/6] Creating S3 bucket..."
awslocal s3 mb s3://product-ingestion-bucket || true

echo "[2/6] Enabling S3 EventBridge notifications..."
awslocal s3api put-bucket-notification-configuration \
    --bucket product-ingestion-bucket \
    --notification-configuration '{"EventBridgeConfiguration": {}}'

echo "[3/6] Creating SQS queues..."
awslocal sqs create-queue --queue-name product-ingestion-dlq || true

DLQ_ARN="arn:aws:sqs:us-east-1:000000000000:product-ingestion-dlq"
awslocal sqs create-queue --queue-name product-ingestion-queue \
    --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" || true

echo "[4/6] Creating EventBridge event bus..."
awslocal events create-event-bus --name product-events || true

echo "[5/6] Creating EventBridge rule..."
awslocal events put-rule \
    --name product-ingested-to-sqs \
    --event-bus-name product-events \
    --event-pattern '{"source":["com.challenge.ingestion"],"detail-type":["ProductIngested"]}' || true

echo "[6/6] Adding SQS target to EventBridge rule..."
awslocal events put-targets \
    --rule product-ingested-to-sqs \
    --event-bus-name product-events \
    --targets '[{"Id":"sqs-target","Arn":"arn:aws:sqs:us-east-1:000000000000:product-ingestion-queue"}]' || true

echo "============================================"
echo "LocalStack initialization complete!"
echo "============================================"

awslocal s3 ls
awslocal sqs list-queues
awslocal events list-rules --event-bus-name product-events
