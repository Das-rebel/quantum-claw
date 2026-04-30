/**
 * Feature Flags - Gradual Rollout and A/B Testing
 *
 * Enables safe, gradual rollout of new OmniClaw 2.0 UI/UX features:
 * - Percentage-based rollout (10% → 25% → 50% → 100%)
 * - User-based whitelisting
 * - Platform-specific rollouts
 * - A/B test group assignment
 * - Instant rollback capability
 */

class FeatureFlags {
  constructor() {
    // Feature flag definitions
    this.flags = {
      simplified_ui: {
        enabled: true,
        rolloutPercentage: 10, // Start at 10% of users
        whitelist: [], // Specific user IDs to always include
        blacklist: [], // Specific user IDs to always exclude
        platforms: ['alexa', 'whatsapp', 'web'], // All platforms initially
        description: 'New simplified UI with natural language routing',
        dependencies: [],
        introducedAt: new Date().toISOString()
      },

      smart_router: {
        enabled: true,
        rolloutPercentage: 10,
        whitelist: [],
        blacklist: [],
        platforms: ['alexa', 'whatsapp', 'web'],
        description: 'AI-powered smart routing eliminating intent names',
        dependencies: ['simplified_ui'],
        introducedAt: new Date().toISOString()
      },

      progressive_disclosure: {
        enabled: true,
        rolloutPercentage: 10,
        whitelist: [],
        blacklist: [],
        platforms: ['alexa', 'whatsapp', 'web'],
        description: 'Progressive feature discovery through conversation',
        dependencies: ['simplified_ui', 'smart_router'],
        introducedAt: new Date().toISOString()
      },

      transparency_layer: {
        enabled: true,
        rolloutPercentage: 10,
        whitelist: [],
        blacklist: [],
        platforms: ['alexa', 'whatsapp', 'web'],
        description: 'Confidence indicators and explainable decisions',
        dependencies: ['simplified_ui', 'smart_router'],
        introducedAt: new Date().toISOString()
      },

      smart_defaults: {
        enabled: true,
        rolloutPercentage: 10,
        whitelist: [],
        blacklist: [],
        platforms: ['alexa', 'whatsapp', 'web'],
        description: 'Intelligent defaults and auto-detection',
        dependencies: ['simplified_ui', 'smart_router'],
        introducedAt: new Date().toISOString()
      },

      context_aware: {
        enabled: true,
        rolloutPercentage: 10,
        whitelist: [],
        blacklist: [],
        platforms: ['alexa', 'whatsapp', 'web'],
        description: 'Time-based and platform-based optimization',
        dependencies: ['simplified_ui'],
        introducedAt: new Date().toISOString()
      }
    };

    // A/B test configuration
    this.abTests = {
      ui_simplification: {
        enabled: true,
        name: 'UI Simplification',
        description: 'Compare legacy 19+ intent UI vs simplified natural language UI',
        controlGroup: 'legacy_ui',
        treatmentGroup: 'simplified_ui',
        splitPercentage: 50, // 50/50 split
        startDate: new Date().toISOString(),
        endDate: null, // Run indefinitely until manually stopped
        targetSampleSize: 100, // Minimum sessions per group for statistical significance
        metrics: ['timeToFirstAction', 'completionRate', 'satisfaction', 'featureDiscovery']
      }
    };

    // User assignment cache (for consistent A/B test assignment)
    this.userAssignments = new Map(); // userId -> { group, assignedAt }
  }

