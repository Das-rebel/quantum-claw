/**
 * Perplexity Client
 *
 * Perplexity AI API client for search-enhanced responses
 */

class PerplexityClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.perplexity.ai';
    this.model = 'llama-3.1-sonar-small-128k-online'; // Use Sonar model
  }

  /**
     * Execute a query
     * @param {string} prompt - The query text
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response from Perplexity
     */
  async query(prompt, options = {}) {
    const startTime = Date.now();

    try {
      const response = await fetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: options.model || this.model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 1024,
            top_p: options.topP || 1,
            stream: false
          }),
          signal: options.signal,
          timeout: options.timeout || 20000
        }
      );

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        text,
        model: data.model,
        responseTime: Date.now() - startTime,
        citations: data.citations // Perplexity provides citations for search-based queries
      };

    } catch (error) {
      console.error('Perplexity client error:', error.message);
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
     * Check if the client is available
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
      provider: 'perplexity',
      model: this.model,
      available: this.isAvailable()
    };
  }
}

module.exports = PerplexityClient;
