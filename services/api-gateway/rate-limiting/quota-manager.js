/**
 * Quota Manager for OmniClaw Enhanced API Gateway
 *
 * Manages per-user and per-key quota tracking with:
 * - Hourly and daily quotas
 * - Quota reset and rollover
 * - Quota alerts and notifications
 * - Quota analytics and reporting
 *
 * @version 1.0.0
 */

const { Firestore } = require('@google-cloud/firestore');

class QuotaManager {
  constructor(config = {}) {
    this.config = {
      projectId: config.projectId || process.env.PROJECT_ID || 'omniclaw-enhanced',
      alertThreshold: config.alertThreshold || 0.8, // Alert at 80% usage
      rolloverEnabled: config.rolloverEnabled || true,
      maxRolloverDays: config.maxRolloverDays || 7,
      ...config
    };

    this.db = new Firestore({
      projectId: this.config.projectId
    });

    // Quota tiers
    this.quotaTiers = {
      free: {
        hourlyLimit: 100,
        dailyLimit: 1000,
        monthlyLimit: 10000,
        burstLimit: 10
      },
      basic: {
        hourlyLimit: 1000,
        dailyLimit: 10000,
        monthlyLimit: 100000,
        burstLimit: 100
      },
      pro: {
        hourlyLimit: 10000,
        dailyLimit: 100000,
        monthlyLimit: 1000000,
        burstLimit: 1000
      },
      enterprise: {
        hourlyLimit: Infinity,
        dailyLimit: Infinity,
        monthlyLimit: Infinity,
        burstLimit: Infinity
      }
    };

    // Endpoint-specific quotas
    this.endpointQuotas = {
      '/story/generate': {
        free: { daily: 5, monthly: 50 },
        basic: { daily: 50, monthly: 500 },
        pro: { daily: 500, monthly: 5000 }
      },
      '/story/tts': {
        free: { daily: 50, monthly: 500 },
        basic: { daily: 500, monthly: 5000 },
        pro: { daily: 5000, monthly: 50000 }
      },
      '/price/check': {
        free: { daily: 100, monthly: 1000 },
        basic: { daily: 1000, monthly: 10000 },
        pro: { daily: 10000, monthly: 100000 }
      }
    };
  }

  /**
   * Check and consume quota
   * @param {string} apiKey - API key identifier
   * @param {string} endpoint - API endpoint
   * @param {string} tier - User tier
   * @returns {Promise<{allowed: boolean, quota: object}>}
   */
  async consumeQuota(apiKey, endpoint, tier = 'free') {
    const now = new Date();
    const quotaKey = `quota:${apiKey}:${endpoint}`;
    const tierConfig = this.quotaTiers[tier] || this.quotaTiers.free;

    try {
      // Get current quota
      const quotaDoc = await this.db.collection('quotas').doc(quotaKey).get();
      let quota = quotaDoc.exists ? quotaDoc.data() : this._initializeQuota(tier);

      // Check if quota needs reset
      quota = this._resetIfNeeded(quota, now);

      // Check hourly quota
      if (quota.hourlyUsed >= quota.hourlyLimit) {
        return {
          allowed: false,
          quota: this._formatQuota(quota),
          error: 'Hourly quota exceeded'
        };
      }

      // Check daily quota
      if (quota.dailyUsed >= quota.dailyLimit) {
        return {
          allowed: false,
          quota: this._formatQuota(quota),
          error: 'Daily quota exceeded'
        };
      }

      // Check endpoint-specific quota
      const endpointQuota = this.endpointQuotas[endpoint]?.[tier];
      if (endpointQuota && quota.endpointUsed >= endpointQuota.daily) {
        return {
          allowed: false,
          quota: this._formatQuota(quota),
          error: 'Endpoint daily quota exceeded'
        };
      }

      // Consume quota
      quota.hourlyUsed += 1;
      quota.dailyUsed += 1;
      quota.monthlyUsed += 1;
      quota.endpointUsed = (quota.endpointUsed || 0) + 1;
      quota.lastUsed = now.toISOString();

      // Check for alerts
      await this._checkAlerts(apiKey, quota, tierConfig);

      // Save quota
      await this.db.collection('quotas').doc(quotaKey).set(quota);

      return {
        allowed: true,
        quota: this._formatQuota(quota)
      };
    } catch (error) {
      console.error('Quota manager error:', error);
      // Fail open - allow request if quota manager fails
      return {
        allowed: true,
        quota: this._formatQuota(this._initializeQuota(tier))
      };
    }
  }

