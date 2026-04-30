/**
 * Cerebras AI Client - Real Implementation
 * Uses Cerebras API for fast inference
 */
class CerebrasClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.CEREBRAS_API_KEY;
    this.baseUrl = 'https://api.cerebras.ai/v1';
    this.model = options.model || 'llama3.1-8b';
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { status: 'unavailable', reason: 'No API key configured' };
    }
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        })
      });
      return response.ok 
        ? { status: 'healthy', message: 'Cerebras API accessible' }
        : { status: 'unhealthy', message: `HTTP ${response.status}` };
    } catch (e) {
      return { status: 'unavailable', reason: e.message };
    }
  }

  async query(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('CEREBRAS_API_KEY not configured');
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
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('CEREBRAS_API_KEY not configured');
    }
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: messages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

module.exports = CerebrasClient;