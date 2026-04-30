/**
 * Kodi Client Stub
 * Placeholder for Kodi media player integration
 */
class KodiClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 8080;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'Kodi client not configured' };
  }

  async search(query) {
    throw new Error('Kodi client not available');
  }

  async query(q) {
    throw new Error('Kodi client not available');
  }
}

module.exports = KodiClient;