  /**
   * Get current quota status
   */
  async getQuotaStatus(apiKey, tier = 'free') {
    const quotaKey = `quota:${apiKey}`;
    const quotaDoc = await this.db.collection('quotas').doc(quotaKey).get();

    if (!quotaDoc.exists) {
      return this._formatQuota(this._initializeQuota(tier));
    }

    const quota = quotaDoc.data();
    return this._formatQuota(quota);
  }

  /**
   * Reset quota for API key
   */
  async resetQuota(apiKey, scope = 'all') {
    const quotaKey = `quota:${apiKey}`;
    const quotaDoc = await this.db.collection('quotas').doc(quotaKey).get();

    if (!quotaDoc.exists) {
      return { success: false, error: 'Quota not found' };
    }

    const quota = quotaDoc.data();

    if (scope === 'all') {
      quota.hourlyUsed = 0;
      quota.dailyUsed = 0;
      quota.monthlyUsed = 0;
      quota.endpointUsed = {};
    } else if (scope === 'hourly') {
      quota.hourlyUsed = 0;
    } else if (scope === 'daily') {
      quota.dailyUsed = 0;
      quota.endpointUsed = {};
    } else if (scope === 'monthly') {
      quota.monthlyUsed = 0;
    }

    await this.db.collection('quotas').doc(quotaKey).update(quota);

    return {
      success: true,
      quota: this._formatQuota(quota)
    };
  }

  /**
   * Set custom quota for API key
   */
  async setCustomQuota(apiKey, customQuota) {
    const quotaKey = `quota:${apiKey}`;
    const quotaDoc = await this.db.collection('quotas').doc(quotaKey).get();

    let quota = quotaDoc.exists ? quotaDoc.data() : this._initializeQuota('free');

    // Apply custom quota
    if (customQuota.hourlyLimit !== undefined) {
      quota.hourlyLimit = customQuota.hourlyLimit;
    }
    if (customQuota.dailyLimit !== undefined) {
      quota.dailyLimit = customQuota.dailyLimit;
    }
    if (customQuota.monthlyLimit !== undefined) {
      quota.monthlyLimit = customQuota.monthlyLimit;
    }
    if (customQuota.burstLimit !== undefined) {
      quota.burstLimit = customQuota.burstLimit;
    }

    quota.isCustom = true;

    await this.db.collection('quotas').doc(quotaKey).set(quota);

    return {
      success: true,
      quota: this._formatQuota(quota)
    };
  }

  /**
   * Get quota analytics
   */
  async getQuotaAnalytics(apiKey, startDate, endDate) {
    const quotaKey = `quota:${apiKey}`;
    const analyticsRef = this.db
      .collection('quota-analytics')
      .where('apiKey', '==', apiKey)
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .orderBy('timestamp', 'asc');

    const snapshot = await analyticsRef.get();

    const analytics = {
      totalRequests: 0,
      hourlyUsage: [],
      dailyUsage: [],
      endpointUsage: {},
      topEndpoints: []
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      analytics.totalRequests += data.count;
      analytics.endpointUsage[data.endpoint] = (analytics.endpointUsage[data.endpoint] || 0) + data.count;
    });

    // Sort endpoints by usage
    analytics.topEndpoints = Object.entries(analytics.endpointUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return analytics;
  }

  /**
   * Get quota usage across all API keys (admin only)
   */
  async getAllQuotaUsage(tier) {
    const query = tier
      ? this.db.collection('quotas').where('tier', '==', tier)
      : this.db.collection('quotas');

    const snapshot = await query.get();

    const usage = {
      totalKeys: snapshot.size,
      totalRequests: 0,
      tierDistribution: {},
      averageUsage: {}
    };

    snapshot.forEach(doc => {
      const quota = doc.data();
      usage.totalRequests += quota.dailyUsed;
      usage.tierDistribution[quota.tier] = (usage.tierDistribution[quota.tier] || 0) + 1;
    });

    return usage;
  }

