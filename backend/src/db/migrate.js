const fs = require('fs');
const path = require('path');
const { Client, Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'api_gateway_db',
};

/**
 * Ensures the target database exists on the PostgreSQL server.
 * Connects to 'postgres' administrative database first to check/create.
 */
async function ensureDatabaseExists() {
  const adminClient = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    const checkDbRes = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1;`,
      [dbConfig.database]
    );

    if (checkDbRes.rowCount === 0) {
      console.log(`[Migration] Database "${dbConfig.database}" does not exist. Creating...`);
      // Escape database name safely
      await adminClient.query(`CREATE DATABASE "${dbConfig.database}";`);
      console.log(`[Migration] Database "${dbConfig.database}" created successfully.`);
    } else {
      console.log(`[Migration] Database "${dbConfig.database}" exists.`);
    }
  } catch (err) {
    console.error(`[Migration Error] Failed while checking/creating database:`, err.message);
    throw err;
  } finally {
    await adminClient.end();
  }
}

/**
 * Runs the SQL schema migrations on the target database.
 */
async function runMigrations() {
  console.log(`\n==================================================`);
  console.log(`🚀 Starting Database Migration: ${dbConfig.database}`);
  console.log(`==================================================`);

  await ensureDatabaseExists();

  const targetPool = new Pool(dbConfig);
  const client = await targetPool.connect();

  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`[Migration] Executing schema definition from schema.sql...`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[Migration] Schema executed successfully!`);

    // Verify created tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log(`[Migration] Verified Tables in DB:`, tableRes.rows.map(r => r.table_name).join(', '));

    // Verify created indexes
    const indexRes = await client.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);
    console.log(`[Migration] Verified Indexes:`);
    indexRes.rows.forEach(idx => console.log(`   - ${idx.tablename} -> ${idx.indexname}`));

    console.log(`\n✅ Migration completed successfully.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n❌ Migration failed:`, err);
    process.exitCode = 1;
  } finally {
    client.release();
    await targetPool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations, ensureDatabaseExists };
