/**
 * Unified Resilience Interface
 * Combines all resilience patterns into a cohesive interface
 *
 * This module provides a unified way to add resilience to any function:
 * - Timeout handling
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Graceful degradation
 * - Health monitoring
 */

const { withTimeout, fetchWithTimeout, createTimeoutWrapper } = require('./timeout-wrapper');
const { retryWithBackoff, createRetryWrapper, isTransientError } = require('./retry');
const { CircuitBreaker, createCircuitBreaker, globalRegistry } = require('./circuit-breaker');
const { withFallbackChain, safeExecute, withFullResilience, createAlexaErrorResponse } = require('./graceful-degradation');

/**
 * Create a fully protected function with all resilience patterns
 *
 * @param {Function} fn - Function to protect
 * @param {Object} options - Resilience configuration
 * @returns {Function} - Protected function
 *
 * @example
 * const protectedFetch = createResilientFunction(fetch, {
 *   name: 'my-api',
 *   timeout: 10000,
 *   maxRetries: 3,
 *   circuitBreaker: { threshold: 5, timeout: 60000 },
 *   fallbacks: [cacheFetch, defaultFetch]
 * });
 */
function createResilientFunction(fn, options = {}) {
  const {
    name = 'unnamed',
    timeout = 30000,
    maxRetries = 3,
    circuitBreaker: cbConfig = null,
    fallbacks = [],
    context = {}
  } = options;

  // Create circuit breaker if configured
  let circuitBreaker = null;
  if (cbConfig) {
    circuitBreaker = createCircuitBreaker(name, fn, cbConfig);
  }

  // Return protected function
  return async function(...args) {
    return withFullResilience(
      () => fn(...args),
      {
        timeout,
        maxRetries,
        circuitBreaker,
        fallbacks,
        context: { ...context, operation: name }
      }
    );
  };
}

/**
 * Protect an API client with all resilience patterns
 *
 * @param {Object} client - API client object
 * @param {Object} config - Resilience configuration for each method
 * @returns {Object} - Protected client
 *
 * @example
 * const protectedClient = protectClient(newsClient, {
 *   fetchNews: { timeout: 10000, maxRetries: 3 },
 *   searchArticles: { timeout: 15000, maxRetries: 2 }
 * });
 */
function protectClient(client, config = {}) {
  const protectedClient = {};

  for (const [methodName, options] of Object.entries(config)) {
    if (typeof client[methodName] === 'function') {
      protectedClient[methodName] = createResilientFunction(
        client[methodName].bind(client),
        {
          name: `${client.constructor.name}.${methodName}`,
          ...options
        }
      );
    }
  }

  // Preserve non-function properties
  for (const [key, value] of Object.entries(client)) {
    if (typeof value !== 'function' && !(key in protectedClient)) {
      protectedClient[key] = value;
    }
  }

  return protectedClient;
}

/**
 * Protect all preserved clients with resilience wrappers
 *
 * @param {Object} clients - Object containing all clients
 * @returns {Object} - Object with protected clients
 */
function protectAllClients(clients) {
  const protectedClients = {};

  // Default resilience configuration for each client type
  const defaultConfigs = {
    // News/Search APIs - fast responses, important
    NewsClient: {
      fetchNews: { timeout: 10000, maxRetries: 3, circuitBreaker: { threshold: 5, timeout: 30000 } },
      searchArticles: { timeout: 15000, maxRetries: 2 }
    },

    // Social Media - can be slower
    TwitterClient: {
      tweet: { timeout: 15000, maxRetries: 2 },
      search: { timeout: 20000, maxRetries: 2, circuitBreaker: { threshold: 3, timeout: 60000 } }
    },

    RedditClient: {
      search: { timeout: 15000, maxRetries: 3 },
      getThread: { timeout: 20000, maxRetries: 2 }
    },

    // Knowledge APIs - critical, fast
    WikipediaClient: {
      search: { timeout: 8000, maxRetries: 3 },
      getArticle: { timeout: 10000, maxRetries: 2 }
    },

    ArxivClient: {
      search: { timeout: 10000, maxRetries: 3 },
      getAbstract: { timeout: 15000, maxRetries: 2 }
    },

    // Translation - fast, important
    GoogleTranslateClient: {
      translate: { timeout: 8000, maxRetries: 3, circuitBreaker: { threshold: 5, timeout: 20000 } }
    },

    // LLM Providers - variable timeout, important
    CerebrasClient: {
      query: { timeout: 30000, maxRetries: 2, circuitBreaker: { threshold: 3, timeout: 60000 } }
    },

    UnifiedGLMClientV2: {
      query: { timeout: 30000, maxRetries: 2 }
    },

    // TTS - moderate timeout
    SarvamTTSSClient: {
      synthesize: { timeout: 15000, maxRetries: 2 }
    },

    // Video platforms - can be slow
    YouTubeClient: {
      search: { timeout: 15000, maxRetries: 2 },
      getVideoInfo: { timeout: 20000, maxRetries: 2 }
    }
  };

  // Protect each client based on its type
  for (const [clientName, client] of Object.entries(clients)) {
    const config = defaultConfigs[clientName] || {};

    if (Object.keys(config).length > 0) {
      protectedClients[clientName] = protectClient(client, config);
      console.info(`✅ Protected ${clientName} with resilience wrappers`);
    } else {
      // No specific config, use generic protection
      protectedClients[clientName] = protectClient(client, {
        // Protect all methods generically
        ...Object.keys(client)
          .filter(key => typeof client[key] === 'function' && !key.startsWith('_'))
          .reduce((acc, key) => {
            acc[key] = { timeout: 15000, maxRetries: 2 };
            return acc;
          }, {})
      });
      console.info(`⚠️  Protected ${clientName} with generic resilience wrappers`);
    }
  }

  return protectedClients;
}

/**
 * Health check for all protected services
 * @returns {Object} - Health status of all circuit breakers
 */
function getHealthStatus() {
  return {
    circuitBreakers: globalRegistry.getAllHealthStatuses(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Reset all circuit breakers (use with caution)
 */
function resetAllCircuitBreakers() {
  globalRegistry.resetAll();
  console.warn('⚠️  All circuit breakers have been reset');
}

/**
 * Get statistics about resilience patterns
 * @returns {Object} - Aggregate statistics
 */
function getResilienceStats() {
  const breakerStates = globalRegistry.getAllStates();

  return {
    totalCircuitBreakers: breakerStates.length,
    openCircuits: breakerStates.filter(b => b.state === 'OPEN').length,
    halfOpenCircuits: breakerStates.filter(b => b.state === 'HALF_OPEN').length,
    closedCircuits: breakerStates.filter(b => b.state === 'CLOSED').length,
    totalRequests: breakerStates.reduce((sum, b) => sum + b.stats.totalRequests, 0),
    totalSuccesses: breakerStates.reduce((sum, b) => sum + b.stats.totalSuccesses, 0),
    totalFailures: breakerStates.reduce((sum, b) => sum + b.stats.totalFailures, 0),
    totalRejected: breakerStates.reduce((sum, b) => sum + b.stats.totalRejected, 0)
  };
}

module.exports = {
  // Core patterns
  createResilientFunction,
  protectClient,
  protectAllClients,

  // Individual patterns (re-exported)
  withTimeout,
  fetchWithTimeout,
  retryWithBackoff,
  CircuitBreaker,
  createCircuitBreaker,
  withFallbackChain,
  safeExecute,
  createAlexaErrorResponse,

  // Monitoring & management
  getHealthStatus,
  resetAllCircuitBreakers,
  getResilienceStats,
  globalRegistry
};
