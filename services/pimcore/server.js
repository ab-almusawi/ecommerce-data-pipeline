const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));

const products = new Map();
let nextId = 1;

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'pimcore-datahub-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    productCount: products.size
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/objects', (req, res) => {
  const { className, filter, limit = 20, offset = 0 } = req.query;
  
  let items = Array.from(products.values());
  
  if (filter) {
    try {
      const filterObj = JSON.parse(filter);
      if (filterObj.externalId) {
        items = items.filter(p => p.data?.externalId === filterObj.externalId);
      }
    } catch (e) {}
  }
  
  const total = items.length;
  items = items.slice(Number(offset), Number(offset) + Number(limit));
  
  res.json({
    success: true,
    total,
    items: items.map(p => ({
      id: p.id,
      key: p.key,
      className: p.className,
      path: p.path,
      published: p.published,
      data: p.data
    }))
  });
});

app.get('/api/objects/:id', (req, res) => {
  const product = products.get(req.params.id);
  
  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'Product not found',
      id: req.params.id
    });
  }
  
  res.json({
    success: true,
    id: product.id,
    key: product.key,
    className: product.className,
    path: product.path,
    published: product.published,
    data: product.data,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  });
});

app.post('/api/objects', (req, res) => {
  const { className, parentId, key, published, data } = req.body;
  
  const id = String(nextId++);
  const now = new Date().toISOString();
  
  const product = {
    id,
    objectId: id,
    className: className || 'Product',
    parentId: parentId || 1,
    key: key || `product-${id}`,
    path: `/products/${key || `product-${id}`}`,
    published: published || false,
    data: data || {},
    createdAt: now,
    updatedAt: now
  };
  
  products.set(id, product);
  
  console.log(`[CREATE] Product ${id}: ${data?.externalId || key}`);
  
  res.status(201).json({
    success: true,
    id: product.id,
    objectId: product.id,
    path: product.path,
    key: product.key
  });
});

app.put('/api/objects/:id', (req, res) => {
  const existing = products.get(req.params.id);
  
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }
  
  const { data, published } = req.body;
  
  const updated = {
    ...existing,
    data: data ? { ...existing.data, ...data } : existing.data,
    published: published !== undefined ? published : existing.published,
    updatedAt: new Date().toISOString()
  };
  
  products.set(req.params.id, updated);
  
  console.log(`[UPDATE] Product ${req.params.id}`);
  
  res.json({
    success: true,
    id: updated.id,
    path: updated.path,
    key: updated.key,
    published: updated.published
  });
});

app.delete('/api/objects/:id', (req, res) => {
  if (!products.has(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Product not found'
    });
  }
  
  products.delete(req.params.id);
  console.log(`[DELETE] Product ${req.params.id}`);
  
  res.json({ success: true, deleted: req.params.id });
});

app.get('/api/stats', (req, res) => {
  res.json({
    totalProducts: products.size,
    publishedProducts: Array.from(products.values()).filter(p => p.published).length
  });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ success: false, error: err.message });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log('============================================');
  console.log('Pimcore DataHub REST API Service');
  console.log('============================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Products: http://localhost:${PORT}/api/objects`);
  console.log('============================================');
});
