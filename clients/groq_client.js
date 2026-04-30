/**
 * Groq Client
 *
 * Groq API client for fast AI inference
 */

class GroqClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'llama3-70b-8192'; // Use Llama 3 70B model
  }

  /**
     * Execute a query
     * @param {string} prompt - The query text
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Response from Groq
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
          timeout: options.timeout || 15000
        }
      );

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        success: true,
        text,
        model: data.model,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Groq client error:', error.message);
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
      provider: 'groq',
      model: this.model,
      available: this.isAvailable()
    };
  }
}

module.exports = GroqClient;
