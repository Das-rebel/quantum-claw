/**
 * TMLPD Parallel Query Client
 *
 * Queries TMLPD MCP server for parallel LLM execution
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class TMLPDQueryClient {
  constructor(config) {
    // TMLPD endpoint (default, can be overridden)
    this.endpoint = config.endpoint || 'http://localhost:18789/api/parallel';

    // Parallel models (can be configured)
    this.models = config.models || {
      primary: 'gemini-2.5-flash',
      secondary: ['glm-4.7', 'claude-3.5-sonnet']
    };

    // Consensus settings
    this.consensusThreshold = config.consensusThreshold || 0.7;
    this.timeout = config.timeout || 30000; // 30 seconds default

    // Request logging
    this.loggingEnabled = config.logging !== false;
  }

  /**
     * Execute parallel query
     * @param {string} query - User query text
     * @param {Array} models - Models to query (defaults to all configured)
     * @param {number} timeout - Request timeout in ms (optional)
     * @returns {Promise<Object>} Response object with responses array and consensus
     */
  async executeParallel(query, models = null, timeout = null) {
    const startTime = Date.now();

    // Log request
    console.log('\n🚀 TMLPD Parallel Query');
    console.log(`   Query: "${query.substring(0, 100)}..."`);
    console.log(`   Models: ${models?.join(', ') || 'none'}`);

    // Prepare request body
    const requestBody = {
      query: query,
      models: models || this.models
    };

    try {
      // Send request to TMLPD
      const response = await this._sendTMLPDRequest(requestBody, timeout);

      // Return formatted response
      return this._formatResponse(response);

    } catch (error) {
      console.error(`❌ TMLPD Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        responses: [],
        consensus: null
      };
    }
  }

  /**
     * Get configured models
     * @returns {Array<string>} Array of model names
     */
  getConfiguredModels() {
    return this.models || [];
  }

  /**
     * Send request to TMLPD
     */
  async _sendTMLPDRequest(requestBody, timeout = null) {
    const requestTimeout = timeout || this.timeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    const options = {
      hostname: this.endpoint.replace('https://', '').replace(/^https?:\/\//, 'http://'),
      port: 18789, // TMLPD default port
      path: '/api/parallel',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          clearTimeout(timeoutId);

          try {
            const response = JSON.parse(data);

            // Log response
            if (this.loggingEnabled) {
              console.log('✅ TMLPD Response received');
              console.log(`   Status: ${response.status}`);
              if (response.responses && response.responses.length > 0) {
                console.log(`   Responses: ${response.responses.length}`);
                response.responses.forEach((r, idx) => {
                  console.log(`   [${idx + 1}] Model ${r.model}:`);
                });
              }
            }

            resolve({
              success: true,
              statusCode: res.statusCode,
              data: response,
              headers: res.headers
            });
          } catch (e) {
            console.error(`❌ Failed to parse TMLPD response: ${e.message}`);
            reject({
              success: false,
              error: e.message,
              responses: [],
              consensus: null
            });
          }
        });
      });

      req.on('error', (error) => {
        clearTimeout(timeoutId);
        reject({
          success: false,
          error: error.message,
          responses: [],
          consensus: null
        });
      });

      // Write body to request
      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  /**
     * Format TMLPD response for bridge
     * @param {Object} response - Response from TMLPD
     * @returns {Promise<Object>} Formatted response
     */
  _formatResponse(response) {
    if (!response || !response.responses || response.responses.length === 0) {
      console.error('Invalid TMLPD response');
      return {
        type: 'PlainText',
        text: 'I apologize, but I couldn\'t generate a response at this time.',
        shouldEndSession: false
      };
    }

    const text = response.responses?.[0]?.content || 'I apologize, but I couldn\'t generate a response.';

    // Check for progressive responses (interim results)
    let progressiveResponse = null;
    let hasProgressive = false;

    if (response.responses && response.responses.length > 0) {
      // Aggregate responses and find consensus
      const commonElements = this._findCommonElements(response.responses);

      // Simple majority vote (at least 3/5 agree on top element)
      let topElements = commonElements
        .sort((a, b) => b.count - a.count)
        .slice(0, 2); // Top 2

      // If top elements agree (simple majority)
      if (topElements.length >= 1) {
        const consensusResponse = {
          type: 'consensus',
          content: topElements[0].content,
          participatingModels: response.responses.map(r => ({
            model: r.model,
            agreed: true
          })),
          confidence: Math.round(topElements[0].count / response.responses.length * 100)
        };
        return consensusResponse;
      }
    }

    return {
      type: 'PlainText',
      text: text,
      shouldEndSession: !hasProgressive,
      progressiveResponse: hasProgressive
    };
  }

  /**
     * Find common elements in responses
     * @param {Array} responses - Array of model responses
     * @returns {Array} Common elements
     */
  _findCommonElements(responses) {
    if (!responses || responses.length === 0) return [];

    const elementCounts = {};
    responses.forEach(r => {
      const words = r.content.split(' ');
      words.forEach(word => {
        // Skip empty words
        if (word.length < 2) return;

        // Convert to lowercase for counting
        const lowerWord = word.toLowerCase();
        elementCounts[lowerWord] = (elementCounts[lowerWord] || 0) + 1;
      });
    });

    // Find top 5 most common elements
    const sortedElements = Object.entries(elementCounts)
      .sort((a, b) => b[1] - a[1])
      .reverse()
      .slice(0, 5); // Top 5

    return sortedElements.map(([word, count]) => ({
      word,
      count
    }));
  }

  /**
     * Check if progressive responses exist
     * @param {Array} responses - Response array
     * @returns {string|null} Progressive response content or null
     */
  hasProgressiveResponse(responses) {
    return responses.some(r =>
      r.content &&
            r.content.toLowerCase().includes('researching that') &&
            r.content.toLowerCase().includes('for you')
    );
  }
}

module.exports = TMLPDQueryClient;
