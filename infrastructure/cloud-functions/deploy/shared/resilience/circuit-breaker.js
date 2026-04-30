/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily blocking requests to failing services
 *
 * States:
 *   CLOSED - Normal operation, requests pass through
 *   OPEN - Failure threshold exceeded, requests blocked
 *   HALF_OPEN - Testing if service has recovered
 *
 * Usage:
 *   const breaker = new CircuitBreaker(apiCall, { threshold: 5, timeout: 60000 });
 *   const result = await breaker.execute();
 */

/**
 * Circuit Breaker States
 */
const CircuitState = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, block requests
  HALF_OPEN: 'HALF_OPEN' // Testing recovery
};

/**
 * Circuit Breaker Configuration
 */
const defaultConfig = {
  threshold: 5,           // Failures before opening
  timeout: 60000,         // MS to stay open before half-open
  resetTimeout: 30000,    // MS to wait in half-open before closing
  monitoringPeriod: 10000,// MS between health checks
  successThreshold: 2,    // Successes needed to close from half-open
  name: 'CircuitBreaker'   // Identifier for logging
};

/**
 * Circuit Breaker Class
 */
class CircuitBreaker {
  /**
   * @param {Function} fn - Function to protect with circuit breaker
   * @param {Object} config - Configuration options
   */
  constructor(fn, config = {}) {
    this.fn = fn;
    this.config = { ...defaultConfig, ...config };

    // State tracking
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // Statistics
    this.stats = {
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalRejected: 0,
      totalTimeOpen: 0,
      lastStateChange: Date.now()
    };

    // Event callbacks
    this.onStateChange = null;
    this.onSuccess = null;
    this.onFailure = null;
    this.onReject = null;
  }

  /**
   * Execute protected function with circuit breaker logic
   * @param {...any} args - Arguments to pass to protected function
   * @returns {Promise} - Result of protected function
   * @throws {Error} - If circuit is open or function fails
   */
  async execute(...args) {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        // Still in timeout period, reject request
        this.stats.totalRejected++;
        this._notifyReject('Circuit breaker is OPEN - request blocked');
        throw new Error(`Circuit breaker [${this.config.name}] is OPEN - rejecting request`);
      } else {
        // Timeout period over, transition to half-open
        this._transitionTo(CircuitState.HALF_OPEN);
      }
    }

    try {
      // Execute the protected function
      const result = await this.fn(...args);

      // Success - handle based on current state
      this._handleSuccess();

      // Notify success callback
      if (this.onSuccess) {
        this.onSuccess(result, this.state);
      }

      return result;
    } catch (error) {
      // Failure - handle based on current state
      this._handleFailure(error);

      // Notify failure callback
      if (this.onFailure) {
        this.onFailure(error, this.state);
      }

      throw error;
    }
  }

  /**
   * Handle successful execution
   * @private
   */
  _handleSuccess() {
    this.stats.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        // Service recovered, close circuit
        this._transitionTo(CircuitState.CLOSED);
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   * @private
   * @param {Error} error - Error that occurred
   */
  _handleFailure(error) {
    this.stats.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed during recovery test, open circuit again
      this._transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if threshold exceeded
      if (this.failureCount >= this.config.threshold) {
        this._transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Transition to new state
   * @private
   * @param {string} newState - New circuit state
   */
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.lastStateChange = Date.now();

    // Handle state-specific logic
    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.timeout;
      console.warn(`Circuit breaker [${this.config.name}] opened after ${this.failureCount} failures`);
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      console.info(`Circuit breaker [${this.config.name}] closed after recovery`);
    } else if (newState === CircuitState.HALF_OPEN) {
      console.info(`Circuit breaker [${this.config.name}] moved to half-open for testing`);
    }

    // Notify state change callback
    if (this.onStateChange && oldState !== newState) {
      this.onStateChange(oldState, newState);
    }
  }

  /**
   * Notify rejection callback
   * @private
   * @param {string} reason - Rejection reason
   */
  _notifyReject(reason) {
    if (this.onReject) {
      this.onReject(reason, this.state);
    }
  }

  /**
   * Get current circuit breaker state
   * @returns {Object} - Current state and statistics
   */
  getState() {
    return {
      name: this.config.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      stats: { ...this.stats }
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset() {
    const oldState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    if (oldState !== CircuitState.CLOSED) {
      console.info(`Circuit breaker [${this.config.name}] manually reset to CLOSED`);
    }
  }

  /**
   * Check if circuit is allowing requests
   * @returns {boolean} - True if requests are allowed
   */
  isRequestAllowed() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      return Date.now() >= this.nextAttemptTime;
    }

    // HALF_OPEN allows requests for testing
    return true;
  }

  /**
   * Get health status for monitoring
   * @returns {Object} - Health status information
   */
  getHealthStatus() {
    const uptime = Date.now() - this.stats.lastStateChange;

    return {
      name: this.config.name,
      state: this.state,
      healthy: this.state !== CircuitState.OPEN,
      uptime: uptime,
      failureRate: this.stats.totalRequests > 0
        ? this.stats.totalFailures / this.stats.totalRequests
        : 0,
      stats: {
        requests: this.stats.totalRequests,
        successes: this.stats.totalSuccesses,
        failures: this.stats.totalFailures,
        rejected: this.stats.totalRejected
      },
      config: {
        threshold: this.config.threshold,
        timeout: this.config.timeout
      }
    };
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create circuit breaker
   * @param {string} name - Circuit breaker name
   * @param {Function} fn - Function to protect
   * @param {Object} config - Configuration
   * @returns {CircuitBreaker} - Circuit breaker instance
   */
  get(name, fn, config = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker(fn, { ...config, name });
      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name);
  }

  /**
   * Remove circuit breaker from registry
   * @param {string} name - Circuit breaker name
   */
  remove(name) {
    this.breakers.delete(name);
  }

  /**
   * Get all circuit breaker states
   * @returns {Array} - Array of circuit breaker states
   */
  getAllStates() {
    return Array.from(this.breakers.values()).map(b => b.getState());
  }

  /**
   * Get all health statuses
   * @returns {Array} - Array of health statuses
   */
  getAllHealthStatuses() {
    return Array.from(this.breakers.values()).map(b => b.getHealthStatus());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global registry instance
const globalRegistry = new CircuitBreakerRegistry();

/**
 * Create a circuit breaker with automatic registration
 * @param {string} name - Circuit breaker name
 * @param {Function} fn - Function to protect
 * @param {Object} config - Configuration
 * @returns {CircuitBreaker} - Circuit breaker instance
 */
function createCircuitBreaker(name, fn, config = {}) {
  return globalRegistry.get(name, fn, config);
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  createCircuitBreaker,
  globalRegistry
};
