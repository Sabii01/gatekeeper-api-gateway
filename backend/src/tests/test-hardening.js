const http = require('http');
const app = require('../app');
const { pool } = require('../config/db');
const { getRedisClient, InMemoryRedis } = require('../config/redis');
const { startUpstreamService } = require('../services/mockUpstream');

const GATEWAY_TEST_PORT = 5060;
const UPSTREAM_TEST_PORT = 5061;
const UNUSED_PORT = 5999;
const UPSTREAM_URL = `http://localhost:${UPSTREAM_TEST_PORT}`;

process.env.UPSTREAM_URL = UPSTREAM_URL;

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

async function runHardeningTests() {
  console.log('====================================================');
  console.log('🛡️  Starting Hardening, Validation & Edge Case Tests');
  console.log('====================================================\n');

  let gatewayServer;
  let upstreamServer;
  let passedCount = 0;
  let failedCount = 0;
  let lifecycleClientId = null;

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

  const enterpriseKey = 'ak_live_enterprise_acme_72819401'; // 1000 req/min, never throttled here
  const freeKey = 'ak_live_free_alice_84920482'; // 10 req/min
  const redis = getRedisClient();

  try {
    upstreamServer = await startUpstreamService(UPSTREAM_TEST_PORT);
    gatewayServer = await new Promise((resolve) => {
      const s = app.listen(GATEWAY_TEST_PORT, () => resolve(s));
    });
    await redis.del(`ratelimit:${enterpriseKey}`, `ratelimit:${freeKey}`);

    // ------------------------------------------------------------------------
    // SUITE 1: Reverse proxy hardening
    // ------------------------------------------------------------------------
    console.log('[Test Suite 1] Reverse Proxy Hardening');

    const resQuery = await makeRequest({
      path: '/api/v1/services/inspect?page=2&tag=a',
      headers: { 'x-api-key': enterpriseKey },
    });
    assert(
      resQuery.status === 200 &&
        resQuery.body.url === '/inspect?page=2&tag=a' &&
        resQuery.body.query.page === '2' &&
        resQuery.body.query.tag === 'a',
      'Query string is forwarded exactly once (no duplicated parameters)',
      JSON.stringify({ url: resQuery.body.url, query: resQuery.body.query })
    );

    assert(
      resQuery.body.receivedHeaders &&
        resQuery.body.receivedHeaders['x-api-key'] === undefined &&
        resQuery.body.receivedHeaders['x-gateway-client-tier'] === 'enterprise',
      'Client x-api-key is stripped before forwarding while telemetry headers are injected',
      JSON.stringify(resQuery.body.receivedHeaders)
    );

    const resBearer = await makeRequest({
      path: '/api/v1/services/inspect',
      headers: { Authorization: `Bearer ${enterpriseKey}` },
    });
    assert(
      resBearer.status === 200 && resBearer.body.receivedHeaders.authorization === undefined,
      'Authorization: Bearer credential is stripped before forwarding',
      JSON.stringify(resBearer.body.receivedHeaders)
    );

    const resText = await makeRequest({
      path: '/api/v1/services/text',
      headers: { 'x-api-key': enterpriseKey },
    });
    assert(
      resText.status === 200 &&
        String(resText.headers['content-type']).startsWith('text/plain') &&
        resText.body === 'plain upstream response',
      'Non-JSON upstream responses pass through with their original content-type',
      JSON.stringify({ headers: resText.headers, body: resText.body })
    );

    const resUpstream404 = await makeRequest({
      path: '/api/v1/services/users/usr_missing',
      headers: { 'x-api-key': enterpriseKey },
    });
    assert(
      resUpstream404.status === 404 &&
        resUpstream404.body.error === 'User not found' &&
        resUpstream404.headers['x-ratelimit-limit'] === '1000',
      'Upstream error status codes pass through and keep gateway rate limit headers',
      JSON.stringify({ status: resUpstream404.status, body: resUpstream404.body })
    );

    const resCase = await makeRequest({
      path: '/api/v1/SERVICES/users',
      headers: { 'x-api-key': enterpriseKey },
    });
    assert(
      resCase.status === 200 && resCase.body.service === 'User Microservice',
      'Case-insensitive /SERVICES/ prefix is still stripped before forwarding',
      JSON.stringify(resCase.body)
    );

    process.env.UPSTREAM_TIMEOUT_MS = '300';
    const resTimeout = await makeRequest({
      path: '/api/v1/services/slow?ms=1500',
      headers: { 'x-api-key': enterpriseKey },
    });
    delete process.env.UPSTREAM_TIMEOUT_MS;
    assert(
      resTimeout.status === 504 && resTimeout.body.error === 'Gateway Timeout',
      'Slow upstream beyond UPSTREAM_TIMEOUT_MS returns 504 Gateway Timeout',
      JSON.stringify({ status: resTimeout.status, body: resTimeout.body })
    );

    process.env.UPSTREAM_URL = `http://localhost:${UNUSED_PORT}`;
    const resDown = await makeRequest({
      path: '/api/v1/services/users',
      headers: { 'x-api-key': enterpriseKey },
    });
    process.env.UPSTREAM_URL = UPSTREAM_URL;
    assert(
      resDown.status === 502 && resDown.body.error === 'Bad Gateway',
      'Unreachable upstream returns 502 Bad Gateway',
      JSON.stringify({ status: resDown.status, body: resDown.body })
    );

    // ------------------------------------------------------------------------
    // SUITE 2: Input validation & error handling
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 2] Input Validation & Error Handling');

    const register = (body) => makeRequest({ method: 'POST', path: '/api/v1/clients/register', body });

    const resLongName = await register({ name: 'x'.repeat(101), email: `long_${Date.now()}@example.com` });
    assert(resLongName.status === 400, 'Name longer than 100 characters returns 400 (not a 500 DB error)', JSON.stringify(resLongName.body));

    const resBadEmail = await register({ name: 'Bad Email', email: 'not-an-email' });
    const resAtEmail = await register({ name: 'At Email', email: '@' });
    assert(
      resBadEmail.status === 400 && resAtEmail.status === 400,
      'Malformed email addresses ("not-an-email", "@") return 400'
    );

    const resBadTier = await register({ name: 'Bad Tier', email: `tier_${Date.now()}@example.com`, tier: 'platinum' });
    const resNumericTier = await register({ name: 'Numeric Tier', email: `tier2_${Date.now()}@example.com`, tier: 123 });
    assert(
      resBadTier.status === 400 && resNumericTier.status === 400,
      'Unknown or non-string tier returns 400'
    );

    const resBadJson = await makeRequest({ method: 'POST', path: '/api/v1/clients/register', body: '{"name": bad json' });
    assert(
      resBadJson.status === 400 && resBadJson.body.error === 'Bad Request',
      'Malformed JSON body returns 400 Bad Request (not 500)',
      JSON.stringify({ status: resBadJson.status, body: resBadJson.body })
    );

    const resToggleBadId = await makeRequest({ method: 'PATCH', path: '/api/v1/clients/not-a-uuid/toggle-status' });
    const resDeleteBadId = await makeRequest({ method: 'DELETE', path: '/api/v1/clients/not-a-uuid' });
    const resDeleteMissing = await makeRequest({ method: 'DELETE', path: '/api/v1/clients/00000000-0000-4000-8000-000000000000' });
    assert(
      resToggleBadId.status === 404 && resDeleteBadId.status === 404 && resDeleteMissing.status === 404,
      'Malformed or unknown client ids return 404 for toggle/delete (not 500)',
      JSON.stringify([resToggleBadId.status, resDeleteBadId.status, resDeleteMissing.status])
    );

    const resUnknown = await makeRequest({ path: '/api/v1/does-not-exist-public' });
    assert(
      resUnknown.status === 401,
      'Unknown route under the protected /api/v1 prefix still requires an API key (401)'
    );

    const resUnknownRoot = await makeRequest({ path: '/definitely/not/here' });
    assert(
      resUnknownRoot.status === 404 && resUnknownRoot.body.error === 'Not Found',
      'Unknown route outside the gateway returns JSON 404'
    );

    // ------------------------------------------------------------------------
    // SUITE 3: Client lifecycle (register → revoke → activate → delete)
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 3] Client Lifecycle');

    const mixedCaseEmail = `Hardening_${Date.now()}@Example.COM`;
    const resReg = await register({ name: '  Hardening Lab  ', email: mixedCaseEmail, tier: 'FREE' });
    lifecycleClientId = resReg.body.client?.id || null;
    const lifecycleKey = resReg.body.client?.apiKey;
    assert(
      resReg.status === 201 &&
        resReg.body.client.email === mixedCaseEmail.toLowerCase() &&
        resReg.body.client.name === 'Hardening Lab' &&
        resReg.body.client.tier === 'free' &&
        /^ak_live_free_[0-9a-f]{32}$/.test(lifecycleKey),
      'Registration trims name, lowercases email & tier, and issues ak_live_free_<32 hex> key',
      JSON.stringify(resReg.body)
    );

    const resRevoke = await makeRequest({ method: 'PATCH', path: `/api/v1/clients/${lifecycleClientId}/toggle-status` });
    const resActivate = await makeRequest({ method: 'PATCH', path: `/api/v1/clients/${lifecycleClientId}/toggle-status` });
    assert(
      resRevoke.body.client?.isActive === false && resActivate.body.client?.isActive === true,
      'Toggling twice revokes then re-activates the key'
    );

    const resDelete = await makeRequest({ method: 'DELETE', path: `/api/v1/clients/${lifecycleClientId}` });
    const resDeletedKey = await makeRequest({ path: '/api/v1/client/me', headers: { 'x-api-key': lifecycleKey } });
    const resDeleteAgain = await makeRequest({ method: 'DELETE', path: `/api/v1/clients/${lifecycleClientId}` });
    assert(
      resDelete.status === 200 && resDeletedKey.status === 401 && resDeleteAgain.status === 404,
      'Deleted client key is rejected with 401 and a second delete returns 404',
      JSON.stringify([resDelete.status, resDeletedKey.status, resDeleteAgain.status])
    );
    if (resDelete.status === 200) lifecycleClientId = null;

    // ------------------------------------------------------------------------
    // SUITE 4: Concurrency — atomic counters under a burst
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 4] Atomic Rate Limiting Under Concurrent Burst');

    await redis.del(`ratelimit:${freeKey}`);
    const burst = await Promise.all(
      Array.from({ length: 15 }, () => makeRequest({ path: '/api/v1/client/me', headers: { 'x-api-key': freeKey } }))
    );
    const okCount = burst.filter((r) => r.status === 200).length;
    const blockedCount = burst.filter((r) => r.status === 429).length;
    assert(
      okCount === 10 && blockedCount === 5,
      '15 concurrent Free-tier requests yield exactly 10 × 200 and 5 × 429',
      JSON.stringify({ okCount, blockedCount })
    );

    const blocked = burst.find((r) => r.status === 429);
    assert(
      blocked && blocked.headers['retry-after'] === blocked.headers['x-ratelimit-reset'],
      'Retry-After matches x-ratelimit-reset on blocked responses',
      JSON.stringify(blocked && blocked.headers)
    );

    // ------------------------------------------------------------------------
    // SUITE 5: Admin endpoints
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 5] Admin Endpoints');

    const resLogsNaN = await makeRequest({ path: '/api/v1/admin/logs?limit=abc' });
    const resLogsTwo = await makeRequest({ path: '/api/v1/admin/logs?limit=2' });
    const resLogsNegative = await makeRequest({ path: '/api/v1/admin/logs?limit=-5' });
    assert(
      resLogsNaN.body.logs.length > 2 && resLogsTwo.body.logs.length === 2 && resLogsNegative.body.logs.length === 1,
      'Log limit falls back to default for non-numeric input and is clamped to >= 1',
      JSON.stringify([resLogsNaN.body.logs.length, resLogsTwo.body.logs.length, resLogsNegative.body.logs.length])
    );

    const resBadReset = await makeRequest({ method: 'POST', path: '/api/v1/admin/ratelimit/reset', body: { apiKey: 123 } });
    assert(resBadReset.status === 400, 'Reset with a non-string apiKey returns 400');

    await redis.set('unrelated:hardening-test', 'keep-me');
    await makeRequest({ path: '/api/v1/client/me', headers: { 'x-api-key': enterpriseKey } });
    const resFlush = await makeRequest({ method: 'POST', path: '/api/v1/admin/ratelimit/reset', body: {} });
    const survivor = await redis.get('unrelated:hardening-test');
    const remainingKeys = await redis.keys('ratelimit:*');
    assert(
      resFlush.status === 200 && resFlush.body.keysRemoved >= 1 && survivor === 'keep-me' && remainingKeys.length === 0,
      'Flush-all removes only ratelimit:* keys and leaves unrelated Redis data intact',
      JSON.stringify({ body: resFlush.body, survivor, remainingKeys })
    );
    await redis.del('unrelated:hardening-test');

    const resStats = await makeRequest({ path: '/api/v1/admin/stats' });
    assert(
      resStats.body.metrics.totalRequests <= 2 && resStats.body.metrics.rateLimited429 === 0,
      'Flush-all also resets aggregated traffic metrics',
      JSON.stringify(resStats.body.metrics)
    );

    // ------------------------------------------------------------------------
    // SUITE 6: In-memory Redis fallback semantics
    // ------------------------------------------------------------------------
    console.log('\n[Test Suite 6] In-Memory Redis Fallback Semantics');

    const mem = new InMemoryRedis();
    const first = await mem.incr('k');
    const second = await mem.incr('k');
    const ttlNoExpire = await mem.ttl('k');
    await mem.expire('k', 60);
    const ttlWithExpire = await mem.ttl('k');
    const ttlMissing = await mem.ttl('missing');
    assert(
      first === 1 && second === 2 && ttlNoExpire === -1 && ttlWithExpire === 60 && ttlMissing === -2,
      'INCR / EXPIRE / TTL follow Redis semantics (-1 no expiry, -2 missing key)',
      JSON.stringify({ first, second, ttlNoExpire, ttlWithExpire, ttlMissing })
    );

    await mem.set('k', 'plain');
    const ttlAfterSet = await mem.ttl('k');
    assert(ttlAfterSet === -1, 'Plain SET clears an existing TTL', String(ttlAfterSet));

    await mem.set('a.b', '1');
    await mem.set('axb', '1');
    const dotMatches = await mem.keys('a.b');
    assert(
      dotMatches.length === 1 && dotMatches[0] === 'a.b',
      'KEYS treats regex characters in the pattern literally',
      JSON.stringify(dotMatches)
    );

    await mem.set('short', 'lived', 'EX', 1);
    await new Promise((r) => setTimeout(r, 1100));
    const expired = await mem.get('short');
    assert(expired === null, 'Keys expire after their TTL elapses');

    console.log('\n====================================================');
    console.log(`🏁 Hardening Test Results: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Hardening test error:', err);
    failedCount++;
  } finally {
    if (lifecycleClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1;', [lifecycleClientId]).catch(() => {});
    }
    await redis.del(`ratelimit:${enterpriseKey}`, `ratelimit:${freeKey}`).catch(() => {});
    if (gatewayServer) gatewayServer.close();
    if (upstreamServer) upstreamServer.close();
    await pool.end();
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runHardeningTests();
}

module.exports = { runHardeningTests };
