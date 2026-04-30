/**
 * Amazon Polly TTS Provider
 *
 * Fallback TTS service using AWS Polly
 * Good for reliability and cost management
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const TTSService = require('./base');

class AmazonPollyTTS extends TTSService {
  constructor(config) {
    super(config);
    this.region = config.region || 'us-east-1';
    this.voiceId = config.voiceId || 'Joanna';
    this.engine = config.engine || 'neural'; // neural or standard

    // Validate AWS credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
    }
  }

  /**
   * Initialize Polly client (lazy initialization)
   */
  _getClient() {
    if (!this.polly) {
      AWS.config.update({
        region: this.region,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      });

      this.polly = new AWS.Polly({
        signatureVersion: 'v4'
      });
    }

    return this.polly;
  }

  /**
   * Generate speech using Amazon Polly
   */
  async generateSpeech(text, options = {}) {
    if (!this.enabled) {
      throw new Error('Amazon Polly is disabled in configuration');
    }

    const {
      outputFormat = 'mp3',
      sampleRate = '22050',
      textType = 'text'
    } = options;

    const logger = require('../../utils/logger');

    try {
      const polly = this._getClient();

      const params = {
        Text: text,
        OutputFormat: outputFormat,
        SampleRate: sampleRate,
        TextType: textType,
        VoiceId: this.voiceId,
        Engine: this.engine
      };

      logger.debug('Amazon Polly request', {
        textLength: text.length,
        voiceId: this.voiceId,
        engine: this.engine
      });

      const response = await polly.synthesizeSpeech(params).promise();

      if (response.AudioStream) {
        // Convert stream to buffer
        const audioBuffer = await this._streamToBuffer(response.AudioStream);

        logger.debug('Amazon Polly success', {
          audioSize: audioBuffer.length,
          contentType: 'audio/mpeg'
        });

        return {
          audio: audioBuffer,
          contentType: 'audio/mpeg',
          service: 'amazon-polly',
          voiceId: this.voiceId
        };
      } else {
        logger.error('Amazon Polly error', { error: 'No audio stream returned' });
        throw new Error('Amazon Polly returned no audio stream');
      }
    } catch (error) {
      logger.error('Amazon Polly exception', { error: error.message });
      throw error;
    }
  }

  /**
   * Convert audio stream to buffer
   */
  _streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });

      stream.on('error', (error) => {
        reject(error);
      });
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

module.exports = AmazonPollyTTS;
