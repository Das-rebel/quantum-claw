/**
 * Rate Limiter
 * Provides configurable rate limiting for API providers
 * Supports token bucket, sliding window, and fixed window algorithms
 */

class RateLimiter {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'token_bucket'; // token_bucket, sliding_window, fixed_window
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute

    this.clients = new Map();
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes

    // For token bucket algorithm
    this.refillRate = options.refillRate || (this.maxRequests / (this.windowMs / 1000)); // tokens per second

    // Statistics
    this.stats = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      rateLimitErrors: 0
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
     * Start cleanup interval
     */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
     * Stop cleanup interval
     */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  /**
     * Check if request is allowed for client
     * @param {string} clientId - Client identifier (IP, API key, etc.)
     * @param {object} options - Additional options
     * @returns {object} - Result with allowed boolean and metadata
     */
  check(clientId, options = {}) {
    this.stats.totalRequests++;

    const result = {
      allowed: false,
      clientId,
      remaining: 0,
      resetAt: null,
      retryAfter: null
    };

    // Get or create client state
    let client = this.clients.get(clientId);
    if (!client) {
      client = this.createClientState();
      this.clients.set(clientId, client);
    }

    // Check based on algorithm
    switch (this.algorithm) {
    case 'token_bucket':
      Object.assign(result, this.checkTokenBucket(client));
      break;
    case 'sliding_window':
      Object.assign(result, this.checkSlidingWindow(client));
      break;
    case 'fixed_window':
    default:
      Object.assign(result, this.checkFixedWindow(client));
      break;
    }

    // Update statistics
    if (result.allowed) {
      this.stats.allowedRequests++;
    } else {
      this.stats.blockedRequests++;
      result.retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    }

    return result;
  }

  /**
     * Create new client state
     * @returns {object} - Client state
     */
  createClientState() {
    const now = Date.now();

    switch (this.algorithm) {
    case 'token_bucket':
      return {
        tokens: this.maxRequests,
        lastRefill: now
      };
    case 'sliding_window':
      return {
        requests: [],
        windowStart: now
      };
    case 'fixed_window':
    default:
      return {
        count: 0,
        windowStart: now
      };
    }
  }

  /**
     * Check token bucket rate limit
     * @param {object} client - Client state
     * @returns {object} - Result
     */
  checkTokenBucket(client) {
    const now = Date.now();
    const timeSinceRefill = (now - client.lastRefill) / 1000; // seconds

    // Refill tokens
    client.tokens = Math.min(this.maxRequests, client.tokens + timeSinceRefill * this.refillRate);
    client.lastRefill = now;

    const result = {
      allowed: false,
      remaining: Math.floor(client.tokens),
      resetAt: now + ((this.maxRequests - client.tokens) / this.refillRate * 1000)
    };

    if (client.tokens >= 1) {
      client.tokens -= 1;
      result.allowed = true;
    }

    return result;
  }

  /**
     * Check sliding window rate limit
     * @param {object} client - Client state
     * @returns {object} - Result
     */
  checkSlidingWindow(client) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old requests outside the window
    client.requests = client.requests.filter(timestamp => timestamp > windowStart);

