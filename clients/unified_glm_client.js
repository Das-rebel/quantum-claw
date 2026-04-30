/**
 * Unified GLM API Client - Adapts to Cloud Functions vs Local Environment
 * Uses fetch API (Cloud Functions) or HTTPS (Local) based on environment detection
 *
 * Models: claude-sonnet-4-20250514 (via Anthropic API through Z.ai proxy)
 */

class UnifiedGLMClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.ZAI_API_KEY;
    this.baseUrl = 'https://api.z.ai';
    this.basePath = '/api/anthropic';
    this.model = 'claude-sonnet-4-20250514';

    // Detect environment
    this.isCloudFunctions = process.env.FUNCTION_TARGET === 'alexaHandler' ||
                              process.env.K_SERVICE !== undefined;

    // Sync timeout: 100s for Cloud Functions (leaves 20s buffer), 30s for local
    this.timeout = this.isCloudFunctions ? 100000 : 30000;

    console.log('[GLM] === INITIALIZED ===');
    console.log(`[GLM] Environment: ${this.isCloudFunctions ? 'Cloud Functions' : 'Local Development'}`);
    console.log(`[GLM] Timeout: ${this.timeout}ms`);
    console.log(`[GLM] API Key: ${this.apiKey ? 'configured' : 'missing'}`);
    console.log(`[GLM] Model: ${this.model}`);
  }

  /**
     * Generate AI response for a given query
     */
  async query(message, options = {}) {
    const {
      maxTokens = 500,
      temperature = 0.7,
      timeout = this.timeout
    } = options;

    console.log('[GLM] === QUERY START ===');
    console.log(`[GLM] Message: "${message.substring(0, 50)}..."`);
    console.log(`[GLM] Environment: ${this.isCloudFunctions ? 'Cloud Functions' : 'Local'}`);
    console.log(`[GLM] Timeout: ${timeout}ms`);

    const data = {
      model: this.model,
      messages: [{
        role: 'user',
        content: message
      }],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false
    };

    const url = `${this.baseUrl}${this.basePath}/v1/messages`;
    console.log(`[GLM] Request URL: ${url}`);

    // Use appropriate HTTP method based on environment
    if (this.isCloudFunctions) {
      return this.fetchRequest(url, data, timeout);
    } else {
      return this.httpsRequest(url, data, timeout);
    }
  }

  /**
     * Fetch-based request (Cloud Functions)
     */
  async fetchRequest(url, data, timeout) {
    console.log('[GLM] === USING FETCH API (Cloud Functions) ===');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error(`[GLM] === TIMEOUT AFTER ${timeout}ms ===`);
      controller.abort();
    }, timeout);

    try {
      console.log('[GLM] === MAKING FETCH REQUEST ===');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('[GLM] === RESPONSE RECEIVED ===');
      console.log(`[GLM] Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GLM] === HTTP ERROR ===');
        console.error(`[GLM] API error ${response.status}:`, errorText.substring(0, 200));
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const body = await response.json();
      console.log('[GLM] === PARSING SUCCESS RESPONSE ===');
      console.log('[GLM] Response:', JSON.stringify(body).substring(0, 200));

      const content = body.content?.[0]?.text;
      console.log(`[GLM] Response.content[0].text: ${content ? 'present' : 'missing'}`);

      if (content) {
        console.log('[GLM] === SUCCESS ===');
        console.log(`[GLM] Generated response length: ${content.length} characters`);
        console.log(`[GLM] Generated response: ${content.substring(0, 100)}...`);
        return content.trim();
      } else {
        console.log('[GLM] === INVALID RESPONSE STRUCTURE ===');
        throw new Error('Invalid response structure: missing content');
      }

    } catch (error) {
      clearTimeout(timeoutId);

      console.log('[GLM] === QUERY ERROR ===');
      console.error('[GLM] Error:', error.message);

      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  /**
     * HTTPS-based request (Local Development)
     */
  async httpsRequest(url, data, timeout) {
    console.log('[GLM] === USING HTTPS (Local Development) ===');

    return new Promise((resolve, reject) => {
      const https = require('https');

      const reqOptions = {
        hostname: this.baseUrl,
        path: this.basePath + '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: timeout
      };

      console.log('[GLM] === MAKING HTTPS REQUEST ===');
      console.log(`[GLM] Hostname: ${reqOptions.hostname}`);
      console.log(`[GLM] Path: ${reqOptions.path}`);

      const req = https.request(reqOptions, (res) => {
        console.log('[GLM] === RESPONSE RECEIVED ===');
        console.log(`[GLM] Status: ${res.statusCode}`);

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.log('[GLM] === RESPONSE BODY RECEIVED ===');
          console.log(`[GLM] Body length: ${body.length} characters`);

          if (res.statusCode === 200) {
            try {
              const response = JSON.parse(body);
              console.log('[GLM] === PARSING SUCCESS RESPONSE ===');

              const content = response.content?.[0]?.text;
              console.log(`[GLM] Response.content[0].text: ${content ? 'present' : 'missing'}`);

              if (content) {
                console.log('[GLM] === SUCCESS ===');
                console.log(`[GLM] Generated response: ${content.substring(0, 100)}...`);
                resolve(content.trim());
              } else {
                console.log('[GLM] === INVALID RESPONSE STRUCTURE ===');
                reject(new Error('Invalid response structure: missing content'));
              }
            } catch (error) {
              console.log('[GLM] === PARSE ERROR ===');
              reject(new Error(`Parse error: ${error.message}`));
            }
          } else {
            console.log('[GLM] === HTTP ERROR ===');
            reject(new Error(`API error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        console.log('[GLM] === REQUEST ERROR ===');
        reject(error);
      });

      req.on('timeout', () => {
        console.log('[GLM] === TIMEOUT ===');
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      req.write(JSON.stringify(data));
      req.end();
      console.log('[GLM] === REQUEST SENT ===');
    });
  }

  /**
     * Health check with actual query validation
     */
  async healthCheck() {
    console.log('[GLM] === HEALTH CHECK START ===');

    try {
      // Execute actual test query
      const testResponse = await this.query('Say hello', { timeout: 10000 });

      console.log('[GLM] === HEALTH CHECK SUCCESS ===');
      console.log(`[GLM] Test response: ${testResponse}`);

      return {
        status: 'healthy',
        provider: 'GLM',
        model: this.model,
        environment: this.isCloudFunctions ? 'Cloud Functions' : 'Local',
        testQuery: 'passed'
      };
    } catch (error) {
      console.log('[GLM] === HEALTH CHECK FAILED ===');
      console.error('[GLM] Health check error:', error.message);

      return {
        status: 'unhealthy',
        provider: 'GLM',
        error: error.message,
        environment: this.isCloudFunctions ? 'Cloud Functions' : 'Local',
        testQuery: 'failed'
      };
    }
  }

  /**
     * Set a specific model
     */
  setModel(model) {
    const validModels = ['anthropic/claude-sonnet-4-20250514', 'claude-sonnet-4-20250514'];
    if (validModels.includes(model)) {
      this.model = model;
      console.log(`[GLM] Model changed to: ${model}`);
    } else {
      console.warn(`[GLM] Invalid model: ${model}, using default: ${this.model}`);
    }
  }

  /**
     * Get current model
     */
  getModel() {
    return this.model;
  }

  /**
     * Get current environment
     */
  getEnvironment() {
    return this.isCloudFunctions ? 'Cloud Functions' : 'Local Development';
  }

  /**
     * Get current timeout
     */
  getTimeout() {
    return this.timeout;
  }
}

module.exports = UnifiedGLMClient;
