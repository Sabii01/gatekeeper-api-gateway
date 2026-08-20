const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');
const { ensureDatabaseExists } = require('./migrate');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'api_gateway_db',
};

// Default Rate Limit Tiers according to requirements
const DEFAULT_TIERS = [
  {
    tier: 'free',
    max_requests_per_minute: 10,
    burst_capacity: 5,
    description: 'Free tier - 10 requests/minute for personal & evaluation use.',
  },
  {
    tier: 'pro',
    max_requests_per_minute: 60,
    burst_capacity: 20,
    description: 'Pro tier - 60 requests/minute for production apps & teams.',
  },
  {
    tier: 'enterprise',
    max_requests_per_minute: 1000,
    burst_capacity: 100,
    description: 'Enterprise tier - 1000 requests/minute for high-throughput enterprise systems.',
  },
];

// Test Clients & API Keys
const TEST_CLIENTS = [
  {
    name: 'Alice Dev',
    email: 'alice.dev@example.com',
    api_key: 'ak_live_free_alice_84920482',
    tier: 'free',
    is_active: true,
  },
  {
    name: 'Bob Founder (Pro)',
    email: 'bob.founder@startup.io',
    api_key: 'ak_live_pro_bob_93810294',
    tier: 'pro',
    is_active: true,
  },
  {
    name: 'Acme Global Corp (Enterprise)',
    email: 'infra@acmeglobal.com',
    api_key: 'ak_live_enterprise_acme_72819401',
    tier: 'enterprise',
    is_active: true,
  },
  {
    name: 'Revoked Test Client',
    email: 'revoked.user@example.com',
    api_key: 'ak_live_revoked_key_00000000',
    tier: 'free',
    is_active: false,
  },
];

/**
 * Seeds the database with default rate limit tiers and test clients
 */
async function seedDatabase() {
  console.log(`\n==================================================`);
  console.log(`🌱 Starting Database Seeder: ${dbConfig.database}`);
  console.log(`==================================================`);

  await ensureDatabaseExists();

  const pool = new Pool(dbConfig);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Seed Rate Limit Tiers
    console.log(`\n[1/2] Seeding Rate Limit Tiers...`);
    for (const item of DEFAULT_TIERS) {
      const tierQuery = `
        INSERT INTO rate_limit_rules (tier, max_requests_per_minute, burst_capacity, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tier) DO UPDATE 
        SET max_requests_per_minute = EXCLUDED.max_requests_per_minute,
            burst_capacity = EXCLUDED.burst_capacity,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *;
      `;
      const res = await client.query(tierQuery, [
        item.tier,
        item.max_requests_per_minute,
        item.burst_capacity,
        item.description,
      ]);
      console.log(`   ✓ Tier [${res.rows[0].tier.toUpperCase()}]: max ${res.rows[0].max_requests_per_minute} req/min (burst: ${res.rows[0].burst_capacity})`);
    }

    // 2. Seed Test Clients & API Keys
    console.log(`\n[2/2] Seeding Test Clients & API Keys...`);
    for (const c of TEST_CLIENTS) {
      const clientQuery = `
        INSERT INTO clients (name, email, api_key, tier, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            api_key = EXCLUDED.api_key,
            tier = EXCLUDED.tier,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
        RETURNING id, name, email, api_key, tier, is_active;
      `;
      const res = await client.query(clientQuery, [
        c.name,
        c.email,
        c.api_key,
        c.tier,
        c.is_active,
      ]);
      const row = res.rows[0];
      console.log(`   ✓ Client [${row.tier.toUpperCase()}]: ${row.name} <${row.email}>`);
      console.log(`     API Key:   ${row.api_key}`);
      console.log(`     Active:    ${row.is_active ? 'Yes' : 'No (Revoked)'}`);
      console.log(`     UUID:      ${row.id}`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Database seeded successfully!`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n❌ Seeding failed:`, err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, DEFAULT_TIERS, TEST_CLIENTS };
