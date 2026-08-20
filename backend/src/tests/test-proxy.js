const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');
const { startUpstreamService } = require('../services/mockUpstream');

const GATEWAY_TEST_PORT = 5057;
const UPSTREAM_TEST_PORT = 5058;

// Set upstream URL for proxy tests
process.env.UPSTREAM_URL = `http://localhost:${UPSTREAM_TEST_PORT}`;

function makeRequest({ method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: GATEWAY_TEST_PORT,
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

async function runProxyTests() {
  console.log('====================================================');
  console.log('🔀 Starting Reverse Proxy & Logging Middleware Tests');
  console.log('====================================================\n');

  let gatewayServer;
  let upstreamServer;
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
    // 1. Start upstream microservices
    upstreamServer = await startUpstreamService(UPSTREAM_TEST_PORT);

    // 2. Start API Gateway
    gatewayServer = await new Promise((resolve) => {
      const s = app.listen(GATEWAY_TEST_PORT, () => resolve(s));
    });

    const apiKey = 'ak_live_pro_bob_93810294'; // Pro Tier key

    // ------------------------------------------------------------------------
    // TEST 1: Forward GET /api/v1/services/users to Upstream User Microservice
    // ------------------------------------------------------------------------
    console.log('[Test Suite 1] Reverse Proxy Forwarding (GET Requests)');
    const resUsers = await makeRequest({
      path: '/api/v1/services/users',
      headers: { 'x-api-key': apiKey },
    });

    assert(
      resUsers.status === 200 &&
        resUsers.headers['x-gateway-proxied'] === 'true' &&
        resUsers.body.service === 'User Microservice' &&
        Array.isArray(resUsers.body.users),
      'GET /api/v1/services/users proxies to User Microservice and returns users',
      JSON.stringify(resUsers.body)
    );

    // ------------------------------------------------------------------------
    // TEST 2: Forward GET /api/v1/services/products to Product Microservice
    // ------------------------------------------------------------------------
    const resProducts = await makeRequest({
      path: '/api/v1/services/products',
      headers: { 'x-api-key': apiKey },
    });

    assert(
      resProducts.status === 200 &&
        resProducts.body.service === 'Product Catalog Microservice' &&
        resProducts.body.products.length > 0,
      'GET /api/v1/services/products proxies to Product Catalog Microservice',
      JSON.stringify(resProducts.body)
    );

    // ------------------------------------------------------------------------
    // TEST 3: Forward POST /api/v1/services/products with Request Body
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 2] Reverse Proxy Forwarding (POST Requests + Body)');
    const newProductPayload = { name: 'Distributed Rate Limiter Gateway License', price: 199.0, stock: 50 };
    const resPost = await makeRequest({
      method: 'POST',
      path: '/api/v1/services/products',
      headers: { 'x-api-key': apiKey },
      body: newProductPayload,
    });

    assert(
      resPost.status === 201 &&
        resPost.body.product &&
        resPost.body.product.name === newProductPayload.name,
      'POST /api/v1/services/products sends payload to upstream and creates resource',
      JSON.stringify(resPost.body)
    );

    // ------------------------------------------------------------------------
    // TEST 4: Header Injection & Telemetry Forwarding
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 3] Gateway Telemetry Header Injection');
    const resInspect = await makeRequest({
      path: '/api/v1/services/inspect',
      headers: { 'x-api-key': apiKey },
    });

    assert(
      resInspect.status === 200 &&
        resInspect.body.forwardedByGateway === true &&
        resInspect.body.clientTier === 'pro',
      'Gateway injected x-gateway-forwarded, x-gateway-client-tier, and x-gateway-client-id into upstream request',
      JSON.stringify(resInspect.body)
    );

    // ------------------------------------------------------------------------
    // TEST 5: Logging Middleware Captured IP, Route, Status, Latency
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 4] Traffic Logger & Analytics Verification');
    const resLogs = await makeRequest({
      path: '/api/v1/admin/logs?limit=5',
    });

    const recentLogs = resLogs.body.logs;
    assert(
      resLogs.status === 200 &&
        Array.isArray(recentLogs) &&
        recentLogs.length > 0 &&
        recentLogs[0].clientIp &&
        recentLogs[0].method &&
        recentLogs[0].route &&
        recentLogs[0].statusCode &&
        typeof recentLogs[0].latencyMs === 'number',
      'Traffic logger recorded client IP, route, method, status code, and latency in milliseconds',
      JSON.stringify(recentLogs[0])
    );

    // ------------------------------------------------------------------------
    // TEST 6: Aggregated Traffic Metrics
    // ------------------------------------------------------------------------
    const resStats = await makeRequest({
      path: '/api/v1/admin/stats',
    });

    assert(
      resStats.status === 200 &&
        resStats.body.metrics.totalRequests > 0 &&
        typeof resStats.body.metrics.averageLatencyMs === 'number',
      'Admin metrics endpoint returns totalRequests and averageLatencyMs'
    );

    console.log('\n====================================================');
    console.log(`🏁 Reverse Proxy & Logging Test Results: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('❌ Proxy test error:', err);
    process.exitCode = 1;
  } finally {
    if (gatewayServer) gatewayServer.close();
    if (upstreamServer) upstreamServer.close();
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runProxyTests();
}

module.exports = { runProxyTests };
