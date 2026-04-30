/**
 * Google Cloud TTS Provider
 *
 * Text-to-Speech API integration
 * Supports both API Key and Service Account authentication
 * Generates MP3 audio files with ultra-realistic voices
 * Free tier (1M chars/month) with 64 KHz quality
 * Multiple language support including neural voices
 */

const https = require('https');
const URL = require('url');
const { GoogleAuth } = require('google-auth-library');

/**
 * Google Cloud TTS Service
 * Implements Text-to-Speech API
 * Supports: API Key (local) and Service Account (cloud)
 */
class GoogleCloudTTS {
  constructor(config) {
    this.enabled = config.googleCloud.enabled === true || config.googleCloud.enabled === 'true';
    this.voiceId = 'en-US-Standard';
    this.useServiceAccount = config.googleCloud.useServiceAccount === true || config.googleCloud.useServiceAccount === 'true';
    this.apiKey = config.googleCloud.apiKey || '';

    // Initialize authentication
    if (this.useServiceAccount) {
      // Service Account authentication (for Cloud Run)
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
    } else {
      // API Key authentication (for local development)
      if (!this.apiKey || this.apiKey.includes('your-')) {
        console.warn('⚠️  Google Cloud TTS: API key not configured');
      }
    }
  }

  /**
   * Generate speech using Google Cloud TTS API
   */
  async generateSpeech(text, options = {}) {
    if (!this.enabled) {
      throw new Error('Google Cloud TTS is disabled in configuration');
    }

    const logger = require('../../utils/logger');

    // Set voice from options
    this.voiceId = options.voiceId || 'en-US-Standard';

    logger.debug('Google Cloud TTS request', {
      textLength: text.length,
      voiceId: this.voiceId,
      authMethod: this.useServiceAccount ? 'Service Account' : 'API Key'
    });

    try {
      let response;

      if (this.useServiceAccount) {
        // Service Account authentication (Cloud Run)
        response = await this._generateWithServiceAccount(text, options, logger);
      } else {
        // API Key authentication (local development)
        response = await this._generateWithApiKey(text, options, logger);
      }

      if (response.statusCode === 200 && response.data.audioContent) {
        logger.info('Google Cloud TTS success', {
          audioSize: response.data.audioContent.length,
          contentType: response.headers['content-type'] || 'audio/mpeg',
          authMethod: this.useServiceAccount ? 'Service Account' : 'API Key'
        });

        return {
          audio: response.data.audioContent,
          contentType: response.headers['content-type'] || 'audio/mpeg',
          service: 'google-cloud',
          voiceId: this.voiceId,
          authMethod: this.useServiceAccount ? 'service-account' : 'api-key'
        };
      } else {
        logger.error('Google Cloud TTS error', { status: response.statusCode });
        throw new Error(`Google Cloud TTS error: ${response.statusCode}`);
      }
    } catch (error) {
      logger.error('Google Cloud TTS exception', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate speech with API Key (local development)
   */
  async _generateWithApiKey(text, options, logger) {
    if (!this.apiKey) {
      throw new Error('API key not configured');
    }

    const apiUrl = `https://texttospeech.googleapis.com/v1/synthesize?key=${this.apiKey}`;

    const requestBody = {
      input: { text: text },
      voice: {
        languageCode: 'en-US',
        name: this.voiceId,
        ssmlGender: options.gender || 'FEMALE'
      },
      audioConfig: {
        audioEncoding: options.outputEncoding || 'MP3'
      }
    };

    const response = await this._makeHttpsRequest(apiUrl, requestBody);
    return response;
  }

  /**
   * Generate speech with Service Account (Cloud Run)
   */
  async _generateWithServiceAccount(text, options, logger) {
    if (!this.auth) {
      throw new Error('Google Auth not initialized');
    }

    // Get authenticated client
    const client = await this.auth.getClient();

    // Get access token
    const projectId = await this.auth.getProjectId();
    const token = client.credentials.token.access_token;

    if (!token) {
      throw new Error('Failed to get access token');
    }

    const apiUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize';

    const requestBody = {
      input: { text: text },
      voice: {
        languageCode: 'en-US',
        name: this.voiceId,
        ssmlGender: options.gender || 'FEMALE'
      },
      audioConfig: {
        audioEncoding: options.outputEncoding || 'MP3'
      }
    };

    const requestOptions = {
      hostname: 'texttospeech.googleapis.com',
      port: 443,
      path: '/v1/text:synthesize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const response = await this._makeHttpsRequestWithOpts(requestOptions, requestBody);
    return response;
  }

  /**
   * Make HTTPS request to Google Cloud TTS API
   */
  _makeHttpsRequest(urlString, requestBody) {
    return new Promise((resolve, reject) => {
      const url = URL.parse(urlString);

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              const jsonData = JSON.parse(data);
              resolve({
                statusCode: response.statusCode,
                headers: response.headers,
                data: jsonData
              });
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Request failed with status ${response.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  /**
   * Make HTTPS request with custom options
   */
  _makeHttpsRequestWithOpts(options, requestBody) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode === 200) {
            try {
              const jsonData = JSON.parse(data);
              resolve({
                statusCode: response.statusCode,
                headers: response.headers,
                data: jsonData
              });
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`Request failed with status ${response.statusCode}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(JSON.stringify(requestBody));
      req.end();
    });
  }

  /**
   * Check if service is ready to generate speech
   */
  isReady() {
    if (this.useServiceAccount) {
      // Service Account always ready if auth initialized
      return this.enabled && this.auth;
    } else {
      // API Key mode: check if key exists
      return this.enabled && this.apiKey && !this.apiKey.includes('your-');
    }
  }

  /**
   * Get service name for logging
   */
  getServiceName() {
    const authMethod = this.useServiceAccount ? ' (Service Account)' : ' (API Key)';
    return `Google Cloud TTS${authMethod}`;
  }
}

module.exports = GoogleCloudTTS;
