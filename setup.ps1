# =============================================================================
# E-Commerce Data Pipeline - Complete Setup Script (PowerShell)
# =============================================================================
# Run this script once after cloning the project on a fresh Windows machine.
# Prerequisites: Docker Desktop installed and running
# Usage: .\setup.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "E-Commerce Data Pipeline - Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Start Docker services
Write-Host "[1/5] Starting Docker services..." -ForegroundColor Yellow
docker-compose up -d

# Step 2: Wait for services to be healthy
Write-Host "[2/5] Waiting for services to be healthy (this may take 2-3 minutes)..." -ForegroundColor Yellow

Write-Host "      Waiting for PostgreSQL..."
do {
    Start-Sleep -Seconds 2
    $result = docker exec challenge-postgres pg_isready -U postgres 2>$null
} while ($LASTEXITCODE -ne 0)
Write-Host "      PostgreSQL ready." -ForegroundColor Green

Write-Host "      Waiting for Redis..."
do {
    Start-Sleep -Seconds 2
    $result = docker exec challenge-redis redis-cli ping 2>$null
} while ($LASTEXITCODE -ne 0)
Write-Host "      Redis ready." -ForegroundColor Green

Write-Host "      Waiting for LocalStack..."
do {
    Start-Sleep -Seconds 2
    $result = docker exec challenge-localstack awslocal sts get-caller-identity 2>$null
} while ($LASTEXITCODE -ne 0)
Write-Host "      LocalStack ready." -ForegroundColor Green

Write-Host "      Waiting for MedusaJS (may take up to 2 minutes)..."
do {
    Start-Sleep -Seconds 5
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9000/health" -UseBasicParsing -ErrorAction SilentlyContinue
        $healthy = $response.StatusCode -eq 200
    } catch {
        $healthy = $false
    }
} while (-not $healthy)
Write-Host "      MedusaJS ready." -ForegroundColor Green

Write-Host "      Waiting for Pimcore API..."
do {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/health" -UseBasicParsing -ErrorAction SilentlyContinue
        $healthy = $response.StatusCode -eq 200
    } catch {
        $healthy = $false
    }
} while (-not $healthy)
Write-Host "      Pimcore API ready." -ForegroundColor Green

Write-Host "      Waiting for NestJS..."
do {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -ErrorAction SilentlyContinue
        $healthy = $response.StatusCode -eq 200
    } catch {
        $healthy = $false
    }
} while (-not $healthy)
Write-Host "      NestJS ready." -ForegroundColor Green

# Step 3: Initialize LocalStack AWS resources
Write-Host "[3/5] Initializing LocalStack (S3, SQS, EventBridge)..." -ForegroundColor Yellow
docker cp init-localstack.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/init-localstack.sh > /tmp/init.sh && chmod +x /tmp/init.sh && /tmp/init.sh"

# Step 4: Deploy Lambda function
Write-Host "[4/5] Deploying Lambda function..." -ForegroundColor Yellow
docker cp services/ingestion-lambda challenge-localstack:/lambda-src
docker cp deploy-lambda.sh challenge-localstack:/tmp/
docker exec challenge-localstack sh -c "tr -d '\r' < /tmp/deploy-lambda.sh > /tmp/deploy.sh && chmod +x /tmp/deploy.sh && /tmp/deploy.sh"

# Step 5: Create MedusaJS admin user
Write-Host "[5/5] Creating MedusaJS admin user..." -ForegroundColor Yellow
docker exec challenge-medusa npx medusa user -e admin@challenge.com -p admin123 2>$null
Write-Host "      Admin user created (or already exists)." -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services running:" -ForegroundColor White
Write-Host "  - NestJS Integration: http://localhost:3000/health"
Write-Host "  - MedusaJS:           http://localhost:9000/health"
Write-Host "  - Pimcore API:        http://localhost:8080/api/health"
Write-Host "  - LocalStack:         http://localhost:4566"
Write-Host ""
Write-Host "MedusaJS Admin:" -ForegroundColor White
Write-Host "  - Email:    admin@challenge.com"
Write-Host "  - Password: admin123"
Write-Host ""
Write-Host "To test the pipeline:" -ForegroundColor White
Write-Host "  1. Upload a product file to S3:"
Write-Host '     docker cp test-product.json challenge-localstack:/tmp/'
Write-Host '     docker exec challenge-localstack awslocal s3 cp /tmp/test-product.json s3://product-ingestion-bucket/test/products.json'
Write-Host ""
Write-Host "  2. Invoke Lambda (PowerShell):"
Write-Host '     $payload = ''{"Records":[{"s3":{"bucket":{"name":"product-ingestion-bucket"},"object":{"key":"test/products.json"}}}]}'''
Write-Host '     $base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))'
Write-Host '     docker exec challenge-localstack sh -c "echo $base64 | base64 -d > /tmp/p.json && awslocal lambda invoke --function-name product-ingestion-lambda --payload file:///tmp/p.json /tmp/r.json && cat /tmp/r.json"'
Write-Host ""
Write-Host "  3. Check products:"
Write-Host '     (Invoke-WebRequest -Uri "http://localhost:8080/api/objects" -UseBasicParsing).Content'
Write-Host ""
