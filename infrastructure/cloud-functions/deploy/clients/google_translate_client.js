/**
 * Google Translate Client Stub
 * Placeholder for Google Translate API integration
 */
class GoogleTranslateClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_TRANSLATE_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Google Translate client not configured' };
  }

  async query(q) {
    throw new Error('Google Translate client not available');
  }
}

module.exports = GoogleTranslateClient;
