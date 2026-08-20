const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');
const { getRedisClient } = require('../config/redis');

const TEST_PORT = 5056;

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

async function runRateLimitTests() {
  console.log('====================================================');
  console.log('⏱️  Starting Redis Rate Limiter & Header Tests');
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

    const redis = getRedisClient();
    // Flush test keys before testing
    await redis.flushall();

    const freeApiKey = 'ak_live_free_alice_84920482'; // Free Tier (10 req/min)
    const proApiKey = 'ak_live_pro_bob_93810294';    // Pro Tier (60 req/min)

    // ------------------------------------------------------------------------
    // TEST 1: Standard Rate Limit Headers on 200 OK
    // ------------------------------------------------------------------------
    console.log('[Test Suite 1] Standard Rate Limit Headers on Valid Requests');
    const res1 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': freeApiKey },
    });

    assert(
      res1.status === 200 &&
        res1.headers['x-ratelimit-limit'] === '10' &&
        res1.headers['x-ratelimit-remaining'] === '9' &&
        parseInt(res1.headers['x-ratelimit-reset'], 10) > 0,
      'Response includes x-ratelimit-limit, x-ratelimit-remaining (9), and x-ratelimit-reset',
      JSON.stringify(res1.headers)
    );

    // ------------------------------------------------------------------------
    // TEST 2: Remaining counter decrements with successive requests
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 2] Rate Limit Decrementing & Window Consumption');
    const res2 = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': freeApiKey },
    });
    assert(
      res2.headers['x-ratelimit-remaining'] === '8',
      'Second request correctly decrements x-ratelimit-remaining to 8'
    );

    // ------------------------------------------------------------------------
    // TEST 3: Consume Remaining Quota to hit 429
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 3] Quota Exhaustion & 429 Too Many Requests');
    // Consume requests 3 through 10
    for (let i = 3; i <= 10; i++) {
      await makeRequest({
        path: '/api/v1/client/me',
        headers: { 'x-api-key': freeApiKey },
      });
    }

    // Request 11 should exceed the Free Tier limit of 10
    const resBlocked = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': freeApiKey },
    });

    assert(
      resBlocked.status === 429 &&
        resBlocked.body.error === 'Too Many Requests' &&
        resBlocked.headers['x-ratelimit-remaining'] === '0' &&
        parseInt(resBlocked.headers['retry-after'], 10) > 0,
      'Request #11 is blocked with 429 Too Many Requests & Retry-After header',
      JSON.stringify({ status: resBlocked.status, headers: resBlocked.headers, body: resBlocked.body })
    );

    // ------------------------------------------------------------------------
    // TEST 4: Pro Tier with Higher Limit is NOT blocked
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 4] Multi-Tier Isolation (Pro Tier vs Free Tier)');
    const resPro = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': proApiKey },
    });

    assert(
      resPro.status === 200 &&
        resPro.headers['x-ratelimit-limit'] === '60' &&
        resPro.headers['x-ratelimit-remaining'] === '59',
      'Pro Tier has independent limit of 60 req/min and is not blocked by Free tier exhaustion'
    );

    // ------------------------------------------------------------------------
    // TEST 5: Rate Limit Reset via Admin Endpoint
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 5] Admin Rate Limit Reset Functionality');
    const resetRes = await makeRequest({
      method: 'POST',
      path: '/api/v1/admin/ratelimit/reset',
      body: { apiKey: freeApiKey },
    });

    assert(resetRes.status === 200 && resetRes.body.success === true, 'Admin successfully resets client rate limit');

    // Free client should now be unblocked
    const resAfterReset = await makeRequest({
      path: '/api/v1/client/me',
      headers: { 'x-api-key': freeApiKey },
    });

    assert(
      resAfterReset.status === 200 && resAfterReset.headers['x-ratelimit-remaining'] === '9',
      'Free tier client is unblocked immediately after reset with full remaining quota'
    );

    console.log('\n====================================================');
    console.log(`🏁 Rate Limiter Test Results: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Rate limiter test error:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runRateLimitTests();
}

module.exports = { runRateLimitTests };
