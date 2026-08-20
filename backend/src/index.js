const app = require('./app');
const { testConnection } = require('./config/db');
const { getRedisClient } = require('./config/redis');
const { startUpstreamService } = require('./services/mockUpstream');

const PORT = parseInt(process.env.PORT || '5000', 10);
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PORT || '5001', 10);

async function startServer() {
  console.log('====================================================');
  console.log('🚀 Starting API Gateway & Rate Limiter System');
  console.log('====================================================');

  // 1. Verify PostgreSQL connection
  const dbStatus = await testConnection();
  if (!dbStatus.success) {
    console.error(`❌ Fatal: Database connection failed: ${dbStatus.error}`);
    process.exit(1);
  }
  console.log(`✅ Database connected: "${dbStatus.database}" on ${dbStatus.host}:${dbStatus.port}`);

  // 2. Verify Redis / In-Memory Engine
  const redis = getRedisClient();
  const pong = await redis.ping();
  console.log(`✅ Redis Engine: ${redis.isFallback ? 'Embedded In-Memory Engine' : 'Live Redis Server'} (${pong})`);

  // 3. Start Upstream Mock Microservices
  const upstreamServer = await startUpstreamService(UPSTREAM_PORT);

  // 4. Start API Gateway
  const gatewayServer = app.listen(PORT, () => {
    console.log(`\n🌐 API Gateway listening on:       http://localhost:${PORT}`);
    console.log(`🔌 Upstream Target Microservices:  http://localhost:${UPSTREAM_PORT}`);
    console.log(`🛡️  Auth + Rate Limited Route:     http://localhost:${PORT}/api/v1/client/me`);
    console.log(`🔀 Proxied Microservice Route:     http://localhost:${PORT}/api/v1/services/users`);
    console.log(`📊 Traffic Analytics & Logs:       http://localhost:${PORT}/api/v1/admin/logs`);
    console.log(`❤️  Gateway Health Check:          http://localhost:${PORT}/health`);
    console.log('====================================================\n');
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n🛑 Shutting down Gateway and Microservices gracefully...');
    gatewayServer.close(() => {
      upstreamServer.close(() => {
        console.log('👋 All servers closed.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
