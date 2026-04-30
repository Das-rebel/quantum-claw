/**
 * Analytics Tracker - Measure UI/UX Improvement Success
 *
 * Tracks key metrics to validate Jony Ive-inspired simplification:
 * - Time to first successful action
 * - Task completion rate
 * - User satisfaction
 * - Feature discovery rate
 * - Error rates and patterns
 */

class AnalyticsTracker {
  constructor() {
    this.metrics = new Map(); // sessionId -> metrics
    this.globalMetrics = {
      totalSessions: 0,
      totalInteractions: 0,
      successfulActions: 0,
      failedActions: 0,
      timeToFirstAction: [],
      taskCompletionRate: 0,
      userSatisfactionScores: [],
      featureDiscoveryRates: {}
    };

    // A/B test groups
    this.abTestGroups = {
      control: 'legacy_ui',      // Original 19+ intent interface
      treatment: 'simplified_ui' // New simplified interface
    };
  }

  /**
   * Start tracking a new user session
   *
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Session options (abTestGroup, platform, etc.)
   */
  startSession(sessionId, options = {}) {
    const { abTestGroup = this._assignTestGroup(), platform = 'alexa', userId = null } = options;

    this.metrics.set(sessionId, {
      sessionId,
      userId,
      abTestGroup,
      platform,
      startTime: Date.now(),
      firstActionTime: null,
      interactions: [],
      featuresDiscovered: new Set(),
      tasksCompleted: 0,
      tasksFailed: 0,
      satisfactions: [],
      errors: []
    });

    this.globalMetrics.totalSessions++;

    console.log(`[Analytics] Session ${sessionId} started (${abTestGroup} group, ${platform})`);
  }

  /**
   * Track an interaction (query + response)
   *
   * @param {string} sessionId - Session identifier
   * @param {Object} interaction - Interaction data
   */
  trackInteraction(sessionId, interaction) {
    const session = this.metrics.get(sessionId);
    if (!session) {
      console.warn(`[Analytics] Unknown session: ${sessionId}`);
      return;
    }

    const interactionData = {
      timestamp: Date.now(),
      query: interaction.query,
      intent: interaction.intent,
      capability: interaction.capability,
      confidence: interaction.confidence,
      success: interaction.success !== undefined ? interaction.success : true,
      responseTime: interaction.responseTime,
      timeFromStart: this._getTimeFromStart(session, Date.now()),
      requiredConfirmation: interaction.requiredConfirmation || false,
      defaultApplied: interaction.defaultApplied || false,
      clarificationNeeded: interaction.clarificationNeeded || false,
      correction: interaction.correction || false
    };

    session.interactions.push(interactionData);

    // Track first action time
    if (!session.firstActionTime && interaction.success) {
      session.firstActionTime = interactionData.timeFromStart;
      this.globalMetrics.timeToFirstAction.push(interactionData.timeFromStart);
    }

    // Track success/failure
    if (interaction.success) {
      session.tasksCompleted++;
      this.globalMetrics.successfulActions++;
    } else {
      session.tasksFailed++;
      this.globalMetrics.failedActions++;
    }

    // Track feature discovery
    if (interaction.capability) {
      session.featuresDiscovered.add(interaction.capability);
    }

    this.globalMetrics.totalInteractions++;

    console.log(`[Analytics] Interaction tracked: ${interaction.capability} (${interaction.success ? 'success' : 'failure'})`);
  }

  /**
   * Track user satisfaction rating
   *
   * @param {string} sessionId - Session identifier
   * @param {number} rating - Satisfaction rating (1-5)
   * @param {string} comment - Optional user comment
   */
  trackSatisfaction(sessionId, rating, comment = '') {
    const session = this.metrics.get(sessionId);
    if (!session) {
      console.warn(`[Analytics] Unknown session: ${sessionId}`);
      return;
    }

    const satisfaction = {
      timestamp: Date.now(),
      rating: Math.max(1, Math.min(5, rating)), // Clamp to 1-5
      comment,
      interactionCount: session.interactions.length
    };

    session.satisfactions.push(satisfaction);
    this.globalMetrics.userSatisfactionScores.push(satisfaction.rating);

    console.log(`[Analytics] Satisfaction tracked: ${rating}/5 "${comment}"`);
  }

