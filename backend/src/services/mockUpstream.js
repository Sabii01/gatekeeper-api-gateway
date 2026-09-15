const express = require('express');

const upstreamApp = express();
upstreamApp.use(express.json());

// Mock Microservice Database
const mockData = {
  users: [
    { id: 'usr_1', name: 'Sundar Pichai', role: 'Executive', status: 'active' },
    { id: 'usr_2', name: 'Demis Hassabis', role: 'AI Research Lead', status: 'active' },
    { id: 'usr_3', name: 'Vikash Kumar', role: 'Systems Engineer', status: 'active' },
  ],
  products: [
    { id: 'prd_101', name: 'Cloud Compute Instance (4 vCPU)', price: 49.99, stock: 120 },
    { id: 'prd_102', name: 'Managed PostgreSQL Enterprise', price: 99.00, stock: 45 },
    { id: 'prd_103', name: 'Redis Cache Cluster (High Availability)', price: 29.99, stock: 250 },
  ],
  orders: [
    { id: 'ord_9001', userId: 'usr_1', total: 148.99, status: 'fulfilled', createdAt: '2026-08-20T10:00:00Z' },
    { id: 'ord_9002', userId: 'usr_2', total: 99.00, status: 'processing', createdAt: '2026-08-20T11:30:00Z' },
  ],
};

// ----------------------------------------------------------------------------
// Upstream Microservice Endpoints
// ----------------------------------------------------------------------------

// User Service
upstreamApp.get('/users', (req, res) => {
  res.json({
    service: 'User Microservice',
    status: 200,
    count: mockData.users.length,
    users: mockData.users,
    gatewayMeta: {
      callerTier: req.headers['x-gateway-client-tier'] || 'none',
      callerEmail: req.headers['x-gateway-client-email'] || 'none',
    },
  });
});

upstreamApp.get('/users/:id', (req, res) => {
  const user = mockData.users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ service: 'User Microservice', error: 'User not found' });
  }
  res.json({ service: 'User Microservice', user });
});

// Product Service
upstreamApp.get('/products', (req, res) => {
  res.json({
    service: 'Product Catalog Microservice',
    status: 200,
    count: mockData.products.length,
    products: mockData.products,
    gatewayMeta: {
      callerTier: req.headers['x-gateway-client-tier'] || 'none',
    },
  });
});

upstreamApp.post('/products', (req, res) => {
  const newProduct = {
    id: `prd_${Date.now()}`,
    name: req.body.name || 'New Product',
    price: req.body.price || 19.99,
    stock: req.body.stock || 10,
  };
  mockData.products.push(newProduct);
  res.status(201).json({
    service: 'Product Catalog Microservice',
    message: 'Product created successfully',
    product: newProduct,
  });
});

// Order Service
upstreamApp.get('/orders', (req, res) => {
  res.json({
    service: 'Order Microservice',
    status: 200,
    count: mockData.orders.length,
    orders: mockData.orders,
  });
});

// Header Inspection Endpoint (verifies that gateway injected client tier/ID headers)
upstreamApp.all('/inspect', (req, res) => {
  res.json({
    service: 'Upstream Header Inspector',
    receivedHeaders: req.headers,
    forwardedByGateway: req.headers['x-gateway-forwarded'] === 'true',
    clientTier: req.headers['x-gateway-client-tier'] || null,
    clientId: req.headers['x-gateway-client-id'] || null,
    body: req.body,
    method: req.method,
    url: req.originalUrl,
    query: req.query,
  });
});

// Plain-text endpoint (verifies that non-JSON upstream responses pass through the gateway untouched)
upstreamApp.get('/text', (req, res) => {
  res.type('text/plain').send('plain upstream response');
});

// Slow endpoint (verifies gateway timeout handling)
upstreamApp.get('/slow', (req, res) => {
  const delayMs = Math.min(parseInt(req.query.ms || '2000', 10) || 2000, 30000);
  setTimeout(() => res.json({ service: 'Slow Microservice', delayMs }), delayMs);
});

/**
 * Starts the upstream microservices on a given port (default 5001)
 */
function startUpstreamService(port = 5001) {
  return new Promise((resolve) => {
    const server = upstreamApp.listen(port, () => {
      console.log(`🔌 [Upstream Microservice] Running on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`🔌 [Upstream Microservice] Port ${port} is already active, reusing existing upstream service.`);
        resolve(server);
      } else {
        console.error('[Upstream Microservice Error]:', err);
        resolve(server);
      }
    });
  });
}

module.exports = { upstreamApp, startUpstreamService };
