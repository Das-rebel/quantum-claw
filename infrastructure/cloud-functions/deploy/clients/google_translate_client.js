/**
 * Google Translate Client
 * Provides translation using Google Translate API or AI fallback
 */
const { createValidator } = require('./response_validator');

class GoogleTranslateClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY;
    this.useAI = !this.apiKey;
    this.validator = createValidator('Translate');
    
    // AI fallback keys
    this.cerebrasKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
    this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    
    console.log('[Translate] Client initialized, AI fallback:', this.useAI ? 'yes' : 'no');
  }

  async translate(text, targetLang = 'english') {
    if (!text) return '';
    
    console.log(`[Translate] Translating to ${targetLang}: "${text.substring(0, 50)}..."`);
    
    if (this.useAI) {
      return this._translateWithAI(text, targetLang);
    }
    
    // Use Google Translate API
    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          target: targetLang.toLowerCase().replace('english', 'en').replace('spanish', 'es').replace('hindi', 'hi').replace('french', 'fr').replace('german', 'de').replace('chinese', 'zh').replace('japanese', 'ja').replace('korean', 'ko').replace('arabic', 'ar'),
          source: 'en'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.data.translations[0].translatedText;
      }
    } catch (e) {
      console.error('[Translate] Google API failed, using AI fallback:', e.message);
    }
    
    // Fallback to AI translation
    return this._translateWithAI(text, targetLang);
  }

  async _translateWithAI(text, targetLang) {
    const langMap = {
      'english': 'English', 'spanish': 'Spanish', 'hindi': 'Hindi',
      'french': 'French', 'german': 'German', 'chinese': 'Chinese',
      'japanese': 'Japanese', 'korean': 'Korean', 'arabic': 'Arabic',
      'portuguese': 'Portuguese', 'italian': 'Italian', 'russian': 'Russian'
    };
    const targetLanguage = langMap[targetLang.toLowerCase()] || targetLang;

    const prompt = `Translate the following text to ${targetLanguage}. Provide only the translation, no explanation.
Text: "${text}"
Translation (${targetLanguage}):`;

    const systemPrompt = `You are a professional translator. Provide accurate, natural translations. Return only the translated text.`;

    try {
      const response = await this._callAI(prompt, systemPrompt);
      if (response) {
        return response;
      }
    } catch (e) {
      console.error('[Translate] AI translation failed:', e.message);
    }

    return text; // Return original if translation fails
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
            temperature: 0.3
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim();
        }
      } catch (e) {
        console.warn(`[Translate] ${provider.name} failed:`, e.message);
      }
    }

    return null;
  }

  async healthCheck() {
    if (this.useAI) {
      return { status: 'healthy', mode: 'AI fallback' };
    }
    return { status: 'healthy', mode: 'Google API' };
  }

  async query(q) {
    return this.translate(q, 'english');
  }
}

module.exports = GoogleTranslateClient;