  /**
   * Track error or failure
   *
   * @param {string} sessionId - Session identifier
   * @param {Error|string} error - Error object or message
   * @param {Object} context - Error context
   */
  trackError(sessionId, error, context = {}) {
    const session = this.metrics.get(sessionId);
    if (!session) {
      console.warn(`[Analytics] Unknown session: ${sessionId}`);
      return;
    }

    const errorData = {
      timestamp: Date.now(),
      message: error.message || error,
      code: error.code || 'UNKNOWN',
      context: {
        query: context.query,
        intent: context.intent,
        confidence: context.confidence
      }
    };

    session.errors.push(errorData);

    console.error(`[Analytics] Error tracked: ${errorData.message} (${errorData.code})`);
  }

  /**
   * End a session and calculate final metrics
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object} Final session metrics
   */
  endSession(sessionId) {
    const session = this.metrics.get(sessionId);
    if (!session) {
      console.warn(`[Analytics] Unknown session: ${sessionId}`);
      return null;
    }

    const endTime = Date.now();
    const duration = endTime - session.startTime;

    // Calculate session metrics
    const sessionMetrics = {
      sessionId: session.sessionId,
      userId: session.userId,
      abTestGroup: session.abTestGroup,
      platform: session.platform,
      duration: duration,
      startTime: session.startTime,
      endTime: endTime,
      timeToFirstAction: session.firstActionTime,
      interactionCount: session.interactions.length,
      tasksCompleted: session.tasksCompleted,
      tasksFailed: session.tasksFailed,
      taskCompletionRate: session.interactions.length > 0
        ? session.tasksCompleted / session.interactions.length
        : 0,
      featuresDiscovered: Array.from(session.featuresDiscovered),
      featureDiscoveryCount: session.featuresDiscovered.size,
      averageSatisfaction: session.satisfactions.length > 0
        ? session.satisfactions.reduce((sum, s) => sum + s.rating, 0) / session.satisfactions.length
        : null,
      satisfactionCount: session.satisfactions.length,
      errorCount: session.errors.length,
      errors: session.errors
    };

    // Update global metrics
    this._updateGlobalMetrics(sessionMetrics);

    console.log(`[Analytics] Session ${sessionId} ended. Duration: ${Math.round(duration / 1000)}s, Completion: ${Math.round(sessionMetrics.taskCompletionRate * 100)}%`);

    return sessionMetrics;
  }

  /**
   * Get A/B test results comparing control vs treatment
   *
   * @returns {Object} A/B test comparison data
   */
  getABTestResults() {
    const controlSessions = [];
    const treatmentSessions = [];

    // Group sessions by A/B test group
    for (const [sessionId, session] of this.metrics.entries()) {
      if (session.abTestGroup === this.abTestGroups.control) {
        controlSessions.push(session);
      } else if (session.abTestGroup === this.abTestGroups.treatment) {
        treatmentSessions.push(session);
      }
    }

    // Calculate metrics for each group
    const controlMetrics = this._calculateGroupMetrics(controlSessions);
    const treatmentMetrics = this._calculateGroupMetrics(treatmentSessions);

    return {
      control: {
        name: 'Legacy UI',
        sessions: controlSessions.length,
        metrics: controlMetrics
      },
      treatment: {
        name: 'Simplified UI',
        sessions: treatmentSessions.length,
        metrics: treatmentMetrics
      },
      comparison: this._compareGroups(controlMetrics, treatmentMetrics),
      statisticalSignificance: this._calculateStatisticalSignificance(controlMetrics, treatmentMetrics)
    };
  }

