/**
 * OmniClaw Client for Alexa Bridge
 * Handles communication with OmniClaw Personal Assistant backend
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { getSecret } = require('../shared/security/secrets');

class OmniClawClient {
  constructor() {
    // OmniClaw Personal Assistant endpoints
    this.endpoints = {
      apiHandler: process.env.OMNICLAW_API_ENDPOINT ||
                       'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api/alexa',
      fallbackHandler: process.env.OMNICLAW_FALLBACK_ENDPOINT ||
                           'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api/alexa'
    };

    this.apiKey = null;
    this.initialized = false;
    this.initializePromise = this.initialize();

    // Health status
    this.healthStatus = {
      apiHandler: 'unknown',
      fallbackHandler: 'unknown',
      lastCheck: null
    };
  }

  /**
     * Initialize client with API key from Secret Manager
     */
  async initialize() {
    try {
      console.log('🔑 Initializing OmniClaw client...');

      // Try to get API key from Secret Manager (optional, may not exist yet)
      try {
        this.apiKey = await getSecret('omniclaw-api-key');
        console.log('✅ OmniClaw API key loaded from Secret Manager');
      } catch (secretError) {
        console.log('⚠️  OmniClaw API key not found in Secret Manager, will use unauthenticated access');
        this.apiKey = null;
      }

      // Verify endpoint accessibility
      await this._verifyEndpoints();

      this.initialized = true;
      console.log('✅ OmniClaw client initialization complete');

    } catch (error) {
      console.error('❌ OmniClaw client initialization failed:', error.message);
      // Continue without failing - will use fallback mode
      this.initialized = true;
    }
  }

  /**
     * Verify that OmniClaw endpoints are accessible
     */
  async _verifyEndpoints() {
    const healthCheck = await this.getHealthStatus();
    this.healthStatus = {
      ...healthCheck,
      lastCheck: new Date().toISOString()
    };
  }

  /**
     * Process request through OmniClaw backend
     * @param {Object} requestData - Request data to send to OmniClaw
     * @returns {Promise<Object>} - Response from OmniClaw
     */
  async processRequest(requestData) {
    await this.ensureInitialized();

    const requestBody = {
      query: requestData.query || 'general',
      text: requestData.text || '',
      context: {
        ...requestData.context,
        source: 'alexa-bridge',
        timestamp: new Date().toISOString()
      },
      capabilities: requestData.capabilities || [],
      options: {
        voice_response: true,
        max_length: 150, // Alexa-friendly response length
        language: requestData.context?.language || 'en'
      }
    };

    console.log('📤 Sending request to OmniClaw:', JSON.stringify(requestBody).substring(0, 200) + '...');

    try {
      // Try primary endpoint first
      const response = await this._callAPI(this.endpoints.apiHandler, requestBody);
      return response;

    } catch (error) {
      console.warn('⚠️  Primary endpoint failed, trying fallback:', error.message);

      try {
        // Try fallback endpoint
        const fallbackResponse = await this._callAPI(this.endpoints.fallbackHandler, requestBody);
        return fallbackResponse;
      } catch (fallbackError) {
        console.error('❌ All endpoints failed:', fallbackError.message);
        throw new Error('OmniClaw endpoints unavailable');
      }
    }
  }

  /**
     * Make API call to OmniClaw endpoint
     * @param {string} endpoint - Target endpoint URL
     * @param {Object} data - Request data
     * @returns {Promise<Object>} - API response
     */
  _callAPI(endpoint, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const postData = JSON.stringify(data);
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 30000 // 30 second timeout
      };

      // Add authorization if we have an API key
      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = client.request(options, (res) => {
        let body = '';

        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200 || res.statusCode === 201) {
              const response = JSON.parse(body);
              console.log('✅ OmniClaw response received');
              resolve(this._formatResponse(response));
            } else if (res.statusCode === 401) {
              reject(new Error('Unauthorized: Invalid API key'));
            } else if (res.statusCode === 404) {
              reject(new Error('Endpoint not found'));
            } else if (res.statusCode >= 500) {
              reject(new Error(`Server error: ${res.statusCode}`));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request error:', error.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
     * Format OmniClaw response for Alexa consumption
     * @param {Object} omniclawResponse - Raw response from OmniClaw
     * @returns {Object} - Formatted response
     */
  _formatResponse(omniclawResponse) {
    // Handle different response formats
    if (omniclawResponse.text) {
      return {
        text: omniclawResponse.text,
        speech: omniclawResponse.speech || omniclawResponse.text,
        provider: omniclawResponse.provider || 'omniclaw',
        source: 'omniclaw-api',
        metadata: omniclawResponse.metadata || {}
      };
    }

    if (omniclawResponse.response) {
      return {
        text: omniclawResponse.response,
        speech: omniclawResponse.response,
        provider: 'omniclaw',
        source: 'omniclaw-api'
      };
    }

    if (omniclawResponse.answer) {
      return {
        text: omniclawResponse.answer,
        speech: omniclawResponse.answer,
        provider: 'omniclaw',
        source: 'omniclaw-api'
      };
    }

    // Default fallback
    return {
      text: 'I processed your request through OmniClaw.',
      speech: 'I processed your request through OmniClaw.',
      provider: 'omniclaw',
      source: 'omniclaw-api'
    };
  }

  /**
     * Get health status of OmniClaw endpoints
     * @returns {Promise<Object>} - Health status
     */
  async getHealthStatus() {
    const status = {
      apiHandler: this.endpoints.apiHandler,
      fallbackHandler: this.endpoints.fallbackHandler,
      apiHandlerStatus: 'unknown',
      fallbackHandlerStatus: 'unknown',
      authenticated: !!this.apiKey,
      timestamp: new Date().toISOString()
    };

    // Check primary endpoint
    try {
      const apiHealth = await this._checkEndpoint(this.endpoints.apiHandler);
      status.apiHandlerStatus = apiHealth;
    } catch (error) {
      status.apiHandlerStatus = 'unreachable';
    }

    // Check fallback endpoint
    try {
      const fallbackHealth = await this._checkEndpoint(this.endpoints.fallbackHandler);
      status.fallbackHandlerStatus = fallbackHealth;
    } catch (error) {
      status.fallbackHandlerStatus = 'unreachable';
    }

    return status;
  }

  /**
     * Check if endpoint is accessible
     * @param {string} endpoint - Endpoint URL
     * @returns {Promise<string>} - Health status
     */
  _checkEndpoint(endpoint) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname || '/',
        method: 'GET',
        timeout: 5000,
        headers: {}
      };

      if (this.apiKey) {
        options.headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const req = client.request(options, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) { // 404 is OK, endpoint exists
          resolve('healthy');
        } else {
          resolve(`http_${res.statusCode}`);
        }
      });

      req.on('error', () => reject(new Error('unreachable')));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.end();
    });
  }

  /**
     * Ensure client is initialized
     */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializePromise;
    }
  }

  /**
     * Test connection with simple request
     * @returns {Promise<boolean>} - Test result
     */
  async testConnection() {
    try {
      const response = await this.processRequest({
        query: 'test',
        text: 'hello',
        context: { test: true }
      });
      return !!response.text;
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = OmniClawClient;
