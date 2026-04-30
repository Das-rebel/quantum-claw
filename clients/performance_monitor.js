/**
 * Performance Monitor
 * Tracks response times, memory usage, and detects potential memory leaks
 */

const v8 = require('v8');

class PerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.responseTimeThreshold = options.responseTimeThreshold || 3000; // 3 seconds
    this.memoryThreshold = options.memoryThreshold || 256 * 1024 * 1024; // 256MB

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      slowRequests: 0,
      memorySnapshots: []
    };

    this.requestHistory = new Map();
    this.alertHistory = [];

    // Start monitoring interval
    if (this.enabled) {
      this.startMonitoring();
    }
  }

  /**
     * Start monitoring intervals
     */
  startMonitoring() {
    // Memory monitoring every 30 seconds
    this.memoryInterval = setInterval(() => {
      this.captureMemorySnapshot();
    }, 30000);

    // Cleanup old request history every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldRequests();
    }, 300000);
  }

  /**
     * Stop monitoring
     */
  stopMonitoring() {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
     * Record request start
     * @param {string} requestId - Unique request identifier
     * @param {object} metadata - Request metadata
     */
  recordRequestStart(requestId, metadata = {}) {
    if (!this.enabled) return;

    this.requestHistory.set(requestId, {
      startTime: Date.now(),
      metadata
    });

    this.metrics.totalRequests++;
  }

  /**
     * Record request completion
     * @param {string} requestId - Unique request identifier
     * @param {boolean} success - Whether request was successful
     * @param {object} metadata - Additional metadata
     */
  recordRequestEnd(requestId, success = true, metadata = {}) {
    if (!this.enabled) return;

    const request = this.requestHistory.get(requestId);
    if (!request) return;

    const responseTime = Date.now() - request.startTime;

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Track response times (keep last 1000)
    this.metrics.responseTimes.push(responseTime);
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    // Check for slow requests
    if (responseTime > this.responseTimeThreshold) {
      this.metrics.slowRequests++;
      this.alertHistory.push({
        type: 'slow_request',
        timestamp: new Date().toISOString(),
        responseTime,
        threshold: this.responseTimeThreshold,
        metadata: { ...request.metadata, ...metadata }
      });
      console.warn(`⚠️ Slow request detected: ${responseTime}ms > ${this.responseTimeThreshold}ms`);
    }

    this.requestHistory.delete(requestId);
  }

  /**
     * Capture memory snapshot
     */
  captureMemorySnapshot() {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    const snapshot = {
      timestamp: new Date().toISOString(),
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      heapLimit: heapStats.heap_size_limit,
      heapAvailable: heapStats.total_available_size
    };

    this.metrics.memorySnapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.metrics.memorySnapshots.length > 100) {
      this.metrics.memorySnapshots.shift();
    }

    // Check memory threshold
    if (snapshot.heapUsed > this.memoryThreshold) {
      this.alertHistory.push({
        type: 'high_memory',
        timestamp: snapshot.timestamp,
        heapUsed: snapshot.heapUsed,
        threshold: this.memoryThreshold
      });
      console.warn(`⚠️ High memory usage detected: ${(snapshot.heapUsed / 1024 / 1024).toFixed(2)}MB > ${(this.memoryThreshold / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  /**
     * Detect potential memory leaks
     * @returns {object|null} - Leak detection result or null
     */
  detectMemoryLeaks() {
    if (this.metrics.memorySnapshots.length < 10) {
      return null;
    }

    const recentSnapshots = this.metrics.memorySnapshots.slice(-10);
    const firstSnapshot = recentSnapshots[0];
    const lastSnapshot = recentSnapshots[recentSnapshots.length - 1];

    const memoryGrowth = lastSnapshot.heapUsed - firstSnapshot.heapUsed;
    const growthRate = memoryGrowth / firstSnapshot.heapUsed;

    // If memory grew by more than 50% in recent snapshots
    if (growthRate > 0.5) {
      this.alertHistory.push({
        type: 'potential_memory_leak',
        timestamp: new Date().toISOString(),
        memoryGrowth,
        growthRate,
        startSnapshot: firstSnapshot.timestamp,
        endSnapshot: lastSnapshot.timestamp
      });

      return {
        detected: true,
        memoryGrowth,
        growthRate,
        message: `Potential memory leak detected: ${growthRate > 1 ? 'severe' : 'moderate'} memory growth`
      };
    }

    return null;
  }

  /**
     * Get performance metrics
     * @returns {object} - Performance metrics
     */
  getMetrics() {
    const responseTimes = this.metrics.responseTimes;

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    const p50ResponseTime = this.getPercentile(responseTimes, 50);
    const p95ResponseTime = this.getPercentile(responseTimes, 95);
    const p99ResponseTime = this.getPercentile(responseTimes, 99);

    const successRate = this.metrics.totalRequests > 0
      ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100)
      : 0;

    const slowRequestRate = this.metrics.totalRequests > 0
      ? (this.metrics.slowRequests / this.metrics.totalRequests * 100)
      : 0;

    const memoryLeak = this.detectMemoryLeaks();

    return {
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.successfulRequests,
        failed: this.metrics.failedRequests,
        successRate: successRate.toFixed(2) + '%'
      },
      responseTime: {
        avg: Math.round(avgResponseTime),
        p50: p50ResponseTime,
        p95: p95ResponseTime,
        p99: p99ResponseTime
      },
      slowRequests: {
        count: this.metrics.slowRequests,
        rate: slowRequestRate.toFixed(2) + '%',
        threshold: this.responseTimeThreshold
      },
      memory: this.getCurrentMemoryUsage(),
      memoryLeak: memoryLeak || { detected: false }
    };
  }

  /**
     * Get current memory usage
     * @returns {object} - Memory usage info
     */
  getCurrentMemoryUsage() {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      rss: this.formatBytes(memoryUsage.rss),
      heapTotal: this.formatBytes(memoryUsage.heapTotal),
      heapUsed: this.formatBytes(memoryUsage.heapUsed),
      external: this.formatBytes(memoryUsage.external),
      arrayBuffers: this.formatBytes(memoryUsage.arrayBuffers),
      heapLimit: this.formatBytes(heapStats.heap_size_limit),
      heapUsedPercent: ((memoryUsage.heapUsed / heapStats.heap_size_limit) * 100).toFixed(2) + '%'
    };
  }

  /**
     * Get recent alerts
     * @param {number} limit - Maximum number of alerts to return
     * @returns {Array} - Recent alerts
     */
  getRecentAlerts(limit = 10) {
    return this.alertHistory.slice(-limit);
  }

  /**
     * Clean up old request history
     */
  cleanupOldRequests() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [requestId, request] of this.requestHistory.entries()) {
      if (now - request.startTime > maxAge) {
        this.requestHistory.delete(requestId);
      }
    }
  }

  /**
     * Calculate percentile
     * @param {Array} values - Array of values
     * @param {number} percentile - Percentile to calculate
     * @returns {number} - Percentile value
     */
  getPercentile(values, percentile) {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[index];
  }

  /**
     * Format bytes to human readable string
     * @param {number} bytes - Bytes to format
     * @returns {string} - Formatted string
     */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  }

  /**
     * Reset metrics
     */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      slowRequests: 0,
      memorySnapshots: []
    };
    this.alertHistory = [];
    this.requestHistory.clear();
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create performance monitor singleton
 * @param {object} options - Configuration options
 * @returns {PerformanceMonitor} - Performance monitor instance
 */
function getPerformanceMonitor(options) {
  if (!instance) {
    instance = new PerformanceMonitor(options);
  }
  return instance;
}

module.exports = { PerformanceMonitor, getPerformanceMonitor };
