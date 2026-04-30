/**
 * Distributed Rate Limiter for OmniClaw Enhanced API Gateway
 *
 * Implements multiple rate limiting strategies:
 * - Token Bucket Algorithm
 * - Sliding Window Log
 * - Fixed Window Counter
 * - Leaky Bucket
 *
 * @version 1.0.0
 */

const { Firestore } = require('@google-cloud/firestore');
const { Redis } = require('@upstash/redis');

class RateLimiter {
  constructor(config = {}) {
    this.config = {
      // Default configuration
      strategy: config.strategy || 'token-bucket', // token-bucket, sliding-window, fixed-window, leaky-bucket
      storage: config.storage || 'firestore', // firestore, redis, memory
      windowSize: config.windowSize || 3600000, // 1 hour in milliseconds
      maxRequests: config.maxRequests || 1000,
      burstLimit: config.burstLimit || 100,
      refillRate: config.refillRate || 16.67, // tokens per second (1000 per hour)
      ...config
    };

    // Initialize storage
    if (this.config.storage === 'firestore') {
      this.db = new Firestore({
        projectId: process.env.PROJECT_ID || 'omniclaw-enhanced'
      });
    } else if (this.config.storage === 'redis') {
      this.redis = new Redis({
        url: process.env.REDIS_URL,
        token: process.env.REDIS_TOKEN
      });
    } else {
      // In-memory storage (not recommended for production)
      this.memoryStore = new Map();
    }

    // Rate limit tiers
    this.tiers = {
      free: {
        hourlyLimit: 100,
        minuteLimit: 10,
        burstLimit: 10,
        refillRate: 0.0278 // 100 per hour
      },
      basic: {
        hourlyLimit: 1000,
        minuteLimit: 100,
        burstLimit: 50,
        refillRate: 0.278 // 1000 per hour
      },
      pro: {
        hourlyLimit: 10000,
        minuteLimit: 1000,
        burstLimit: 200,
        refillRate: 2.78 // 10000 per hour
      },
      enterprise: {
        hourlyLimit: Infinity,
        minuteLimit: Infinity,
        burstLimit: Infinity,
        refillRate: Infinity
      }
    };

    // Endpoint-specific limits
    this.endpointLimits = {
      '/story/generate': {
        basic: { limit: 10, window: 3600000 }, // 10 per hour
        pro: { limit: 100, window: 3600000 }
      },
      '/story/tts': {
        free: { limit: 50, window: 3600000 },
        basic: { limit: 500, window: 3600000 }
      },
      '/price/check': {
        basic: { limit: 100, window: 3600000 },
        pro: { limit: 1000, window: 3600000 }
      }
    };
  }

  /**
   * Check if request is allowed
   * @param {string} apiKey - API key identifier
   * @param {string} endpoint - API endpoint
   * @param {string} tier - User tier
   * @returns {Promise<{allowed: boolean, retryAfter: number, remaining: number}>}
   */
  async checkLimit(apiKey, endpoint, tier = 'free') {
    const now = Date.now();
    const tierConfig = this.tiers[tier] || this.tiers.free;

    try {
      switch (this.config.strategy) {
        case 'token-bucket':
          return await this._tokenBucketCheck(apiKey, endpoint, tierConfig, now);
        case 'sliding-window':
          return await this._slidingWindowCheck(apiKey, endpoint, tierConfig, now);
        case 'fixed-window':
          return await this._fixedWindowCheck(apiKey, endpoint, tierConfig, now);
        case 'leaky-bucket':
          return await this._leakyBucketCheck(apiKey, endpoint, tierConfig, now);
        default:
          return await this._tokenBucketCheck(apiKey, endpoint, tierConfig, now);
      }
    } catch (error) {
      console.error('Rate limiter check error:', error);
      // Fail open - allow request if rate limiter fails
      return { allowed: true, retryAfter: 0, remaining: tierConfig.minuteLimit };
    }
  }

