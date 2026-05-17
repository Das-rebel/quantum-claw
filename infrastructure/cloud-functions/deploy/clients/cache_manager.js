/**
 * Cache Manager
 * Provides synchronous caching functionality for API responses
 */
class CacheManager {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttl = this.ttl) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return { size: this.cache.size };
  }
}

/**
 * Get a cache manager instance
 */
function getCacheManager(options = {}) {
  return new CacheManager(options);
}

module.exports = { CacheManager, getCacheManager };
