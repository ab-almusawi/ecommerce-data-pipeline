# Technical Assumptions & Decisions

This document tracks the technical decisions and assumptions made during the implementation of the E-Commerce Data Pipeline challenge.

## 📌 Data Model Assumptions

### 1. SHEIN JSON Structure

**Assumption:** The provided `shein_products.json` file contains an array of product objects, each with a consistent structure including:
- `code`: "0" indicates successful data
- `info.productInfo`: Contains the main product details
- `info.productInfo.goods_id`: Unique product identifier
- `info.productInfo.goods_sn`: SKU/Stock Keeping Unit

**Decision:** Products with `code` != "0" are treated as invalid and skipped during transformation.

### 2. Localization

**Assumption:** Product names in the source data (`goods_name`) are primarily in Arabic.

**Decision:** 
- Arabic content is preserved in `name.ar`
- English names are extracted from product attributes where available
- If no English name exists, the Arabic name is used as fallback

### 3. Price Currency

**Assumption:** Prices in the SHEIN data use SAR (Saudi Riyal) as the primary currency with USD conversion available.

**Decision:** Both currencies are stored in the canonical model for flexibility.

### 4. Product Variants

**Assumption:** Products may have multiple variants based on size and color combinations.

**Decision:** Each SKU in `skuList` is treated as a separate variant with its own pricing and inventory.

---

## 🏗️ Architecture Decisions

### 1. Event-Driven Architecture

**Decision:** Use EventBridge + SQS for decoupling ingestion from processing.

**Rationale:**
- EventBridge allows flexible routing rules for future expansion
- SQS provides reliable message buffering and retry capabilities
- Dead Letter Queues (DLQ) capture failed messages for investigation

### 2. Canonical Data Model

**Decision:** Transform raw SHEIN data into a platform-agnostic canonical model before pushing to platforms.

**Rationale:**
- Single transformation point simplifies maintenance
- Each platform (Pimcore, MedusaJS) receives adapted data
- Easier to add new target platforms in the future

### 3. Async Push to MedusaJS

**Decision:** Products are pushed to MedusaJS asynchronously after Pimcore sync completes.

**Rationale:**
- Pimcore serves as the source of truth (PIM)
- Allows for potential manual review before commerce publishing
- Event-driven approach using NestJS EventEmitter

### 4. Idempotency

**Decision:** Implement idempotency using a combination of:
- Event ID + Product ID as idempotency key
- In-memory cache with TTL (expandable to Redis)

**Rationale:**
- Prevents duplicate processing on message redelivery
- SQS at-least-once delivery requires idempotency handling

---

## 🔧 Technology Choices

### 1. Python for Lambda

**Decision:** Use Python 3.11+ with Pydantic for Lambda functions.

**Rationale:**
- Strong JSON processing capabilities
- Pydantic provides runtime validation and type safety
- Lightweight cold start compared to Java/C#
- Challenge requirement specified Python

### 2. NestJS for Integration Service

**Decision:** Use NestJS with TypeScript.

**Rationale:**
- Challenge requirement specified NestJS
- Built-in dependency injection
- Excellent support for scheduled tasks and event handling
- Strong typing with TypeScript

### 3. LocalStack for Local Development

**Decision:** Use LocalStack to emulate AWS services locally.

**Rationale:**
- Zero AWS costs during development
- Consistent development environment
- Easy to reset and reproduce issues

### 4. Docker Compose for Platform Services

**Decision:** Containerize Pimcore and MedusaJS with Docker Compose.

**Rationale:**
- Reproducible development environment
- Easy onboarding for reviewers (`docker-compose up`)
- Production-like configuration

---

## ⚠️ Known Limitations

### 1. Pimcore API Compatibility

**Limitation:** Pimcore API structure varies between versions.

**Mitigation:** The `PimcoreService` uses flexible API calls that may need adjustment based on the actual Pimcore version deployed.

### 2. MedusaJS Version

**Limitation:** MedusaJS v2 has different API structure than v1.

**Assumption:** Using MedusaJS v1.x Admin API structure. May need updates for v2.

### 3. Image Handling

**Limitation:** Images are stored as URLs pointing to SHEIN CDN.

**Future Improvement:** Download and re-host images for production use.

### 4. Category Mapping

**Limitation:** Categories are created as-is without mapping to existing Pimcore/Medusa categories.

**Future Improvement:** Implement category mapping/merging logic.

---

## 🔄 Error Handling Strategy

### 1. Lambda Level

- Validation errors: Log and continue with valid products
- Transform errors: Skip product, log error, continue batch
- EventBridge errors: Retry with exponential backoff

### 2. NestJS Level

- SQS processing errors: Message returns to queue (visibility timeout)
- After 3 failures: Message moves to DLQ
- Pimcore/Medusa API errors: Logged, message not deleted (retry)

### 3. Monitoring

**Decision:** Use structured logging (JSON format) for observability.

**Future Improvement:** Add CloudWatch metrics and alarms.

---

## 📊 Performance Considerations

### 1. Batch Processing

**Decision:** Process products in batches of 25 for EventBridge publishing.

**Rationale:** EventBridge `PutEvents` supports up to 10 entries per call. Batching reduces API calls.

### 2. SQS Long Polling

**Decision:** Use 20-second long polling for SQS message retrieval.

**Rationale:** Reduces empty API calls, improves efficiency.

### 3. Connection Pooling

**Decision:** Use axios with connection keep-alive for HTTP clients.

**Rationale:** Reduces connection overhead for high-throughput scenarios.

---

## 🔒 Security Considerations

### 1. API Keys

**Decision:** Store API keys in environment variables, not in code.

**Production Recommendation:** Use AWS Secrets Manager or Parameter Store.

### 2. IAM Permissions

**Decision:** Lambda uses minimal required permissions (S3 read, EventBridge write).

**Rationale:** Principle of least privilege.

### 3. Network Security

**Production Recommendation:** 
- Place services in VPC
- Use security groups to restrict access
- Enable encryption in transit (HTTPS)

---

## 📅 Future Enhancements

1. **Real-time Updates**: Implement webhooks from Pimcore for immediate Medusa sync
2. **Bulk Operations**: Support bulk import for large datasets
3. **Data Validation UI**: Admin dashboard for reviewing transformation errors
4. **Inventory Sync**: Bi-directional inventory updates between platforms
5. **Search Integration**: Sync to Elasticsearch/Algolia for search functionality

---

*Document maintained by: Hameed Majid*  
*Last updated: February 2026*