  /**
   * Token Bucket Algorithm
   */
  async _tokenBucketCheck(apiKey, endpoint, tierConfig, now) {
    const key = `rate-limit:${apiKey}:${endpoint}`;
    const bucket = {
      tokens: tierConfig.minuteLimit,
      lastRefill: now,
      ...await this._getStorage(key)
    };

    // Calculate tokens to add
    const timePassed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = Math.min(timePassed * tierConfig.refillRate, tierConfig.minuteLimit);
    bucket.tokens = Math.min(bucket.tokens + tokensToAdd, tierConfig.minuteLimit);
    bucket.lastRefill = now;

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      await this._setStorage(key, bucket, this.config.windowSize);
      return {
        allowed: true,
        retryAfter: 0,
        remaining: Math.floor(bucket.tokens)
      };
    } else {
      // Calculate retry after
      const retryAfter = Math.ceil((1 - bucket.tokens) / tierConfig.refillRate);
      return {
        allowed: false,
        retryAfter,
        remaining: 0
      };
    }
  }

  /**
   * Sliding Window Log Algorithm
   */
  async _slidingWindowCheck(apiKey, endpoint, tierConfig, now) {
    const key = `rate-limit:${apiKey}:${endpoint}`;
    const windowStart = now - this.config.windowSize;

    // Get existing request timestamps
    let timestamps = await this._getStorage(key) || [];

    // Remove old timestamps outside window
    timestamps = timestamps.filter(ts => ts > windowStart);

    // Check if limit exceeded
    if (timestamps.length >= tierConfig.minuteLimit) {
      // Calculate retry after (oldest timestamp + window size)
      const oldestTimestamp = timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + this.config.windowSize - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        remaining: 0
      };
    }

    // Add current request timestamp
    timestamps.push(now);
    await this._setStorage(key, timestamps, this.config.windowSize);

    return {
      allowed: true,
      retryAfter: 0,
      remaining: tierConfig.minuteLimit - timestamps.length
    };
  }

  /**
   * Fixed Window Counter Algorithm
   */
  async _fixedWindowCheck(apiKey, endpoint, tierConfig, now) {
    const windowStart = Math.floor(now / this.config.windowSize) * this.config.windowSize;
    const key = `rate-limit:${apiKey}:${endpoint}:${windowStart}`;

    // Get current counter
    let count = await this._getStorage(key) || 0;

    // Check if limit exceeded
    if (count >= tierConfig.minuteLimit) {
      const retryAfter = Math.ceil((windowStart + this.config.windowSize - now) / 1000);
      return {
        allowed: false,
        retryAfter,
        remaining: 0
      };
    }

    // Increment counter
    count += 1;
    await this._setStorage(key, count, this.config.windowSize);

    return {
      allowed: true,
      retryAfter: 0,
      remaining: tierConfig.minuteLimit - count
    };
  }

  /**
   * Leaky Bucket Algorithm
   */
  async _leakyBucketCheck(apiKey, endpoint, tierConfig, now) {
    const key = `rate-limit:${apiKey}:${endpoint}`;
    const bucket = {
      queue: [],
      lastLeak: now,
      ...await this._getStorage(key)
    };

    // Leak bucket (remove old requests)
    const timePassed = (now - bucket.lastLeak) / 1000;
    const leakRate = tierConfig.refillRate; // requests per second
    const toLeak = Math.floor(timePassed * leakRate);
    bucket.queue = bucket.queue.slice(toLeak);
    bucket.lastLeak = now;

    // Check if bucket is full
    if (bucket.queue.length >= tierConfig.minuteLimit) {
      const retryAfter = Math.ceil(bucket.queue.length / leakRate);
      return {
        allowed: false,
        retryAfter,
        remaining: 0
      };
    }

    // Add request to bucket
    bucket.queue.push(now);
    await this._setStorage(key, bucket, this.config.windowSize);

    return {
      allowed: true,
      retryAfter: 0,
      remaining: tierConfig.minuteLimit - bucket.queue.length
    };
  }

  /**
   * Reset rate limit for API key
   */
  async resetLimit(apiKey, endpoint = '*') {
    const pattern = `rate-limit:${apiKey}:${endpoint}`;

    if (this.config.storage === 'firestore') {
      const snapshot = await this.db
        .collection('rate-limits')
        .where('key', '>=', pattern)
        .where('key', '<=', pattern + '\uf8ff')
        .get();

      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } else if (this.config.storage === 'redis') {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } else {
      // Memory storage
      for (const key of this.memoryStore.keys()) {
        if (key.startsWith(pattern)) {
          this.memoryStore.delete(key);
        }
      }
    }
  }

  /**
   * Get current rate limit status
   */
  async getStatus(apiKey, endpoint, tier = 'free') {
    const tierConfig = this.tiers[tier] || this.tiers.free;
    const key = `rate-limit:${apiKey}:${endpoint}`;
    const data = await this._getStorage(key);

    return {
      tier,
      hourlyLimit: tierConfig.hourlyLimit,
      hourlyUsed: data?.count || 0,
      hourlyRemaining: Math.max(0, tierConfig.hourlyLimit - (data?.count || 0)),
      minuteLimit: tierConfig.minuteLimit,
      minuteUsed: data?.tokens !== undefined ? tierConfig.minuteLimit - data.tokens : 0,
      minuteRemaining: data?.tokens !== undefined ? Math.floor(data.tokens) : tierConfig.minuteLimit,
      resetTime: data?.lastRefill ? new Date(data.lastRefill + this.config.windowSize) : new Date(Date.now() + this.config.windowSize)
    };
  }

  /**
   * Get storage value
   */
  async _getStorage(key) {
    if (this.config.storage === 'firestore') {
      const doc = await this.db.collection('rate-limits').doc(key).get();
      return doc.exists ? doc.data().value : null;
    } else if (this.config.storage === 'redis') {
      return await this.redis.get(key);
    } else {
      return this.memoryStore.get(key);
    }
  }

  /**
   * Set storage value with TTL
   */
  async _setStorage(key, value, ttl) {
    if (this.config.storage === 'firestore') {
      await this.db.collection('rate-limits').doc(key).set({
        value,
        expiresAt: Date.now() + ttl
      });
    } else if (this.config.storage === 'redis') {
      await this.redis.set(key, value, { px: ttl });
    } else {
      this.memoryStore.set(key, value);
      // Auto-cleanup after TTL
      setTimeout(() => this.memoryStore.delete(key), ttl);
    }
  }

  /**
   * Cleanup expired rate limit entries
   */
  async cleanup() {
    if (this.config.storage === 'firestore') {
      const snapshot = await this.db
        .collection('rate-limits')
        .where('expiresAt', '<', Date.now())
        .get();

      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } else if (this.config.storage === 'redis') {
      // Redis handles TTL automatically
    } else {
      // Memory cleanup
      const now = Date.now();
      for (const [key, value] of this.memoryStore.entries()) {
        if (value.expiresAt && value.expiresAt < now) {
          this.memoryStore.delete(key);
        }
      }
    }
  }
}

module.exports = RateLimiter;