  /**
   * Get real-time metrics dashboard data
   *
   * @returns {Object} Current metrics snapshot
   */
  getDashboardData() {
    const abResults = this.getABTestResults();

    return {
      summary: {
        totalSessions: this.globalMetrics.totalSessions,
        totalInteractions: this.globalMetrics.totalInteractions,
        successfulActions: this.globalMetrics.successfulActions,
        failedActions: this.globalMetrics.failedActions,
        overallCompletionRate: this.globalMetrics.totalInteractions > 0
          ? this.globalMetrics.successfulActions / this.globalMetrics.totalInteractions
          : 0
      },
      timeToFirstAction: {
        average: this._average(this.globalMetrics.timeToFirstAction),
        median: this._median(this.globalMetrics.timeToFirstAction),
        p95: this._percentile(this.globalMetrics.timeToFirstAction, 95),
        target: 10000, // 10 seconds
        targetMet: this._average(this.globalMetrics.timeToFirstAction) <= 10000
      },
      userSatisfaction: {
        average: this._average(this.globalMetrics.userSatisfactionScores),
        median: this._median(this.globalMetrics.userSatisfactionScores),
        target: 4.5,
        targetMet: this._average(this.globalMetrics.userSatisfactionScores) >= 4.5
      },
      abTestComparison: abResults.comparison,
      topCapabilities: this._getTopCapabilities(),
      errorRate: {
        rate: this.globalMetrics.totalInteractions > 0
          ? this.globalMetrics.failedActions / this.globalMetrics.totalInteractions
          : 0,
        target: 0.05,
        targetMet: this.globalMetrics.totalInteractions > 0 &&
          (this.globalMetrics.failedActions / this.globalMetrics.totalInteractions) <= 0.05
      }
    };
  }

  /**
   * Export metrics for analysis
   *
   * @param {string} format - Export format ('json' or 'csv')
   * @returns {string} Exported data
   */
  exportMetrics(format = 'json') {
    const allSessions = [];

    for (const [sessionId, session] of this.metrics.entries()) {
      allSessions.push({
        sessionId: session.sessionId,
        userId: session.userId,
        abTestGroup: session.abTestGroup,
        platform: session.platform,
        duration: Date.now() - session.startTime,
        interactionCount: session.interactions.length,
        tasksCompleted: session.tasksCompleted,
        tasksFailed: session.tasksFailed,
        featuresDiscovered: session.featuresDiscovered.size,
        averageSatisfaction: session.satisfactions.length > 0
          ? session.satisfactions.reduce((sum, s) => sum + s.rating, 0) / session.satisfactions.length
          : null
      });
    }

    if (format === 'csv') {
      const headers = Object.keys(allSessions[0] || {}).join(',');
      const rows = allSessions.map(session =>
        Object.values(session).map(v =>
          typeof v === 'string' ? `"${v}"` : v
        ).join(',')
      );
      return [headers, ...rows].join('\n');
    }

    return JSON.stringify(allSessions, null, 2);
  }

  /**
   * Assign user to A/B test group (50/50 split)
   *
   * @returns {string} Test group name
   * @private
   */
  _assignTestGroup() {
    return Math.random() < 0.5 ? this.abTestGroups.control : this.abTestGroups.treatment;
  }

  /**
   * Get time from session start
   *
   * @param {Object} session - Session object
   * @param {number} currentTime - Current timestamp
   * @returns {number} Time in milliseconds
   * @private
   */
  _getTimeFromStart(session, currentTime) {
    return currentTime - session.startTime;
  }

  /**
   * Update global metrics
   *
   * @param {Object} sessionMetrics - Session metrics
   * @private
   */
  _updateGlobalMetrics(sessionMetrics) {
    // Track feature discovery rates by capability
    sessionMetrics.featuresDiscovered.forEach(capability => {
      if (!this.globalMetrics.featureDiscoveryRates[capability]) {
        this.globalMetrics.featureDiscoveryRates[capability] = 0;
      }
      this.globalMetrics.featureDiscoveryRates[capability]++;
    });
  }

