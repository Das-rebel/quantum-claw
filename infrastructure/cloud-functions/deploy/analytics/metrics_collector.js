/**
 * Metrics Collector - Integration with Cloud Functions
 *
 * Bridges OmniClaw 2.0 systems with analytics and feature flags:
 * - Automatic session tracking
 * - Interaction metrics collection
 * - A/B test group assignment
 * - Feature flag checks
 * - Dashboard data aggregation
 */

const AnalyticsTracker = require('./analytics_tracker');
const FeatureFlags = require('./feature_flags');
const UserJourneyTracker = require('./user_journey_tracker');

class MetricsCollector {
  constructor() {
    this.analytics = new AnalyticsTracker();
    this.featureFlags = new FeatureFlags();
    this.journeyTracker = new UserJourneyTracker();

    // Configuration
    this.config = {
      enabled: true,
      samplingRate: 1.0, // Track 100% of interactions (adjust for high traffic)
      persistData: true, // Persist metrics to database
      alertThresholds: {
        errorRate: 0.10, // Alert if error rate > 10%
        responseTime: 5000, // Alert if P95 response time > 5s
        completionRate: 0.50 // Alert if completion rate < 50%
      }
    };

    // Alert callbacks
    this.alertCallbacks = [];
  }

  /**
   * Initialize a new session with analytics and A/B test assignment
   *
   * @param {Object} request - Incoming request object
   * @returns {Object} Session context with feature flags and A/B test group
   */
  initializeSession(request) {
    if (!this.config.enabled) {
      return { trackingEnabled: false };
    }

    const sessionId = this._generateSessionId();
    const userId = this._extractUserId(request);
    const platform = this._extractPlatform(request);

    // Determine A/B test group
    const abTestGroup = this.featureFlags.getABTestGroup('ui_simplification', userId);

    // Start analytics session
    this.analytics.startSession(sessionId, {
      abTestGroup,
      platform,
      userId
    });

    // Start user journey tracking
    this.journeyTracker.startJourney(sessionId, { userId, platform });

    // Check which features are enabled for this session
    const enabledFeatures = {
      simplified_ui: this.featureFlags.isEnabled('simplified_ui', { userId, platform, sessionId }),
      smart_router: this.featureFlags.isEnabled('smart_router', { userId, platform, sessionId }),
      progressive_disclosure: this.featureFlags.isEnabled('progressive_disclosure', { userId, platform, sessionId }),
      transparency_layer: this.featureFlags.isEnabled('transparency_layer', { userId, platform, sessionId }),
      smart_defaults: this.featureFlags.isEnabled('smart_defaults', { userId, platform, sessionId }),
      context_aware: this.featureFlags.isEnabled('context_aware', { userId, platform, sessionId })
    };

    const sessionContext = {
      sessionId,
      userId,
      platform,
      abTestGroup,
      enabledFeatures,
      trackingEnabled: true,
      startTime: Date.now()
    };

    console.log(`[MetricsCollector] Session initialized: ${sessionId} (${abTestGroup} group)`);

    return sessionContext;
  }

  /**
   * Track a query interaction
   *
   * @param {Object} sessionContext - Session context from initializeSession()
   * @param {Object} queryData - Query and routing data
   * @param {Object} responseData - Response data
   */
  trackQuery(sessionContext, queryData, responseData) {
    if (!sessionContext.trackingEnabled || !this.config.enabled) {
      return;
    }

    // Apply sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    const interaction = {
      query: queryData.query,
      intent: responseData.intent || queryData.intent,
      capability: responseData.capability || queryData.capability,
      confidence: responseData.confidence || 0.5,
      success: responseData.success !== undefined ? responseData.success : true,
      responseTime: responseData.responseTime || 0,
      requiredConfirmation: responseData.requiredConfirmation || false,
      defaultApplied: responseData.defaultApplied || false,
      clarificationNeeded: responseData.clarificationNeeded || false,
      correction: responseData.correction || false,
      featuresUsed: responseData.featuresUsed || []
    };

    this.analytics.trackInteraction(sessionContext.sessionId, interaction);

    // Record journey step for simplification tracking
    this.journeyTracker.recordStep(sessionContext.sessionId, {
      query: queryData.query,
      intent: responseData.intent || queryData.intent,
      capability: responseData.capability || queryData.capability,
      source: responseData.defaultApplied ? 'default' : 'direct',
      success: responseData.success !== undefined ? responseData.success : true,
      responseTime: responseData.responseTime || 0,
      defaultsApplied: responseData.defaultsApplied || [],
      correction: responseData.correction || false,
      clarificationNeeded: responseData.clarificationNeeded || false,
      confidence: responseData.confidence || 0.5
    });

