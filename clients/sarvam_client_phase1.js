/**
 * Sarvam API Client for Hindi/Bengali Translation
 * Integrated with Phase 1 Bridge
 */

class SarvamClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.sarvam.ai';
  }

  /**
     * Detect language from text using Unicode ranges
     */
  async detectLanguage(text) {
    // Hindi: Devanagari script (U+0900–U+097F)
    const hindiPattern = /[\u0900-\u097F]/;

    // Bengali: Bengali script (U+0980–U+09FF)
    const bengaliPattern = /[\u0980-\u09FF]/;

    if (hindiPattern.test(text)) {
      return 'hi';
    } else if (bengaliPattern.test(text)) {
      return 'bn';
    } else {
      return 'en';
    }
  }

  /**
     * Translate from English to target language
     */
  async translateFromEnglish(text, targetLanguage) {
    const langMap = {
      'hi': 'hi-IN',
      'bn': 'bn-IN'
    };

    const targetLang = langMap[targetLanguage];
    if (!targetLang) {
      console.log(`[Sarvam] Unsupported target language: ${targetLanguage}`);
      return text;
    }

    try {
      const response = await fetch(`${this.baseURL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        body: JSON.stringify({
          input: text,
          source_language_code: 'en',
          target_language_code: targetLang,
          speaker_gender: 'Female'
        })
      });

      if (!response.ok) {
        throw new Error(`Sarvam API error: ${response.status}`);
      }

      const data = await response.json();
      return data.translated_text || text;

    } catch (error) {
      console.log(`[Sarvam] Translation failed: ${error.message}`);
      return text; // Fallback to original text
    }
  }

  /**
     * Translate to English from source language
     */
  async translateToEnglish(text, sourceLanguage) {
    const langMap = {
      'hi': 'hi-IN',
      'bn': 'bn-IN'
    };

    const sourceLang = langMap[sourceLanguage];
    if (!sourceLang) {
      return text;
    }

    try {
      const response = await fetch(`${this.baseURL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        body: JSON.stringify({
          input: text,
          source_language_code: sourceLang,
          target_language_code: 'en-IN',
          speaker_gender: 'Female'
        })
      });

      if (!response.ok) {
        throw new Error(`Sarvam API error: ${response.status}`);
      }

      const data = await response.json();
      return data.translated_text || text;

    } catch (error) {
      console.log(`[Sarvam] Translation failed: ${error.message}`);
      return text; // Fallback to original text
    }
  }

  /**
     * Health check
     */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        body: JSON.stringify({
          input: 'Hello',
          source_language_code: 'en-IN',
          target_language_code: 'hi-IN',
          speaker_gender: 'Female'
        }),
        timeout: 5000
      });

      return {
        status: response.ok ? 'ok' : 'error',
        statusCode: response.status
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

module.exports = SarvamClient;
