#!/bin/bash
# Deploy Lambda to LocalStack

set -e

echo "============================================"
echo "Deploying Ingestion Lambda to LocalStack"
echo "============================================"

# Create deployment package
echo "[1/5] Creating deployment package..."
cd /tmp
rm -rf lambda-package lambda-package.zip 2>/dev/null || true
mkdir -p lambda-package

# Copy source files
cp -r /lambda-src/src/* lambda-package/
cp /lambda-src/requirements.txt lambda-package/

# Install dependencies
cd lambda-package
pip install -r requirements.txt -t . --quiet
rm -rf requirements.txt *.dist-info __pycache__ tests

# Create zip
cd /tmp
zip -r lambda-package.zip lambda-package/* -q

echo "[2/5] Creating IAM role..."
awslocal iam create-role \
    --role-name lambda-execution-role \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    2>/dev/null || echo "Role already exists"

echo "[3/5] Deploying Lambda function..."
awslocal lambda create-function \
    --function-name product-ingestion-lambda \
    --runtime python3.11 \
    --role arn:aws:iam::000000000000:role/lambda-execution-role \
    --handler handler.handler \
    --zip-file fileb:///tmp/lambda-package.zip \
    --timeout 60 \
    --memory-size 256 \
    --environment "Variables={EVENT_BUS_NAME=product-events,AWS_REGION=us-east-1,LOCALSTACK_ENDPOINT=http://localhost:4566,LOG_LEVEL=INFO}" \
    2>/dev/null || \
awslocal lambda update-function-code \
    --function-name product-ingestion-lambda \
    --zip-file fileb:///tmp/lambda-package.zip

echo "[4/5] Adding S3 trigger permission..."
awslocal lambda add-permission \
    --function-name product-ingestion-lambda \
    --statement-id s3-trigger \
    --action lambda:InvokeFunction \
    --principal s3.amazonaws.com \
    --source-arn arn:aws:s3:::product-ingestion-bucket \
    2>/dev/null || echo "Permission already exists"

echo "[5/5] Configuring S3 bucket notification..."
awslocal s3api put-bucket-notification-configuration \
    --bucket product-ingestion-bucket \
    --notification-configuration '{
        "LambdaFunctionConfigurations": [
            {
                "LambdaFunctionArn": "arn:aws:lambda:us-east-1:000000000000:function:product-ingestion-lambda",
                "Events": ["s3:ObjectCreated:*"],
                "Filter": {
                    "Key": {
                        "FilterRules": [
                            {"Name": "suffix", "Value": ".json"}
                        ]
                    }
                }
            }
        ]
    }'

echo ""
echo "============================================"
echo "Lambda deployment complete!"
echo "============================================"
echo ""
echo "To test: Upload a JSON file to S3"
echo "  awslocal s3 cp test.json s3://product-ingestion-bucket/"
echo ""

# Verify deployment
awslocal lambda get-function --function-name product-ingestion-lambda --query 'Configuration.{Name:FunctionName,Runtime:Runtime,State:State}'
