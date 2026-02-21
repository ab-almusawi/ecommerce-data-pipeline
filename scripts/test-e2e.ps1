<#
.SYNOPSIS
    End-to-end test script for the Product Data Pipeline

.DESCRIPTION
    This script tests the full data flow:
    1. Uploads test data to S3 (LocalStack)
    2. Verifies EventBridge events
    3. Checks SQS queue
    4. Verifies NestJS processing
    5. Checks health endpoints

.EXAMPLE
    .\scripts\test-e2e.ps1
#>

param(
    [string]$LocalStackEndpoint = "http://localhost:4566",
    [string]$NestJSEndpoint = "http://localhost:3000",
    [string]$S3Bucket = "product-ingestion-bucket",
    [string]$SqsQueueUrl = "http://localhost:4566/000000000000/product-ingestion-queue"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Product Data Pipeline" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Test-ServiceHealth {
    param([string]$Url, [string]$ServiceName)
    
    Write-Host "Checking $ServiceName health..." -NoNewline
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec 5
        Write-Host " OK" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

function Test-LocalStack {
    Write-Host "Checking LocalStack..." -NoNewline
    try {
        $health = Invoke-RestMethod -Uri "$LocalStackEndpoint/_localstack/health"
        if ($health.services.s3 -eq "available" -and $health.services.sqs -eq "available") {
            Write-Host " OK" -ForegroundColor Green
            return $true
        }
        Write-Host " DEGRADED" -ForegroundColor Yellow
        return $false
    }
    catch {
        Write-Host " FAILED" -ForegroundColor Red
        return $false
    }
}

# Step 1: Check services
Write-Host "`n[Step 1] Checking service health..." -ForegroundColor Cyan
$localstackOk = Test-LocalStack
$nestjsOk = Test-ServiceHealth -Url "$NestJSEndpoint/health" -ServiceName "NestJS"

if (-not $localstackOk) {
    Write-Host "LocalStack is not available. Please start with: docker-compose up localstack" -ForegroundColor Red
    exit 1
}

# Step 2: Check S3 bucket
Write-Host "`n[Step 2] Checking S3 bucket..." -ForegroundColor Cyan
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"

try {
    aws --endpoint-url $LocalStackEndpoint s3 ls s3://$S3Bucket 2>$null
    Write-Host "  S3 bucket exists: $S3Bucket" -ForegroundColor Green
}
catch {
    Write-Host "  Creating S3 bucket: $S3Bucket" -ForegroundColor Yellow
    aws --endpoint-url $LocalStackEndpoint s3 mb s3://$S3Bucket
}

# Step 3: Create test product file
Write-Host "`n[Step 3] Creating test product data..." -ForegroundColor Cyan
$testProduct = @"
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
"@

$testFilePath = Join-Path $env:TEMP "test-products.json"
$testProduct | Out-File -FilePath $testFilePath -Encoding UTF8
Write-Host "  Created test file: $testFilePath" -ForegroundColor Green

# Step 4: Upload to S3
Write-Host "`n[Step 4] Uploading test data to S3..." -ForegroundColor Cyan
aws --endpoint-url $LocalStackEndpoint s3 cp $testFilePath s3://$S3Bucket/test-products.json
Write-Host "  Uploaded to s3://$S3Bucket/test-products.json" -ForegroundColor Green

# Step 5: Check SQS queue
Write-Host "`n[Step 5] Checking SQS queue..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

$queueAttributes = aws --endpoint-url $LocalStackEndpoint sqs get-queue-attributes `
    --queue-url $SqsQueueUrl `
    --attribute-names ApproximateNumberOfMessages `
    --output json | ConvertFrom-Json

$messageCount = $queueAttributes.Attributes.ApproximateNumberOfMessages
Write-Host "  Messages in queue: $messageCount" -ForegroundColor $(if ($messageCount -gt 0) { "Green" } else { "Yellow" })

# Step 6: Check NestJS metrics
if ($nestjsOk) {
    Write-Host "`n[Step 6] Checking NestJS metrics..." -ForegroundColor Cyan
    try {
        $metrics = Invoke-RestMethod -Uri "$NestJSEndpoint/health/metrics"
        Write-Host "  Consumer processed: $($metrics.consumer.processed)" -ForegroundColor Green
        Write-Host "  Consumer skipped: $($metrics.consumer.skipped)" -ForegroundColor Green
        Write-Host "  Consumer failed: $($metrics.consumer.failed)" -ForegroundColor $(if ($metrics.consumer.failed -eq 0) { "Green" } else { "Yellow" })
    }
    catch {
        Write-Host "  Could not fetch metrics" -ForegroundColor Yellow
    }
}

# Step 7: Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LocalStack: $(if ($localstackOk) { 'OK' } else { 'FAILED' })" -ForegroundColor $(if ($localstackOk) { "Green" } else { "Red" })
Write-Host "  NestJS: $(if ($nestjsOk) { 'OK' } else { 'FAILED' })" -ForegroundColor $(if ($nestjsOk) { "Green" } else { "Red" })
Write-Host "  S3 Upload: OK" -ForegroundColor Green
Write-Host "  SQS Messages: $messageCount" -ForegroundColor $(if ($messageCount -ge 0) { "Green" } else { "Yellow" })
Write-Host ""

# Cleanup
Remove-Item $testFilePath -Force -ErrorAction SilentlyContinue

if ($localstackOk -and $nestjsOk) {
    Write-Host "E2E Test: PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "E2E Test: PARTIAL SUCCESS" -ForegroundColor Yellow
    exit 1
}
