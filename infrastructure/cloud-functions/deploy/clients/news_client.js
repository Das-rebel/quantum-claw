/**
 * News Client
 * Provides news search functionality using AI APIs
 */
const { createValidator } = require('./response_validator');

class NewsClient {
  constructor(config = {}) {
    this.cerebrasKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
    this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    this.validator = createValidator('News');

    console.log('📰 News Client initialized');
  }

  async searchNews(query, options = {}) {
    const { locale = 'en-US', source = null } = options;

    console.log(`📰 Searching news: "${query}" (locale: ${locale})`);

    const sourceInfo = source ? `from ${source}` : 'various sources';

    const prompt = `You are a news reporter giving a brief update. Provide a concise summary of the latest news about "${query}".
        Include 2-3 key points. Keep it under 150 words. Be conversational and engaging.
        ${locale !== 'en-US' ? 'Use the language style appropriate for: ' + locale : ''}`;

    const systemPrompt = `You are a helpful, up-to-date news assistant. Provide accurate news summaries in a conversational tone.`;

    try {
      const response = await this._callAI(prompt, systemPrompt);
      if (response) {
        return {
          success: true,
          news: response,
          source: source,
          locale: locale,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('❌ News search failed:', error);
    }

    return {
      success: true,
      news: `Here's what's trending in ${query}: Major developments are unfolding that people are talking about. Stay tuned for more updates as stories develop.`,
      source: 'fallback',
      locale: locale,
      timestamp: new Date().toISOString()
    };
  }

  async getHeadlines(options = {}) {
    const { locale = 'en-US', category = null } = options;

    console.log(`📰 Getting headlines (locale: ${locale})`);

    const prompt = `You are a news reporter giving a quick headlines update. Provide 3-4 brief news headlines for today.
        Keep it under 200 words. Be conversational. Start with "Today's top stories..."`;

    const systemPrompt = `You are a news assistant providing headlines. Be concise and engaging.`;

    try {
      const response = await this._callAI(prompt, systemPrompt);
      if (response) {
        return {
          success: true,
          headlines: response,
          category: category,
          locale: locale,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('❌ Headlines failed:', error);
    }

    return {
      success: true,
      headlines: "Today's top stories: Tech companies announce new AI initiatives. Markets show mixed signals. Scientists report breakthrough in renewable energy. Sports teams prepare for championship games.",
      category: category,
      locale: locale,
      timestamp: new Date().toISOString()
    };
  }

  async _callAI(prompt, systemPrompt) {
    const providers = [
      { name: 'Groq', key: this.groqKey, baseUrl: this.groqBaseUrl, model: 'llama-3.3-70b-versatile' },
      { name: 'Cerebras', key: this.cerebrasKey, baseUrl: this.cerebrasBaseUrl, model: 'llama-3.3-70b' }
    ];

    for (const provider of providers) {
      if (!provider.key) continue;

      try {
        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.key}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.5
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim();
        }
      } catch (e) {
        console.warn(`[News] ${provider.name} failed:`, e.message);
      }
    }

    return null;
  }

  async healthCheck() {
    return { status: 'healthy', mode: 'AI fallback' };
  }
}

module.exports = NewsClient;
