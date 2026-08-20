# API Gateway & Rate Limiter - Backend

## Phase 1: PostgreSQL Schema & Database Seeder

### Overview
This backend service implements the database schemas and data provisioning required for an API Gateway & Rate Limiter system.

### Tables

1. **`rate_limit_rules`**: Defines the rate limits and burst capacities per tier.
   - `tier` (VARCHAR(50) PRIMARY KEY): e.g. `'free'`, `'pro'`, `'enterprise'`
   - `max_requests_per_minute` (INTEGER NOT NULL): Max requests per 60-second sliding/fixed window
   - `burst_capacity` (INTEGER): Maximum burst tokens allowable
   - `description` (TEXT): Tier description
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **`clients`**: Stores registered users, API keys, and subscription tiers.
   - `id` (UUID PRIMARY KEY DEFAULT `gen_random_uuid()`)
   - `name` (VARCHAR(100) NOT NULL)
   - `email` (VARCHAR(255) UNIQUE NOT NULL)
   - `api_key` (VARCHAR(128) UNIQUE NOT NULL)
   - `tier` (VARCHAR(50) NOT NULL REFERENCES `rate_limit_rules(tier)`)
   - `is_active` (BOOLEAN DEFAULT TRUE)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

### Indexes
- `idx_clients_api_key`: High-performance B-Tree index for low-latency API key lookup in the Gateway.
- `idx_clients_tier`: Foreign key reference index for fast joins.
- `idx_clients_is_active`: Filter active vs revoked keys.

---

### Database Commands

```bash
# 1. Run Migration (creates database and executes schema.sql)
npm run migrate

# 2. Run Seeder (populates default tiers & test API keys)
npm run seed

# 3. Initialize DB (Migrate + Seed)
npm run db:init

# 4. Verify & Test DB connection and queries
npm run test:db
```

---

### Seeded Test API Keys

| Tier | Name | Email | API Key | Rate Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | Alice Dev | `alice.dev@example.com` | `ak_live_free_alice_84920482` | 10 req/min |
| **Pro** | Bob Founder (Pro) | `bob.founder@startup.io` | `ak_live_pro_bob_93810294` | 60 req/min |
| **Enterprise** | Acme Global Corp | `infra@acmeglobal.com` | `ak_live_enterprise_acme_72819401` | 1000 req/min |
| **Free (Revoked)** | Revoked Test Client | `revoked.user@example.com` | `ak_live_revoked_key_00000000` | 10 req/min *(Inactive)* |
