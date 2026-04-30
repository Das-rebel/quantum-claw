/**
 * API Key Manager for OmniClaw Enhanced API Gateway
 *
 * Features:
 * - Generate secure API keys
 * - Validate API keys
 * - Manage API key lifecycle
 * - Track API key usage
 * - Revoke and rotate API keys
 *
 * @version 1.0.0
 */

const crypto = require('crypto');
const { Firestore } = require('@google-cloud/firestore');

class ApiKeyManager {
  constructor(config = {}) {
    this.config = {
      projectId: config.projectId || process.env.PROJECT_ID || 'omniclaw-enhanced',
      keyLength: 32,
      keyPrefix: 'sk',
      environment: config.environment || 'production',
      ...config
    };

    this.db = new Firestore({
      projectId: this.config.projectId
    });

    // API key scopes
    this.scopes = {
      'price:read': { description: 'Read price tracking data', category: 'price' },
      'price:write': { description: 'Write price tracking data', category: 'price' },
      'story:read': { description: 'Read story content', category: 'story' },
      'story:write': { description: 'Generate stories and TTS', category: 'story' },
      'media:read': { description: 'Read media controls', category: 'media' },
      'media:write': { description: 'Control media playback', category: 'media' },
      'analytics:read': { description: 'Read analytics data', category: 'analytics' },
      'email:send': { description: 'Send emails', category: 'email' },
      'admin:*': { description: 'Full administrative access', category: 'admin' }
    };

    // API key tiers
    this.tiers = {
      free: {
        name: 'Free',
        requestsPerHour: 100,
        requestsPerDay: 1000,
        features: ['price:read', 'story:read', 'media:read']
      },
      basic: {
        name: 'Basic',
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        features: ['price:read', 'price:write', 'story:read', 'story:write', 'media:read', 'media:write']
      },
      pro: {
        name: 'Pro',
        requestsPerHour: 10000,
        requestsPerDay: 100000,
        features: ['price:read', 'price:write', 'story:read', 'story:write', 'media:read', 'media:write', 'analytics:read']
      },
      enterprise: {
        name: 'Enterprise',
        requestsPerHour: Infinity,
        requestsPerDay: Infinity,
        features: ['*'] // All scopes
      }
    };
  }

