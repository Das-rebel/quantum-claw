/**
 * TMLPD Query Client - Real Implementation
 */
class TMLPDQueryClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = options.model || 'llama-3.3-70b-versatile';
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { status: 'unavailable', reason: 'No API key configured' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      return response.ok 
        ? { status: 'healthy', message: 'TMLPD Query accessible' }
        : { status: 'unhealthy', message: `HTTP ${response.status}` };
    } catch (e) {
      return { status: 'unavailable', reason: e.message };
    }
  }

  async query(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TMLPD Query error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
  }

  async search(query, options = {}) {
    return this.query(query, options);
  }
}

module.exports = TMLPDQueryClient;
