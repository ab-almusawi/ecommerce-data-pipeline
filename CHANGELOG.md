# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-19

### Added

- **Python Ingestion Lambda**
  - S3 trigger for JSON file processing
  - SHEIN to canonical model transformation
  - EventBridge event publishing
  - Step Functions integration
  - Custom exception hierarchy
  - Retry with exponential backoff
  - Correlation ID tracking
  - Structured JSON logging
  - Comprehensive unit tests

- **NestJS Integration Service**
  - SQS message consumer with polling
  - Pimcore API client with product upsert
  - MedusaJS API client with product sync
  - Redis-based idempotency
  - Circuit breaker pattern
  - Retry with exponential backoff
  - Configuration validation
  - Health check endpoints with metrics
  - Comprehensive unit tests

- **Infrastructure**
  - Docker Compose for local development
  - LocalStack for AWS service emulation
  - PostgreSQL database configuration
  - Redis for caching and idempotency
  - Serverless Framework deployment
  - Step Functions workflow definition

- **Documentation**
  - C4 architecture diagrams
  - Sequence diagrams
  - Canonical data model specification
  - AWS deployment guide
  - README with quick start guide
  - Technical assumptions document
  - Contributing guidelines

### Technical Details

- Python 3.11+ with Pydantic v2
- NestJS 10 with TypeScript 5
- AWS SDK v3 for JavaScript
- Boto3 for Python AWS integration
- Jest for TypeScript testing
- Pytest for Python testing

## [Unreleased]

### Planned

- GraphQL API for product queries
- Webhook support for real-time updates
- Multi-region deployment support
- Kubernetes deployment manifests
- Terraform infrastructure modules
