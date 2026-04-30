/**
 * Tavily Client Stub
 * Placeholder for Tavily Search API integration
 */
class TavilyClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.TAVILY_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Tavily client not configured' };
  }

  async search(query) {
    throw new Error('Tavily client not available');
  }
}

module.exports = TavilyClient;
