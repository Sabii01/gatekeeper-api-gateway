/**
 * API Service for interacting with the API Gateway backend
 */

const API_BASE = ''; // Relies on Vite dev proxy

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchGatewayInfo() {
  const res = await fetch(`${API_BASE}/api/public/info`);
  return res.json();
}

export async function fetchClients() {
  const res = await fetch(`${API_BASE}/api/v1/clients`);
  return res.json();
}

export async function registerClient({ name, email, tier }) {
  const res = await fetch(`${API_BASE}/api/v1/clients/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, tier }),
  });
  return res.json();
}

export async function toggleClientStatus(clientId) {
  const res = await fetch(`${API_BASE}/api/v1/clients/${clientId}/toggle-status`, {
    method: 'PATCH',
  });
  return res.json();
}

export async function deleteClient(clientId) {
  const res = await fetch(`${API_BASE}/api/v1/clients/${clientId}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function fetchAdminMetrics() {
  const res = await fetch(`${API_BASE}/api/v1/admin/metrics`);
  return res.json();
}

export async function fetchTrafficLogs(limit = 50, tier = null) {
  const url = `${API_BASE}/api/v1/admin/logs?limit=${limit}${tier ? `&tier=${tier}` : ''}`;
  const res = await fetch(url);
  return res.json();
}

export async function resetRateLimitKey(apiKey = null) {
  const res = await fetch(`${API_BASE}/api/v1/admin/ratelimit/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  return res.json();
}

export async function sendGatewayRequest({ path, method = 'GET', apiKey, body = null }) {
  const startTime = performance.now();
  try {
    const headers = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body && ['POST', 'PUT', 'PATCH'].includes(method) ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });

    const endTime = performance.now();
    const roundTripLatencyMs = Math.round(endTime - startTime);

    // Read the body once: calling res.text() after a failed res.json() throws "body already used"
    const rawBody = await res.text();
    let data = rawBody;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch (e) {
      // Non-JSON response (e.g. text/plain from an upstream service) is shown as-is
    }

    // Extract rate limit headers from HTTP headers OR JSON payload fallback
    const headerLimit = res.headers.get('x-ratelimit-limit') || res.headers.get('X-RateLimit-Limit');
    const headerRemaining = res.headers.get('x-ratelimit-remaining') || res.headers.get('X-RateLimit-Remaining');
    const headerReset = res.headers.get('x-ratelimit-reset') || res.headers.get('X-RateLimit-Reset');
    const headerRetry = res.headers.get('retry-after') || res.headers.get('Retry-After');

    const rateLimitHeaders = {
      limit: headerLimit !== null ? headerLimit : (data?.rateLimit?.limit != null ? String(data.rateLimit.limit) : null),
      remaining: headerRemaining !== null ? headerRemaining : (data?.rateLimit?.remaining != null ? String(data.rateLimit.remaining) : null),
      reset: headerReset !== null ? headerReset : (data?.rateLimit?.resetInSeconds != null ? String(data.rateLimit.resetInSeconds) : null),
      retryAfter: headerRetry !== null ? headerRetry : (data?.retryAfter != null ? String(data.retryAfter) : null),
      isProxied: res.headers.get('x-gateway-proxied') === 'true',
      upstream: res.headers.get('x-gateway-upstream') || null,
    };

    return {
      status: res.status,
      ok: res.ok,
      statusText: res.statusText,
      data,
      headers: rateLimitHeaders,
      latencyMs: roundTripLatencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const endTime = performance.now();
    return {
      status: 0,
      ok: false,
      statusText: 'Network Error',
      data: { error: error.message },
      headers: {},
      latencyMs: Math.round(endTime - startTime),
      timestamp: new Date().toISOString(),
    };
  }
}
