/**
 * Cache Manager - LRU Cache with TTL
 *
 * Provides intelligent response caching with:
 * - LRU (Least Recently Used) eviction
 * - TTL (Time To Live) support
 * - Query normalization for cache keys
 * - Cache statistics tracking
 */

const crypto = require('crypto');

class CacheManager {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.ttl || 5 * 60 * 1000; // 5 minutes
    this.cache = new Map();
    this.accessOrder = new Map(); // Track access order for LRU
    this.evicting = false;
    this.accessCounter = 0;

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      expirations: 0
    };

    // Start cleanup interval for expired entries
    if (CacheManager.cleanupInterval) {
      clearInterval(CacheManager.cleanupInterval);
    }
    CacheManager.cleanupInterval = setInterval(() => this.cleanupExpired(), 60 * 1000);
    this.cleanupInterval = CacheManager.cleanupInterval;
  }

  /**
     * Normalize query for consistent cache keys
     * @param {string} query - Raw query text
     * @returns {string} - Normalized query
     */
  normalizeQuery(query) {
    if (typeof query !== 'string') return '';

    return query
      .toLowerCase()
      .trim()
    // Remove extra whitespace
      .replace(/\s+/g, ' ')
    // Remove common punctuation (but keep meaningful chars)
      .replace(/[!?.,;:]+$/, '')
    // Normalize quotes
      .replace(/["'"]/g, '"')
      .replace(/['']/g, "'");
  }

  /**
     * Generate cache key from query
     * @param {string} query - Raw query text
     * @returns {string} - Cache key (hash)
     */
  generateKey(query) {
    const normalized = this.normalizeQuery(query);
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
     * Check if a cache entry is expired
     * @param {object} entry - Cache entry
     * @returns {boolean} - True if expired
     */
  isExpired(entry) {
    if (!entry || typeof entry.expiresAt !== 'number') return true;
    return Date.now() > entry.expiresAt;
  }

  /**
     * Get cached response
     * @param {string} query - Query text
     * @returns {string|null} - Cached response or null
     */
  get(query) {
    const key = this.generateKey(query);
    const entry = this.cache.get(key);

    // Check if entry exists and is not expired
    if (!entry || this.isExpired(entry)) {
      if (entry && this.isExpired(entry)) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        this.stats.expirations++;
      }
      this.stats.misses++;
      return null;
    }

    // Update access order for LRU
    this.accessCounter += 1;
    this.accessOrder.set(key, this.accessCounter);

    // Update hit count and last accessed
    entry.hitCount++;
    entry.lastAccessed = Date.now();

    this.stats.hits++;
    return entry.response;
  }

  /**
     * Set cached response
     * @param {string} query - Query text
     * @param {string} response - Response to cache
     * @param {number} ttl - Optional TTL override
     * @returns {boolean} - True if cached successfully
     */
  set(query, response, ttl = null) {
    const key = this.generateKey(query);
    const now = Date.now();
    const entryTTL = ttl || this.defaultTTL;

    // Check if we need to evict (including new entry)
    while (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry = {
      response,
      query: this.normalizeQuery(query),
      createdAt: now,
      expiresAt: now + entryTTL,
      lastAccessed: now,
      hitCount: 0,
      ttl: entryTTL
    };

    this.cache.set(key, entry);
    this.accessCounter += 1;
    this.accessOrder.set(key, this.accessCounter);
    this.stats.sets++;

    return true;
  }

  /**
     * Check if query is cached
     * @param {string} query - Query text
     * @returns {boolean} - True if cached and not expired
     */
  has(query) {
    const key = this.generateKey(query);
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.stats.expirations++;
      return false;
    }
    return true;
  }

  /**
     * Delete specific cache entry
     * @param {string} query - Query text
     * @returns {boolean} - True if deleted
     */
  delete(query) {
    const key = this.generateKey(query);
    const deleted = this.cache.delete(key);
    this.accessOrder.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
     * Clear all cache entries
     */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
     * Evict least recently used entry
     */
  evictLRU() {
    if (this.evicting) {
      return;
    }
    this.evicting = true;
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessOrder.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
    }
    this.evicting = false;
  }

  /**
     * Cleanup expired entries
     */
  cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.stats.expirations += cleaned;
    }

    return cleaned;
  }

  /**
     * Get cache statistics
     * @returns {object} - Statistics object
     */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: parseFloat(hitRate),
      utilization: parseFloat(((this.cache.size / this.maxSize) * 100).toFixed(2))
    };
  }

  /**
     * Get detailed cache info (for debugging)
     * @returns {object} - Detailed cache info
     */
  getCacheInfo() {
    const entries = [];
    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        key: key.substring(0, 8) + '...',
        query: entry.query.substring(0, 50),
        hitCount: entry.hitCount,
        age: Math.round((Date.now() - entry.createdAt) / 1000) + 's',
        ttl: Math.round((entry.expiresAt - Date.now()) / 1000) + 's'
      });
    }

    return {
      stats: this.getStats(),
      entries: entries.slice(0, 10) // Return first 10 for inspection
    };
  }

  /**
     * Stop cleanup interval
     */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (CacheManager.cleanupInterval === this.cleanupInterval) {
      CacheManager.cleanupInterval = null;
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create cache manager singleton
 * @param {object} options - Configuration options
 * @returns {CacheManager} - Cache manager instance
 */
function getCacheManager(options) {
  if (!instance) {
    instance = new CacheManager(options);
  }
  return instance;
}

module.exports = { CacheManager, getCacheManager };
