# C4 Architecture Diagrams

## Level 1: System Context Diagram

```mermaid
C4Context
    title System Context Diagram - E-Commerce Data Pipeline

    Person(admin, "Admin User", "Uploads product data files")
    
    System_Boundary(pipeline, "Product Data Pipeline") {
        System(ingestion, "Ingestion System", "AWS Lambda/Step Functions - Processes raw JSON data")
    }
    
    System_Ext(shein, "SHEIN Data Source", "Raw product JSON data")
    System_Ext(pimcore, "Pimcore PIM", "Product Information Management")
    System_Ext(medusa, "MedusaJS", "Headless Commerce Platform")
    
    Rel(admin, ingestion, "Uploads shein_products.json")
    Rel(shein, ingestion, "Raw product data")
    Rel(ingestion, pimcore, "Normalized product data")
    Rel(pimcore, medusa, "Published products")
```

## Level 2: Container Diagram

```mermaid
C4Container
    title Container Diagram - E-Commerce Data Pipeline

    Person(admin, "Admin User", "Uploads product data")

    System_Boundary(aws, "AWS Cloud") {
        Container(s3, "S3 Bucket", "AWS S3", "Stores raw JSON files")
        Container(lambda, "Ingestion Lambda", "Python 3.9+", "Validates and transforms JSON data")
        Container(stepfn, "Step Functions", "AWS Step Functions", "Orchestrates ingestion workflow")
        Container(eventbridge, "EventBridge", "AWS EventBridge", "Routes ProductIngested events")
        Container(sqs, "SQS Queue", "AWS SQS", "Buffers messages for consumers")
    }

    System_Boundary(integration, "Integration Layer") {
        Container(nestjs, "NestJS Service", "TypeScript/NestJS", "Consumes SQS, transforms & pushes data")
    }

    System_Boundary(platforms, "Commerce Platforms") {
        ContainerDb(pimcore, "Pimcore", "PHP/MySQL", "Product Information Management")
        ContainerDb(medusa, "MedusaJS", "Node.js/PostgreSQL", "Headless Commerce")
    }

    Rel(admin, s3, "Uploads JSON", "HTTPS")
    Rel(s3, lambda, "Triggers on upload", "S3 Event")
    Rel(lambda, stepfn, "Orchestrated by", "AWS SDK")
    Rel(stepfn, eventbridge, "Publishes events", "ProductIngested")
    Rel(eventbridge, sqs, "Routes to queue", "Event Rule")
    Rel(sqs, nestjs, "Polls messages", "AWS SDK")
    Rel(nestjs, pimcore, "Creates/Updates products", "REST API")
    Rel(pimcore, nestjs, "Webhook on publish", "HTTP")
    Rel(nestjs, medusa, "Pushes products", "REST API")
```

## Level 3: Component Diagram - NestJS Integration Service

```mermaid
C4Component
    title Component Diagram - NestJS Integration Service

    Container_Boundary(nestjs, "NestJS Integration Service") {
        Component(sqsConsumer, "SQS Consumer", "NestJS Module", "Polls and processes SQS messages")
        Component(transformer, "Data Transformer", "Service", "Transforms canonical data for each platform")
        Component(pimcoreClient, "Pimcore Client", "Service", "Manages Pimcore API interactions")
        Component(medusaClient, "Medusa Client", "Service", "Manages MedusaJS API interactions")
        Component(retryHandler, "Retry Handler", "Service", "Handles failures and retries")
        Component(eventEmitter, "Event Emitter", "NestJS Events", "Internal event coordination")
    }

    System_Ext(sqs, "SQS Queue", "Message buffer")
    System_Ext(pimcore, "Pimcore PIM", "Product data hub")
    System_Ext(medusa, "MedusaJS", "Commerce platform")

    Rel(sqs, sqsConsumer, "Receives messages")
    Rel(sqsConsumer, transformer, "Raw product data")
    Rel(transformer, pimcoreClient, "Pimcore-formatted data")
    Rel(transformer, medusaClient, "Medusa-formatted data")
    Rel(pimcoreClient, pimcore, "REST API calls")
    Rel(medusaClient, medusa, "REST API calls")
    Rel(pimcoreClient, eventEmitter, "Product published event")
    Rel(eventEmitter, medusaClient, "Triggers async push")
    Rel(retryHandler, sqsConsumer, "Retry failed messages")
```

## Data Flow Sequence

```
┌─────────┐     ┌────┐     ┌────────┐     ┌─────────────┐     ┌─────┐     ┌────────┐     ┌─────────┐     ┌─────────┐
│  Admin  │     │ S3 │     │ Lambda │     │StepFunctions│     │EB   │     │  SQS   │     │ NestJS  │     │Pimcore/ │
│         │     │    │     │        │     │             │     │     │     │        │     │         │     │ Medusa  │
└────┬────┘     └──┬─┘     └───┬────┘     └──────┬──────┘     └──┬──┘     └───┬────┘     └────┬────┘     └────┬────┘
     │             │           │                 │               │            │               │               │
     │ Upload JSON │           │                 │               │            │               │               │
     │────────────>│           │                 │               │            │               │               │
     │             │           │                 │               │            │               │               │
     │             │ S3 Event  │                 │               │            │               │               │
     │             │──────────>│                 │               │            │               │               │
     │             │           │                 │               │            │               │               │
     │             │           │ Start Execution │               │            │               │               │
     │             │           │────────────────>│               │            │               │               │
     │             │           │                 │               │            │               │               │
     │             │           │<────────────────│               │            │               │               │
     │             │           │  Orchestrate    │               │            │               │               │
     │             │           │                 │               │            │               │               │
     │             │           │ ProductIngested │               │            │               │               │
     │             │           │ Event           │               │            │               │               │
     │             │           │────────────────────────────────>│            │               │               │
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │ Route msg  │               │               │
     │             │           │                 │               │───────────>│               │               │
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │            │  Poll Queue   │               │
     │             │           │                 │               │            │<──────────────│               │
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │            │ Return Msgs   │               │
     │             │           │                 │               │            │──────────────>│               │
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │            │               │ Upsert Product│
     │             │           │                 │               │            │               │──────────────>│
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │            │               │<──────────────│
     │             │           │                 │               │            │               │   Success     │
     │             │           │                 │               │            │               │               │
     │             │           │                 │               │            │ Delete Msg    │               │
     │             │           │                 │               │            │<──────────────│               │
     │             │           │                 │               │            │               │               │
```
