# E-Commerce Data Pipeline Challenge

**Challenge:** Backend & Integration Engineer - Expert Level

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/HOW_TO_RUN.md](docs/HOW_TO_RUN.md) | **Start here** - Full instructions for local & AWS |
| [ASSUMPTIONS.md](ASSUMPTIONS.md) | Technical decisions and assumptions |
| [docs/architecture-c4.md](docs/architecture-c4.md) | C4 Architecture diagrams |
| [docs/sequence-diagram.md](docs/sequence-diagram.md) | Sequence diagrams |
| [docs/data-model.md](docs/data-model.md) | Canonical data model |
| [docs/aws-deployment.md](docs/aws-deployment.md) | AWS deployment guide |
| [aws-resources.env](aws-resources.env) | Deployed AWS resource identifiers |

---


The pipeline will automatically:
1. **Lambda** processes the JSON and publishes events to EventBridge
2. **EventBridge** routes events to SQS
3. **NestJS** consumes SQS messages and syncs to Pimcore
4. **Pimcore** triggers async push to MedusaJS

## Data Flow

```
shein_products.json → AWS (Python Lambda) → EventBridge → SQS → NestJS → Pimcore → MedusaJS
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Data Pipeline Flow                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐                                                        │
│  │   SHEIN     │                                                        │
│  │   JSON      │──┐                                                     │
│  └─────────────┘  │                                                     │
│                   ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              AWS Services (LocalStack for local dev)             │   │
│  │  ┌─────────┐    ┌─────────────┐    ┌───────────┐    ┌────────┐ │   │
│  │  │   S3    │───▶│   Lambda    │───▶│EventBridge│───▶│  SQS   │ │   │
│  │  │ Bucket  │    │  (Python)   │    │           │    │ Queue  │ │   │
│  │  └─────────┘    └─────────────┘    └───────────┘    └────┬───┘ │   │
│  └───────────────────────────────────────────────────────────┼─────┘   │
│                                                               │         │
│  ┌───────────────────────────────────────────────────────────┼─────┐   │
│  │                     NestJS Integration                     │     │   │
│  │  ┌─────────────┐                                          │     │   │
│  │  │ SQS Consumer│◀─────────────────────────────────────────┘     │   │
│  │  │  + Retry    │                                                │   │
│  │  │  + Circuit  │                                                │   │
│  │  │    Breaker  │                                                │   │
│  │  └──────┬──────┘                                                │   │
│  │         │                                                        │   │
│  │         ▼                                                        │   │
│  │  ┌─────────────┐              ┌─────────────┐                   │   │
│  │  │  Pimcore    │─────────────▶│  MedusaJS   │                   │   │
│  │  │  API Client │              │  API Client │                   │   │
│  │  └─────────────┘              └─────────────┘                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Services (docker-compose up -d)

| Service | Port | Description |
|---------|------|-------------|
| **LocalStack** | 4566 | AWS emulation (S3, SQS, EventBridge, Lambda) |
| **PostgreSQL** | 5432 | Database for MedusaJS |
| **MariaDB** | 3306 | Database for Pimcore |
| **Redis** | 6379 | Caching & Idempotency |
| **Pimcore** | 8080 | Product Information Management (Nginx + PHP-FPM) |
| **MedusaJS** | 9000 | Headless Commerce Platform |
| **NestJS** | 3000 | Integration Service (SQS Consumer) |

## Project Structure

```
challenge/
├── docker-compose.yml              # 🚀 Run: docker-compose up -d
├── shein_products.json             # Sample product data
│
├── docs/                           # Architecture & Design
│   ├── architecture-c4.md          # C4 diagrams
│   ├── sequence-diagram.md         # Flow diagrams
│   ├── data-model.md               # Canonical data model
│   └── aws-deployment.md           # AWS deployment guide
│
├── services/
│   ├── ingestion-lambda/           # Python Lambda (AWS)
│   │   ├── src/
│   │   │   ├── handler.py          # Lambda handler
│   │   │   ├── transformer.py      # Data transformation
│   │   │   ├── models.py           # Pydantic models
│   │   │   ├── exceptions.py       # Custom exceptions
│   │   │   └── retry.py            # Retry utilities
│   │   └── tests/                  # Unit tests
│   │
│   ├── nestjs-integration/         # NestJS Integration Service
│   │   ├── src/
│   │   │   ├── sqs/                # SQS consumer
│   │   │   ├── pimcore/            # Pimcore API client
│   │   │   ├── medusa/             # MedusaJS API client
│   │   │   └── common/             # Shared utilities
│   │   └── test/                   # Unit tests
│   │
│   └── medusa-backend/             # MedusaJS configuration
│       ├── Dockerfile              # Docker build
│       ├── medusa-config.js        # Medusa configuration
│       └── package.json            # Dependencies
│
├── infrastructure/
│   ├── docker/                     # Docker setup scripts
│   │   ├── localstack-init.sh      # LocalStack initialization
│   │   └── init-db.sql             # Database initialization
│   └── aws/                        # AWS IaC
│       ├── lambda/                 # Serverless Framework config
│       └── stepfunctions/          # Step Functions definitions
│
├── pimcore/                        # Pimcore configuration
│   ├── nginx.conf                  # Nginx reverse proxy config
│   └── config/                     # Pimcore class definitions
│
├── scripts/                        # Utility scripts
│   ├── deploy-aws.ps1              # AWS deployment script
│   ├── build-lambda.sh             # Lambda build script
│   └── test-e2e.ps1                # End-to-end test script
│
├── ASSUMPTIONS.md                  # Technical decisions
├── README.md                       # This file
└── aws-resources.env               # Deployed AWS resources
```

## Success Criteria (Challenge Requirements)

| Criteria | Status | Evidence |
|----------|--------|----------|
| ✅ Raw JSON ingested and normalized | Done | `services/ingestion-lambda/src/transformer.py` |
| ✅ Data flows: JSON → AWS → SQS → NestJS → Pimcore → MedusaJS | Done | Full pipeline implemented |
| ✅ Infrastructure on Real AWS | Done | `aws-resources.env`, `docs/aws-deployment.md` |
| ✅ C4/Sequence diagrams | Done | `docs/architecture-c4.md`, `docs/sequence-diagram.md` |
| ✅ Error handling & Idempotency | Done | Custom exceptions, Redis idempotency, DLQ |

## Running Tests

```bash
# Python tests
cd services/ingestion-lambda
pip install -r requirements.txt
pytest -v

