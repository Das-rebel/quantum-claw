/**
 * Arxiv Client Stub
 * Placeholder for Arxiv API integration
 */
class ArxivClient {
  constructor(options = {}) {
    this.baseUrl = 'https://export.arxiv.org/api/query';
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Arxiv client not configured' };
  }

  async search(query) {
    throw new Error('Arxiv client not available');
  }
}

module.exports = ArxivClient;
