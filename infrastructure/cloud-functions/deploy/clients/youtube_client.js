/**
 * YouTube Client Stub
 * Placeholder for YouTube API integration
 */
class YouTubeClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.YOUTUBE_API_KEY;
  }

  async healthCheck() {
    return { status: 'unavailable', reason: 'YouTube client not configured' };
  }

  async search(query) {
    throw new Error('YouTube client not available');
  }
}

module.exports = YouTubeClient;
