/**
 * Story Narrator Client for Alexa Bridge
 * Handles communication with Story Narrator Cloud Run service
 */

const https = require('https');

class StoryNarratorClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.STORY_NARRATOR_ENDPOINT || 'https://omniclaw-story-narrator-338789220059.asia-south1.run.app';
    this.timeout = options.timeout || 60000;
  }

  async _makeRequest(path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.endpoint);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            if (res.headers['content-type']?.includes('audio')) {
              resolve({ audio: Buffer.from(data), contentType: res.headers['content-type'] });
            } else {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(data);
              }
            }
          } else {
            try {
              const error = JSON.parse(data);
              reject(new Error(error.error || `HTTP ${res.statusCode}`));
            } catch {
              reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
            }
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }

  async healthCheck() {
    try {
      const url = new URL('/health', this.endpoint);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET'
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ status: 'unknown' });
            }
          });
        });
        req.on('error', reject);
        req.end();
      });
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async generateStory(config) {
    const { theme, setting, plotOutline, characters, language = 'hinglish' } = config;
    return this._makeRequest('/generate', { theme, setting, plotOutline, characters, language });
  }

  async narrate(config) {
    const { content, url, voice = 'NARRATOR', language = 'en' } = config;
    return this._makeRequest('/narrate', { content, url, voice, language });
  }

  async synthesize(config) {
    const { text, voice = 'NARRATOR', language = 'en' } = config;
    return this._makeRequest('/synthesize', { text, voice, language });
  }
}

module.exports = StoryNarratorClient;
