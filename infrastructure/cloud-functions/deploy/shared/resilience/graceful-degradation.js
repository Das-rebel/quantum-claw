/**
 * Graceful Degradation Utilities
 * Provides fallback chains and partial functionality during service failures
 *
 * Strategy:
 *   Primary → Cache → Alternative → Error (with helpful message)
 *
 * Usage:
 *   await withFallback(primary, cache, alternative, errorMessage)
 */

/**
 * Execute with fallback chain
 * Tries each option in sequence until one succeeds
 *
 * @param {Array<Function>} fallbacks - Array of functions to try in order
 * @param {Object} options - Configuration options
 * @returns {Promise} - Result from first successful fallback
 * @throws {Error} - If all fallbacks fail
 */
async function withFallbackChain(fallbacks, options = {}) {
  const {
    onError = null,
    context = {},
    returnPartial = false
  } = options;

  let lastError;

  for (let i = 0; i < fallbacks.length; i++) {
    const fallback = fallbacks[i];

    try {
      const result = await fallback();

      // Add metadata about which fallback succeeded
      if (result && typeof result === 'object') {
        result._fallbackIndex = i;
        result._fallbackUsed = fallback.name || `fallback_${i}`;
      }

      // Log successful fallback (if not primary)
      if (i > 0) {
        console.info(`Fallback ${i} succeeded: ${fallback.name || `fallback_${i}`}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Call error callback if provided
      if (onError) {
        onError(error, i, fallback);
      }

      console.warn(`Fallback ${i} failed: ${error.message}`);

      // If this is partial result and returnPartial is true, return it
      if (error.partialResult && returnPartial) {
        console.info(`Returning partial result from fallback ${i}`);
        return error.partialResult;
      }
    }
  }

  // All fallbacks exhausted
  const fallbackError = new Error('All fallbacks exhausted');
  fallbackError.context = context;
  fallbackError.lastError = lastError;
  fallbackError.fallbacksAttempted = fallbacks.length;
  throw fallbackError;
}

/**
 * Execute with cache fallback
 * Tries primary, falls back to cache
 *
 * @param {Function} primaryFn - Primary function to execute
 * @param {Function} cacheGet - Cache get function
 * @param {string} cacheKey - Cache key
 * @param {Object} options - Options
 * @returns {Promise} - Result from primary or cache
 */
async function withCacheFallback(primaryFn, cacheGet, cacheKey, options = {}) {
  const {
    cacheTTL = 3600000, // 1 hour default
    staleOnError = true,
    context = {}
  } = options;

  // Try primary first
  try {
    const result = await primaryFn();
    return result;
  } catch (primaryError) {
    console.warn(`Primary failed, trying cache for key: ${cacheKey}`);

    // Try cache
    try {
      const cached = await cacheGet(cacheKey);

      if (cached) {
        const age = Date.now() - (cached.timestamp || 0);
        const isStale = age > cacheTTL;

        // Mark as cached response
        if (cached.data && typeof cached.data === 'object') {
          cached.data._fromCache = true;
          cached.data._cacheAge = age;
          cached.data._cacheStale = isStale;
        }

        if (isStale && !staleOnError) {
          throw new Error(`Cache stale (${age}ms old) and staleOnError is false`);
        }

        console.info(`Retrieved from cache${isStale ? ' (stale)' : ''}: ${cacheKey}`);
        return cached.data;
      } else {
        throw new Error('Cache miss');
      }
    } catch (cacheError) {
      // Both primary and cache failed
      const error = new Error(`Primary and cache both failed: ${primaryError.message}`);
      error.primaryError = primaryError;
      error.cacheError = cacheError;
      error.context = context;
      throw error;
    }
  }
}

/**
 * Execute with service degradation
 * Returns partial results if full result unavailable
 *
 * @param {Function} fullFn - Full function
 * @param {Function} partialFn - Partial result function
 * @param {Object} options - Options
 * @returns {Promise} - Full or partial result
 */
async function withServiceDegradation(fullFn, partialFn, options = {}) {
  const {
    degradationTimeout = 5000,
    requireMinimal = true,
    context = {}
  } = options;

  // Try full functionality
  try {
    return await fullFn();
  } catch (fullError) {
    console.warn('Full functionality failed, attempting degraded service');

    // Try partial functionality
    try {
      const partialResult = await partialFn();

      if (partialResult && typeof partialResult === 'object') {
        partialResult._degraded = true;
        partialResult._degradedMessage = 'Running in degraded mode';
      }

      return partialResult;
    } catch (partialError) {
      // Even partial failed
      if (!requireMinimal) {
        const error = new Error('Service completely unavailable');
        error.fullError = fullError;
        error.partialError = partialError;
        error.context = context;
        throw error;
      }

      // Return minimal error-safe response
      return {
        _degraded: true,
        _error: true,
        _message: 'Service temporarily unavailable',
        _fullError: fullError.message,
        _partialError: partialError.message
      };
    }
  }
}

/**
 * Create user-friendly error message for Alexa
 * @param {Error} error - Error that occurred
 * @param {Object} context - Context about what failed
 * @returns {Object} - Alexa response with friendly error message
 */
function createAlexaErrorResponse(error, context = {}) {
  const { operation = 'operation', suggestion = 'please try again' } = context;

  let message = `I'm having trouble with that ${operation}. ${suggestion}.`;

  // Add specific guidance based on error type
  if (error.timeout) {
    message = `That ${operation} is taking too long. ${suggestion} in a moment.`;
  } else if (error.message && error.message.includes('Circuit breaker')) {
    message = `That service is temporarily unavailable. ${suggestion} in a few minutes.`;
  } else if (error.message && error.message.includes('API key')) {
    message = `There's a configuration issue with that service. Please check the setup.`;
  }

  return {
    text: message,
    shouldEndSession: false,
    _error: true,
    _errorType: error.name || 'Error',
    _errorMessage: error.message
  };
}

/**
 * Safe execution with guaranteed non-error response
 * Always returns a valid response, never throws
 *
 * @param {Function} fn - Function to execute
 * @param {Object} defaultResponse - Default response on error
 * @param {Object} options - Options
 * @returns {Promise} - Result or default response
 */
async function safeExecute(fn, defaultResponse, options = {}) {
  const {
    onError = null,
    context = {},
    logErrors = true
  } = options;

  try {
    return await fn();
  } catch (error) {
    if (logErrors) {
      console.error('SafeExecute caught error:', error.message);
    }

    if (onError) {
      onError(error, context);
    }

    // If defaultResponse is a function, call it
    if (typeof defaultResponse === 'function') {
      return defaultResponse(error);
    }

    return defaultResponse;
  }
}

/**
 * Combine multiple resilience patterns
 * Timeout → Retry → Circuit Breaker → Fallback → Graceful Error
 *
 * @param {Function} fn - Function to protect
 * @param {Object} options - All resilience options
 * @returns {Promise} - Protected result
 */
async function withFullResilience(fn, options = {}) {
  const {
    timeout = 30000,
    maxRetries = 3,
    circuitBreaker = null,
    fallbacks = [],
    context = {},
    operation = 'operation'
  } = options;

  // Apply timeout
  const { withTimeout } = require('./timeout-wrapper');
  const timeoutFn = () => withTimeout(fn(), timeout, operation);

  // Apply retry
  const { retryWithBackoff } = require('./retry');
  const retryFn = () => retryWithBackoff(timeoutFn, { maxRetries });

  // Apply circuit breaker
  let protectedFn = retryFn;
  if (circuitBreaker) {
    protectedFn = () => circuitBreaker.execute(retryFn);
  }

  // Apply fallbacks
  const allFallbacks = [protectedFn, ...fallbacks];

  try {
    return await withFallbackChain(allFallbacks, { context });
  } catch (error) {
    // Return graceful error
    return createAlexaErrorResponse(error, { operation, context });
  }
}

/**
 * Degrade functionality gracefully for Alexa responses
 * Ensures Alexa always has something to say
 *
 * @param {Function} dataFn - Function that fetches data
 * @param {Function} responseFn - Function that generates Alexa response
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Alexa response (never throws)
 */
async function gracefulAlexaResponse(dataFn, responseFn, options = {}) {
  const {
    fallbackData = [],
    fallbackMessage = "I couldn't get that information right now, but I'm here to help with other things.",
    context = {}
  } = options;

  try {
    const data = await dataFn();
    return responseFn(data);
  } catch (error) {
    console.error('Primary response failed, using fallback:', error.message);

    // Try fallback data
    if (fallbackData.length > 0) {
      try {
        return responseFn(fallbackData);
      } catch (fallbackError) {
        console.error('Fallback response also failed:', fallbackError.message);
      }
    }

    // Return generic helpful error
    return {
      text: fallbackMessage,
      shouldEndSession: false,
      _error: true,
      _fallback: true
    };
  }
}

module.exports = {
  withFallbackChain,
  withCacheFallback,
  withServiceDegradation,
  createAlexaErrorResponse,
  safeExecute,
  withFullResilience,
  gracefulAlexaResponse
};
