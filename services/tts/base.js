/**
 * TTS Service Base Interface
 *
 * Abstract base class for Text-to-Speech providers
 * Ensures consistent interface across different TTS implementations
 */

class TTSService {
  constructor(config) {
    if (this.constructor === TTSService) {
      throw new Error('TTSService is abstract and cannot be instantiated directly');
    }
    this.config = config;
    this.enabled = config.enabled || false;
  }

  /**
   * Generate speech audio from text
   * Must be implemented by subclasses
   */
  async generateSpeech(text, options) {
    throw new Error('generateSpeech() must be implemented by subclass');
  }

  /**
   * Check if service is ready to generate speech
   */
  isReady() {
    return this.enabled && this.config.apiKey;
  }

  /**
   * Get service name for logging
   */
  getServiceName() {
    return this.constructor.name.replace('TTS', '');
  }
}

module.exports = TTSService;