    const result = {
      allowed: client.requests.length < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - client.requests.length),
      resetAt: client.requests.length > 0 ? client.requests[0] + this.windowMs : now + this.windowMs
    };

    if (result.allowed) {
      client.requests.push(now);
    }

    return result;
  }

  /**
     * Check fixed window rate limit
     * @param {object} client - Client state
     * @returns {object} - Result
     */
  checkFixedWindow(client) {
    const now = Date.now();

    // Check if window expired
    if (now - client.windowStart >= this.windowMs) {
      client.count = 0;
      client.windowStart = now;
    }

    const result = {
      allowed: client.count < this.maxRequests,
      remaining: Math.max(0, this.maxRequests - client.count),
      resetAt: client.windowStart + this.windowMs
    };

    if (result.allowed) {
      client.count++;
    }

    return result;
  }

  /**
     * Clean up old client states
     */
  cleanup() {
    const now = Date.now();
    const maxAge = this.windowMs * 2; // Keep data for 2 windows

    for (const [clientId, client] of this.clients.entries()) {
      let shouldDelete = false;

      switch (this.algorithm) {
      case 'token_bucket':
        shouldDelete = (now - client.lastRefill) > maxAge;
        break;
      case 'sliding_window':
        if (client.requests.length > 0) {
          const oldestRequest = Math.min(...client.requests);
          shouldDelete = (now - oldestRequest) > maxAge;
        } else {
          shouldDelete = (now - client.windowStart) > maxAge;
        }
        break;
      case 'fixed_window':
      default:
        shouldDelete = (now - client.windowStart) > maxAge;
        break;
      }

      if (shouldDelete) {
        this.clients.delete(clientId);
      }
    }
  }

  /**
     * Get rate limit status for client
     * @param {string} clientId - Client identifier
     * @returns {object|null} - Rate limit status
     */
  getStatus(clientId) {
    const client = this.clients.get(clientId);
    if (!client) {
      return null;
    }

    const now = Date.now();

    switch (this.algorithm) {
    case 'token_bucket':
      const timeSinceRefill = (now - client.lastRefill) / 1000;
      const tokens = Math.min(this.maxRequests, client.tokens + timeSinceRefill * this.refillRate);
      return {
        algorithm: this.algorithm,
        tokens: Math.floor(tokens),
        maxTokens: this.maxRequests,
        remaining: Math.floor(tokens),
        resetAt: now + ((this.maxRequests - tokens) / this.refillRate * 1000)
      };
    case 'sliding_window':
      const windowStart = now - this.windowMs;
      const recentRequests = client.requests.filter(timestamp => timestamp > windowStart);
      return {
        algorithm: this.algorithm,
        requests: recentRequests.length,
        maxRequests: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - recentRequests.length),
        resetAt: recentRequests.length > 0 ? recentRequests[0] + this.windowMs : now + this.windowMs
      };
    case 'fixed_window':
    default:
      if (now - client.windowStart >= this.windowMs) {
        return {
          algorithm: this.algorithm,
          count: 0,
          maxRequests: this.maxRequests,
          remaining: this.maxRequests,
          resetAt: now + this.windowMs
        };
      }
      return {
        algorithm: this.algorithm,
        count: client.count,
        maxRequests: this.maxRequests,
        remaining: Math.max(0, this.maxRequests - client.count),
        resetAt: client.windowStart + this.windowMs
      };
    }
  }

  /**
     * Reset rate limit for client
     * @param {string} clientId - Client identifier
     */
  reset(clientId) {
    this.clients.delete(clientId);
  }

  /**
     * Reset all rate limits
     */
  resetAll() {
    this.clients.clear();
  }

  /**
     * Get statistics
     * @returns {object} - Statistics
     */
  getStats() {
    const activeClients = this.clients.size;

    return {
      ...this.stats,
      activeClients,
      algorithm: this.algorithm,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      allowedRate: this.stats.totalRequests > 0
        ? (this.stats.allowedRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      blockedRate: this.stats.totalRequests > 0
        ? (this.stats.blockedRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
     * Update configuration
     * @param {object} options - New configuration options
     */
  updateConfig(options = {}) {
    if (options.algorithm) {
      this.algorithm = options.algorithm;
      // Reset clients when algorithm changes
      this.clients.clear();
    }
    if (options.maxRequests) {
      this.maxRequests = options.maxRequests;
    }
    if (options.windowMs) {
      this.windowMs = options.windowMs;
    }
    if (options.refillRate) {
      this.refillRate = options.refillRate;
    }
  }

  /**
     * Stop cleanup
     */
  destroy() {
    this.stopCleanup();
    this.clients.clear();
  }
}

/**
 * Provider-specific rate limiter factory
 */
class ProviderRateLimiter {
  constructor() {
    this.limiters = new Map();
  }

  /**
     * Get or create rate limiter for provider
     * @param {string} provider - Provider name
     * @param {object} config - Rate limit configuration
     * @returns {RateLimiter} - Rate limiter instance
     */
  getLimiter(provider, config) {
    if (!this.limiters.has(provider)) {
      this.limiters.set(provider, new RateLimiter(config));
    }
    return this.limiters.get(provider);
  }

  /**
     * Check rate limit for provider
     * @param {string} provider - Provider name
     * @param {string} clientId - Client identifier
     * @param {object} config - Rate limit configuration
     * @returns {object} - Result
     */
  check(provider, clientId, config) {
    const limiter = this.getLimiter(provider, config);
    return limiter.check(clientId);
  }

  /**
     * Get all rate limiter statistics
     * @returns {object} - Statistics for all providers
     */
  getAllStats() {
    const stats = {};
    for (const [provider, limiter] of this.limiters.entries()) {
      stats[provider] = limiter.getStats();
    }
    return stats;
  }

  /**
     * Reset all limiters
     */
  resetAll() {
    for (const limiter of this.limiters.values()) {
      limiter.resetAll();
    }
  }

  /**
     * Destroy all limiters
     */
  destroy() {
    for (const limiter of this.limiters.values()) {
      limiter.destroy();
    }
    this.limiters.clear();
  }
}

// Singleton instance
let providerInstance = null;

/**
 * Get or create provider rate limiter singleton
 * @returns {ProviderRateLimiter} - Provider rate limiter instance
 */
function getProviderRateLimiter() {
  if (!providerInstance) {
    providerInstance = new ProviderRateLimiter();
  }
  return providerInstance;
}

module.exports = { RateLimiter, ProviderRateLimiter, getProviderRateLimiter };
