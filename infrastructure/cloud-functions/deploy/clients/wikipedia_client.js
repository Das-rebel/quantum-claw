/**
 * Wikipedia Client Stub
 * Placeholder for Wikipedia API integration
 */
class WikipediaClient {
  constructor(options = {}) {
    this.baseUrl = 'https://en.wikipedia.org/api/rest_v1';
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Wikipedia client not configured' };
  }

  async search(query) {
    throw new Error('Wikipedia client not available');
  }

  async query(q) {
    throw new Error('Wikipedia client not available');
  }
}

module.exports = WikipediaClient;
