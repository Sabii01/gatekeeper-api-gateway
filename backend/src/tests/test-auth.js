const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');

// Set test port
const TEST_PORT = 5055;

/**
 * Helper to make HTTP requests in tests
 */
function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runAuthTests() {
  console.log('====================================================');
  console.log('🧪 Starting Security & Authentication Middleware Tests');
  console.log('====================================================\n');

  let server;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      if (details) console.error(`     Details: ${details}`);
      failedCount++;
    }
  }

  try {
    // Start local test server
    server = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, () => resolve(s));
    });

    // ------------------------------------------------------------------------
    // TEST 1: Public Health Check
    // ------------------------------------------------------------------------
    console.log('[Test Suite 1] Public Routes (No Auth Required)');
    const res1 = await makeRequest({ path: '/health' });
    assert(res1.status === 200 && res1.body.status === 'UP', 'Public /health returns 200 without API key');

    // ------------------------------------------------------------------------
    // TEST 2: Missing Header on Protected Route
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 2] Negative Auth Cases');
    const res2 = await makeRequest({ path: '/api/v1/client/me' });
    assert(
      res2.status === 401 && res2.body.error === 'Unauthorized' && res2.body.message.includes('Missing API Key'),
      'Request with missing x-api-key header returns 401 Unauthorized',
      JSON.stringify(res2.body)
    );

    // ------------------------------------------------------------------------
    // TEST 3: Invalid / Non-Existent API Key
    // ------------------------------------------------------------------------
    const res3 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': 'ak_invalid_non_existent_key_999' },
    });
    assert(
      res3.status === 401 && res3.body.message.includes('Invalid API Key'),
      'Request with non-existent API key returns 401 Unauthorized',
      JSON.stringify(res3.body)
    );

    // ------------------------------------------------------------------------
    // TEST 4: Deactivated / Revoked API Key
    // ------------------------------------------------------------------------
    const res4 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': 'ak_live_revoked_key_00000000' },
    });
    assert(
      res4.status === 403 && res4.body.error === 'Forbidden' && res4.body.message.includes('revoked or inactive'),
      'Request with revoked API key returns 403 Forbidden',
      JSON.stringify(res4.body)
    );

    // ------------------------------------------------------------------------
    // TEST 5: Valid Free Tier API Key
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 3] Positive Auth Cases & req.client Attachment');
    const res5 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': 'ak_live_free_alice_84920482' },
    });
    const c5 = res5.body.client;
    assert(
      res5.status === 200 &&
        res5.body.success === true &&
        c5 &&
        c5.name === 'Alice Dev' &&
        c5.tier === 'free' &&
        c5.rateLimit.maxRequestsPerMinute === 10,
      'Free tier API key returns 200 and attaches req.client with 10 req/min limit',
      JSON.stringify(res5.body)
    );

    // ------------------------------------------------------------------------
    // TEST 6: Valid Pro Tier API Key on Gateway Data Endpoint
    // ------------------------------------------------------------------------
    const res6 = await makeRequest({
      path: '/api/v1/gateway/data',
      headers: { 'x-api-key': 'ak_live_pro_bob_93810294' },
    });
    assert(
      res6.status === 200 &&
        res6.body.caller.name === 'Bob Founder (Pro)' &&
        res6.body.caller.tier === 'pro' &&
        Array.isArray(res6.body.data),
      'Pro tier API key accesses /api/v1/gateway/data and caller is identified',
      JSON.stringify(res6.body)
    );

    // ------------------------------------------------------------------------
    // TEST 7: Valid Enterprise Tier API Key on POST Echo Endpoint
    // ------------------------------------------------------------------------
    const res7 = await makeRequest({
      method: 'POST',
      path: '/api/v1/gateway/echo',
      headers: { 'x-api-key': 'ak_live_enterprise_acme_72819401' },
      body: { service: 'payment-processor', payloadId: 'tx_9988' },
    });
    assert(
      res7.status === 200 &&
        res7.body.authenticatedUser === 'infra@acmeglobal.com' &&
        res7.body.tier === 'enterprise' &&
        res7.body.receivedPayload.service === 'payment-processor',
      'Enterprise API key POST request echoes payload with authenticatedUser',
      JSON.stringify(res7.body)
    );

    // ------------------------------------------------------------------------
    // TEST 8: Authorization Header Fallback (Bearer Token)
    // ------------------------------------------------------------------------
    const res8 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { Authorization: 'Bearer ak_live_free_alice_84920482' },
    });
    assert(
      res8.status === 200 && res8.body.client.name === 'Alice Dev',
      'Authorization: Bearer <key> fallback works seamlessly',
      JSON.stringify(res8.body)
    );

    console.log('\n====================================================');
    console.log(`🏁 Test Results: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runAuthTests();
}

module.exports = { runAuthTests };
