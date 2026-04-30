/**
 * Sarvam TTS Client Stub
 * Placeholder for Sarvam Text-to-Speech API integration
 */
class SarvamTTSSClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SARVAM_TTS_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Sarvam TTS client not configured' };
  }

  async query(q) {
    throw new Error('Sarvam TTS client not available');
  }
}

module.exports = SarvamTTSSClient;