  /**
   * Generate a new API key
   * @param {object} options - API key options
   * @returns {Promise<object>} API key details
   */
  async generateApiKey(options = {}) {
    const {
      name = 'API Key',
      tier = 'free',
      scopes = [],
      userId = null,
      ipAddress = null,
      expiresAt = null,
      metadata = {}
    } = options;

    try {
      // Generate secure random key
      const rawKey = crypto.randomBytes(this.config.keyLength);
      const apiKey = this._formatApiKey(rawKey);
      const keyId = this._generateKeyId(apiKey);

      // Determine scopes
      const finalScopes = scopes.length > 0 ? scopes : this.tiers[tier]?.features || [];

      // Create API key document
      const apiKeyDoc = {
        keyId,
        apiKeyHash: this._hashApiKey(apiKey),
        name,
        tier,
        scopes: finalScopes,
        userId,
        ipAddress,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        usage: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          lastRequest: null
        },
        metadata,
        environment: this.config.environment
      };

      // Save to Firestore
      await this.db.collection('api-keys').doc(keyId).set(apiKeyDoc);

      // Log key generation
      await this._logKeyEvent(keyId, 'generated', { tier, scopes: finalScopes });

      return {
        success: true,
        apiKey, // Only show full key once
        keyId,
        ...this._sanitizeKeyDoc(apiKeyDoc)
      };
    } catch (error) {
      console.error('Error generating API key:', error);
      return {
        success: false,
        error: 'Failed to generate API key'
      };
    }
  }

  /**
   * Validate an API key
   * @param {string} apiKey - API key to validate
   * @param {string} requiredScope - Required scope for access
   * @returns {Promise<object>} Validation result
   */
  async validateApiKey(apiKey, requiredScope = null) {
    try {
      if (!apiKey || typeof apiKey !== 'string') {
        return {
          valid: false,
          error: 'Invalid API key format'
        };
      }

      const keyId = this._extractKeyId(apiKey);
      if (!keyId) {
        return {
          valid: false,
          error: 'Invalid API key format'
        };
      }

      // Get API key from Firestore
      const doc = await this.db.collection('api-keys').doc(keyId).get();
      if (!doc.exists) {
        return {
          valid: false,
          error: 'API key not found'
        };
      }

      const keyDoc = doc.data();

      // Check if key is active
      if (!keyDoc.isActive) {
        return {
          valid: false,
          error: 'API key has been revoked'
        };
      }

      // Check if key has expired
      if (keyDoc.expiresAt && new Date(keyDoc.expiresAt) < new Date()) {
        return {
          valid: false,
          error: 'API key has expired'
        };
      }

      // Verify API key hash
      const inputHash = this._hashApiKey(apiKey);
      if (inputHash !== keyDoc.apiKeyHash) {
        return {
          valid: false,
          error: 'Invalid API key'
        };
      }

      // Check IP restriction
      if (keyDoc.ipAddress) {
        // IP check would be done in the request handler
        // This is just validation
      }

      // Check scope
      if (requiredScope) {
        const hasScope = keyDoc.scopes.includes('*') || keyDoc.scopes.includes(requiredScope);
        if (!hasScope) {
          return {
            valid: false,
            error: 'Insufficient permissions'
          };
        }
      }

      // Update last used timestamp
      await this.db.collection('api-keys').doc(keyId).update({
        lastUsed: new Date().toISOString(),
        'usage.totalRequests': Firestore.FieldValue.increment(1),
        'usage.lastRequest': new Date().toISOString()
      });

      return {
        valid: true,
        keyId,
        tier: keyDoc.tier,
        scopes: keyDoc.scopes,
        userId: keyDoc.userId
      };
    } catch (error) {
      console.error('Error validating API key:', error);
      return {
        valid: false,
        error: 'Validation error'
      };
    }
  }

  /**
   * Revoke an API key
   * @param {string} keyId - API key identifier
   * @returns {Promise<object>} Revoke result
   */
  async revokeApiKey(keyId, reason = 'manual') {
    try {
      const doc = await this.db.collection('api-keys').doc(keyId).get();
      if (!doc.exists) {
        return {
          success: false,
          error: 'API key not found'
        };
      }

      await this.db.collection('api-keys').doc(keyId).update({
        isActive: false,
        revokedAt: new Date().toISOString(),
        revokeReason: reason
      });

      // Log revocation
      await this._logKeyEvent(keyId, 'revoked', { reason });

      return {
        success: true,
        message: 'API key revoked successfully'
      };
    } catch (error) {
      console.error('Error revoking API key:', error);
      return {
        success: false,
        error: 'Failed to revoke API key'
      };
    }
  }

  /**
   * Get API key details
   * @param {string} keyId - API key identifier
   * @returns {Promise<object>} API key details
   */
  async getApiKey(keyId) {
    try {
      const doc = await this.db.collection('api-keys').doc(keyId).get();
      if (!doc.exists) {
        return {
          success: false,
          error: 'API key not found'
        };
      }

      return {
        success: true,
        key: this._sanitizeKeyDoc(doc.data())
      };
    } catch (error) {
      console.error('Error getting API key:', error);
      return {
        success: false,
        error: 'Failed to get API key'
      };
    }
  }

  /**
   * List API keys for user
   * @param {string} userId - User identifier
   * @returns {Promise<object>} List of API keys
   */
  async listApiKeys(userId) {
    try {
      const snapshot = await this.db
        .collection('api-keys')
        .where('userId', '==', userId)
        .where('environment', '==', this.config.environment)
        .get();

      const keys = [];
      snapshot.forEach(doc => {
        keys.push(this._sanitizeKeyDoc(doc.data()));
      });

      return {
        success: true,
        keys,
        count: keys.length
      };
    } catch (error) {
      console.error('Error listing API keys:', error);
      return {
        success: false,
        error: 'Failed to list API keys'
      };
    }
  }

  /**
   * Update API key
   * @param {string} keyId - API key identifier
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Update result
   */
  async updateApiKey(keyId, updates) {
    try {
      const allowedUpdates = ['name', 'scopes', 'expiresAt', 'metadata', 'ipAddress'];
      const sanitizedUpdates = {};

      for (const [key, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(key)) {
          sanitizedUpdates[key] = value;
        }
      }

      await this.db.collection('api-keys').doc(keyId).update(sanitizedUpdates);

      // Log update
      await this._logKeyEvent(keyId, 'updated', { fields: Object.keys(sanitizedUpdates) });

      return {
        success: true,
        message: 'API key updated successfully'
      };
    } catch (error) {
      console.error('Error updating API key:', error);
      return {
        success: false,
        error: 'Failed to update API key'
      };
    }
  }

  /**
   * Get API key usage analytics
   * @param {string} keyId - API key identifier
   * @param {object} options - Analytics options
   * @returns {Promise<object>} Usage analytics
   */
  async getApiKeyUsage(keyId, options = {}) {
    const { startDate, endDate, granularity = 'day' } = options;

    try {
      const doc = await this.db.collection('api-keys').doc(keyId).get();
      if (!doc.exists) {
        return {
          success: false,
          error: 'API key not found'
        };
      }

      const keyDoc = doc.data();

      // Get usage logs
      const logsSnapshot = await this.db
        .collection('api-key-logs')
        .where('keyId', '==', keyId)
        .where('timestamp', '>=', startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .where('timestamp', '<=', endDate || new Date().toISOString())
        .get();

      const analytics = {
        totalRequests: keyDoc.usage.totalRequests,
        successfulRequests: keyDoc.usage.successfulRequests,
        failedRequests: keyDoc.usage.failedRequests,
        lastUsed: keyDoc.lastUsed,
        timeSeries: []
      };

      // Aggregate by granularity
      const timeMap = new Map();
      logsSnapshot.forEach(logDoc => {
        const log = logDoc.data();
        const timestamp = new Date(log.timestamp);
        const key = this._getGranularKey(timestamp, granularity);

        if (!timeMap.has(key)) {
          timeMap.set(key, {
            timestamp: key,
            requests: 0,
            successful: 0,
            failed: 0
          });
        }

        const entry = timeMap.get(key);
        entry.requests += 1;
        if (log.success) {
          entry.successful += 1;
        } else {
          entry.failed += 1;
        }
      });

      analytics.timeSeries = Array.from(timeMap.values()).sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
      );

      return {
        success: true,
        analytics
      };
    } catch (error) {
      console.error('Error getting API key usage:', error);
      return {
        success: false,
        error: 'Failed to get usage analytics'
      };
    }
  }

  /**
   * Format API key with prefix
   */
  _formatApiKey(rawKey) {
    const key = rawKey.toString('base64').replace(/[/+=]/g, '').substring(0, this.config.keyLength);
    return `${this.config.keyPrefix}_${this.config.environment}_${key}`;
  }

  /**
   * Generate key ID from API key
   */
  _generateKeyId(apiKey) {
    // Use first 8 and last 8 characters as ID
    const parts = apiKey.split('_');
    const keyPart = parts[parts.length - 1];
    return `${this.config.keyPrefix}_...${keyPart.substring(keyPart.length - 8)}`;
  }

  /**
   * Extract key ID from API key
   */
  _extractKeyId(apiKey) {
    const parts = apiKey.split('_');
    if (parts.length < 3) return null;

    const keyPart = parts[parts.length - 1];
    return `${this.config.keyPrefix}_...${keyPart.substring(keyPart.length - 8)}`;
  }

  /**
   * Hash API key for storage
   */
  _hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Sanitize API key document for response
   */
  _sanitizeKeyDoc(keyDoc) {
    const sanitized = { ...keyDoc };
    delete sanitized.apiKeyHash;
    delete sanitized.environment;
    return sanitized;
  }

  /**
   * Log API key event
   */
  async _logKeyEvent(keyId, event, data = {}) {
    await this.db.collection('api-key-logs').add({
      keyId,
      event,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Get granular time key
   */
  _getGranularKey(date, granularity) {
    switch (granularity) {
      case 'hour':
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString();
      case 'day':
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).toISOString();
      case 'month':
        return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
      default:
        return date.toISOString();
    }
  }
}

module.exports = ApiKeyManager;
