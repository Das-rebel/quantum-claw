/**
 * Performance Optimizer
 * Provides utilities for optimizing application performance
 * - Memory management
 * - Cache optimization
 * - Response optimization
 * - Garbage collection hints
 */

const v8 = require('v8');
const { getPerformanceMonitor } = require('./performance_monitor');
const { getCacheManager } = require('./cache_manager');

class PerformanceOptimizer {
  constructor(options = {}) {
    this.memoryThreshold = options.memoryThreshold || 256 * 1024 * 1024; // 256MB
    this.responseTimeThreshold = options.responseTimeThreshold || 3000; // 3 seconds
    this.gcThreshold = options.gcThreshold || 0.8; // Trigger GC at 80% memory
    this.autoGC = options.autoGC !== false;

    this.performanceMonitor = getPerformanceMonitor(options);
    this.cacheManager = getCacheManager();

    if (this.autoGC) {
      this.startGCMonitoring();
    }

    console.log('⚡ Performance Optimizer initialized');
    console.log(`   Memory threshold: ${(this.memoryThreshold / 1024 / 1024).toFixed(0)}MB`);
    console.log(`   Response time threshold: ${this.responseTimeThreshold}ms`);
    console.log(`   Auto GC: ${this.autoGC ? 'enabled' : 'disabled'}`);
  }

  /**
     * Start garbage collection monitoring
     */
  startGCMonitoring() {
    this.gcInterval = setInterval(() => {
      this.checkAndTriggerGC();
    }, 30000); // Check every 30 seconds
  }

  /**
     * Stop garbage collection monitoring
     */
  stopGCMonitoring() {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }

  /**
     * Check memory usage and trigger GC if needed
     */
  checkAndTriggerGC() {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    const heapUsedPercent = memoryUsage.heapUsed / heapStats.heap_size_limit;

    if (heapUsedPercent > this.gcThreshold) {
      console.log(`🗑️  Memory usage at ${(heapUsedPercent * 100).toFixed(1)}%, triggering GC...`);

      if (global.gc) {
        global.gc();
        const memoryAfter = process.memoryUsage();
        const memorySaved = memoryUsage.heapUsed - memoryAfter.heapUsed;
        console.log(`   GC complete, saved ${(memorySaved / 1024 / 1024).toFixed(2)}MB`);
      } else {
        console.warn('⚠️  global.gc() not available. Run with --expose-gc flag');
      }

      // Optimize cache if memory is high
      this.optimizeCache();
    }
  }

  /**
     * Optimize cache based on performance metrics
     */
  optimizeCache() {
    const stats = this.cacheManager.getStats();
    const memoryUsage = process.memoryUsage();

    // Reduce cache size if memory pressure is high
    if (memoryUsage.heapUsed > this.memoryThreshold * 0.9) {
      console.log('🗑️  Reducing cache size due to memory pressure');
      const cacheSize = this.cacheManager.cache.size;
      const targetSize = Math.floor(cacheSize * 0.7);

      // Evict oldest entries
      let evicted = 0;
      while (this.cacheManager.cache.size > targetSize) {
        this.cacheManager.evictLRU();
        evicted++;
      }

      console.log(`   Evicted ${evicted} cache entries`);
    }

    // Optimize cache TTL based on hit rate
    if (stats.hitRate < 50) {
      console.log('⚠️  Low cache hit rate, consider adjusting TTL');
    }
  }