  /**
   * Check if a feature is enabled for a specific user/session
   *
   * @param {string} featureName - Feature flag name
   * @param {Object} context - User context (userId, platform, sessionId)
   * @returns {boolean} Whether feature is enabled
   */
  isEnabled(featureName, context = {}) {
    const feature = this.flags[featureName];

    // Feature doesn't exist
    if (!feature) {
      console.warn(`[FeatureFlags] Unknown feature: ${featureName}`);
      return false;
    }

    // Feature explicitly disabled
    if (!feature.enabled) {
      return false;
    }

    // Check whitelist (always enable for these users)
    if (context.userId && feature.whitelist.includes(context.userId)) {
      console.log(`[FeatureFlags] ${featureName} enabled for whitelisted user ${context.userId}`);
      return true;
    }

    // Check blacklist (always disable for these users)
    if (context.userId && feature.blacklist.includes(context.userId)) {
      console.log(`[FeatureFlags] ${featureName} disabled for blacklisted user ${context.userId}`);
      return false;
    }

    // Check platform support
    if (context.platform && !feature.platforms.includes(context.platform)) {
      console.log(`[FeatureFlags] ${featureName} not available on platform ${context.platform}`);
      return false;
    }

    // Check dependencies
    const dependenciesMet = feature.dependencies.every(dep =>
      this.isEnabled(dep, context)
    );
    if (!dependenciesMet) {
      console.log(`[FeatureFlags] ${featureName} dependencies not met`);
      return false;
    }

    // Check rollout percentage
    const isInRollout = this._isInRolloutPercentage(feature.rolloutPercentage, context);
    if (isInRollout) {
      console.log(`[FeatureFlags] ${featureName} enabled for session ${context.sessionId} (${feature.rolloutPercentage}% rollout)`);
    }

    return isInRollout;
  }

  /**
   * Get A/B test group assignment for a user
   *
   * @param {string} testName - A/B test name
   * @param {string} userId - User identifier
   * @returns {string|null} Test group name
   */
  getABTestGroup(testName, userId) {
    const test = this.abTests[testName];

    // Test doesn't exist or is disabled
    if (!test || !test.enabled) {
      return null;
    }

    // Check for cached assignment
    if (this.userAssignments.has(userId)) {
      const assignment = this.userAssignments.get(userId);
      if (assignment.testName === testName) {
        return assignment.group;
      }
    }

    // Assign to group based on consistent hash of userId
    const hash = this._hashUserId(userId);
    const group = hash < test.splitPercentage ? test.controlGroup : test.treatmentGroup;

    // Cache assignment
    this.userAssignments.set(userId, {
      testName,
      group,
      assignedAt: new Date().toISOString()
    });

    console.log(`[FeatureFlags] User ${userId} assigned to ${group} in test ${testName}`);

    return group;
  }

  /**
   * Enable a feature (instant rollout)
   *
   * @param {string} featureName - Feature flag name
   * @param {number} rolloutPercentage - Rollout percentage (0-100)
   */
  enableFeature(featureName, rolloutPercentage = 100) {
    const feature = this.flags[featureName];

    if (!feature) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    feature.enabled = true;
    feature.rolloutPercentage = Math.min(100, Math.max(0, rolloutPercentage));

    console.log(`[FeatureFlags] ${featureName} enabled at ${feature.rolloutPercentage}% rollout`);

    this._logFeatureChange(featureName, 'enable', { rolloutPercentage });
  }

  /**
   * Disable a feature (instant rollback)
   *
   * @param {string} featureName - Feature flag name
   */
  disableFeature(featureName) {
    const feature = this.flags[featureName];

    if (!feature) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    feature.enabled = false;

    console.log(`[FeatureFlags] ${featureName} DISABLED (rollback)`);

    this._logFeatureChange(featureName, 'disable');
  }

  /**
   * Update rollout percentage for gradual rollout
   *
   * @param {string} featureName - Feature flag name
   * @param {number} percentage - New rollout percentage (0-100)
   */
  updateRolloutPercentage(featureName, percentage) {
    const feature = this.flags[featureName];

    if (!feature) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    const oldPercentage = feature.rolloutPercentage;
    feature.rolloutPercentage = Math.min(100, Math.max(0, percentage));

    console.log(`[FeatureFlags] ${featureName} rollout: ${oldPercentage}% → ${feature.rolloutPercentage}%`);

    this._logFeatureChange(featureName, 'update_rollout', {
      oldPercentage,
      newPercentage: feature.rolloutPercentage
    });
  }

  /**
   * Add user to whitelist (always enable for this user)
   *
   * @param {string} featureName - Feature flag name
   * @param {string} userId - User identifier
   */
  addToWhitelist(featureName, userId) {
    const feature = this.flags[featureName];

    if (!feature) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    if (!feature.whitelist.includes(userId)) {
      feature.whitelist.push(userId);
      console.log(`[FeatureFlags] User ${userId} added to ${featureName} whitelist`);
    }

    this._logFeatureChange(featureName, 'whitelist_add', { userId });
  }

