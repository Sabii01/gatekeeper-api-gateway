const express = require('express');
const { getRedisClient } = require('../config/redis');
const { getTrafficMetrics } = require('../middleware/logger');
const { query } = require('../config/db');

const router = express.Router();

/**
 * GET /api/v1/admin/metrics
 * Reads live rate limit keys and counters directly from Redis and aggregates gateway telemetry.
 */
router.get('/', async (req, res) => {
  try {
    const redis = getRedisClient();
    const traffic = getTrafficMetrics();

    // 1. Scan Redis for live rate limit keys
    const redisKeys = await redis.keys('ratelimit:*');
    const activeWindows = [];

    // 2. Fetch all clients from DB for key enrichment
    const clientsRes = await query(`
      SELECT c.id, c.name, c.email, c.api_key, c.tier, c.is_active, r.max_requests_per_minute
      FROM clients c
      JOIN rate_limit_rules r ON c.tier = r.tier;
    `);

    const clientMap = new Map();
    clientsRes.rows.forEach((c) => clientMap.set(c.api_key, c));

    // 3. Inspect each active key in Redis
    for (const key of redisKeys) {
      const apiKey = key.replace('ratelimit:', '');
      const countVal = await redis.get(key);
      const ttlVal = await redis.ttl(key);
      const client = clientMap.get(apiKey);

      const count = parseInt(countVal || '0', 10);
      const maxLimit = client?.max_requests_per_minute || 10;
      const isBlocked = count > maxLimit;
      const remaining = Math.max(0, maxLimit - count);

      activeWindows.push({
        redisKey: key,
        apiKey,
        clientName: client?.name || 'Unknown Client',
        clientEmail: client?.email || 'Unknown',
        tier: client?.tier || 'unknown',
        currentCount: count,
        maxLimit,
        remaining,
        ttlSeconds: ttlVal,
        isBlocked,
        percentUsed: Math.min(100, Math.round((count / maxLimit) * 100)),
      });
    }

    // Sort by most active
    activeWindows.sort((a, b) => b.currentCount - a.currentCount);

    // 4. Fetch tier rules
    const tierRulesRes = await query('SELECT * FROM rate_limit_rules ORDER BY max_requests_per_minute ASC;');

    // 5. Ping Redis
    let redisPong = 'UNKNOWN';
    try {
      redisPong = await redis.ping();
    } catch (e) {
      redisPong = 'ERROR';
    }

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      gateway: {
        totalRequestsHandled: traffic.totalRequests,
        totalRequestsBlocked: traffic.rateLimited429,
        successfulRequests: traffic.successfulRequests,
        clientErrors: traffic.clientErrors,
        serverErrors: traffic.serverErrors,
        averageLatencyMs: traffic.averageLatencyMs,
        tierBreakdown: traffic.tierCounts,
      },
      redis: {
        status: redisPong === 'PONG' ? 'HEALTHY' : 'DEGRADED',
        engine: redis.isFallback ? 'In-Memory Engine' : 'Live Docker Redis Server (port 6379)',
        totalActiveRateLimitKeys: redisKeys.length,
        activeRateLimitWindows: activeWindows,
      },
      database: {
        totalRegisteredClients: clientsRes.rowCount,
        tiers: tierRulesRes.rows,
      },
    });
  } catch (error) {
    console.error('[Admin Metrics Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to retrieve gateway and Redis metrics.',
    });
  }
});

module.exports = router;
