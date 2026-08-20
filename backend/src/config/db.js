const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from backend root .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

const poolConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'api_gateway_db',
  max: parseInt(process.env.PG_MAX_CLIENTS || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '5000', 10),
};

const pool = new Pool(poolConfig);

// Handle idle client errors without crashing the process
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool Error]: Unexpected error on idle client', err);
});

/**
 * Execute a parameterized query using the pool
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => {
  const start = Date.now();
  return pool.query(text, params).then((res) => {
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log('[SQL Query Executed]', { text, duration: `${duration}ms`, rows: res.rowCount });
    }
    return res;
  });
};

/**
 * Test the database connection and return current timestamp & version
 * @returns {Promise<{ success: boolean, version?: string, time?: string, error?: string }>}
 */
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW() AS current_time, version() AS pg_version;');
    return {
      success: true,
      time: result.rows[0].current_time,
      version: result.rows[0].pg_version,
      database: poolConfig.database,
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      database: poolConfig.database,
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
    };
  }
};

module.exports = {
  pool,
  query,
  testConnection,
  poolConfig,
};