  /**
   * Remove user from whitelist
   *
   * @param {string} featureName - Feature flag name
   * @param {string} userId - User identifier
   */
  removeFromWhitelist(featureName, userId) {
    const feature = this.flags[featureName];

    if (!feature) {
      throw new Error(`Unknown feature: ${featureName}`);
    }

    feature.whitelist = feature.whitelist.filter(id => id !== userId);
    console.log(`[FeatureFlags] User ${userId} removed from ${featureName} whitelist`);

    this._logFeatureChange(featureName, 'whitelist_remove', { userId });
  }

  /**
   * Get current status of all feature flags
   *
   * @returns {Object} Feature flag status
   */
  getAllFlags() {
    const status = {};

    Object.entries(this.flags).forEach(([name, feature]) => {
      status[name] = {
        enabled: feature.enabled,
        rolloutPercentage: feature.rolloutPercentage,
        whitelistCount: feature.whitelist.length,
        blacklistCount: feature.blacklist.length,
        platforms: feature.platforms,
        description: feature.description
      };
    });

    return status;
  }

  /**
   * Get A/B test status
   *
   * @returns {Object} A/B test status
   */
  getABTestStatus() {
    const status = {};

    Object.entries(this.abTests).forEach(([name, test]) => {
      // Count group assignments
      let controlCount = 0;
      let treatmentCount = 0;

      for (const assignment of this.userAssignments.values()) {
        if (assignment.testName === name) {
          if (assignment.group === test.controlGroup) controlCount++;
          if (assignment.group === test.treatmentGroup) treatmentCount++;
        }
      }

      status[name] = {
        enabled: test.enabled,
        controlGroup: test.controlGroup,
        treatmentGroup: test.treatmentGroup,
        controlAssignments: controlCount,
        treatmentAssignments: treatmentCount,
        totalAssignments: controlCount + treatmentCount,
        targetSampleSize: test.targetSampleSize,
        sufficientData: (controlCount >= test.targetSampleSize && treatmentCount >= test.targetSampleSize),
        startDate: test.startDate,
        endDate: test.endDate,
        metrics: test.metrics
      };
    });

    return status;
  }

  /**
   * Check if session/user is in rollout percentage
   *
   * @param {number} percentage - Rollout percentage (0-100)
   * @param {Object} context - User context
   * @returns {boolean} Whether in rollout
   * @private
   */
  _isInRolloutPercentage(percentage, context) {
    if (percentage >= 100) return true;
    if (percentage <= 0) return false;

    // Use sessionId for consistent assignment
    const hash = this._hashUserId(context.sessionId || context.userId || 'anonymous');
    return (hash % 100) < percentage;
  }

  /**
   * Hash userId to consistent number (0-99)
   *
   * @param {string} userId - User identifier
   * @returns {number} Hash value (0-99)
   * @private
   */
  _hashUserId(userId) {
    // Simple hash function for consistent assignment
    let hash = 0;
    const str = String(userId);

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash) % 100;
  }

  /**
   * Log feature flag changes for audit trail
   *
   * @param {string} featureName - Feature name
   * @param {string} action - Action performed
   * @param {Object} details - Action details
   * @private
   */
  _logFeatureChange(featureName, action, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      feature: featureName,
      action,
      details
    };

    // In production, this would go to a persistent log
    console.log(`[FeatureFlags Audit] ${JSON.stringify(logEntry)}`);
  }

  /**
   * Export feature flag configuration
   *
   * @returns {Object} Current configuration
   */
  exportConfiguration() {
    return {
      flags: this.flags,
      abTests: this.abTests,
      userAssignments: Array.from(this.userAssignments.entries())
    };
  }

  /**
   * Import feature flag configuration
   *
   * @param {Object} config - Configuration to import
   */
  importConfiguration(config) {
    if (config.flags) {
      Object.assign(this.flags, config.flags);
    }

    if (config.abTests) {
      Object.assign(this.abTests, config.abTests);
    }

    if (config.userAssignments) {
      this.userAssignments = new Map(config.userAssignments);
    }

    console.log('[FeatureFlags] Configuration imported');
  }
}

module.exports = FeatureFlags;
