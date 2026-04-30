/**
 * Error Handler - Retry logic, circuit breaker, and graceful error handling
 *
 * Provides:
 * - Exponential backoff retry logic
 * - Circuit breaker pattern
 * - Error classification and logging
 * - Graceful error message generation
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5; // Failures before opening
    this.timeout = options.timeout || 60000; // Time to stay open (ms)
    this.halfOpenAttempts = options.halfOpenAttempts || 1;

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
  }

  /**
     * Attempt to execute action through circuit breaker
     * @param {Function} action - Action to execute
     * @returns {Promise} - Action result
     */
  async execute(action) {
    // Check if circuit should reset
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.state = 'HALF_OPEN';
      this.lastStateChange = Date.now();
      console.log('🔄 Circuit breaker entering HALF_OPEN state');
    }

    // Reject if circuit is open
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - rejecting requests');
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
     * Check if circuit should attempt reset
     * @returns {boolean} - True if should attempt
     */
  shouldAttemptReset() {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime > this.timeout;
  }

  /**
     * Handle successful execution
     */
  onSuccess() {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenAttempts) {
        this.state = 'CLOSED';
        this.successCount = 0;
        this.lastStateChange = Date.now();
        console.log('✅ Circuit breaker reset to CLOSED state');
      }
    } else {
      this.successCount++;
    }
  }

  /**
     * Handle failed execution
     */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
      console.error(`🔴 Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  /**
     * Get circuit breaker state
     * @returns {object} - State info
     */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      timeSinceLastFailure: this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : null
    };
  }

  /**
     * Reset circuit breaker
     */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    console.log('🔄 Circuit breaker manually reset');
  }
}

class ErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.backoffBase = options.backoffBase || 1000; // Base delay in ms
    this.backoffMax = options.backoffMax || 10000; // Max delay in ms

    this.circuitBreaker = new CircuitBreaker({
      threshold: options.circuitThreshold || 5,
      timeout: options.circuitTimeout || 60000
    });

    this.errorLog = [];
    this.maxErrorLog = options.maxErrorLog || 100;

    this.stats = {
      totalErrors: 0,
      retryErrors: 0,
      circuitBreakerErrors: 0,
      errorsByType: new Map()
    };
  }

  /**
     * Classify error type
     * @param {Error} error - Error object
     * @returns {string} - Error type
     */
  classifyError(error) {
    const errorMsg = String(error?.message ?? error ?? '');
    const message = errorMsg.toLowerCase();

    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('network') || message.includes('econnrefused')) return 'NETWORK';
    if (message.includes('api') || message.includes('401') || message.includes('403')) return 'API_ERROR';
    if (message.includes('quota') || message.includes('429')) return 'QUOTA_EXCEEDED';
    if (message.includes('parse') || message.includes('json')) return 'PARSE_ERROR';

    return 'UNKNOWN';
  }

  /**
     * Calculate exponential backoff delay
     * @param {number} attempt - Attempt number
     * @returns {number} - Delay in ms
     */
  calculateBackoff(attempt) {
    const delay = Math.min(
      this.backoffBase * Math.pow(2, attempt),
      this.backoffMax
    );
    // Add jitter
    const jitterMax = this.backoffBase * 0.1;
    return delay + Math.random() * jitterMax;
  }

  /**
     * Log error with context
     * @param {Error} error - Error object
     * @param {object} context - Error context
     */
  logError(error, context = {}) {
    const errorEntry = {
      type: this.classifyError(error),
      message: String(error?.message ?? error ?? ''),
      stack: error?.stack,
      context,
      timestamp: Date.now()
    };

    this.errorLog.push(errorEntry);
    if (this.errorLog.length > this.maxErrorLog) {
      this.errorLog.shift();
    }

    // Update stats
    this.stats.totalErrors++;
    const type = errorEntry.type;
    this.stats.errorsByType.set(type, (this.stats.errorsByType.get(type) || 0) + 1);

    console.error(`❌ Error [${type}]:`, error?.message ?? error);
  }

  /**
     * Execute with retry logic
     * @param {Function} fn - Function to execute
     * @param {object} context - Execution context
     * @returns {Promise} - Function result
     */
  async executeWithRetry(fn, context = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Check circuit breaker first
        if (attempt > 0) {
          const breakerState = this.circuitBreaker.getState();
          if (breakerState.state === 'OPEN') {
            this.stats.circuitBreakerErrors++;
            throw new Error('Circuit breaker is OPEN');
          }
        }

        const result = await fn(attempt);

        // Success - reset circuit breaker failure count on first success
        if (attempt === 0) {
          this.circuitBreaker.onSuccess();
        }

        return result;

      } catch (error) {
        lastError = error;
        this.logError(error, { ...context, attempt });

        // Check if we should retry
        const errorType = this.classifyError(error);
        const shouldRetry = this.shouldRetry(errorType, attempt);

        if (!shouldRetry) {
          this.circuitBreaker.onFailure();
          throw error;
        }

        if (attempt < this.maxRetries) {
          this.stats.retryErrors++;
          const delay = this.calculateBackoff(attempt);
          console.log(`🔄 Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    this.circuitBreaker.onFailure();
    throw lastError;
  }

  /**
     * Check if error should be retried
     * @param {string} errorType - Error type
     * @param {number} attempt - Attempt number
     * @returns {boolean} - True if should retry
     */
  shouldRetry(errorType, attempt) {
    // Don't retry certain error types
    const noRetryTypes = ['PARSE_ERROR', 'QUOTA_EXCEEDED'];
    if (noRetryTypes.includes(errorType)) {
      return false;
    }

    // Always retry on first attempt
    return attempt < this.maxRetries;
  }

  /**
     * Sleep for specified time
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} - Sleep promise
     */
  sleep(ms) {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
     * Generate graceful error message
     * @param {Error} error - Error object
     * @returns {string} - User-friendly message
     */
  getGracefulMessage(error) {
    const errorType = this.classifyError(error);

    const messages = {
      TIMEOUT: "I'm taking longer than expected. Please try again.",
      NETWORK: "I'm having trouble connecting. Please check your connection and try again.",
      API_ERROR: "There's an issue with my backend. Please try again.",
      QUOTA_EXCEEDED: "I've reached my usage limit. Please try again later.",
      PARSE_ERROR: 'I had trouble understanding that. Please try rephrasing.',
      UNKNOWN: 'Something went wrong. Please try again.'
    };

    return messages[errorType] || messages.UNKNOWN;
  }

  /**
     * Get error statistics
     * @returns {object} - Error statistics
     */
  getStats() {
    return {
      ...this.stats,
      errorsByType: Array.from(this.stats.errorsByType.entries()),
      circuitBreaker: this.circuitBreaker.getState(),
      recentErrors: this.errorLog.slice(-10)
    };
  }

  /**
     * Get error log
     * @param {object} options - Query options
     * @returns {Array} - Error log entries
     */
  getErrorLog(options = {}) {
    const { limit = 50, type = null } = options;

    let filtered = [...this.errorLog];

    if (type) {
      filtered = filtered.filter(e => e.type === type);
    }

    return filtered.slice(-limit).reverse();
  }

  /**
     * Clear error log
     */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
     * Reset circuit breaker
     */
  resetCircuitBreaker() {
    this.circuitBreaker.reset();
  }

  /**
     * Reset statistics
     */
  resetStats() {
    this.stats = {
      totalErrors: 0,
      retryErrors: 0,
      circuitBreakerErrors: 0,
      errorsByType: new Map()
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create error handler singleton
 * @param {object} options - Configuration options
 * @returns {ErrorHandler} - Error handler instance
 */
function getErrorHandler(options) {
  if (!instance) {
    instance = new ErrorHandler(options);
  }
  return instance;
}

module.exports = { ErrorHandler, CircuitBreaker, getErrorHandler };
