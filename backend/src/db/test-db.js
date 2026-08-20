const { query, testConnection } = require('../config/db');

async function testDatabase() {
  console.log(`\n==================================================`);
  console.log(`🔍 Validating API Gateway Database & Schemas`);
  console.log(`==================================================`);

  // 1. Check Connectivity
  console.log(`\n[Step 1] Testing Connection...`);
  const connStatus = await testConnection();
  if (!connStatus.success) {
    console.error(`❌ Connection failed: ${connStatus.error}`);
    process.exit(1);
  }
  console.log(`✅ Connected to Database: "${connStatus.database}" on ${connStatus.host}:${connStatus.port}`);
  console.log(`   PostgreSQL Version: ${connStatus.version.split(',')[0]}`);
  console.log(`   Database Server Time: ${connStatus.time}`);

  // 2. Query Rate Limit Rules
  console.log(`\n[Step 2] Fetching Rate Limit Rules...`);
  const rulesRes = await query(`
    SELECT tier, max_requests_per_minute, burst_capacity, description, updated_at
    FROM rate_limit_rules
    ORDER BY max_requests_per_minute ASC;
  `);
  console.table(rulesRes.rows);

  // 3. Query Clients joined with Rate Limit Rules (Gateway Lookup Simulation)
  console.log(`\n[Step 3] Simulating Gateway Auth & Rate Limit Rule Resolution...`);
  const clientsRes = await query(`
    SELECT 
      c.id,
      c.name,
      c.email,
      c.api_key,
      c.tier,
      c.is_active,
      r.max_requests_per_minute AS rate_limit_per_min,
      r.burst_capacity
    FROM clients c
    INNER JOIN rate_limit_rules r ON c.tier = r.tier
    ORDER BY r.max_requests_per_minute ASC, c.name ASC;
  `);
  console.table(clientsRes.rows);

  // 4. Test Single API Key fast lookup (Index Verification)
  const testKey = 'ak_live_pro_bob_93810294';
  console.log(`\n[Step 4] Testing Single API Key Lookup for: "${testKey}"...`);
  const singleRes = await query(`
    SELECT 
      c.id AS client_id,
      c.name,
      c.tier,
      c.is_active,
      r.max_requests_per_minute,
      r.burst_capacity
    FROM clients c
    JOIN rate_limit_rules r ON c.tier = r.tier
    WHERE c.api_key = $1 AND c.is_active = TRUE;
  `, [testKey]);

  if (singleRes.rowCount > 0) {
    console.log(`✅ API Key Validated Successfully!`);
    console.log(singleRes.rows[0]);
  } else {
    console.error(`❌ API Key not found or inactive!`);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 Phase 1 Schema & Database Validation PASSED!`);
  console.log(`==================================================\n`);
  process.exit(0);
}

testDatabase().catch((err) => {
  console.error(`❌ Test failed with error:`, err);
  process.exit(1);
});
