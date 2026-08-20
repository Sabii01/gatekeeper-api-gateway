// In-memory traffic log ring buffer
const MAX_LOGS = 500;
const logBuffer = [];

// Aggregated Metrics
const metrics = {
  totalRequests: 0,
  successfulRequests: 0, // 2xx / 3xx
  clientErrors: 0,      // 4xx
  rateLimited429: 0,    // 429
  serverErrors: 0,      // 5xx
  totalLatencyMs: 0,
  tierCounts: {
    free: 0,
    pro: 0,
    enterprise: 0,
    unauthenticated: 0,
  },
};

/**
 * Traffic Logging & Analytics Middleware:
 * Tracks user IP, requested route, status code, HTTP method, and response latency.
 */
const requestLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const requestTimestamp = new Date().toISOString();

  // Extract client IP safely
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    '127.0.0.1';

  // Hook into response completion
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const latencyMs = Number(endTime - startTime) / 1e6;
    const statusCode = res.statusCode;
    const method = req.method;
    const route = req.originalUrl || req.url;
    const clientTier = req.client?.tier || 'unauthenticated';
    const clientEmail = req.client?.email || null;
    const clientId = req.client?.id || null;

    // Log Record object
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: requestTimestamp,
      clientIp,
      method,
      route,
      statusCode,
      latencyMs: parseFloat(latencyMs.toFixed(2)),
      client: {
        id: clientId,
        email: clientEmail,
        tier: clientTier,
      },
      rateLimit: req.rateLimit || null,
    };

    // Push to ring buffer
    logBuffer.unshift(logEntry);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.pop();
    }

    // Update aggregated metrics
    metrics.totalRequests++;
    metrics.totalLatencyMs += latencyMs;

    if (statusCode >= 200 && statusCode < 400) {
      metrics.successfulRequests++;
    } else if (statusCode === 429) {
      metrics.rateLimited429++;
      metrics.clientErrors++;
    } else if (statusCode >= 400 && statusCode < 500) {
      metrics.clientErrors++;
    } else if (statusCode >= 500) {
      metrics.serverErrors++;
    }

    if (metrics.tierCounts[clientTier] !== undefined) {
      metrics.tierCounts[clientTier]++;
    }

    // Structured Console Output (omitted in automated test mode to keep test output clean)
    if (process.env.NODE_ENV !== 'test') {
      const statusColor =
        statusCode >= 500
          ? '\x1b[31m' // Red
          : statusCode === 429
          ? '\x1b[33m' // Yellow
          : statusCode >= 400
          ? '\x1b[35m' // Magenta
          : '\x1b[32m'; // Green
      const resetColor = '\x1b[0m';

      console.log(
        `[TRAFFIC] ${requestTimestamp} | IP: ${clientIp.padEnd(15)} | ` +
          `${method.padEnd(6)} | ${route.padEnd(28)} | ` +
          `Status: ${statusColor}${statusCode}${resetColor} | ` +
          `Latency: ${logEntry.latencyMs.toFixed(2)}ms | ` +
          `Tier: [${clientTier.toUpperCase()}]`
      );
    }
  });

  next();
};

/**
 * Returns recent logs with optional pagination / filtering
 */
function getRecentLogs(limit = 100, tierFilter = null) {
  let logs = logBuffer;
  if (tierFilter) {
    logs = logs.filter((l) => l.client.tier === tierFilter);
  }
  return logs.slice(0, limit);
}

/**
 * Returns summary metrics
 */
function getTrafficMetrics() {
  const avgLatency =
    metrics.totalRequests > 0
      ? (metrics.totalLatencyMs / metrics.totalRequests).toFixed(2)
      : 0;

  return {
    ...metrics,
    averageLatencyMs: parseFloat(avgLatency),
    bufferCount: logBuffer.length,
  };
}

/**
 * Clears buffered logs
 */
function clearTrafficLogs() {
  logBuffer.length = 0;
  return true;
}

module.exports = {
  requestLogger,
  getRecentLogs,
  getTrafficMetrics,
  clearTrafficLogs,
};
