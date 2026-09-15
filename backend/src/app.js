const express = require('express');
const cors = require('cors');
const { apiKeyAuth } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimiter');
const { requestLogger, getRecentLogs, getTrafficMetrics, clearTrafficLogs, MAX_LOGS } = require('./middleware/logger');
const { proxyForwarder } = require('./proxy/forwarder');
const { testConnection } = require('./config/db');
const { getRedisClient } = require('./config/redis');

const app = express();

// ----------------------------------------------------------------------------
// 1. GLOBAL MIDDLEWARE
// ----------------------------------------------------------------------------
// Traffic logger captures IP, route, method, status code, latency for all requests
app.use(requestLogger);
app.use(cors({
  origin: '*',
  exposedHeaders: [
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'retry-after',
    'Retry-After',
    'x-gateway-proxied',
    'x-gateway-upstream',
    'x-gateway-client-id',
    'x-gateway-client-tier',
    'x-gateway-client-email'
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------------------------------
// 2. PUBLIC & ADMINISTRATIVE ROUTES (No API Key Required)
// ----------------------------------------------------------------------------
// Health Check
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  const redis = getRedisClient();
  let redisStatus = 'UNKNOWN';
  try {
    const pong = await redis.ping();
    redisStatus = pong === 'PONG' ? 'UP' : 'DEGRADED';
  } catch (e) {
    redisStatus = 'DOWN';
  }

  const isHealthy = dbStatus.success && redisStatus !== 'DOWN';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'UP' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    service: 'API Gateway & Rate Limiter',
    database: {
      connected: dbStatus.success,
      name: dbStatus.database,
      version: dbStatus.version ? dbStatus.version.split(',')[0] : null,
      error: dbStatus.error || null,
    },
    redis: {
      status: redisStatus,
      engine: redis.isFallback ? 'In-Memory Redis Engine' : 'Live Redis Server',
    },
  });
});

// Gateway Public Info
app.get('/api/public/info', (req, res) => {
  res.json({
    name: 'API Gateway & Rate Limiter',
    version: '1.0.0',
    features: [
      'PostgreSQL Client & Tier Schema',
      'API Key Authentication Middleware (x-api-key)',
      'Redis-backed Sliding/Fixed Window Rate Limiting',
      'Standard Rate Limit Headers (x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset)',
      'Reverse Proxy Forwarder to Upstream Microservices',
      'Traffic Logging & Latency Analytics',
    ],
  });
});

// Client Management Routes (Register, List, Toggle Status)
const clientsRouter = require('./routes/clients');
app.use('/api/v1/clients', clientsRouter);

// Live Redis Metrics & Gateway Analytics
const adminMetricsRouter = require('./routes/adminMetrics');
app.use('/api/v1/admin/metrics', adminMetricsRouter);

// Admin Traffic Logs (for Dashboard)
app.get('/api/v1/admin/logs', (req, res) => {
  // Clamp to the ring buffer size; fall back to the default for missing/non-numeric values
  const requested = parseInt(req.query.limit, 10);
  const limit = Number.isNaN(requested) ? 100 : Math.min(Math.max(requested, 1), MAX_LOGS);
  const tier = typeof req.query.tier === 'string' && req.query.tier ? req.query.tier : null;
  res.json({
    success: true,
    logs: getRecentLogs(limit, tier),
  });
});

// Admin Traffic Metrics & Analytics (for Dashboard)
app.get('/api/v1/admin/stats', (req, res) => {
  res.json({
    success: true,
    metrics: getTrafficMetrics(),
  });
});

// Admin Reset Rate Limit Key (Helper for testing)
app.post('/api/v1/admin/ratelimit/reset', async (req, res, next) => {
  try {
    const { apiKey } = req.body || {};
    const redis = getRedisClient();

    if (apiKey !== undefined && apiKey !== null) {
      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          error: 'Bad Request',
          message: 'apiKey must be a non-empty string (or omitted to reset all rate limits).',
        });
      }
      await redis.del(`ratelimit:${apiKey.trim()}`);
      return res.json({ success: true, message: `Rate limit reset for API key: ${apiKey.trim()}` });
    }

    // Only remove the gateway's own rate limit keys; never FLUSHALL a Redis that may be shared
    const keys = await redis.keys('ratelimit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    clearTrafficLogs();
    return res.json({
      success: true,
      message: 'All rate limits and traffic logs flushed.',
      keysRemoved: keys.length,
    });
  } catch (err) {
    return next(err);
  }
});

// ----------------------------------------------------------------------------
// 3. PROTECTED GATEWAY ROUTER (Guarded by apiKeyAuth & rateLimiter)
// ----------------------------------------------------------------------------
const protectedRouter = express.Router();

// Step 1: Validate API Key against PostgreSQL & attach req.client
protectedRouter.use(apiKeyAuth);

// Step 2: Rate limit against Redis & attach standard rate limit headers
protectedRouter.use(rateLimiter);

// Protected Client Profile
protectedRouter.get('/client/me', (req, res) => {
  res.json({
    success: true,
    message: `Authenticated as ${req.client.name} (${req.client.tier.toUpperCase()} Tier)`,
    client: req.client,
    rateLimit: req.rateLimit,
  });
});

// Protected Gateway Native Data
protectedRouter.get('/gateway/data', (req, res) => {
  res.json({
    success: true,
    message: 'Access granted to native gateway data.',
    caller: {
      name: req.client.name,
      email: req.client.email,
      tier: req.client.tier,
    },
    rateLimit: req.rateLimit,
    data: [
      { id: 101, metric: 'Gateway Uptime', value: '99.98%' },
      { id: 102, metric: 'Active Services', value: 4 },
      { id: 103, metric: 'Avg Latency', value: '1.2ms' },
    ],
  });
});

// Protected Gateway Echo
protectedRouter.post('/gateway/echo', (req, res) => {
  res.json({
    success: true,
    authenticatedUser: req.client.email,
    tier: req.client.tier,
    receivedPayload: req.body,
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------------------------------
// 4. REVERSE PROXY FORWARDER ROUTES
// All requests under /api/v1/services/* are forwarded to upstream microservices
// ----------------------------------------------------------------------------
protectedRouter.all('/services/*', proxyForwarder);

// Mount protected router on /api/v1
app.use('/api/v1', protectedRouter);

// ----------------------------------------------------------------------------
// 5. 404 & GLOBAL ERROR HANDLERS
// ----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found on this API Gateway.`,
  });
});

app.use((err, req, res, next) => {
  // body-parser errors (malformed JSON, payload too large) carry a 4xx status and a safe message
  const status = Number.isInteger(err.status || err.statusCode) ? err.status || err.statusCode : 500;

  if (status >= 400 && status < 500) {
    return res.status(status).json({
      success: false,
      statusCode: status,
      error: err.type === 'entity.parse.failed' ? 'Bad Request' : err.name || 'Bad Request',
      message: err.type === 'entity.parse.failed' ? 'Request body contains malformed JSON.' : err.message,
    });
  }

  console.error('[Unhandled Gateway Error]:', err);
  res.status(500).json({
    success: false,
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred in the gateway.',
  });
});

module.exports = app;