  /**
   * Initialize quota for tier
   */
  _initializeQuota(tier) {
    const tierConfig = this.quotaTiers[tier] || this.quotaTiers.free;
    const now = new Date();

    return {
      tier,
      hourlyLimit: tierConfig.hourlyLimit,
      hourlyUsed: 0,
      hourlyReset: new Date(now.setHours(now.getHours() + 1, 0, 0, 0)).toISOString(),
      dailyLimit: tierConfig.dailyLimit,
      dailyUsed: 0,
      dailyReset: new Date(now.setHours(0, 0, 0, 0)).toISOString(),
      dailyReset: new Date(now.setDate(now.getDate() + 1)).toISOString(),
      monthlyLimit: tierConfig.monthlyLimit,
      monthlyUsed: 0,
      monthlyReset: new Date(now.setDate(1, 0, 0, 0)).toISOString(),
      burstLimit: tierConfig.burstLimit,
      endpointUsed: {},
      isCustom: false,
      createdAt: now.toISOString()
    };
  }

  /**
   * Reset quota if time window has expired
   */
  _resetIfNeeded(quota, now) {
    const nowTime = now.getTime();
    let updated = false;

    // Reset hourly quota
    if (nowTime >= new Date(quota.hourlyReset).getTime()) {
      quota.hourlyUsed = 0;
      quota.hourlyReset = new Date(now.setHours(now.getHours() + 1, 0, 0, 0)).toISOString();
      updated = true;
    }

    // Reset daily quota
    if (nowTime >= new Date(quota.dailyReset).getTime()) {
      quota.dailyUsed = 0;
      quota.endpointUsed = {};
      quota.dailyReset = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      updated = true;
    }

    // Reset monthly quota
    if (nowTime >= new Date(quota.monthlyReset).getTime()) {
      quota.monthlyUsed = 0;
      quota.monthlyReset = new Date(now.setDate(1, 0, 0, 0)).toISOString();
      updated = true;
    }

    return quota;
  }

  /**
   * Check for quota alerts and send notifications
   */
  async _checkAlerts(apiKey, quota, tierConfig) {
    const alerts = [];

    // Hourly quota alert
    if (quota.hourlyUsed / quota.hourlyLimit >= this.config.alertThreshold) {
      alerts.push({
        type: 'hourly',
        usage: quota.hourlyUsed,
        limit: quota.hourlyLimit,
        percentage: Math.round((quota.hourlyUsed / quota.hourlyLimit) * 100)
      });
    }

    // Daily quota alert
    if (quota.dailyUsed / quota.dailyLimit >= this.config.alertThreshold) {
      alerts.push({
        type: 'daily',
        usage: quota.dailyUsed,
        limit: quota.dailyLimit,
        percentage: Math.round((quota.dailyUsed / quota.dailyLimit) * 100)
      });
    }

    // Monthly quota alert
    if (quota.monthlyUsed / quota.monthlyLimit >= this.config.alertThreshold) {
      alerts.push({
        type: 'monthly',
        usage: quota.monthlyUsed,
        limit: quota.monthlyLimit,
        percentage: Math.round((quota.monthlyUsed / quota.monthlyLimit) * 100)
      });
    }

    // Store alerts
    if (alerts.length > 0) {
      await this.db.collection('quota-alerts').add({
        apiKey,
        alerts,
        timestamp: new Date().toISOString(),
        notified: false
      });
    }
  }

  /**
   * Format quota for response
   */
  _formatQuota(quota) {
    return {
      tier: quota.tier,
      hourly: {
        limit: quota.hourlyLimit,
        used: quota.hourlyUsed,
        remaining: Math.max(0, quota.hourlyLimit - quota.hourlyUsed),
        resetAt: quota.hourlyReset
      },
      daily: {
        limit: quota.dailyLimit,
        used: quota.dailyUsed,
        remaining: Math.max(0, quota.dailyLimit - quota.dailyUsed),
        resetAt: quota.dailyReset
      },
      monthly: {
        limit: quota.monthlyLimit,
        used: quota.monthlyUsed,
        remaining: Math.max(0, quota.monthlyLimit - quota.monthlyUsed),
        resetAt: quota.monthlyReset
      },
      burst: {
        limit: quota.burstLimit
      },
      endpointUsage: quota.endpointUsed || {},
      isCustom: quota.isCustom || false
    };
  }
}

module.exports = QuotaManager;
