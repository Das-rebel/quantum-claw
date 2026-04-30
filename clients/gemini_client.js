/**
 * Gemini Client
 *
 * Google Gemini API client for AI queries
 */

class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-pro'; // Use Gemini Pro model
  }

  /**
     * Execute a query
     * @param {string} prompt - The query text
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response from Gemini
     */
  async query(prompt, options = {}) {
    const startTime = Date.now();

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: options.temperature || 0.7,
              maxOutputTokens: options.maxTokens || 1024,
              topP: options.topP || 0.8,
              topK: options.topK || 40
            }
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        success: true,
        text,
        model: this.model,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Gemini client error:', error.message);
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
     * Check if client is available
     * @returns {boolean}
     */
  isAvailable() {
    return !!this.apiKey && typeof this.apiKey === 'string';
  }

  /**
     * Get client metrics
     * @returns {object}
     */
  getMetrics() {
    return {
      provider: 'gemini',
      model: this.model,
      available: this.isAvailable()
    };
  }
}

module.exports = GeminiClient;