    // Check for alerts
    this._checkForAlerts(sessionContext, interaction);
  }

  /**
   * Track user satisfaction rating
   *
   * @param {Object} sessionContext - Session context
   * @param {number} rating - Rating (1-5)
   * @param {string} comment - Optional comment
   */
  trackSatisfaction(sessionContext, rating, comment = '') {
    if (!sessionContext.trackingEnabled || !this.config.enabled) {
      return;
    }

    this.analytics.trackSatisfaction(sessionContext.sessionId, rating, comment);
  }

  /**
   * Track error or failure
   *
   * @param {Object} sessionContext - Session context
   * @param {Error|string} error - Error
   * @param {Object} context - Error context
   */
  trackError(sessionContext, error, context = {}) {
    if (!sessionContext.trackingEnabled || !this.config.enabled) {
      return;
    }

    this.analytics.trackError(sessionContext.sessionId, error, context);
  }

  /**
   * End session and get final metrics
   *
   * @param {Object} sessionContext - Session context
   * @returns {Object} Final session metrics
   */
  endSession(sessionContext) {
    if (!sessionContext.trackingEnabled || !this.config.enabled) {
      return null;
    }

    const metrics = this.analytics.endSession(sessionContext.sessionId);
    const journeySummary = this.journeyTracker.endJourney(sessionContext.sessionId);

    console.log(`[MetricsCollector] Session ended: ${sessionContext.sessionId}`);

    return {
      ...metrics,
      journey: journeySummary
    };
  }

  /**
   * Get dashboard data for monitoring
   *
   * @returns {Object} Dashboard metrics
   */
  getDashboardData() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    const dashboard = this.analytics.getDashboardData();
    const featureFlags = this.featureFlags.getAllFlags();
    const abTestStatus = this.featureFlags.getABTestStatus();

    return {
      ...dashboard,
      featureFlags,
      abTestStatus,
      config: {
        samplingRate: this.config.samplingRate,
        trackingEnabled: this.config.enabled
      }
    };
  }

  /**
   * Get A/B test results
   *
   * @returns {Object} A/B test comparison
   */
  getABTestResults() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    return this.analytics.getABTestResults();
  }

  /**
   * Get Jony Ive simplification validation report
   *
   * @returns {Object} Validation report for UI/UX simplification
   */
  getSimplificationValidationReport() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    return this.journeyTracker.getSimplificationValidationReport();
  }

  /**
   * Get feature discovery funnel
   *
   * @returns {Object} Discovery funnel data
   */
  getFeatureDiscoveryFunnel() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    return this.journeyTracker.getFeatureDiscoveryFunnel();
  }

  /**
   * Get platform comparison for journeys
   *
   * @returns {Object} Platform comparison data
   */
  getPlatformJourneyComparison() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    return this.journeyTracker.getPlatformComparison();
  }

  /**
   * Get time-to-value metrics
   *
   * @returns {Object} Time-to-value data
   */
  getTimeToValueMetrics() {
    if (!this.config.enabled) {
      return { enabled: false };
    }

    return this.journeyTracker.getTimeToValueMetrics();
  }

  /**
   * Export journey data for external analysis
   *
   * @param {string} format - Export format ('json' or 'csv')
   * @returns {string} Journey data
   */
  exportJourneyData(format = 'json') {
    if (!this.config.enabled) {
      return JSON.stringify({ enabled: false });
    }

    return this.journeyTracker.exportJourneyData(format);
  }

  /**
   * Export metrics for external analysis
   *
   * @param {string} format - Export format ('json' or 'csv')
   * @returns {string} Exported data
   */
  exportMetrics(format = 'json') {
    if (!this.config.enabled) {
      return JSON.stringify({ enabled: false });
    }

    return this.analytics.exportMetrics(format);
  }

  /**
   * Update feature flag (for admin/ops)
   *
   * @param {string} action - Action ('enable', 'disable', 'update_rollout')
   * @param {string} featureName - Feature name
   * @param {Object} params - Action parameters
   */
  updateFeatureFlag(action, featureName, params = {}) {
    switch (action) {
      case 'enable':
        this.featureFlags.enableFeature(featureName, params.rolloutPercentage);
        break;
      case 'disable':
        this.featureFlags.disableFeature(featureName);
        break;
      case 'update_rollout':
        this.featureFlags.updateRolloutPercentage(featureName, params.percentage);
        break;
      case 'whitelist_add':
        this.featureFlags.addToWhitelist(featureName, params.userId);
        break;
      case 'whitelist_remove':
        this.featureFlags.removeFromWhitelist(featureName, params.userId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Register alert callback
   *
   * @param {Function} callback - Alert callback function
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Generate unique session ID
   *
   * @returns {string} Session ID
   * @private
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Extract user ID from request
   *
   * @param {Object} request - Request object
   * @returns {string|null} User ID
   * @private
   */
  _extractUserId(request) {
    // Try various sources for user ID
    return request?.userId ||
           request?.user?.id ||
           request?.session?.user?.userId ||
           request?.body?.userId ||
           null;
  }

  /**
   * Extract platform from request
   *
   * @param {Object} request - Request object
   * @returns {string} Platform name
   * @private
   */
  _extractPlatform(request) {
    // Try to detect platform from request
    const userAgent = request?.headers?.['user-agent'] || '';
    const path = request?.path || '';

    if (path.includes('alexa') || userAgent.includes('Alexa')) {
      return 'alexa';
    }

    if (path.includes('whatsapp') || userAgent.includes('WhatsApp')) {
      return 'whatsapp';
    }

    if (userAgent.includes('Mozilla') || userAgent.includes('Chrome')) {
      return 'web';
    }

    return 'unknown';
  }

  /**
   * Check for alert conditions
   *
   * @param {Object} sessionContext - Session context
   * @param {Object} interaction - Interaction data
   * @private
   */
  _checkForAlerts(sessionContext, interaction) {
    const alerts = [];

    // Check error rate threshold
    if (!interaction.success) {
      const dashboard = this.analytics.getDashboardData();
      if (dashboard.errorRate && dashboard.errorRate.rate > this.config.alertThresholds.errorRate) {
        alerts.push({
          type: 'high_error_rate',
          severity: 'warning',
          message: `Error rate ${(dashboard.errorRate.rate * 100).toFixed(1)}% exceeds threshold ${(this.config.alertThresholds.errorRate * 100)}%`,
          metric: dashboard.errorRate.rate
        });
      }
    }

    // Check response time threshold
    if (interaction.responseTime > this.config.alertThresholds.responseTime) {
      alerts.push({
        type: 'slow_response',
        severity: 'warning',
        message: `Response time ${interaction.responseTime}ms exceeds threshold ${this.config.alertThresholds.responseTime}ms`,
        metric: interaction.responseTime
      });
    }

    // Check completion rate threshold
    const dashboard = this.analytics.getDashboardData();
    if (dashboard.summary && dashboard.summary.overallCompletionRate < this.config.alertThresholds.completionRate) {
      alerts.push({
        type: 'low_completion_rate',
        severity: 'critical',
        message: `Completion rate ${(dashboard.summary.overallCompletionRate * 100).toFixed(1)}% below threshold ${(this.config.alertThresholds.completionRate * 100)}%`,
        metric: dashboard.summary.overallCompletionRate
      });
    }

    // Trigger alert callbacks
    if (alerts.length > 0) {
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alerts, sessionContext);
        } catch (error) {
          console.error('[MetricsCollector] Alert callback error:', error);
        }
      });
    }
  }

  /**
   * Get health check status
   *
   * @returns {Object} Health status
   */
  healthCheck() {
    const dashboard = this.analytics.getDashboardData();

    return {
      status: 'healthy',
      trackingEnabled: this.config.enabled,
      totalSessions: this.analytics.globalMetrics.totalSessions,
      totalInteractions: this.analytics.globalMetrics.totalInteractions,
      errorRate: dashboard.errorRate?.rate || 0,
      completionRate: dashboard.summary?.overallCompletionRate || 0,
      featureFlagsEnabled: Object.values(this.featureFlags.flags).filter(f => f.enabled).length,
      abTestsActive: Object.values(this.featureFlags.abTests).filter(t => t.enabled).length
    };
  }

  /**
   * Reset all metrics (for testing/debugging)
   *
   * @param {boolean} confirm - Confirmation flag
   */
  resetMetrics(confirm = false) {
    if (!confirm) {
      throw new Error('Must confirm metric reset with confirm=true');
    }

    this.analytics = new AnalyticsTracker();
    this.journeyTracker = new UserJourneyTracker();
    console.log('[MetricsCollector] Metrics reset');
  }
}

// Singleton instance
let collectorInstance = null;

/**
 * Get global MetricsCollector instance
 *
 * @returns {MetricsCollector} Collector instance
 */
function getCollector() {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector();
  }
  return collectorInstance;
}

module.exports = MetricsCollector;
module.exports.getCollector = getCollector;
