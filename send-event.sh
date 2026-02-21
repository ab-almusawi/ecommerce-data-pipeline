#!/bin/bash
awslocal events put-events --entries '[
  {
    "Source": "com.challenge.ingestion",
    "DetailType": "ProductIngested",
    "EventBusName": "product-events",
    "Detail": "{\"eventId\":\"evt-shein-new-001\",\"timestamp\":\"2026-02-19T22:45:00Z\",\"correlationId\":\"test-final-pipeline\",\"product\":{\"id\":\"shein-new-product\",\"sku\":\"SHEIN-NEW-001\",\"name\":{\"en\":\"SHEIN Summer Dress\",\"ar\":\"فستان صيفي\"},\"description\":{\"en\":\"Light summer dress\",\"ar\":\"فستان صيفي خفيف\"},\"categories\":[{\"id\":\"cat-001\",\"name\":{\"en\":\"Women\",\"ar\":\"نساء\"},\"slug\":\"women\",\"level\":1}],\"attributes\":[{\"name\":{\"en\":\"Color\",\"ar\":\"لون\"},\"value\":{\"en\":\"Blue\",\"ar\":\"أزرق\"},\"type\":\"text\"}],\"variants\":[{\"sku\":\"SHEIN-NEW-001-M-BLUE\",\"color\":{\"name\":\"Blue\",\"code\":\"#0000FF\"},\"size\":\"M\",\"price\":{\"amount\":24.99,\"currency\":\"USD\",\"originalAmount\":34.99,\"discountPercent\":28},\"stock\":50,\"images\":[\"https://img.shein.com/new.jpg\"]}],\"images\":[{\"url\":\"https://img.shein.com/main-new.jpg\",\"type\":\"main\",\"sortOrder\":1}],\"metadata\":{\"source\":\"shein\",\"sourceId\":\"SHEIN-NEW-001\",\"importedAt\":\"2026-02-19T22:45:00Z\",\"productRelationId\":\"rel-new\"}},\"metadata\":{\"s3Bucket\":\"product-ingestion-bucket\",\"s3Key\":\"shein/new-products.json\",\"batchId\":\"batch-new\",\"itemIndex\":0,\"totalItems\":1}}"
  }
]'
