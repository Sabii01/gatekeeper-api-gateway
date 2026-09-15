const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/db');
const { getRedisClient } = require('../config/redis');

const router = express.Router();

// Limits mirror the column sizes in schema.sql so bad input is rejected with 400 instead of a DB error
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a high-entropy, cryptographically secure API key
 * Format: ak_live_{tier}_{32-char-random-hex}
 */
function generateApiKey(tier) {
  const randomHex = crypto.randomBytes(16).toString('hex');
  return `ak_live_${tier}_${randomHex}`;
}

/**
 * Maps a clients row (optionally joined with rate_limit_rules) to the camelCase API shape
 */
function formatClient(row) {
  const client = {
    id: row.id,
    name: row.name,
    email: row.email,
    apiKey: row.api_key,
    tier: row.tier,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.max_requests_per_minute !== undefined) {
    client.rateLimit = {
      maxRequestsPerMinute: row.max_requests_per_minute,
      burstCapacity: row.burst_capacity,
      description: row.tier_description,
    };
  }
  return client;
}

function badRequest(res, message) {
  return res.status(400).json({
    success: false,
    statusCode: 400,
    error: 'Bad Request',
    message,
  });
}

function clientNotFound(res) {
  return res.status(404).json({
    success: false,
    statusCode: 404,
    error: 'Not Found',
    message: 'Client not found.',
  });
}

// ----------------------------------------------------------------------------
// 1. POST /api/v1/clients/register - Register new client & generate API key
// ----------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { name, email, tier = 'free' } = req.body || {};

  // Validation
  if (typeof name !== 'string' || name.trim().length === 0) {
    return badRequest(res, 'Name is required.');
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    return badRequest(res, `Name must be at most ${MAX_NAME_LENGTH} characters.`);
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_REGEX.test(normalizedEmail) || normalizedEmail.length > MAX_EMAIL_LENGTH) {
    return badRequest(res, 'A valid email address is required.');
  }

  if (typeof tier !== 'string') {
    return badRequest(res, 'Tier must be a string. Valid tiers are: free, pro, enterprise.');
  }
  const normalizedTier = tier.toLowerCase().trim();

  try {
    // 1. Verify tier exists in rate_limit_rules
    const tierCheck = await query('SELECT tier, max_requests_per_minute, burst_capacity FROM rate_limit_rules WHERE tier = $1;', [normalizedTier]);
    if (tierCheck.rowCount === 0) {
      return badRequest(res, `Invalid subscription tier "${tier}". Valid tiers are: free, pro, enterprise.`);
    }

    const tierRule = tierCheck.rows[0];

    // 2. Generate secure API key
    const apiKey = generateApiKey(normalizedTier);

    // 3. Insert into PostgreSQL
    const insertSql = `
      INSERT INTO clients (name, email, api_key, tier, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, name, email, api_key, tier, is_active, created_at, updated_at;
    `;

    const result = await query(insertSql, [name.trim(), normalizedEmail, apiKey, normalizedTier]);
    const newClient = result.rows[0];

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Client registered successfully. API Key generated.',
      client: {
        id: newClient.id,
        name: newClient.name,
        email: newClient.email,
        apiKey: newClient.api_key,
        tier: newClient.tier,
        isActive: newClient.is_active,
        createdAt: newClient.created_at,
        rateLimit: {
          maxRequestsPerMinute: tierRule.max_requests_per_minute,
          burstCapacity: tierRule.burst_capacity,
        },
      },
    });
  } catch (error) {
    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        statusCode: 409,
        error: 'Conflict',
        message: `A client with email "${normalizedEmail}" is already registered.`,
      });
    }

    console.error('[Registration Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to register client due to a database error.',
    });
  }
});

// ----------------------------------------------------------------------------
// 2. GET /api/v1/clients - List all registered clients with their tier rules
// ----------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
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
      ORDER BY c.created_at DESC;
    `;

    const result = await query(sql);
    const clients = result.rows.map(formatClient);

    return res.json({
      success: true,
      count: clients.length,
      clients,
    });
  } catch (error) {
    console.error('[Get Clients Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to fetch clients from database.',
    });
  }
});

// ----------------------------------------------------------------------------
// 3. PATCH /api/v1/clients/:id/toggle-status - Toggle active/revoked status
// ----------------------------------------------------------------------------
router.patch('/:id/toggle-status', async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return clientNotFound(res);
  }

  try {
    const updateSql = `
      UPDATE clients
      SET is_active = NOT is_active,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, name, email, api_key, tier, is_active, created_at, updated_at;
    `;

    const result = await query(updateSql, [id]);
    if (result.rowCount === 0) {
      return clientNotFound(res);
    }

    const updated = result.rows[0];
    if (!updated.is_active) {
      // Clear any rate limit key in redis when deactivated
      await getRedisClient().del(`ratelimit:${updated.api_key}`);
    }

    return res.json({
      success: true,
      message: `Client ${updated.is_active ? 'activated' : 'revoked'} successfully.`,
      client: formatClient(updated),
    });
  } catch (error) {
    console.error('[Toggle Status Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to update client status.',
    });
  }
});

// ----------------------------------------------------------------------------
// 4. DELETE /api/v1/clients/:id - Remove client
// ----------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!UUID_REGEX.test(id)) {
    return clientNotFound(res);
  }

  try {
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING api_key;', [id]);
    if (result.rowCount === 0) {
      return clientNotFound(res);
    }

    await getRedisClient().del(`ratelimit:${result.rows[0].api_key}`);

    return res.json({
      success: true,
      message: 'Client and API key deleted successfully.',
    });
  } catch (error) {
    console.error('[Delete Client Error]:', error);
    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Failed to delete client.',
    });
  }
});

module.exports = router;
