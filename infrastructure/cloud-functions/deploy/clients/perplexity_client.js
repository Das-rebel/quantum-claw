/**
 * Perplexity Client Stub
 * Placeholder for Perplexity API integration
 */
class PerplexityClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PERPLEXITY_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Perplexity client not configured' };
  }

  async query(q) {
    throw new Error('Perplexity client not available');
  }
}

module.exports = PerplexityClient;
