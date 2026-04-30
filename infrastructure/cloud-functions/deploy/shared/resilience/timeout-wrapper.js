/**
 * Timeout Wrapper Utility
 * Provides configurable timeout handling for async operations
 *
 * Usage:
 *   await withTimeout(fetch('https://api.example.com'), 30000)
 */

/**
 * Wraps a promise with timeout functionality
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @param {string} operation - Operation name for error messages (default: 'Operation')
 * @returns {Promise} - Promise that rejects on timeout
 * @throws {Error} - When timeout is exceeded
 */
async function withTimeout(promise, timeoutMs = 30000, operation = 'Operation') {
  let timeoutHandle;

  // Create timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${operation} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    // Race between actual promise and timeout
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    // Always clear timeout to prevent memory leaks
    clearTimeout(timeoutHandle);
  }
}

/**
 * Enhanced timeout wrapper with retry hint
 * @param {Promise} promise - The promise to wrap
 * @param {Object} options - Configuration options
 * @returns {Promise} - Promise with timeout protection
 */
async function withTimeoutEnhanced(promise, options = {}) {
  const {
    timeoutMs = 30000,
    operation = 'Operation',
    retryable = true,
    context = {}
  } = options;

  try {
    return await withTimeout(promise, timeoutMs, operation);
  } catch (error) {
    // Add metadata for retry logic
    error.retryable = retryable;
    error.timeout = true;
    error.operation = operation;
    error.context = context;

    throw error;
  }
}

/**
 * Timeout wrapper for fetch calls
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>} - Fetch response with timeout protection
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms`);
      timeoutError.retryable = true;
      timeoutError.timeout = true;
      timeoutError.url = url;
      throw timeoutError;
    }

    throw error;
  }
}

/**
 * Create timeout-wrapped version of any async function
 * @param {Function} fn - Async function to wrap
 * @param {number} timeoutMs - Default timeout
 * @param {string} operation - Operation name
 * @returns {Function} - Wrapped function
 */
function createTimeoutWrapper(fn, timeoutMs = 30000, operation = 'Operation') {
  return async function(...args) {
    return withTimeout(fn(...args), timeoutMs, operation);
  };
}

/**
 * Multiple timeouts with increasing durations
 * Useful for operations that may need more time on retry
 * @param {Function} fn - Function to execute
 * @param {number[]} timeouts - Array of timeout durations to try
 * @returns {Promise} - Result with progressive timeouts
 */
async function withProgressiveTimeout(fn, timeouts = [10000, 20000, 30000]) {
  for (const timeoutMs of timeouts) {
    try {
      return await withTimeout(fn(), timeoutMs, `Operation (${timeoutMs}ms timeout)`);
    } catch (error) {
      if (error.timeout && timeouts.indexOf(timeoutMs) < timeouts.length - 1) {
        console.log(`Timeout at ${timeoutMs}ms, trying ${timeouts[timeouts.indexOf(timeoutMs) + 1]}ms`);
        continue;
      }
      throw error;
    }
  }
}

module.exports = {
  withTimeout,
  withTimeoutEnhanced,
  fetchWithTimeout,
  createTimeoutWrapper,
  withProgressiveTimeout
};
