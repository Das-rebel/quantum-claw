/**
 * ElevenLabs TTS Provider
 *
 * Ultra-realistic text-to-speech with emotional voice support
 * API Documentation: https://elevenlabs.io/docs/api/reference/text-to-speech
 */

const https = require('https');
const TTSService = require('./base');
const fs = require('fs');
const path = require('path');

class ElevenLabsTTS extends TTSService {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || 'eleven_multilingual_v2';
    this.modelId = config.modelId || 'eleven_turbo_v2';
    this.apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech/' + this.voiceId;

    // Validate required config
    if (!this.apiKey || this.apiKey.includes('your-')) {
      throw new Error('ElevenLabs API key missing or invalid. Set ELEVENLABS_API_KEY in .env');
    }
  }

  /**
   * Generate speech using ElevenLabs API
   * Supports emotion, voice settings, and output format options
   */
  async generateSpeech(text, options = {}) {
    if (!this.enabled) {
      throw new Error('ElevenLabs TTS is disabled in configuration');
    }

    const {
      emotion = 'neutral',
      stability = 0.5,
      similarity = 0.75,
      model_id = this.modelId
    } = options;

    const requestData = {
      text: text,
      model_id: model_id,
      voice_settings: {
        stability: stability,
        similarity_boost: similarity
      }
    };

    // Add emotion if specified
    if (emotion && emotion !== 'neutral') {
      requestData.voice_settings.emotion = emotion;
    }

    const logger = require('../../utils/logger');
    logger.debug('ElevenLabs TTS request', {
      textLength: text.length,
      emotion: emotion,
      voiceId: this.voiceId
    });

    try {
      const response = await this._makeRequest(requestData);

      if (response.status === 200) {
        const audioBuffer = response.data;

        logger.debug('ElevenLabs TTS success', {
          audioSize: audioBuffer.length,
          contentType: response.headers['content-type']
        });

        return {
          audio: audioBuffer,
          contentType: response.headers['content-type'] || 'audio/mpeg',
          service: 'elevenlabs',
          voiceId: this.voiceId
        };
      } else {
        const errorText = 'Status ' + response.status + ': ' + JSON.stringify(response.data);
        logger.error('ElevenLabs TTS error', { status: response.status, error: errorText });
        throw new Error('ElevenLabs API error: ' + errorText);
      }
    } catch (error) {
      logger.error('ElevenLabs TTS exception', { error: error.message });
      throw error;
    }
  }

  /**
   * Make HTTP request to ElevenLabs API
   */
  _makeRequest(requestData) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
          'Accept': 'audio/mpeg'
        }
      };

      const req = https.request(options, (response) => {
        let data = [];

        response.on('data', (chunk) => {
          data.push(chunk);
        });

        response.on('end', () => {
          const buffer = Buffer.concat(data);
          resolve({
            status: response.statusCode,
            headers: response.headers,
            data: buffer
          });
        });

        response.on('error', (error) => {
          reject(error);
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(JSON.stringify(requestData));
      req.end();
    });
  }

  /**
   * Save audio to file (for debugging/caching)
   */
  async saveToFile(audioBuffer, filename) {
    const logger = require('../../utils/logger');
    const audioDir = path.join(__dirname, '../../audio');

    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const filepath = path.join(audioDir, filename);
    fs.writeFileSync(filepath, audioBuffer);
    logger.info('Audio saved to file', { filepath });

    return filepath;
  }
}

module.exports = ElevenLabsTTS;
