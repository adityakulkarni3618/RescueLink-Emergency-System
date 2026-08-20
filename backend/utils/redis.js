const Redis = require('ioredis');

let redis = null;
try {
  if (process.env.REDIS_SENTINELS) {
    const sentinels = process.env.REDIS_SENTINELS.split(',').map(s => {
      const [host, port] = s.split(':');
      return { host, port: parseInt(port) || 26379 };
    });
    redis = new Redis({
      sentinels,
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          console.log('[REDIS] Max Sentinel retries reached. Using in-memory fallback.');
          return null;
        }
        return 1000;
      }
    });
  } else {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          console.log('[REDIS] Max retries reached. Using in-memory fallback.');
          return null; // stop retrying
        }
        return 1000;
      }
    });
  }

  redis.on('error', (err) => {
    // Suppress spamming connection errors to console but log a warning
    if (redis.status !== 'ready') {
      console.log(`[REDIS] Connection status: ${redis.status}`);
    }
  });
} catch (err) {
  console.log('[REDIS] Initialization failed. Using in-memory fallback.');
}

const memoryBlacklist = new Set();

/**
 * Blacklists a JWT token.
 * @param {string} token
 * @param {number} ttl - Time-to-live in seconds
 */
async function blacklistToken(token, ttl) {
  console.log(`[AUTH] Blacklisting token with TTL ${ttl}s`);
  if (redis && redis.status === 'ready') {
    try {
      await redis.set(`blacklist:${token}`, '1', 'EX', Math.ceil(ttl));
      return;
    } catch (err) {
      console.log('[REDIS ERROR] blacklistToken failed, falling back to memory:', err.message);
    }
  }
  memoryBlacklist.add(token);
  setTimeout(() => memoryBlacklist.delete(token), ttl * 1000);
}

/**
 * Checks if a JWT token is blacklisted.
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function isTokenBlacklisted(token) {
  if (redis && redis.status === 'ready') {
    try {
      const exists = await redis.get(`blacklist:${token}`);
      return !!exists;
    } catch (err) {
      console.log('[REDIS ERROR] isTokenBlacklisted failed, falling back to memory:', err.message);
    }
  }
  return memoryBlacklist.has(token);
}

/**
 * Acquires a distributed lock.
 * @param {string} resource Name of lock
 * @param {string} value Value for lock (e.g. socket id)
 * @param {number} ttlSeconds Time-to-live in seconds
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireLock(resource, value, ttlSeconds = 15) {
  if (redis && redis.status === 'ready') {
    try {
      const result = await redis.set(`lock:${resource}`, value, 'NX', 'EX', ttlSeconds);
      return result === 'OK';
    } catch (err) {
      console.log('[REDIS ERROR] acquireLock failed:', err.message);
    }
  }
  return false;
}

/**
 * Releases a distributed lock.
 * @param {string} resource Name of lock
 * @param {string} value Value matching lock value
 * @returns {Promise<boolean>} True if lock released
 */
async function releaseLock(resource, value) {
  if (redis && redis.status === 'ready') {
    try {
      const luaScript = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `;
      const result = await redis.eval(luaScript, 1, `lock:${resource}`, value);
      return result === 1;
    } catch (err) {
      console.log('[REDIS ERROR] releaseLock failed:', err.message);
    }
  }
  return false;
}

module.exports = {
  redis,
  blacklistToken,
  isTokenBlacklisted,
  acquireLock,
  releaseLock
};
