Subject: Software Developer Interview Challenge - Hameed Majid
Dear Hameed Majid,
Thank you again for your interest in the position of Software Developer at Alikhtisar Alsareea (Akkooo). As discussed, please find below the details of the technical challenge.
🚀 Backend & Integration Engineer Challenge
Enterprise E-Commerce Data Pipeline & Integration System
📌 Challenge Overview
Design and implement a production-grade data integration pipeline that ingests raw product data (JSON), processes it via AWS Serverless architecture, and asynchronously pushes it to a Product Information Management (PIM) system and a Headless Commerce platform.
Duration
Tech Stack
Difficulty
10 Days
Python (AWS), NestJS, Pimcore, MedusaJS
Expert-Level
🎯 Goals & Objectives
Primary Goals
Serverless Ingestion: Build an AWS Lambda/Step Functions pipeline (Python) to ingest and normalize raw JSON data.
Event-Driven Architecture: Use AWS EventBridge and SQS to decouple ingestion from processing.
Product Information Management: Implement Pimcore as the central PIM for product data.
Commerce Integration: Asynchronously push published products from Pimcore to MedusaJS storefront.
Data Modeling: Design comprehensive data models and system architecture diagrams before coding.
Success Criteria
✅ Raw 
shein_products.json
 is successfully ingested and normalized.
✅ Data flows correctly: JSON → AWS (Python) → SQS → NestJS → Pimcore → MedusaJS.
✅ Infrastructure is deployed on Real AWS Account (ECS/EC2/Lambda).
✅ Architecture diagrams (C4/Sequence) are delivered and match the implementation.
✅ Error handling and idempotency are demonstrated.
🛠️ Technical Requirements
1. Ingestion Layer (AWS Serverless - Python)
Language: Python 3.9+
Services: AWS Lambda, AWS Step Functions
Trigger: Uploading 
shein_products.json
 to S3 (or manual trigger).
Responsibility: Validate JSON, normalize data, push events to EventBridge.
2. Message Bus (AWS)
EventBridge: Routes "ProductIngested" events to an SQS Queue.
SQS: Buffers messages for the consumer application.
3. Integration Middleware (NestJS)
Framework: NestJS (TypeScript).
Responsibility: Consume SQS messages, transform data for Pimcore, upsert to Pimcore, and asynchronously push finalized data to MedusaJS.
4. Platforms (Dockerized)
Pimcore: Product Information Hub.
MedusaJS: Sales Channel (Headless Commerce).
📋 The Workflow
Input: 
shein_products.json
 (raw product data).
Process:
Step 1: Python Lambda reads/cleans data → publishes events.
Step 2: SQS queue receives events.
Step 3: NestJS Service consumes queue → creates/updates products in Pimcore.
Step 4: Once published in Pimcore, data is asynchronously pushed to MedusaJS.
Output: Product is visible and purchasable in MedusaJS.
📦 Deliverables Checklist
1. Architecture & Design
Diagrams: C4 or Sequence diagrams showing data flow.
Data Models: JSON schemas or ER Diagrams.
2. Infrastructure as Code (IaC)
Docker Compose: To spin up Pimcore, Medusa, Postgres, LocalStack.
Goal: Reviewer must be able to run 
docker-compose up
.
3. Source Code
Python Function: Lambda/Step Function logic.
NestJS Application: Integration service code.
Configuration: Dockerfiles, serverless.yml, etc.
📅 Task List & Priority
Phase 0: Platform Setup
Provision AWS Account (Free Tier OK)
Deploy Pimcore & MedusaJS (Docker)
Configure PostgreSQL
Phase 1: Design & Modeling
Design Data Flow & Sequence Diagrams
Define Canonical Data Model
Set up Docker Compose & LocalStack
Phase 2: Ingestion (Python/AWS)
Implement transform logic
Create Lambda/Step Function
Configure EventBridge & SQS
Phase 3: Integration (NestJS)
Implement SQS Consumer
Build Pimcore & MedusaJS API Clients
Implement Async Push Logic
Phase 4: Polish
Add Error Handling & Dead Letter Queues
Create "How to Run" Documentation
⚠️ Important Notes
Real AWS Required: Must deploy to a real AWS account (Free Tier sufficient).
Data Quality: Handle missing fields in JSON gracefully.
Pimcore/Medusa: Focus on API connectivity, not UI customization.
📬 Submission & Support
Please send your final deliverables (or repository link) to:
To: 
mustafa.a.hadi@akkooo.iq
Cc: 
ali.alshamry@akkooo.iq
 (CTO), 
fareed.alrobiee@akkooo.iq
 (CIO)
For any technical questions, please contact me at 
mustafa.a.hadi@akkooo.iq
.
Please also include an 
ASSUMPTIONS.md
 file to track your technical decisions.