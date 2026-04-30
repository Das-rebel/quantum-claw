/**
 * LRU (Least Recently Used) Cache with TTL and Analytics
 * Prevents memory exhaustion by evicting least recently used entries
 */

class LRUCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 300000; // 5 minutes default
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;

    console.log(`[LRU Cache] Initialized with maxSize=${this.maxSize}, ttl=${this.ttl}ms`);
  }

  /**
     * Get value from cache
     */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update LRU: move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.data;
  }

  /**
     * Set value in cache
     */
  set(key, value) {
    // Delete oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        console.log(`[LRU Cache] Evicted oldest entry: ${oldestKey.substring(0, 50)}...`);
      }
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now()
    });
  }

  /**
     * Check if key exists in cache
     */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
     * Delete specific key from cache
     */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
     * Clear all entries from cache
     */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log(`[LRU Cache] Cleared ${size} entries`);
  }

  /**
     * Clean up expired entries
     */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[LRU Cache] Cleaned up ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
     * Get cache statistics
     */
  getStats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total * 100) : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate.toFixed(2) + '%',
      size: this.cache.size,
      maxSize: this.maxSize,
      usageRate: ((this.cache.size / this.maxSize) * 100).toFixed(2) + '%'
    };
  }

  /**
     * Get all keys in cache
     */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
     * Get cache size
     */
  get size() {
    return this.cache.size;
  }
}

module.exports = LRUCache;
