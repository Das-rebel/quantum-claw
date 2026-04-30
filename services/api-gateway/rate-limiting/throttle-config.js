/**
 * Throttle Configuration for OmniClaw Enhanced API Gateway
 *
 * Defines throttling rules and configuration for:
 * - Per-endpoint throttling
 * - Per-user throttling
 * - Burst handling
 * - Concurrent request limits
 *
 * @version 1.0.0
 */

module.exports = {
  // Global throttle configuration
  global: {
    enabled: true,
    defaultLimit: 100, // requests per minute
    defaultBurst: 10,
    defaultWindow: 60000, // 1 minute
    storage: 'firestore', // firestore, redis, memory
    strategy: 'token-bucket' // token-bucket, sliding-window, fixed-window, leaky-bucket
  },

  // Tier-based throttling
  tiers: {
    free: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 1000,
      burstLimit: 10,
      concurrentRequests: 2,
      cooldownPeriod: 1000, // ms between requests
      endpoints: {
        '/story/generate': {
          requestsPerDay: 5,
          requestsPerWeek: 20
        },
        '/story/tts': {
          requestsPerDay: 50,
          requestsPerHour: 10
        },
        '/price/check': {
          requestsPerDay: 100,
          requestsPerHour: 20
        },
        '/media/*': {
          requestsPerMinute: 20,
          requestsPerHour: 200
        }
      }
    },
    basic: {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      burstLimit: 50,
      concurrentRequests: 5,
      cooldownPeriod: 100,
      endpoints: {
        '/story/generate': {
          requestsPerDay: 50,
          requestsPerWeek: 200
        },
        '/story/tts': {
          requestsPerDay: 500,
          requestsPerHour: 100
        },
        '/price/check': {
          requestsPerDay: 1000,
          requestsPerHour: 200
        },
        '/media/*': {
          requestsPerMinute: 100,
          requestsPerHour: 1000
        }
      }
    },
    pro: {
      requestsPerMinute: 1000,
      requestsPerHour: 10000,
      requestsPerDay: 100000,
      burstLimit: 200,
      concurrentRequests: 10,
      cooldownPeriod: 10,
      endpoints: {
        '/story/generate': {
          requestsPerDay: 500,
          requestsPerWeek: 2000
        },
        '/story/tts': {
          requestsPerDay: 5000,
          requestsPerHour: 1000
        },
        '/price/check': {
          requestsPerDay: 10000,
          requestsPerHour: 2000
        },
        '/media/*': {
          requestsPerMinute: 500,
          requestsPerHour: 10000
        }
      }
    },
    enterprise: {
      requestsPerMinute: Infinity,
      requestsPerHour: Infinity,
      requestsPerDay: Infinity,
      burstLimit: Infinity,
      concurrentRequests: Infinity,
      cooldownPeriod: 0,
      customLimits: true // Limits set individually
    }
  },

  // Endpoint-specific throttling
  endpoints: {
    // Price tracking endpoints
    '/price/products': {
      POST: {
        limit: 100, // per hour
        window: 3600000,
        burst: 10
      },
      GET: {
        limit: 200,
        window: 3600000,
        burst: 20
      }
    },
    '/price/products/{productId}': {
      GET: {
        limit: 500,
        window: 3600000,
        burst: 50
      },
      DELETE: {
        limit: 50,
        window: 3600000,
        burst: 5
      }
    },
    '/price/products/{productId}/history': {
      GET: {
        limit: 300,
        window: 3600000,
        burst: 30
      }
    },
    '/price/check': {
      POST: {
        limit: 100,
        window: 3600000,
        burst: 10
      }
    },

    // Story endpoints
    '/story/tts': {
      POST: {
        limit: 500,
        window: 3600000,
        burst: 50,
        costPerRequest: 5 // TTS is expensive
      }
    },
    '/story/generate': {
      POST: {
        limit: 50,
        window: 3600000,
        burst: 5,
        costPerRequest: 20 // Story generation is very expensive
      }
    },
    '/story/voices': {
      GET: {
        limit: 1000,
        window: 3600000,
        burst: 100
      }
    },

    // Media endpoints
    '/media/play': {
      POST: {
        limit: 1000,
        window: 3600000,
        burst: 100
      }
    },
    '/media/pause': {
      POST: {
        limit: 1000,
        window: 3600000,
        burst: 100
      }
    },
    '/media/search': {
      POST: {
        limit: 500,
        window: 3600000,
        burst: 50
      }
    },
    '/media/unified-search': {
      POST: {
        limit: 200,
        window: 3600000,
        burst: 20,
        costPerRequest: 2 // Searches multiple platforms
      }
    },

    // Analytics endpoints
    '/analytics/usage': {
      GET: {
        limit: 100,
        window: 3600000,
        burst: 10
      }
    },
    '/analytics/quota': {
      GET: {
        limit: 100,
        window: 3600000,
        burst: 10
      }
    },

    // Email endpoints
    '/email/send': {
      POST: {
        limit: 50,
        window: 3600000,
        burst: 5,
        costPerRequest: 10
      }
    },

    // API key endpoints
    '/keys': {
      POST: {
        limit: 10,
        window: 86400000, // 24 hours
        burst: 2
      },
      GET: {
        limit: 100,
        window: 3600000,
        burst: 10
      }
    },
    '/keys/{apiKey}': {
      GET: {
        limit: 200,
        window: 3600000,
        burst: 20
      },
      DELETE: {
        limit: 10,
        window: 3600000,
        burst: 2
      }
    },

    // Rate limiting endpoints
    '/rate-limit/check': {
      GET: {
        limit: 100,
        window: 3600000,
        burst: 10
      }
    }
  },

  // IP-based throttling (anti-DDoS)
  ipBased: {
    enabled: true,
    defaultLimit: 100,
    window: 60000,
    burst: 20,
    whitelistedIPs: [], // IPs that bypass throttling
    blacklistedIPs: [], // IPs that are blocked
    suspiciousBehavior: {
      enabled: true,
      threshold: 1000, // requests per minute triggers investigation
      action: 'throttle', // throttle, block, notify
      blockDuration: 300000 // 5 minutes
    }
  },

  // Geographic throttling
  geographic: {
    enabled: false,
    rules: {
      // Example: Restrict certain regions
      'US': { limit: 1000, window: 60000 },
      'EU': { limit: 800, window: 60000 },
      'APAC': { limit: 600, window: 60000 }
    }
  },

  // Time-based throttling
  timeBased: {
    enabled: true,
    peakHours: {
      enabled: true,
      hours: [9, 10, 11, 14, 15, 16, 17, 18], // UTC hours
      multiplier: 0.8, // Reduce limits by 20% during peak hours
      timezone: 'UTC'
    },
    offPeakHours: {
      enabled: true,
      hours: [0, 1, 2, 3, 4, 5, 22, 23],
      multiplier: 1.5, // Increase limits by 50% during off-peak
      timezone: 'UTC'
    }
  },

  // Burst handling
  burst: {
    enabled: true,
    defaultBurstLimit: 10,
    burstWindow: 1000, // 1 second
    burstDecay: 0.1, // How fast burst capacity recovers
    maxBurstDuration: 5000 // Max burst duration in ms
  },

  // Concurrent request limits
  concurrentRequests: {
    enabled: true,
    defaultLimit: 5,
    perUserLimits: {
      free: 2,
      basic: 5,
      pro: 10,
      enterprise: Infinity
    },
    timeout: 30000, // 30 seconds
    queueSize: 10, // Max queued requests
    queueTimeout: 5000 // 5 seconds
  },

  // Cooldown periods (prevent rapid successive requests)
  cooldown: {
    enabled: true,
    defaultPeriod: 1000, // 1 second
    perEndpoint: {
      '/story/generate': 5000, // 5 seconds between story generations
      '/story/tts': 2000, // 2 seconds between TTS requests
      '/price/check': 10000 // 10 seconds between price checks
    },
    perTier: {
      free: 1000,
      basic: 500,
      pro: 100,
      enterprise: 0
    }
  },

  // Response headers
  headers: {
    enabled: true,
    rateLimitLimit: 'X-RateLimit-Limit',
    rateLimitRemaining: 'X-RateLimit-Remaining',
    rateLimitReset: 'X-RateLimit-Reset',
    rateLimitRetryAfter: 'Retry-After',
    rateLimitTier: 'X-RateLimit-Tier'
  },

  // Monitoring and alerts
  monitoring: {
    enabled: true,
    logAllRequests: false,
    logThrottledRequests: true,
    alertThreshold: 0.8, // Alert at 80% of limit
    alertChannels: ['console', 'firestore'], // console, firestore, pubsub
    metrics: {
      enabled: true,
      collection: 'throttle-metrics',
      retentionDays: 30
    }
  },

  // Error handling
  errors: {
    retryAfterHeader: true,
    showRetryAfter: true,
    showLimitDetails: true,
    customMessage: null // Override default error message
  },

  // Grace period for new API keys
  gracePeriod: {
    enabled: true,
    duration: 3600000, // 1 hour
    multiplier: 2.0 // Double limits during grace period
  },

  // Cost-based throttling (for expensive operations)
  costBased: {
    enabled: true,
    defaultCost: 1,
    costs: {
      '/story/generate': 20,
      '/story/tts': 5,
      '/price/check': 2,
      '/media/unified-search': 2,
      '/email/send': 10
    }
  }
};
