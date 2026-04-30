/**
 * Sarvam Client Stub
 * Placeholder for Sarvam AI API integration
 */
class SarvamClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SARVAM_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Sarvam client not configured' };
  }

  async query(q) {
    throw new Error('Sarvam client not available');
  }
}

module.exports = SarvamClient;
