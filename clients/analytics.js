/**
 * Analytics - Metrics collection and aggregation
 *
 * Provides:
 * - Query metrics tracking
 * - Per-model performance metrics
 * - Real-time metric updates
 * - Historical data aggregation
 */

class Analytics {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 1000;
    this.maxRetention = options.maxRetention || 24 * 60 * 60 * 1000; // 24 hours

    // Query history
    this.queryHistory = [];

    // Aggregated metrics
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cachedQueries: 0,
      progressiveResponses: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0
    };

    // Per-model metrics
    this.modelMetrics = new Map();

    // Hourly aggregation
    this.hourlyMetrics = new Map();

    // WebSocket clients for real-time updates
    this.clients = new Set();
  }

  /**
     * Record query execution
     * @param {object} record - Query record
     */
  recordQuery(record) {
    const now = Date.now();
    const rec = {
      queryId: record.queryId || this.generateId(),
      userId: record.userId || 'unknown',
      sessionId: record.sessionId || 'unknown',
      query: record.query || '',
      response: record.response || '',
      intent: record.intent || 'Unknown',
      model: record.model || 'unknown',
      cached: record.cached || false,
      success: record.success !== false,
      duration: record.duration || 0,
      complexity: record.complexity || 0,
      timestamp: now
    };

    // Add to history
    this.queryHistory.push(rec);
    if (this.queryHistory.length > this.maxHistory) {
      this.queryHistory.shift();
    }

    // Update metrics
    this.updateMetrics(rec);

    // Update model metrics
    this.updateModelMetrics(rec);

    // Update hourly metrics
    this.updateHourlyMetrics(rec);

    // Notify clients
    this.notifyClients({
      type: 'query',
      data: rec
    });

    return rec;
  }

  /**
     * Update aggregated metrics
     * @param {object} record - Query record
     */
  updateMetrics(record) {
    this.metrics.totalQueries++;

    if (!record.cached) {
      if (record.success) {
        this.metrics.successfulQueries++;
      } else {
        this.metrics.failedQueries++;
      }
    }

    if (record.cached) {
      this.metrics.cachedQueries++;
    }

    if (!record.cached) {
      this.metrics.totalResponseTime += record.duration;
    }

    // Calculate averages (exclude cached queries)
    const responseSamples = this.metrics.totalQueries - this.metrics.cachedQueries;
    this.metrics.avgResponseTime = responseSamples > 0
      ? this.metrics.totalResponseTime / responseSamples
      : 0;

    // Calculate percentiles
    this.calculatePercentiles();

    // Calculate rates
    this.metrics.errorRate = (this.metrics.failedQueries / this.metrics.totalQueries) * 100;
    this.metrics.cacheHitRate = (this.metrics.cachedQueries / this.metrics.totalQueries) * 100;
  }

  /**
     * Update per-model metrics
     * @param {object} record - Query record
     */
  updateModelMetrics(record) {
    const model = record.model;
    if (!this.modelMetrics.has(model)) {
      this.modelMetrics.set(model, {
        model,
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        totalResponseTime: 0,
        avgResponseTime: 0,
        successRate: 0
      });
    }

    const metrics = this.modelMetrics.get(model);
    metrics.totalQueries++;

    if (record.success) {
      metrics.successfulQueries++;
    } else {
      metrics.failedQueries++;
    }

    metrics.totalResponseTime += record.duration;
    metrics.avgResponseTime = metrics.totalQueries > 0
      ? metrics.totalResponseTime / metrics.totalQueries
      : 0;
    metrics.successRate = metrics.totalQueries > 0
      ? (metrics.successfulQueries / metrics.totalQueries) * 100
      : 0;
  }

  /**
     * Update hourly metrics
     * @param {object} record - Query record
     */
  updateHourlyMetrics(record) {
    const now = Date.now();
    const hourKey = Math.floor(now / (60 * 60 * 1000));

    if (!this.hourlyMetrics.has(hourKey)) {
      this.hourlyMetrics.set(hourKey, {
        hour: hourKey,
        timestamp: hourKey * 60 * 60 * 1000,
        totalQueries: 0,
        successfulQueries: 0,
        avgResponseTime: 0
      });
    }

    const metrics = this.hourlyMetrics.get(hourKey);
    metrics.totalQueries++;
    if (record.success) {
      metrics.successfulQueries++;
    }

    // Clean old hourly metrics
    this.cleanupOldMetrics();
  }

  /**
     * Calculate response time percentiles
     */
  calculatePercentiles() {
    if (this.queryHistory.length === 0) return;

    const durations = this.queryHistory
      .map(r => r.duration)
      .sort((a, b) => a - b);

    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    this.metrics.p50ResponseTime = durations[p50Index] || 0;
    this.metrics.p95ResponseTime = durations[p95Index] || 0;
    this.metrics.p99ResponseTime = durations[p99Index] || 0;
  }

  /**
     * Clean up old metrics
     */
  cleanupOldMetrics() {
    const now = Date.now();
    const cutoff = now - this.maxRetention;

    // Clean hourly metrics
    for (const [key, metrics] of this.hourlyMetrics.entries()) {
      if (metrics.timestamp < cutoff) {
        this.hourlyMetrics.delete(key);
      }
    }

    // Clean query history
    this.queryHistory = this.queryHistory.filter(r => r.timestamp > cutoff);
  }

  /**
     * Get current metrics
     * @returns {object} - Metrics object
     */
  getMetrics() {
    return {
      ...this.metrics,
      modelMetrics: Array.from(this.modelMetrics.values()),
      activeModels: this.modelMetrics.size,
      historySize: this.queryHistory.length
    };
  }

  /**
     * Get query history
     * @param {object} options - Query options
     * @returns {Array} - Query history
     */
  getHistory(options = {}) {
    const {
      limit = 100,
      offset = 0,
      userId = null,
      sessionId = null,
      model = null,
      success = null
    } = options;

    let filtered = [...this.queryHistory];

    if (userId) {
      filtered = filtered.filter(r => r.userId === userId);
    }
    if (sessionId) {
      filtered = filtered.filter(r => r.sessionId === sessionId);
    }
    if (model) {
      filtered = filtered.filter(r => r.model === model);
    }
    if (success !== null) {
      filtered = filtered.filter(r => r.success === success);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return {
      total: filtered.length,
      data: filtered.slice(offset, offset + limit)
    };
  }

  /**
     * Get hourly metrics
     * @param {number} hours - Number of hours to return
     * @returns {Array} - Hourly metrics
     */
  getHourlyMetrics(hours = 24) {
    const now = Date.now();
    const cutoff = now - (hours * 60 * 60 * 1000);

    return Array.from(this.hourlyMetrics.values())
      .filter(m => m.timestamp > cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
     * Get top queries
     * @param {number} limit - Number of queries
     * @returns {Array} - Top queries
     */
  getTopQueries(limit = 10) {
    const queryCounts = new Map();

    for (const record of this.queryHistory) {
      const query = record.query.toLowerCase();
      queryCounts.set(query, (queryCounts.get(query) || 0) + 1);
    }

    return Array.from(queryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  /**
     * Get intent distribution
     * @returns {Array} - Intent distribution
     */
  getIntentDistribution() {
    const intentCounts = new Map();

    for (const record of this.queryHistory) {
      const intent = record.intent || 'Unknown';
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    }

    const total = Array.from(intentCounts.values()).reduce((a, b) => a + b, 0);

    return Array.from(intentCounts.entries()).map(([intent, count]) => ({
      intent,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    }));
  }

  /**
     * Register WebSocket client
     * @param {WebSocket} ws - WebSocket connection
     */
  registerClient(ws) {
    this.clients.add(ws);

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    // Send initial metrics
    this.sendToClient(ws, {
      type: 'metrics',
      data: this.getMetrics()
    });
  }

  /**
     * Notify all clients
     * @param {object} message - Message to send
     */
  notifyClients(message) {
    const data = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        try {
          client.send(data);
        } catch (err) {
          console.error('Error sending to client:', err);
        }
      }
    }
  }

  /**
     * Send to specific client
     * @param {WebSocket} ws - WebSocket connection
     * @param {object} message - Message to send
     */
  sendToClient(ws, message) {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        console.error('Error sending to client:', err);
      }
    }
  }

  /**
     * Generate unique ID
     * @returns {string} - Unique ID
     */
  generateId() {
    return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
     * Reset metrics
     */
  reset() {
    this.queryHistory = [];
    this.metrics = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cachedQueries: 0,
      progressiveResponses: 0,
      totalResponseTime: 0,
      avgResponseTime: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0
    };
    this.modelMetrics.clear();
    this.hourlyMetrics.clear();
  }

  /**
     * Export analytics data
     * @returns {object} - Export data
     */
  export() {
    return {
      metrics: this.getMetrics(),
      history: this.getHistory({ limit: this.maxHistory }),
      hourlyMetrics: this.getHourlyMetrics(24),
      topQueries: this.getTopQueries(20),
      intentDistribution: this.getIntentDistribution(),
      exportedAt: new Date().toISOString()
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create analytics singleton
 * @param {object} options - Configuration options
 * @returns {Analytics} - Analytics instance
 */
function getAnalytics(options) {
  if (!instance) {
    instance = new Analytics(options);
  }
  return instance;
}

module.exports = { Analytics, getAnalytics };
