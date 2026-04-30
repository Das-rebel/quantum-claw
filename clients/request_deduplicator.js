/**
 * Request Deduplicator
 * Prevents duplicate API calls for concurrent identical requests
 * Uses Map to track in-flight requests and their promises
 */

class RequestDeduplicator {
  constructor(options = {}) {
    this.cacheSize = options.cacheSize || 1000;
    this.cacheTTL = options.cacheTTL || 5000; // 5 seconds default

    this.pendingRequests = new Map();
    this.completedCache = new Map();

    // Statistics
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
     * Generate deduplication key
     * @param {string} key - Request key
     * @param {object} options - Request options
     * @returns {string} - Deduplication key
     */
  generateKey(key, options = {}) {
    const optionsStr = JSON.stringify(options);
    return `${key}:${optionsStr}`;
  }

  /**
     * Execute or deduplicate request
     * @param {string} key - Request key
     * @param {Function} requestFn - Function to execute request
     * @param {object} options - Request options
     * @returns {Promise} - Request result
     */
  async execute(key, requestFn, options = {}) {
    this.stats.totalRequests++;

    const dedupKey = this.generateKey(key, options);

    // Check if there's a pending request
    if (this.pendingRequests.has(dedupKey)) {
      this.stats.deduplicatedRequests++;
      console.log(`🔄 Deduplicating request: ${key.substring(0, 50)}...`);
      return this.pendingRequests.get(dedupKey);
    }

    // Check completed cache
    const cached = this.getFromCache(dedupKey);
    if (cached) {
      this.stats.cacheHits++;
      console.log(`💾 Cache hit for: ${key.substring(0, 50)}...`);
      return cached;
    }

    this.stats.cacheMisses++;

    // Create new request promise
    const requestPromise = requestFn()
      .then(result => {
        // Cache successful result
        this.addToCache(dedupKey, result);

        // Remove from pending
        this.pendingRequests.delete(dedupKey);

        return result;
      })
      .catch(error => {
        // Remove from pending even on error
        this.pendingRequests.delete(dedupKey);

        throw error;
      });

    // Store pending request
    this.pendingRequests.set(dedupKey, requestPromise);

    return requestPromise;
  }

  /**
     * Execute with priority (skip cache, force new request)
     * @param {string} key - Request key
     * @param {Function} requestFn - Function to execute request
     * @param {object} options - Request options
     * @returns {Promise} - Request result
     */
  async executePriority(key, requestFn, options = {}) {
    const dedupKey = this.generateKey(key, options);

    // Remove from cache if exists
    this.completedCache.delete(dedupKey);

    // Execute normally
    return this.execute(key, requestFn, options);
  }

  /**
     * Execute multiple requests concurrently with deduplication
     * @param {Array} requests - Array of request objects {key, fn, options}
     * @returns {Promise<Array>} - Array of results
     */
  async executeAll(requests) {
    const promises = requests.map(({ key, fn, options }) =>
      this.execute(key, fn, options)
    );

    return Promise.all(promises);
  }

  /**
     * Execute multiple requests with race (first to finish wins)
     * @param {Array} requests - Array of request objects {key, fn, options}
     * @returns {Promise} - First result
     */
  async executeRace(requests) {
    const promises = requests.map(({ key, fn, options }) =>
      this.execute(key, fn, options)
    );

    return Promise.race(promises);
  }

  /**
     * Get from completed cache
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null
     */
  getFromCache(key) {
    const entry = this.completedCache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.completedCache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
     * Add to completed cache
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     */
  addToCache(key, value) {
    // Check cache size
    while (this.completedCache.size >= this.cacheSize) {
      const firstKey = this.completedCache.keys().next().value;
      this.completedCache.delete(firstKey);
    }

    this.completedCache.set(key, {
      value,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.cacheTTL
    });
  }

  /**
     * Clear cache for specific key
     * @param {string} key - Request key
     * @param {object} options - Request options
     */
  clear(key, options = {}) {
    const dedupKey = this.generateKey(key, options);
    this.completedCache.delete(dedupKey);
  }

  /**
     * Clear all cache
     */
  clearAll() {
    this.completedCache.clear();
  }

  /**
     * Start cleanup interval
     */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  /**
     * Stop cleanup interval
     */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
     * Clean up expired cache entries
     */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.completedCache.entries()) {
      if (now > entry.expiresAt) {
        this.completedCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
     * Get statistics
     * @returns {object} - Statistics
     */
  getStats() {
    const deduplicationRate = this.stats.totalRequests > 0
      ? (this.stats.deduplicatedRequests / this.stats.totalRequests * 100)
      : 0;

    const cacheHitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) * 100)
      : 0;

    return {
      ...this.stats,
      pendingRequests: this.pendingRequests.size,
      cachedRequests: this.completedCache.size,
      deduplicationRate: deduplicationRate.toFixed(2) + '%',
      cacheHitRate: cacheHitRate.toFixed(2) + '%'
    };
  }

  /**
     * Get cache info for debugging
     * @returns {object} - Cache info
     */
  getCacheInfo() {
    const entries = [];
    const now = Date.now();

    for (const [key, entry] of this.completedCache.entries()) {
      entries.push({
        key: key.substring(0, 50) + '...',
        age: Math.round((now - entry.cachedAt) / 1000) + 's',
        ttl: Math.round((entry.expiresAt - now) / 1000) + 's'
      });
    }

    return {
      stats: this.getStats(),
      entries: entries.slice(0, 20) // Return first 20 for inspection
    };
  }

  /**
     * Reset statistics
     */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
     * Destroy deduplicator
     */
  destroy() {
    this.stopCleanup();
    this.pendingRequests.clear();
    this.completedCache.clear();
  }
}

/**
 * Provider-specific request deduplicator
 */
class ProviderRequestDeduplicator {
  constructor() {
    this.deduplicators = new Map();
  }

