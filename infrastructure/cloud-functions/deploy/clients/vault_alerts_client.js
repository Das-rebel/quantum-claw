/**
 * Vault Alerts Client - Topic-based Content Matching
 *
 * Manages alerts for vault content that matches user interests.
 * Checks new posts against alert criteria and tracks pending notifications.
 */

const path = require('path');
const fs = require('fs');

class VaultAlertsClient {
  constructor(options = {}) {
    this.alertsPath = options.alertsPath || path.join(__dirname, '../learning_base/vault_alerts.json');
    this.alerts = new Map();
    this.lastContentChecks = new Map();
    this.loadAlerts();
  }

  /**
   * Create an alert for a topic
   * @param {string} topic - The topic name
   * @param {Object} criteria - Alert criteria
   * @param {string[]} criteria.keywords - Keywords to match
   * @param {string} criteria.matchMode - 'any' or 'all' keywords
   * @param {string} criteria.frequency - 'immediate', 'daily', or 'weekly'
   * @returns {string} alertId
   */
  createAlert(topic, criteria = {}) {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const alert = {
      id: alertId,
      topic,
      keywords: criteria.keywords || [],
      matchMode: criteria.matchMode || 'any',
      frequency: criteria.frequency || 'immediate',
      createdAt: new Date().toISOString(),
      lastChecked: null,
      pendingContent: []
    };

    this.alerts.set(alertId, alert);
    this.saveAlerts();
    return alertId;
  }

  /**
   * Check if new content matches any alerts
   * @param {Object} post - Vault post with vlTags and vlSubject
   * @returns {Object} { matchedAlerts: [], alertIds: [] }
   */
  checkNewContent(post) {
    const matchedAlerts = [];
    const alertIds = [];

    for (const [alertId, alert] of this.alerts) {
      if (this.contentMatchesAlert(post, alert)) {
        matchedAlerts.push({ ...alert });
        alertIds.push(alertId);

        alert.pendingContent.push({
          postId: post.id,
          matchedAt: new Date().toISOString(),
          matchedKeywords: this.getMatchedKeywords(post, alert)
        });

        this.alerts.set(alertId, alert);
      }
    }

    if (matchedAlerts.length > 0) {
      this.saveAlerts();
    }

    return { matchedAlerts, alertIds };
  }

  /**
   * Get pending alerts to fire
   * @returns {Object[]} Alerts with new content since last check
   */
  getPendingAlerts() {
    const pending = [];

    for (const [alertId, alert] of this.alerts) {
      if (alert.pendingContent.length > 0) {
        const frequencyHours = {
          immediate: 0,
          daily: 24,
          weekly: 168
        };

        const hoursSinceLastCheck = alert.lastChecked
          ? (Date.now() - new Date(alert.lastChecked).getTime()) / (1000 * 60 * 60)
          : Infinity;

        if (hoursSinceLastCheck >= frequencyHours[alert.frequency] || alert.lastChecked === null) {
          pending.push({
            ...alert,
            pendingContent: [...alert.pendingContent]
          });
        }
      }
    }

    return pending;
  }

  /**
   * Get all active alerts
   * @returns {Object[]} All alert configurations
   */
  getActiveAlerts() {
    return Array.from(this.alerts.values()).map(alert => ({ ...alert }));
  }

  /**
   * Delete an alert by ID
   * @param {string} alertId - Alert ID to remove
   * @returns {boolean} True if deleted, false if not found
   */
  deleteAlert(alertId) {
    const deleted = this.alerts.delete(alertId);
    if (deleted) {
      this.saveAlerts();
    }
    return deleted;
  }

  /**
   * Mark pending alerts as sent/cleared
   * @param {string[]} alertIds - IDs to clear
   */
  clearPendingAlerts(alertIds) {
    for (const alertId of alertIds) {
      const alert = this.alerts.get(alertId);
      if (alert) {
        alert.pendingContent = [];
        alert.lastChecked = new Date().toISOString();
        this.alerts.set(alertId, alert);
      }
    }
    this.saveAlerts();
  }

  /**
   * Internal: Load alerts from file
   */
  loadAlerts() {
    try {
      if (fs.existsSync(this.alertsPath)) {
        const data = JSON.parse(fs.readFileSync(this.alertsPath, 'utf8'));
        this.alerts.clear();
        if (Array.isArray(data)) {
          for (const alert of data) {
            if (alert.id) {
              this.alerts.set(alert.id, alert);
            }
          }
        }
      }
    } catch (error) {
      console.error('[VaultAlertsClient] Error loading alerts:', error.message);
    }
  }

  /**
   * Internal: Save alerts to file
   */
  saveAlerts() {
    try {
      const data = Array.from(this.alerts.values());
      fs.writeFileSync(this.alertsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('[VaultAlertsClient] Error saving alerts:', error.message);
    }
  }

  /**
   * Check if content matches an alert's criteria
   * @private
   */
  contentMatchesAlert(post, alert) {
    if (!alert.keywords || alert.keywords.length === 0) {
      return false;
    }

    const textFields = [
      ...(post.vlTags || []),
      post.vlSubject || '',
      post.vlStyle || '',
      post.vlMood || '',
      post.caption || ''
    ].join(' ').toLowerCase();

    const keywords = alert.keywords.map(k => k.toLowerCase());

    if (alert.matchMode === 'all') {
      return keywords.every(keyword => textFields.includes(keyword));
    } else {
      return keywords.some(keyword => textFields.includes(keyword));
    }
  }

  /**
   * Get matched keywords for a post
   * @private
   */
  getMatchedKeywords(post, alert) {
    const textFields = [
      ...(post.vlTags || []),
      post.vlSubject || '',
      post.vlStyle || '',
      post.vlMood || '',
      post.caption || ''
    ].join(' ').toLowerCase();

    return alert.keywords.filter(keyword =>
      textFields.includes(keyword.toLowerCase())
    );
  }
}

module.exports = VaultAlertsClient;
