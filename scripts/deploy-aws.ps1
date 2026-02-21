<#
.SYNOPSIS
    Deploy AWS resources for the Product Data Pipeline

.DESCRIPTION
    Creates S3, SQS, EventBridge, and Lambda resources in AWS
#>

param(
    [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Continue"

# Refresh PATH to include AWS CLI
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Set credentials (will use environment variables or AWS config)
$env:AWS_DEFAULT_REGION = $Region

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AWS Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get Account ID
Write-Host "[1/8] Getting AWS Account ID..." -ForegroundColor Yellow
$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
$AccountId = $identity.Account
Write-Host "  Account: $AccountId" -ForegroundColor Green

# S3 Bucket (unique name with account ID)
$BucketName = "product-ingestion-bucket-$AccountId"
Write-Host ""
Write-Host "[2/8] Creating S3 bucket: $BucketName..." -ForegroundColor Yellow
aws s3 mb "s3://$BucketName" --region $Region 2>$null
aws s3api put-bucket-notification-configuration --bucket $BucketName --notification-configuration '{"EventBridgeConfiguration": {}}' 2>$null
Write-Host "  S3 bucket created" -ForegroundColor Green

# SQS Dead Letter Queue
Write-Host ""
Write-Host "[3/8] Creating SQS Dead Letter Queue..." -ForegroundColor Yellow
$dlqResult = aws sqs create-queue --queue-name product-ingestion-dlq --region $Region --output json | ConvertFrom-Json
$DlqUrl = $dlqResult.QueueUrl
Write-Host "  DLQ URL: $DlqUrl" -ForegroundColor Green

# Get DLQ ARN
$dlqAttrs = aws sqs get-queue-attributes --queue-url $DlqUrl --attribute-names QueueArn --output json | ConvertFrom-Json
$DlqArn = $dlqAttrs.Attributes.QueueArn
Write-Host "  DLQ ARN: $DlqArn" -ForegroundColor Green

# SQS Main Queue with DLQ
Write-Host ""
Write-Host "[4/8] Creating SQS Main Queue..." -ForegroundColor Yellow
$redrivePolicy = "{`"deadLetterTargetArn`":`"$DlqArn`",`"maxReceiveCount`":`"3`"}"
$queueAttrs = @{
    VisibilityTimeout = "300"
    MessageRetentionPeriod = "1209600"
    RedrivePolicy = $redrivePolicy
} | ConvertTo-Json -Compress
$queueResult = aws sqs create-queue --queue-name product-ingestion-queue --attributes $queueAttrs --region $Region --output json 2>$null | ConvertFrom-Json
$QueueUrl = $queueResult.QueueUrl
Write-Host "  Queue URL: $QueueUrl" -ForegroundColor Green

# Get Queue ARN
$queueAttrsResult = aws sqs get-queue-attributes --queue-url $QueueUrl --attribute-names QueueArn --output json | ConvertFrom-Json
$QueueArn = $queueAttrsResult.Attributes.QueueArn
Write-Host "  Queue ARN: $QueueArn" -ForegroundColor Green

# EventBridge Event Bus
Write-Host ""
Write-Host "[5/8] Creating EventBridge Event Bus..." -ForegroundColor Yellow
aws events create-event-bus --name product-events --region $Region 2>$null
Write-Host "  Event bus 'product-events' created" -ForegroundColor Green

# EventBridge Rule
Write-Host ""
Write-Host "[6/8] Creating EventBridge Rule..." -ForegroundColor Yellow
$eventPattern = '{"source":["com.challenge.ingestion"],"detail-type":["ProductIngested"]}'
aws events put-rule --name product-ingested-to-sqs --event-bus-name product-events --event-pattern $eventPattern --region $Region 2>$null
Write-Host "  Rule 'product-ingested-to-sqs' created" -ForegroundColor Green

# Add SQS Target to Rule
Write-Host ""
Write-Host "[7/8] Adding SQS target to EventBridge rule..." -ForegroundColor Yellow
$targets = "[{`"Id`":`"sqs-target`",`"Arn`":`"$QueueArn`"}]"
aws events put-targets --rule product-ingested-to-sqs --event-bus-name product-events --targets $targets --region $Region 2>$null

# Add SQS Policy to allow EventBridge
$sqsPolicy = @{
    Version = "2012-10-17"
    Statement = @(
        @{
            Sid = "AllowEventBridge"
            Effect = "Allow"
            Principal = @{ Service = "events.amazonaws.com" }
            Action = "sqs:SendMessage"
            Resource = $QueueArn
        }
    )
} | ConvertTo-Json -Depth 10 -Compress

aws sqs set-queue-attributes --queue-url $QueueUrl --attributes "Policy=$sqsPolicy" --region $Region 2>$null
Write-Host "  SQS target added" -ForegroundColor Green

# Summary
Write-Host ""
Write-Host "[8/8] Deployment Complete!" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AWS Resources Created" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  S3 Bucket:      $BucketName" -ForegroundColor White
Write-Host "  SQS Queue:      $QueueUrl" -ForegroundColor White
Write-Host "  SQS DLQ:        $DlqUrl" -ForegroundColor White
Write-Host "  EventBridge:    product-events" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Deploy Lambda: cd infrastructure/aws/lambda && serverless deploy --stage prod" -ForegroundColor White
Write-Host "  2. Upload test data: aws s3 cp shein_products.json s3://$BucketName/" -ForegroundColor White
Write-Host ""

# Output environment variables for Lambda deployment
@"
# Add these to your serverless.yml or .env
S3_BUCKET=$BucketName
SQS_QUEUE_URL=$QueueUrl
SQS_DLQ_URL=$DlqUrl
EVENT_BUS_NAME=product-events
AWS_ACCOUNT_ID=$AccountId
"@ | Out-File -FilePath ".\aws-resources.env" -Encoding UTF8

Write-Host "Resource details saved to: aws-resources.env" -ForegroundColor Green