  /**
     * Get or create deduplicator for provider
     * @param {string} provider - Provider name
     * @param {object} config - Deduplicator configuration
     * @returns {RequestDeduplicator} - Deduplicator instance
     */
  getDeduplicator(provider, config = {}) {
    if (!this.deduplicators.has(provider)) {
      this.deduplicators.set(provider, new RequestDeduplicator(config));
    }
    return this.deduplicators.get(provider);
  }

  /**
     * Execute or deduplicate request for provider
     * @param {string} provider - Provider name
     * @param {string} key - Request key
     * @param {Function} requestFn - Request function
     * @param {object} options - Request options
     * @returns {Promise} - Request result
     */
  async execute(provider, key, requestFn, options = {}) {
    const deduplicator = this.getDeduplicator(provider, options);
    return deduplicator.execute(key, requestFn, options);
  }

  /**
     * Clear all caches
     */
  clearAll() {
    for (const deduplicator of this.deduplicators.values()) {
      deduplicator.clearAll();
    }
  }

  /**
     * Get all statistics
     * @returns {object} - Statistics for all providers
     */
  getAllStats() {
    const stats = {};
    for (const [provider, deduplicator] of this.deduplicators.entries()) {
      stats[provider] = deduplicator.getStats();
    }
    return stats;
  }

  /**
     * Destroy all deduplicators
     */
  destroy() {
    for (const deduplicator of this.deduplicators.values()) {
      deduplicator.destroy();
    }
    this.deduplicators.clear();
  }
}

// Singleton instance
let instance = null;
let providerInstance = null;

/**
 * Get or create request deduplicator singleton
 * @param {object} options - Configuration options
 * @returns {RequestDeduplicator} - Request deduplicator instance
 */
function getRequestDeduplicator(options) {
  if (!instance) {
    instance = new RequestDeduplicator(options);
  }
  return instance;
}

/**
 * Get or create provider request deduplicator singleton
 * @returns {ProviderRequestDeduplicator} - Provider request deduplicator instance
 */
function getProviderRequestDeduplicator() {
  if (!providerInstance) {
    providerInstance = new ProviderRequestDeduplicator();
  }
  return providerInstance;
}

module.exports = {
  RequestDeduplicator,
  ProviderRequestDeduplicator,
  getRequestDeduplicator,
  getProviderRequestDeduplicator
};
