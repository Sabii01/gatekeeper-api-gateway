const { query } = require('../config/db');

/**
 * Authentication Middleware: Validates API Key from custom headers
 * against PostgreSQL and attaches client record & tier rules to req.client
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    // 1. Extract API Key from custom header (x-api-key / X-API-KEY) or fallback authorization header
    let apiKey = req.headers['x-api-key'] || req.headers['x-api-token'];

    if (!apiKey && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7).trim();
      } else {
        apiKey = authHeader.trim();
      }
    }

    // 2. Reject if no API key is provided
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing API Key. Please provide a valid API key in the "x-api-key" header.',
      });
    }

    apiKey = apiKey.trim();

    // 3. Query PostgreSQL for client & associated rate limit rules
    const sql = `
      SELECT 
        c.id,
        c.name,
        c.email,
        c.api_key,
        c.tier,
        c.is_active,
        c.created_at,
        c.updated_at,
        r.max_requests_per_minute,
        r.burst_capacity,
        r.description AS tier_description
      FROM clients c
      INNER JOIN rate_limit_rules r ON c.tier = r.tier
      WHERE c.api_key = $1
      LIMIT 1;
    `;

    const result = await query(sql, [apiKey]);

    // 4. Validate existence of client with this API key
    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid API Key. The provided API key does not match any registered client.',
      });
    }

    const clientRow = result.rows[0];

    // 5. Check if client is active
    if (!clientRow.is_active) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        error: 'Forbidden',
        message: 'API Key is revoked or inactive. Please contact support or upgrade your subscription.',
        client: {
          id: clientRow.id,
          name: clientRow.name,
          tier: clientRow.tier,
          isActive: false,
        },
      });
    }

    // 6. Attach client record and tier metadata to req.client
    req.client = {
      id: clientRow.id,
      name: clientRow.name,
      email: clientRow.email,
      apiKey: clientRow.api_key,
      tier: clientRow.tier,
      isActive: clientRow.is_active,
      createdAt: clientRow.created_at,
      updatedAt: clientRow.updated_at,
      rateLimit: {
        maxRequestsPerMinute: clientRow.max_requests_per_minute,
        burstCapacity: clientRow.burst_capacity,
        description: clientRow.tier_description,
      },
    };

    // Proceed to next middleware or route handler
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to authenticate request due to a database error.',
    });
  }
};

module.exports = { apiKeyAuth };
