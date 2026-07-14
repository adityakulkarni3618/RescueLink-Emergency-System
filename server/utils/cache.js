const { redis } = require('./redis');

// In-memory cache fallback map
const localMemoryCache = new Map();

/**
 * Gets a cached item by key.
 */
async function get(key) {
  if (redis && redis.status === 'ready') {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn('[CACHE ERROR] GET failed, fallback to memory:', err.message);
    }
  }
  
  const entry = localMemoryCache.get(key);
  if (entry) {
    if (entry.expiresAt > Date.now()) {
      return entry.value;
    }
    localMemoryCache.delete(key); // Evict expired
  }
  return null;
}

/**
 * Sets a cached item by key.
 */
async function set(key, value, ttlSeconds = 300) {
  const serialized = JSON.stringify(value);
  if (redis && redis.status === 'ready') {
    try {
      await redis.set(key, serialized, 'EX', Math.ceil(ttlSeconds));
      return;
    } catch (err) {
      console.warn('[CACHE ERROR] SET failed, fallback to memory:', err.message);
    }
  }
  
  localMemoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });
}

/**
 * Deletes a cached item.
 */
async function del(key) {
  if (redis && redis.status === 'ready') {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      console.warn('[CACHE ERROR] DEL failed, fallback to memory:', err.message);
    }
  }
  localMemoryCache.delete(key);
}

module.exports = {
  get,
  set,
  del
};