# NestJS tests
cd services/nestjs-integration
npm install
npm test
```

## AWS Deployment (Real AWS - Production)

All infrastructure has been deployed to real AWS:

| Resource | Type | Status |
|----------|------|--------|
| S3 Bucket | `product-ingestion-bucket-147847019615` | ✅ Deployed |
| Lambda | `product-ingestion-lambda` | ✅ Deployed |
| EventBridge | `product-events` | ✅ Deployed |
| SQS Queue | `product-ingestion-queue` | ✅ Deployed |
| SQS DLQ | `product-ingestion-dlq` | ✅ Deployed |
| RDS PostgreSQL | `challenge-postgres` | ✅ Deployed |
| ElastiCache Redis | `challenge-redis` | ✅ Deployed |
| ECS Cluster | `challenge-cluster` | ✅ Deployed |
| ECS Service (NestJS) | `nestjs-service` | ✅ Deployed |
| ECS Service (Pimcore) | `pimcore-service` | ✅ Deployed |
| ECS Service (MedusaJS) | `medusajs-service` | ✅ Deployed |

See `aws-resources.env` for all resource identifiers and `docs/aws-deployment.md` for detailed instructions.

## Technical Highlights

### Code Quality

**Python Lambda:**
- Custom exception hierarchy with context
- Retry decorator with exponential backoff & jitter
- Correlation ID tracking for distributed tracing
- Structured JSON logging (CloudWatch compatible)
- Pydantic models for type-safe validation

**NestJS Integration:**
- Redis-based idempotency (production-grade duplicate detection)
- Circuit breaker pattern (resilient external API calls)
- Configuration validation with class-validator
- Global exception filters & logging interceptors
- Comprehensive unit tests with Jest

