/**
 * Retry Logic with Exponential Backoff
 * Provides intelligent retry mechanisms for transient failures
 *
 * Usage:
 *   await retryWithBackoff(() => fetch('https://api.example.com'))
 */

/**
 * Check if an error is transient (worth retrying)
 * @param {Error} error - Error to check
 * @returns {boolean} - True if error is transient
 */
function isTransientError(error) {
  // Network errors
  if (error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'EAI_AGAIN') {
    return true;
  }

  // HTTP status codes that indicate transient issues
  if (error.response) {
    const status = error.response.status;
    if (status === 408 || // Request Timeout
        status === 429 || // Too Many Requests
        (status >= 500 && status < 600)) { // Server errors
      return true;
    }
  }

  // Check if error has explicit retryable flag
  if (error.retryable === true) {
    return true;
  }

  // Timeout errors
  if (error.timeout === true) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Attempt number (1-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  // Exponential backoff: 2^(attempt-1) * baseDelay
  const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;

  // Add jitter: ±25% random variation to avoid thundering herd
  const jitter = 0.25;
  const randomFactor = 1 + (Math.random() * 2 * jitter) - jitter;
  const delayed = exponentialDelay * randomFactor;

  // Cap at max delay
  return Math.min(delayed, maxDelay);
}

/**
 * Sleep for specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Configuration options
 * @returns {Promise} - Result of successful execution
 * @throws {Error} - Last error if all retries exhausted
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
    shouldRetry = isTransientError
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        // Enhance error with retry information
        error.attempts = attempt;
        error.maxRetries = maxRetries;
        error.exhausted = true;
        throw error;
      }

      // Calculate backoff delay
      const backoffDelay = calculateBackoff(attempt, baseDelay, maxDelay);

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt, backoffDelay);
      }

      // Log retry attempt
      console.warn(`Retry attempt ${attempt}/${maxRetries} after ${backoffDelay.toFixed(0)}ms delay:`, error.message);

      // Wait before retrying
      await delay(backoffDelay);
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Retry with custom delay strategy
 * @param {Function} fn - Async function to retry
 * @param {number[]} delays - Array of delays to use between attempts
 * @param {Function} shouldRetry - Function to determine if retry is worth it
 * @returns {Promise} - Result of successful execution
 */
async function retryWithCustomDelays(fn, delays = [1000, 2000, 5000, 10000], shouldRetry = isTransientError) {
  let lastError;

  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= delays.length || !shouldRetry(error, attempt + 1)) {
        error.attempts = attempt + 1;
        error.exhausted = true;
        throw error;
      }

      const delayMs = delays[attempt];
      console.warn(`Retry attempt ${attempt + 1}/${delays.length} after ${delayMs}ms delay:`, error.message);
      await delay(delayMs);
    }
  }

  throw lastError;
}

/**
 * Retry with immediate first retry, then exponential backoff
 * Useful for operations that might succeed on immediate retry
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Configuration options
 * @returns {Promise} - Result of successful execution
 */
async function retryWithImmediateFirst(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000
  } = options;

  // First attempt
  try {
    return await fn();
  } catch (error) {
    // Immediate retry (attempt 2)
    try {
      return await fn();
    } catch (retryError) {
      // If immediate retry fails, use exponential backoff for remaining attempts
      return retryWithBackoff(fn, {
        maxRetries: maxRetries - 2, // Subtract the 2 attempts we already made
        baseDelay,
        maxDelay
      });
    }
  }
}

/**
 * Create a retry-wrapped version of any async function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} - Wrapped function with automatic retry
 */
function createRetryWrapper(fn, options = {}) {
  return async function(...args) {
    return retryWithBackoff(() => fn(...args), options);
  };
}

/**
 * Retry multiple functions in parallel with individual retry logic
 * @param {Array<Function>} functions - Array of async functions to execute
 * @param {Object} options - Retry options for all functions
 * @returns {Promise<Array>} - Array of results
 */
async function retryAll(functions, options = {}) {
  return Promise.all(
    functions.map(fn => retryWithBackoff(fn, options))
  );
}

/**
 * Retry with circuit breaker awareness
 * Only retries if circuit breaker allows
 * @param {Function} fn - Function to retry
 * @param {Object} circuitBreaker - Circuit breaker instance
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of successful execution
 */
async function retryWithCircuitBreaker(fn, circuitBreaker, options = {}) {
  return retryWithBackoff(async () => {
    // Check circuit breaker state before attempting
    if (circuitBreaker && circuitBreaker.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - request blocked');
    }

    return await fn();
  }, options);
}

module.exports = {
  isTransientError,
  calculateBackoff,
  delay,
  retryWithBackoff,
  retryWithCustomDelays,
  retryWithImmediateFirst,
  createRetryWrapper,
  retryAll,
  retryWithCircuitBreaker
};
