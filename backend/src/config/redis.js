const Redis = require('ioredis');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

// In-Memory Fallback Engine (Fully Redis-compatible for Rate Limiting)
class InMemoryRedis {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.isFallback = true;
  }

  _cleanExpired(key) {
    if (this.ttls.has(key)) {
      const expiresAt = this.ttls.get(key);
      if (Date.now() >= expiresAt) {
        this.store.delete(key);
        this.ttls.delete(key);
      }
    }
  }

  async incr(key) {
    this._cleanExpired(key);
    const current = parseInt(this.store.get(key) || '0', 10);
    const next = current + 1;
    this.store.set(key, String(next));
    return next;
  }

  async expire(key, seconds) {
    this._cleanExpired(key);
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key) {
    this._cleanExpired(key);
    if (!this.store.has(key)) return -2;
    if (!this.ttls.has(key)) return -1;
    const remainingMs = this.ttls.get(key) - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  async get(key) {
    this._cleanExpired(key);
    return this.store.get(key) || null;
  }

  async set(key, value, ...args) {
    this.store.set(key, String(value));
    if (args.length >= 2 && String(args[0]).toUpperCase() === 'EX') {
      const seconds = parseInt(args[1], 10);
      this.ttls.set(key, Date.now() + seconds * 1000);
    } else {
      // Like Redis, a plain SET discards any previous TTL
      this.ttls.delete(key);
    }
    return 'OK';
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      this.ttls.delete(key);
    }
    return count;
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async ping() {
    return 'PONG';
  }

  async keys(pattern = '*') {
    // Translate the Redis glob into a regex, escaping everything except the * and ? wildcards
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp('^' + escaped + '$');
    const result = [];
    for (const key of this.store.keys()) {
      this._cleanExpired(key);
      if (this.store.has(key) && regex.test(key)) {
        result.push(key);
      }
    }
    return result;
  }
}

// Resilient Redis Wrapper
class ResilientRedisClient {
  constructor() {
    this.inMemory = new InMemoryRedis();
    this.isLiveConnected = false;
    this.isFallback = true;
    this.readyPromise = null;
    this.initLiveConnection();
  }

  initLiveConnection() {
    try {
      this.live = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: 1,
        connectTimeout: 800,
        retryStrategy: () => 500,
        enableReadyCheck: true,
      });

      this.live.on('ready', () => {
        this.isLiveConnected = true;
        this.isFallback = false;
      });

      this.live.on('error', () => {
        this.isLiveConnected = false;
        this.isFallback = true;
      });
    } catch (e) {
      this.isLiveConnected = false;
      this.isFallback = true;
    }
  }

  async _getActive() {
    if (this.live && this.live.status === 'ready') {
      return this.live;
    }
    // Give 100ms for live connection if it's currently connecting
    if (this.live && ['connecting', 'connect'].includes(this.live.status)) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (this.live.status === 'ready') {
          return this.live;
        }
      } catch (e) {}
    }
    return this.inMemory;
  }

  async incr(key) {
    const client = await this._getActive();
    return client.incr(key);
  }

  async expire(key, seconds) {
    const client = await this._getActive();
    return client.expire(key, seconds);
  }

  async ttl(key) {
    const client = await this._getActive();
    return client.ttl(key);
  }

  async get(key) {
    const client = await this._getActive();
    return client.get(key);
  }

  async set(key, value, ...args) {
    const client = await this._getActive();
    return client.set(key, value, ...args);
  }

  async del(...keys) {
    const client = await this._getActive();
    return client.del(...keys);
  }

  async flushall() {
    const client = await this._getActive();
    return client.flushall();
  }

  async ping() {
    const client = await this._getActive();
    return client.ping();
  }

  async keys(pattern = '*') {
    const client = await this._getActive();
    if (client === this.inMemory) {
      return client.keys(pattern);
    }

    // Use SCAN instead of KEYS so a large keyspace never blocks the live Redis server
    const found = new Set();
    let cursor = '0';
    do {
      const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      batch.forEach((key) => found.add(key));
    } while (cursor !== '0');
    return [...found];
  }
}

const singletonClient = new ResilientRedisClient();

function getRedisClient() {
  return singletonClient;
}

module.exports = {
  getRedisClient,
  InMemoryRedis,
};
