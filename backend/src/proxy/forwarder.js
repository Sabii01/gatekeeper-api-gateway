const axios = require('axios');

/**
 * Reverse Proxy Forwarder:
 * Intercepts authenticated, rate-permitted requests and forwards them to upstream microservices.
 */
const proxyForwarder = async (req, res) => {
  const upstreamBaseUrl = process.env.UPSTREAM_URL || 'http://localhost:5001';

  try {
    // 1. Resolve upstream target URL
    const targetPath = req.originalUrl.replace(/^\/api\/v1\/services/, '');
    const upstreamUrl = `${upstreamBaseUrl}${targetPath || '/'}`;

    // 2. Prepare headers for upstream forwarding
    const forwardedHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      // Exclude hop-by-hop and host/length headers
      if (!['host', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        forwardedHeaders[key] = value;
      }
    }

    // Inject Gateway telemetry headers
    forwardedHeaders['x-gateway-forwarded'] = 'true';
    forwardedHeaders['x-gateway-client-id'] = req.client?.id || 'unknown';
    forwardedHeaders['x-gateway-client-tier'] = req.client?.tier || 'unknown';
    forwardedHeaders['x-gateway-client-email'] = req.client?.email || 'unknown';
    forwardedHeaders['x-gateway-timestamp'] = new Date().toISOString();

    if (req.body && Object.keys(req.body).length > 0) {
      forwardedHeaders['content-type'] = 'application/json';
    }

    // 3. Make HTTP request to upstream target
    const response = await axios({
      method: req.method,
      url: upstreamUrl,
      headers: forwardedHeaders,
      data: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? req.body : undefined,
      params: req.query,
      validateStatus: () => true, // Pass all upstream HTTP codes through
      timeout: 10000,
    });

    // 4. Set gateway response header indicating proxied response
    res.setHeader('x-gateway-proxied', 'true');
    res.setHeader('x-gateway-upstream', upstreamBaseUrl);

    // 5. Send back upstream microservice's status code and data to client
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`[Proxy Forwarder Error]: Failed to forward to ${req.originalUrl}:`, error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(502).json({
        success: false,
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'Upstream microservice is unavailable or unreachable.',
        target: upstreamBaseUrl,
      });
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
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
      message: error.message || 'An error occurred while proxying the request.',
    });
  }
};

module.exports = { proxyForwarder };
