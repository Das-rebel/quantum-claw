/**
 * Google TTS Client Stub
 * Placeholder for Google Cloud Text-to-Speech API integration
 */
class GoogleTTSClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_TTS_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Google TTS client not configured' };
  }

  async query(q) {
    throw new Error('Google TTS client not available');
  }
}

module.exports = GoogleTTSClient;
