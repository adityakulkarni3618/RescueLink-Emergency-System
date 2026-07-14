const Redis = require('ioredis');

let redis = null;
try {
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

module.exports = {
  redis,
  blacklistToken,
  isTokenBlacklisted
};
