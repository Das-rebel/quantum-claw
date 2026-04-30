/**
 * Google Gemini AI Client - Real Implementation
 * Uses Google Gemini API for AI inference
 */
class GeminiClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.model = options.model || 'gemini-2.0-flash';
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { status: 'unavailable', reason: 'No API key configured' };
    }
    try {
      const response = await fetch(
        `${this.baseUrl}?key=${this.apiKey}`,
        { method: 'GET' }
      );
      return response.ok 
        ? { status: 'healthy', message: 'Gemini API accessible' }
        : { status: 'unhealthy', message: `HTTP ${response.status}` };
    } catch (e) {
      return { status: 'unavailable', reason: e.message };
    }
  }

  async query(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not configured');
    }
    
    const model = options.model || this.model;
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 1000
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not configured');
    }
    
    const model = options.model || this.model;
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;
    
    // Convert messages to Gemini format
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens || 1000
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

module.exports = GeminiClient;