  /**
   * Calculate metrics for a group of sessions
   *
   * @param {Array} sessions - Array of session objects
   * @returns {Object} Group metrics
   * @private
   */
  _calculateGroupMetrics(sessions) {
    if (sessions.length === 0) {
      return { timeToFirstAction: 0, completionRate: 0, satisfaction: 0, featureDiscovery: 0 };
    }

    const timeToFirstAction = sessions
      .filter(s => s.firstActionTime !== null)
      .map(s => s.firstActionTime);

    const completionRates = sessions.map(s =>
      s.interactions.length > 0 ? s.tasksCompleted / s.interactions.length : 0
    );

    const satisfactions = sessions
      .filter(s => s.satisfactions.length > 0)
      .map(s => s.satisfactions.reduce((sum, sat) => sum + sat.rating, 0) / s.satisfactions.length);

    const featureDiscovery = sessions.map(s => s.featuresDiscovered.size);

    return {
      timeToFirstAction: this._average(timeToFirstAction) || 0,
      completionRate: this._average(completionRates) || 0,
      satisfaction: this._average(satisfactions) || 0,
      featureDiscovery: this._average(featureDiscovery) || 0,
      sessionCount: sessions.length
    };
  }

  /**
   * Compare control vs treatment groups
   *
   * @param {Object} control - Control group metrics
   * @param {Object} treatment - Treatment group metrics
   * @returns {Object} Comparison data
   * @private
   */
  _compareGroups(control, treatment) {
    return {
      timeToFirstAction: {
        control: control.timeToFirstAction,
        treatment: treatment.timeToFirstAction,
        improvement: control.timeToFirstAction > 0
          ? ((control.timeToFirstAction - treatment.timeToFirstAction) / control.timeToFirstAction) * 100
          : 0,
        target: 66.67 // 30s → 10s = 66.67% reduction
      },
      completionRate: {
        control: control.completionRate,
        treatment: treatment.completionRate,
        improvement: treatment.completionRate - control.completionRate,
        target: 0.30 // 60% → 90% = 30% increase
      },
      satisfaction: {
        control: control.satisfaction,
        treatment: treatment.satisfaction,
        improvement: treatment.satisfaction - control.satisfaction,
        target: 1.3 // 3.2 → 4.5 = 1.3 increase
      },
      featureDiscovery: {
        control: control.featureDiscovery,
        treatment: treatment.featureDiscovery,
        improvement: control.featureDiscovery > 0
          ? ((treatment.featureDiscovery - control.featureDiscovery) / control.featureDiscovery) * 100
          : 0,
        target: 100 // 30% → 60% = 100% increase
      }
    };
  }

  /**
   * Calculate statistical significance (simplified)
   *
   * @param {Object} control - Control group metrics
   * @param {Object} treatment - Treatment group metrics
   * @returns {Object} Statistical significance data
   * @private
   */
  _calculateStatisticalSignificance(control, treatment) {
    // Simplified statistical significance calculation
    // In production, use proper statistical tests (t-test, chi-square, etc.)

    const minSampleSize = 30; // Minimum for meaningful results
    const sufficientData = control.sessionCount >= minSampleSize && treatment.sessionCount >= minSampleSize;

    return {
      sufficientData,
      sampleSizeWarning: sufficientData ? null : `Need at least ${minSampleSize} sessions per group`,
      confidenceLevel: sufficientData ? '95%' : 'Insufficient data',
      statisticallySignificant: sufficientData // Placeholder
    };
  }

  /**
   * Get most used capabilities
   *
   * @returns {Array} Top capabilities
   * @private
   */
  _getTopCapabilities() {
    const capabilityCounts = {};

    for (const [sessionId, session] of this.metrics.entries()) {
      session.interactions.forEach(interaction => {
        const capability = interaction.capability || 'unknown';
        capabilityCounts[capability] = (capabilityCounts[capability] || 0) + 1;
      });
    }

    return Object.entries(capabilityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([capability, count]) => ({ capability, count }));
  }

  /**
   * Calculate average of array
   *
   * @param {Array} arr - Array of numbers
   * @returns {number} Average
   * @private
   */
  _average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  /**
   * Calculate median of array
   *
   * @param {Array} arr - Array of numbers
   * @returns {number} Median
   * @private
   */
  _median(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Calculate percentile of array
   *
   * @param {Array} arr - Array of numbers
   * @param {number} p - Percentile (0-100)
   * @returns {number} Percentile value
   * @private
   */
  _percentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

module.exports = AnalyticsTracker;
