const { getRedisClient } = require('../config/redis');

const WINDOW_SIZE_SECONDS = 60; // 1 minute fixed/sliding window

/**
 * Rate Limiter Middleware:
 * Uses Redis atomic INCR and TTL to track and enforce per-client API key rate limits.
 * Injects standard rate limit HTTP headers on EVERY response.
 */
const rateLimiter = async (req, res, next) => {
  // If client is not attached by auth middleware, skip or reject
  if (!req.client || !req.client.apiKey) {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Client authentication required before rate limiting.',
    });
  }

  const redis = getRedisClient();
  const apiKey = req.client.apiKey;
  const tierLimit = req.client.rateLimit?.maxRequestsPerMinute || 10;
  const redisKey = `ratelimit:${apiKey}`;

  try {
    // 1. Atomically increment request counter for this API key
    const count = await redis.incr(redisKey);

    // 2. If it's the first request in this window, set the TTL
    if (count === 1) {
      await redis.expire(redisKey, WINDOW_SIZE_SECONDS);
    }

    // 3. Get remaining time to live (seconds until window reset)
    let ttl = await redis.ttl(redisKey);
    if (ttl <= 0) {
      ttl = WINDOW_SIZE_SECONDS;
      await redis.expire(redisKey, WINDOW_SIZE_SECONDS);
    }

    // 4. Calculate remaining requests allowed in this window
    const remaining = Math.max(0, tierLimit - count);

    // 5. Attach standard rate limit HTTP headers on EVERY response
    res.setHeader('x-ratelimit-limit', String(tierLimit));
    res.setHeader('x-ratelimit-remaining', String(remaining));
    res.setHeader('x-ratelimit-reset', String(ttl));

    // Also support uppercase variants for RFC compliance
    res.setHeader('X-RateLimit-Limit', String(tierLimit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(ttl));

    // Attach rate limit state to request for logger and downstream handlers
    req.rateLimit = {
      limit: tierLimit,
      current: count,
      remaining,
      resetSeconds: ttl,
    };

    // 6. Check if request count exceeds the tier limit
    if (count > tierLimit) {
      res.setHeader('Retry-After', String(ttl));
      return res.status(429).json({
        success: false,
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Your subscription tier (${req.client.tier.toUpperCase()}) allows a maximum of ${tierLimit} requests per minute.`,
        client: {
          name: req.client.name,
          email: req.client.email,
          tier: req.client.tier,
        },
        rateLimit: {
          limit: tierLimit,
          current: count,
          remaining: 0,
          resetInSeconds: ttl,
        },
      });
    }

    // Proceed to upstream proxy or next handler
    next();
  } catch (err) {
    console.error('[RateLimiter Error]:', err);
    // On unexpected rate limiter error, fail open or return 500
    res.setHeader('x-ratelimit-limit', String(tierLimit));
    res.setHeader('x-ratelimit-remaining', '0');
    res.setHeader('x-ratelimit-reset', '60');
    next();
  }
};

module.exports = { rateLimiter, WINDOW_SIZE_SECONDS };
