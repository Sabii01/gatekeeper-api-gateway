const axios = require('axios');

// Hop-by-hop headers (RFC 7230 §6.1) are connection-specific and must not be forwarded.
// Client credentials are consumed by the gateway and must never leak to upstream services.
const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-connection',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-api-key',
  'x-api-token',
  'authorization',
]);

// axios decompresses and re-frames the body, so length/encoding headers from upstream no longer apply.
// CORS and rate limit headers are owned by the gateway and must not be overridden by upstream.
const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
]);
const GATEWAY_OWNED_RESPONSE_HEADER = /^(access-control-|x-ratelimit-|retry-after$)/i;

const UPSTREAM_UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH']);

/**
 * Reverse Proxy Forwarder:
 * Intercepts authenticated, rate-permitted requests and forwards them to upstream microservices.
 */
const proxyForwarder = async (req, res) => {
  const upstreamBaseUrl = (process.env.UPSTREAM_URL || 'http://localhost:5001').replace(/\/+$/, '');
  const timeoutMs = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '10000', 10);

  try {
    // 1. Resolve upstream target URL. req.url is relative to the /api/v1 mount point and still carries
    //    the raw query string, so the query is forwarded verbatim (passing axios `params` would duplicate it).
    const targetPath = req.url.replace(/^\/services/i, '') || '/';
    const upstreamUrl = `${upstreamBaseUrl}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;

    // 2. Prepare headers for upstream forwarding
    const forwardedHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
        forwardedHeaders[key] = value;
      }
    }

    // Inject Gateway telemetry headers
    forwardedHeaders['x-gateway-forwarded'] = 'true';
    forwardedHeaders['x-gateway-client-id'] = req.client?.id || 'unknown';
    forwardedHeaders['x-gateway-client-tier'] = req.client?.tier || 'unknown';
    forwardedHeaders['x-gateway-client-email'] = req.client?.email || 'unknown';
    forwardedHeaders['x-gateway-timestamp'] = new Date().toISOString();

    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (hasBody && req.body !== undefined) {
      // express.json / express.urlencoded have already parsed the body, so it is re-sent as JSON
      forwardedHeaders['content-type'] = 'application/json';
    }

    // 3. Make HTTP request to upstream target
    const response = await axios({
      method: req.method,
      url: upstreamUrl,
      headers: forwardedHeaders,
      data: hasBody ? req.body : undefined,
      responseType: 'arraybuffer', // pass the upstream body through untouched (JSON, text, binary)
      maxRedirects: 0,
      validateStatus: () => true, // Pass all upstream HTTP codes through
      timeout: timeoutMs,
    });

    // 4. Relay upstream response headers, then mark the response as proxied
    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined || STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase()) || GATEWAY_OWNED_RESPONSE_HEADER.test(key)) {
        continue;
      }
      res.setHeader(key, value);
    }
    res.setHeader('x-gateway-proxied', 'true');
    res.setHeader('x-gateway-upstream', upstreamBaseUrl);

    // 5. Send back upstream microservice's status code and raw body to client
    return res.status(response.status).send(Buffer.from(response.data));
  } catch (error) {
    console.error(`[Proxy Forwarder Error]: Failed to forward to ${req.originalUrl}:`, error.message);

    if (UPSTREAM_UNREACHABLE_CODES.has(error.code)) {
      return res.status(502).json({
        success: false,
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'Upstream microservice is unavailable or unreachable.',
        target: upstreamBaseUrl,
      });
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || /timeout/i.test(error.message)) {
      return res.status(504).json({
        success: false,
        statusCode: 504,
        error: 'Gateway Timeout',
        message: 'Upstream microservice timed out before responding.',
      });
    }

    return res.status(500).json({
      success: false,
      statusCode: 500,
      error: 'Proxy Error',
      message: 'An error occurred while proxying the request.',
    });
  }
};

module.exports = { proxyForwarder };
