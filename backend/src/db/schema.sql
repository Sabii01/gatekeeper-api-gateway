-- ============================================================================
-- API GATEWAY & RATE LIMITER: DATABASE SCHEMA
-- Phase 1 - Feature 1: Client & Tier Schema
-- ============================================================================

-- Enable pgcrypto for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. RATE LIMIT RULES TABLE
-- Defines maximum allowed requests per minute (and optional burst) per tier.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_rules (
    tier VARCHAR(50) PRIMARY KEY,
    max_requests_per_minute INTEGER NOT NULL CHECK (max_requests_per_minute > 0),
    burst_capacity INTEGER DEFAULT 0 CHECK (burst_capacity >= 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. CLIENTS TABLE
-- Stores registered users, their secret API keys, and assigned subscription tiers.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    api_key VARCHAR(128) UNIQUE NOT NULL,
    tier VARCHAR(50) NOT NULL REFERENCES rate_limit_rules(tier) ON UPDATE CASCADE ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 3. INDEXES FOR HIGH-PERFORMANCE GATEWAY LOOKUPS
-- ----------------------------------------------------------------------------
-- API Key index for O(1)/O(log N) Gateway token validation
CREATE INDEX IF NOT EXISTS idx_clients_api_key ON clients(api_key);

-- Tier index for fast client-tier relational lookups
CREATE INDEX IF NOT EXISTS idx_clients_tier ON clients(tier);

-- Active status index for filtering revoked keys
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

-- ----------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER FUNCTION
-- Automatically updates updated_at timestamp on row modification
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for rate_limit_rules
DROP TRIGGER IF EXISTS trg_rate_limit_rules_updated_at ON rate_limit_rules;
CREATE TRIGGER trg_rate_limit_rules_updated_at
    BEFORE UPDATE ON rate_limit_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for clients
DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
