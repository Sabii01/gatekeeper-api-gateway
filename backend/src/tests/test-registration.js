const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');

const TEST_PORT = 5059;

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

    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runRegistrationTests() {
  console.log('====================================================');
  console.log('🔑 Starting Client Registration & Redis Metrics Tests');
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
    server = await new Promise((resolve) => {
      const s = app.listen(TEST_PORT, () => resolve(s));
    });

    const testEmail = `dev_${Date.now()}@nexustech.io`;
    let generatedApiKey = null;
    let registeredClientId = null;

    // ------------------------------------------------------------------------
    // TEST 1: Register New Pro Client
    // ------------------------------------------------------------------------
    console.log('[Test Suite 1] Client Registration & Cryptographic Key Generation');
    const resReg = await makeRequest({
      method: 'POST',
      path: '/api/v1/clients/register',
      body: {
        name: 'Nexus Tech Lab',
        email: testEmail,
        tier: 'pro',
      },
    });

    assert(
      resReg.status === 201 &&
        resReg.body.client &&
        resReg.body.client.apiKey.startsWith('ak_live_pro_') &&
        resReg.body.client.rateLimit.maxRequestsPerMinute === 60,
      'POST /api/v1/clients/register generates ak_live_pro_ key and stores client in PostgreSQL',
      JSON.stringify(resReg.body)
    );

    generatedApiKey = resReg.body.client?.apiKey;
    registeredClientId = resReg.body.client?.id;

    // ------------------------------------------------------------------------
    // TEST 2: Duplicate Email Conflict Handling
    // ------------------------------------------------------------------------
    const resDup = await makeRequest({
      method: 'POST',
      path: '/api/v1/clients/register',
      body: {
        name: 'Duplicate Nexus',
        email: testEmail,
        tier: 'free',
      },
    });

    assert(
      resDup.status === 409 && resDup.body.error === 'Conflict',
      'Registering with duplicate email returns 409 Conflict'
    );

    // ------------------------------------------------------------------------
    // TEST 3: List All Registered Clients
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 2] Client Directory & Status Management');
    const resList = await makeRequest({
      path: '/api/v1/clients',
    });

    assert(
      resList.status === 200 &&
        Array.isArray(resList.body.clients) &&
        resList.body.clients.some((c) => c.id === registeredClientId),
      'GET /api/v1/clients returns list containing newly created client'
    );

    // ------------------------------------------------------------------------
    // TEST 4: Immediate Gateway Request with Newly Generated Key
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 3] Live Gateway Auth & Rate Limiting with New Key');
    const resGateway = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': generatedApiKey },
    });

    assert(
      resGateway.status === 200 &&
        resGateway.body.client.name === 'Nexus Tech Lab' &&
        resGateway.headers['x-ratelimit-limit'] === '60' &&
        resGateway.headers['x-ratelimit-remaining'] === '59',
      'Newly generated API key authenticates immediately through Gateway with 60 req/min limit'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Toggle Status (Deactivate / Revoke Key)
    // ------------------------------------------------------------------------
    const resToggle = await makeRequest({
      method: 'PATCH',
      path: `/api/v1/clients/${registeredClientId}/toggle-status`,
    });

    assert(
      resToggle.status === 200 && resToggle.body.client.is_active === false,
      'PATCH /api/v1/clients/:id/toggle-status revokes API key'
    );

    // Blocked after revocation
    const resRevoked = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': generatedApiKey },
    });

    assert(
      resRevoked.status === 403 && resRevoked.body.error === 'Forbidden',
      'Revoked key is immediately blocked by Gateway authentication middleware with 403'
    );

    // ------------------------------------------------------------------------
    // TEST 6: Live Redis Admin Metrics Endpoint
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 4] Live Redis Counters & Gateway Analytics');
    const resMetrics = await makeRequest({
      path: '/api/v1/admin/metrics',
    });

    assert(
      resMetrics.status === 200 &&
        resMetrics.body.gateway &&
        typeof resMetrics.body.gateway.totalRequestsHandled === 'number' &&
        resMetrics.body.redis &&
        resMetrics.body.redis.status === 'HEALTHY' &&
        Array.isArray(resMetrics.body.redis.activeRateLimitWindows),
      'GET /api/v1/admin/metrics returns live Redis counters, active windows, and traffic metrics',
      JSON.stringify(resMetrics.body)
    );

    console.log('\n====================================================');
    console.log(`🏁 Registration & Metrics Results: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Registration test error:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runRegistrationTests();
}

module.exports = { runRegistrationTests };