  /**
     * Optimize response for voice delivery
     * @param {string} text - Response text
     * @param {object} options - Optimization options
     * @returns {string} - Optimized text
     */
  optimizeResponseForVoice(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let optimized = text;

    // Remove markdown and formatting
    optimized = optimized.replace(/#{1,6}\s/g, ''); // Remove headers
    optimized = optimized.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold
    optimized = optimized.replace(/\*([^*]+)\*/g, '$1'); // Remove italic
    optimized = optimized.replace(/`([^`]+)`/g, '$1'); // Remove inline code

    // Limit word count for voice
    const maxWords = options.maxWords || 150;
    const words = optimized.split(/\s+/);

    if (words.length > maxWords) {
      optimized = words.slice(0, maxWords).join(' ') + '...';
      console.log(`✂️  Response truncated to ${maxWords} words for voice`);
    }

    // Add natural pauses for long sentences
    optimized = optimized.replace(/\. /g, '. ');
    optimized = optimized.replace(/, and /g, ', and ');

    // Replace technical terms with simpler alternatives
    optimized = this.simplifyTechnicalTerms(optimized);

    return optimized.trim();
  }

  /**
     * Simplify technical terms for voice delivery
     * @param {string} text - Text to simplify
     * @returns {string} - Simplified text
     */
  simplifyTechnicalTerms(text) {
    const replacements = {
      'API': 'A P I',
      'HTTP': 'H T T P',
      'HTTPS': 'H T T P S',
      'JSON': 'J son',
      'SQL': 'S Q L',
      'URL': 'U R L',
      'AI': 'A I',
      'ML': 'M L',
      'NLP': 'N L P',
      'IoT': 'I O T',
      'CPU': 'C P U',
      'GPU': 'G P U',
      'RAM': 'R A M',
      'SSD': 'S S D',
      'HDD': 'H D D',
      'KB': 'kilobytes',
      'MB': 'megabytes',
      'GB': 'gigabytes',
      'TB': 'terabytes'
    };

    let simplified = text;

    for (const [term, replacement] of Object.entries(replacements)) {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      simplified = simplified.replace(regex, replacement);
    }

    return simplified;
  }

  /**
     * Get performance recommendations
     * @returns {Array} - Array of recommendations
     */
  getPerformanceRecommendations() {
    const recommendations = [];
    const metrics = this.performanceMonitor.getMetrics();
    const cacheStats = this.cacheManager.getStats();
    const memoryUsage = process.memoryUsage();

    // Check response time
    if (metrics.responseTime.p95 > this.responseTimeThreshold) {
      recommendations.push({
        type: 'warning',
        issue: 'Slow response times',
        recommendation: 'Consider enabling caching or using faster providers',
        metric: `p95: ${metrics.responseTime.p95}ms > ${this.responseTimeThreshold}ms`
      });
    }

    // Check memory usage
    if (memoryUsage.heapUsed > this.memoryThreshold * 0.8) {
      recommendations.push({
        type: 'warning',
        issue: 'High memory usage',
        recommendation: 'Reduce cache size or increase memory threshold',
        metric: `heapUsed: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB > ${(this.memoryThreshold * 0.8 / 1024 / 1024).toFixed(0)}MB`
      });
    }

    // Check cache hit rate
    if (cacheStats.hitRate < 50) {
      recommendations.push({
        type: 'info',
        issue: 'Low cache hit rate',
        recommendation: 'Consider increasing cache TTL or size',
        metric: `hitRate: ${cacheStats.hitRate}% < 50%`
      });
    }

    // Check memory leak
    if (metrics.memoryLeak.detected) {
      recommendations.push({
        type: 'error',
        issue: 'Potential memory leak detected',
        recommendation: 'Investigate and fix memory leaks. Consider restarting server.',
        metric: `growthRate: ${metrics.memoryLeak.growthRate.toFixed(2)}`
      });
    }

    // Check slow requests
    if (metrics.slowRequests.count > 0) {
      recommendations.push({
        type: 'warning',
        issue: 'Slow requests detected',
        recommendation: 'Review slow request logs and optimize',
        metric: `count: ${metrics.slowRequests.count}, rate: ${metrics.slowRequests.rate}`
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        issue: 'Performance is good',
        recommendation: 'Continue monitoring performance metrics',
        metric: 'All metrics within acceptable ranges'
      });
    }

    return recommendations;
  }

  /**
     * Get comprehensive performance report
     * @returns {object} - Performance report
     */
  getPerformanceReport() {
    const metrics = this.performanceMonitor.getMetrics();
    const cacheStats = this.cacheManager.getStats();
    const memoryUsage = process.memoryUsage();
    const recommendations = this.getPerformanceRecommendations();

    return {
      timestamp: new Date().toISOString(),
      summary: {
        status: recommendations.some(r => r.type === 'error') ? 'critical' :
          recommendations.some(r => r.type === 'warning') ? 'warning' :
            'healthy',
        totalRecommendations: recommendations.length,
        criticalIssues: recommendations.filter(r => r.type === 'error').length,
        warnings: recommendations.filter(r => r.type === 'warning').length
      },
      metrics: {
        responseTime: metrics.responseTime,
        memory: metrics.memory,
        requests: metrics.requests,
        slowRequests: metrics.slowRequests
      },
      cache: cacheStats,
      recommendations
    };
  }

  /**
     * Optimize async function execution
     * @param {Function} fn - Async function to optimize
     * @param {object} options - Optimization options
     * @returns {Function} - Optimized function
     */
  optimizeAsync(fn, options = {}) {
    return async (...args) => {
      const requestId = `req_${Date.now()}_${Math.random()}`;
      this.performanceMonitor.recordRequestStart(requestId, {
        function: fn.name || 'anonymous'
      });

      try {
        const result = await fn(...args);

        // Optimize result if it's a text response
        if (typeof result === 'string' && options.optimizeForVoice) {
          return this.optimizeResponseForVoice(result, options);
        }

        return result;
      } catch (error) {
        this.performanceMonitor.recordRequestEnd(requestId, false, {
          error: error.message
        });
        throw error;
      } finally {
        this.performanceMonitor.recordRequestEnd(requestId, true);
      }
    };
  }

  /**
     * Create a performance-optimized wrapper for API calls
     * @param {string} provider - Provider name
     * @param {Function} apiCall - API call function
     * @returns {Function} - Optimized API call
     */
  createOptimizedAPICall(provider, apiCall) {
    return async (...args) => {
      const requestId = `${provider}_${Date.now()}_${Math.random()}`;
      this.performanceMonitor.recordRequestStart(requestId, {
        provider,
        type: 'api_call'
      });

      try {
        const startTime = Date.now();
        const result = await apiCall(...args);
        const responseTime = Date.now() - startTime;

        // Check for slow API calls
        if (responseTime > this.responseTimeThreshold) {
          console.warn(`⚠️  Slow API call to ${provider}: ${responseTime}ms`);
        }

        return result;
      } catch (error) {
        this.performanceMonitor.recordRequestEnd(requestId, false, {
          error: error.message
        });
        throw error;
      } finally {
        this.performanceMonitor.recordRequestEnd(requestId, true);
      }
    };
  }

  /**
     * Cleanup resources
     */
  destroy() {
    this.stopGCMonitoring();
    this.performanceMonitor.stopMonitoring();
    console.log('🗑️  Performance Optimizer destroyed');
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create performance optimizer singleton
 * @param {object} options - Configuration options
 * @returns {PerformanceOptimizer} - Performance optimizer instance
 */
function getPerformanceOptimizer(options) {
  if (!instance) {
    instance = new PerformanceOptimizer(options);
  }
  return instance;
}

module.exports = { PerformanceOptimizer, getPerformanceOptimizer };
