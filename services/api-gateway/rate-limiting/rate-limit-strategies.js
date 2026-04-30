/**
 * Multiple Rate Limiting Strategies for OmniClaw Enhanced API Gateway
 *
 * Implements various rate limiting algorithms:
 * - Token Bucket
 * - Sliding Window Log
 * - Fixed Window Counter
 * - Leaky Bucket
 * - Fixed Window Counter with Redis
 *
 * @version 1.0.0
 */

class RateLimitStrategy {
  constructor(config) {
    this.config = config;
  }

  async checkLimit(key, limit, window) {
    throw new Error('checkLimit must be implemented by subclass');
  }

  async resetLimit(key) {
    throw new Error('resetLimit must be implemented by subclass');
  }
}

/**
 * Token Bucket Algorithm
 * Allows bursts up to bucket capacity, refills at constant rate
 */
class TokenBucketStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.capacity = config.capacity || 100;
    this.refillRate = config.refillRate || 1; // tokens per second
    this.storage = new Map(); // In-memory storage
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const bucket = this.storage.get(key) || {
      tokens: this.capacity,
      lastRefill: now
    };

    // Calculate tokens to add based on time passed
    const timePassed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = Math.min(timePassed * this.refillRate, this.capacity);
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, this.capacity);
    bucket.lastRefill = now;

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.storage.set(key, bucket);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: new Date(now + Math.ceil((1 - bucket.tokens) / this.refillRate * 1000))
      };
    } else {
      const retryAfter = Math.ceil((1 - bucket.tokens) / this.refillRate);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(now + retryAfter * 1000)
      };
    }
  }

  async resetLimit(key) {
    this.storage.delete(key);
  }
}

/**
 * Sliding Window Log Algorithm
 * Maintains log of request timestamps, counts within sliding window
 */
class SlidingWindowLogStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.window = config.window || 60000; // 1 minute
    this.limit = config.limit || 100;
    this.storage = new Map();
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const windowStart = now - this.window;

    // Get existing timestamps
    let timestamps = this.storage.get(key) || [];

    // Remove timestamps outside window
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= this.limit) {
      const oldestTimestamp = timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + this.window - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(oldestTimestamp + this.window)
      };
    }

    // Add current request
    timestamps.push(now);
    this.storage.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.limit - timestamps.length,
      resetAt: new Date(now + this.window)
    };
  }

  async resetLimit(key) {
    this.storage.delete(key);
  }
}

/**
 * Fixed Window Counter Algorithm
 * Resets counter at fixed intervals (e.g., every minute)
 */
class FixedWindowCounterStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.window = config.window || 60000; // 1 minute
    this.limit = config.limit || 100;
    this.storage = new Map();
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.window) * this.window;
    const currentWindowKey = `${key}:${windowStart}`;

    // Get current count
    let count = this.storage.get(currentWindowKey) || 0;

    // Check if limit exceeded
    if (count >= this.limit) {
      const retryAfter = Math.ceil((windowStart + this.window - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(windowStart + this.window)
      };
    }

    // Increment counter
    count += 1;
    this.storage.set(currentWindowKey, count);

    // Cleanup old window counters
    this._cleanup(now);

    return {
      allowed: true,
      remaining: this.limit - count,
      resetAt: new Date(windowStart + this.window)
    };
  }

  async resetLimit(key) {
    // Remove all windows for this key
    for (const [windowKey] of this.storage.entries()) {
      if (windowKey.startsWith(key)) {
        this.storage.delete(windowKey);
      }
    }
  }

  _cleanup(now) {
    // Remove counters for expired windows
    const expiredWindowStart = Math.floor((now - this.window) / this.window) * this.window;
    for (const [windowKey] of this.storage.entries()) {
      const windowTime = parseInt(windowKey.split(':').pop());
      if (windowTime < expiredWindowStart) {
        this.storage.delete(windowKey);
      }
    }
  }
}

/**
 * Leaky Bucket Algorithm
 * Processes requests at constant rate, queues excess requests
 */
class LeakyBucketStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.capacity = config.capacity || 100;
    this.leakRate = config.leakRate || 1; // requests per second
    this.storage = new Map();
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const bucket = this.storage.get(key) || {
      queue: [],
      lastLeak: now
    };

    // Leak bucket (process requests)
    const timePassed = (now - bucket.lastLeak) / 1000;
    const toLeak = Math.floor(timePassed * this.leakRate);
    bucket.queue = bucket.queue.slice(toLeak);
    bucket.lastLeak = now;

    // Check if bucket is full
    if (bucket.queue.length >= this.capacity) {
      const retryAfter = Math.ceil(bucket.queue.length / this.leakRate);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(now + retryAfter * 1000)
      };
    }

    // Add request to queue
    bucket.queue.push(now);
    this.storage.set(key, bucket);

    return {
      allowed: true,
      remaining: this.capacity - bucket.queue.length,
      resetAt: new Date(now + Math.ceil(bucket.queue.length / this.leakRate * 1000))
    };
  }

  async resetLimit(key) {
    this.storage.delete(key);
  }
}

/**
 * Sliding Window Counter Algorithm
 * Hybrid approach with counters for previous and current windows
 */
class SlidingWindowCounterStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.window = config.window || 60000; // 1 minute
    this.limit = config.limit || 100;
    this.storage = new Map();
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.window) * this.window;
    const previousWindowStart = currentWindowStart - this.window;

    // Get counters
    const currentWindowKey = `${key}:${currentWindowStart}`;
    const previousWindowKey = `${key}:${previousWindowStart}`;

    const currentCount = this.storage.get(currentWindowKey) || 0;
    const previousCount = this.storage.get(previousWindowKey) || 0;

    // Calculate weighted count (sliding window)
    const previousWindowWeight = (this.window - (now - currentWindowStart)) / this.window;
    const weightedCount = Math.floor(previousCount * previousWindowWeight + currentCount);

    // Check if limit exceeded
    if (weightedCount >= this.limit) {
      const retryAfter = Math.ceil((currentWindowStart + this.window - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(currentWindowStart + this.window)
      };
    }

    // Increment current window counter
    this.storage.set(currentWindowKey, currentCount + 1);

    // Cleanup old windows
    this._cleanup(currentWindowStart);

    return {
      allowed: true,
      remaining: this.limit - weightedCount,
      resetAt: new Date(currentWindowStart + this.window)
    };
  }

  async resetLimit(key) {
    for (const [windowKey] of this.storage.entries()) {
      if (windowKey.startsWith(key)) {
        this.storage.delete(windowKey);
      }
    }
  }

  _cleanup(currentWindowStart) {
    const oldestWindowStart = currentWindowStart - this.window * 2;
    for (const [windowKey] of this.storage.entries()) {
      const windowTime = parseInt(windowKey.split(':').pop());
      if (windowTime < oldestWindowStart) {
        this.storage.delete(windowKey);
      }
    }
  }
}

/**
 * Adaptive Rate Limiting
 * Adjusts limits based on system load and response times
 */
class AdaptiveRateLimitStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.baseLimit = config.baseLimit || 100;
    this.minLimit = config.minLimit || 10;
    this.maxLimit = config.maxLimit || 1000;
    this.window = config.window || 60000;
    this.storage = new Map();
    this.systemLoad = config.systemLoad || 0.5; // 0-1 scale
  }

  async checkLimit(key, limit, window) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.window) * this.window;
    const currentWindowKey = `${key}:${windowStart}`;

    // Calculate adaptive limit based on system load
    const adaptiveLimit = Math.floor(
      this.baseLimit * (1 - this.systemLoad * 0.5)
    );
    const finalLimit = Math.max(
      this.minLimit,
      Math.min(this.maxLimit, adaptiveLimit)
    );

    // Get current count
    let count = this.storage.get(currentWindowKey) || 0;

    // Check if limit exceeded
    if (count >= finalLimit) {
      const retryAfter = Math.ceil((windowStart + this.window - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        resetAt: new Date(windowStart + this.window),
        adaptiveLimit: finalLimit
      };
    }

    // Increment counter
    count += 1;
    this.storage.set(currentWindowKey, count);

    return {
      allowed: true,
      remaining: finalLimit - count,
      resetAt: new Date(windowStart + this.window),
      adaptiveLimit: finalLimit
    };
  }

  async resetLimit(key) {
    for (const [windowKey] of this.storage.entries()) {
      if (windowKey.startsWith(key)) {
        this.storage.delete(windowKey);
      }
    }
  }

  setSystemLoad(load) {
    this.systemLoad = Math.max(0, Math.min(1, load));
  }
}

/**
 * Hierarchical Rate Limiting
 * Applies multiple rate limits in hierarchy (global, per-user, per-endpoint)
 */
class HierarchicalRateLimitStrategy extends RateLimitStrategy {
  constructor(config = {}) {
    super(config);
    this.strategies = {
      global: new TokenBucketStrategy(config.global || {}),
      perUser: new SlidingWindowLogStrategy(config.perUser || {}),
      perEndpoint: new FixedWindowCounterStrategy(config.perEndpoint || {})
    };
  }

  async checkLimit(key, limit, window, context = {}) {
    const { userId, endpoint } = context;

    // Check global limit
    const globalCheck = await this.strategies.global.checkLimit('global', limit, window);
    if (!globalCheck.allowed) {
      return {
        ...globalCheck,
        reason: 'global'
      };
    }

    // Check per-user limit
    if (userId) {
      const userCheck = await this.strategies.perUser.checkLimit(`user:${userId}`, limit, window);
      if (!userCheck.allowed) {
        return {
          ...userCheck,
          reason: 'user'
        };
      }
    }

    // Check per-endpoint limit
    if (endpoint) {
      const endpointCheck = await this.strategies.perEndpoint.checkLimit(
        `endpoint:${endpoint}`,
        limit,
        window
      );
      if (!endpointCheck.allowed) {
        return {
          ...endpointCheck,
          reason: 'endpoint'
        };
      }
    }

    return {
      allowed: true,
      remaining: Math.min(globalCheck.remaining, limit),
      resetAt: globalCheck.resetAt
    };
  }

  async resetLimit(key) {
    await Promise.all([
      this.strategies.global.resetLimit(key),
      this.strategies.perUser.resetLimit(key),
      this.strategies.perEndpoint.resetLimit(key)
    ]);
  }
}

// Export all strategies
module.exports = {
  RateLimitStrategy,
  TokenBucketStrategy,
  SlidingWindowLogStrategy,
  FixedWindowCounterStrategy,
  LeakyBucketStrategy,
  SlidingWindowCounterStrategy,
  AdaptiveRateLimitStrategy,
  HierarchicalRateLimitStrategy
};
