/**
 * Resilience Utilities Tests
 * Comprehensive test suite for all resilience patterns
 */

const {
  withTimeout,
  retryWithBackoff,
  CircuitBreaker,
  withFallbackChain,
  safeExecute
} = require('../index');

describe('Timeout Wrapper', () => {
  test('should resolve before timeout', async () => {
    const fn = async () => 'success';
    const result = await withTimeout(fn(), 1000);
    expect(result).toBe('success');
  });

  test('should timeout on slow function', async () => {
    const fn = async () => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return 'slow';
    };

    await expect(withTimeout(fn(), 100)).rejects.toThrow('timeout');
  });

  test('should handle fetch with timeout', async () => {
    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: 'test' })
      })
    );

    const { fetchWithTimeout } = require('../index');
    const response = await fetchWithTimeout('https://api.test.com', {}, 5000);
    expect(response.ok).toBe(true);
  });
});

describe('Retry Logic', () => {
  test('should succeed on first try', async () => {
    const fn = jest.fn(async () => 'success');
    const result = await retryWithBackoff(fn, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should retry on transient error', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, { maxRetries: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('should exhaust retries on persistent error', async () => {
    const fn = jest.fn(async () => {
      throw new Error('Persistent error');
    });

    await expect(retryWithBackoff(fn, { maxRetries: 2 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  test('should respect exponential backoff', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockResolvedValue('success');

    const startTime = Date.now();
    await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 100 });
    const elapsed = Date.now() - startTime;

    // Should have waited: 100ms (1st retry) + 200ms (2nd retry) = ~300ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(280);
  });
});

describe('Circuit Breaker', () => {
  let circuitBreaker;
  let mockFn;

  beforeEach(() => {
    mockFn = jest.fn();
    circuitBreaker = new CircuitBreaker(mockFn, {
      threshold: 3,
      timeout: 1000,
      name: 'TestBreaker'
    });
  });

  test('should allow requests in CLOSED state', async () => {
    mockFn.mockResolvedValue('success');

    const result = await circuitBreaker.execute();
    expect(result).toBe('success');
    expect(circuitBreaker.state).toBe('CLOSED');
  });

  test('should open circuit after threshold failures', async () => {
    mockFn.mockRejectedValue(new Error('Service error'));

    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute();
      } catch (error) {
        // Expected
      }
    }

    expect(circuitBreaker.state).toBe('OPEN');
  });

  test('should reject requests when OPEN', async () => {
    // Force circuit open
    circuitBreaker._transitionTo('OPEN');
    circuitBreaker.nextAttemptTime = Date.now() + 10000;

    await expect(circuitBreaker.execute()).rejects.toThrow('OPEN');
  });

  test('should transition to HALF_OPEN after timeout', async () => {
    // Force circuit open with expired timeout
    circuitBreaker._transitionTo('OPEN');
    circuitBreaker.nextAttemptTime = Date.now() - 1000;

    mockFn.mockResolvedValue('success');
    await circuitBreaker.execute();

    expect(circuitBreaker.state).toBe('HALF_OPEN');
  });

  test('should close after successful recovery', async () => {
    // Open circuit
    for (let i = 0; i < 3; i++) {
      mockFn.mockRejectedValue(new Error('Error'));
      try {
        await circuitBreaker.execute();
      } catch (e) {}
    }

    expect(circuitBreaker.state).toBe('OPEN');

    // Expire timeout
    circuitBreaker.nextAttemptTime = Date.now() - 1000;

    // Success attempts to close
    mockFn.mockResolvedValue('success');
    for (let i = 0; i < 2; i++) {
      await circuitBreaker.execute();
    }

    expect(circuitBreaker.state).toBe('CLOSED');
  });

  test('should provide health status', () => {
    const health = circuitBreaker.getHealthStatus();

    expect(health).toHaveProperty('name', 'TestBreaker');
    expect(health).toHaveProperty('state');
    expect(health).toHaveProperty('healthy');
    expect(health).toHaveProperty('stats');
  });
});

describe('Graceful Degradation', () => {
  test('should use first successful fallback', async () => {
    const fallback1 = jest.fn().mockRejectedValue(new Error('Failed'));
    const fallback2 = jest.fn().mockResolvedValue('fallback success');
    const fallback3 = jest.fn().mockResolvedValue('never called');

    const result = await withFallbackChain([fallback1, fallback2, fallback3]);

    expect(result).toBe('fallback success');
    expect(fallback1).toHaveBeenCalledTimes(1);
    expect(fallback2).toHaveBeenCalledTimes(1);
    expect(fallback3).not.toHaveBeenCalled();
  });

  test('should throw when all fallbacks fail', async () => {
    const fallback1 = jest.fn().mockRejectedValue(new Error('Error 1'));
    const fallback2 = jest.fn().mockRejectedValue(new Error('Error 2'));

    await expect(withFallbackChain([fallback1, fallback2]))
      .rejects.toThrow('All fallbacks exhausted');
  });

  test('should return default on error with safeExecute', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Error'));
    const defaultResponse = { text: 'Default response' };

    const result = await safeExecute(fn, defaultResponse);

    expect(result).toEqual(defaultResponse);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should call onError callback', async () => {
    const onError = jest.fn();
    const fn = jest.fn().mockRejectedValue(new Error('Error'));
    const defaultResponse = 'fallback';

    await safeExecute(fn, defaultResponse, { onError });

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Object)
    );
  });
});

describe('Integration Tests', () => {
  test('should combine timeout + retry + circuit breaker', async () => {
    let attemptCount = 0;
    const fn = async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    };

    const { createResilientFunction } = require('../index');
    const protectedFn = createResilientFunction(fn, {
      name: 'integration-test',
      timeout: 5000,
      maxRetries: 3,
      circuitBreaker: { threshold: 5, timeout: 60000 }
    });

    const result = await protectedFn();
    expect(result).toBe('success');
    expect(attemptCount).toBeGreaterThanOrEqual(2);
  });

  test('should handle cascading failures gracefully', async () => {
    const alwaysFail = jest.fn().mockRejectedValue(new Error('Service down'));
    const { createResilientFunction } = require('../index');

    const protectedFn = createResilientFunction(alwaysFail, {
      name: 'failing-service',
      timeout: 1000,
      maxRetries: 2,
      fallbacks: [
        jest.fn().mockRejectedValue(new Error('Fallback 1 failed')),
        jest.fn().mockRejectedValue(new Error('Fallback 2 failed'))
      ]
    });

    await expect(protectedFn()).rejects.toThrow();
  });
});

describe('Health Monitoring', () => {
  test('should aggregate circuit breaker stats', () => {
    const { getResilienceStats, createCircuitBreaker } = require('../index');

    // Create some test circuit breakers
    createCircuitBreaker('test1', async () => {}, { threshold: 5 });
    createCircuitBreaker('test2', async () => {}, { threshold: 3 });

    const stats = getResilienceStats();

    expect(stats).toHaveProperty('totalCircuitBreakers');
    expect(stats.totalCircuitBreakers).toBeGreaterThanOrEqual(2);
  });

  test('should provide health status', () => {
    const { getHealthStatus } = require('../index');
    const health = getHealthStatus();

    expect(health).toHaveProperty('circuitBreakers');
    expect(health).toHaveProperty('timestamp');
    expect(Array.isArray(health.circuitBreakers)).toBe(true);
  });
});
