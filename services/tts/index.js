/**
 * TTS Service Factory
 *
 * Factory pattern for Text-to-Speech provider selection
 * Handles fallback logic and provider coordination
 */

// Safely require TTS providers (handle missing dependencies)
let ElevenLabsTTS = null;
let AmazonPollyTTS = null;
let GoogleCloudTTS = null;

try {
  ElevenLabsTTS = require('./elevenlabs');
} catch (err) {
  console.warn('⚠️  ElevenLabs provider not available:', err.message);
}

try {
  AmazonPollyTTS = require('./amazon-polly');
} catch (err) {
  console.warn('⚠️  Amazon Polly provider not available:', err.message);
}

try {
  GoogleCloudTTS = require('./google-cloud');
} catch (err) {
  console.error('❌ Google Cloud provider failed to load:', err.message);
}

const config = require('../../config');
const logger = require('../../utils/logger');

function getTtsConfig() {
  const configSource = config.config || config;
  const ttsConfig = configSource.tts || {};

  return {
    provider: ttsConfig.provider || 'default',
    googleCloud: ttsConfig.googleCloud || configSource.googleCloud || {},
    elevenlabs: ttsConfig.elevenlabs || configSource.elevenlabs || {},
    polly: ttsConfig.polly || configSource.polly || {}
  };
}

class TTSServiceFactory {
  constructor() {
    // Initialize providers
    this.providers = {
      googleCloud: null,
      elevenlabs: null,
      polly: null
    };

    this.currentProvider = null;
  }

  /**
   * Initialize TTS providers based on configuration
   */
  initialize() {
    const ttsConfig = getTtsConfig();

    // Initialize Google Cloud TTS first (primary)
    if (GoogleCloudTTS && ttsConfig.googleCloud.enabled && ttsConfig.googleCloud.apiKey) {
      logger.info('Initializing Google Cloud TTS provider');

      this.providers.googleCloud = new GoogleCloudTTS({
        googleCloud: ttsConfig.googleCloud,
        enabled: true
      });

      if (this.providers.googleCloud.isReady()) {
        this.currentProvider = 'googleCloud';
        logger.info('Google Cloud TTS provider ready (primary)');
      }
    }

    // Initialize ElevenLabs if enabled
    if (ElevenLabsTTS && ttsConfig.elevenlabs.enabled && ttsConfig.elevenlabs.apiKey) {
      logger.info('Initializing ElevenLabs TTS provider');

      this.providers.elevenlabs = new ElevenLabsTTS({
        apiKey: ttsConfig.elevenlabs.apiKey,
        voiceId: ttsConfig.elevenlabs.voiceId,
        modelId: ttsConfig.elevenlabs.modelId,
        enabled: true
      });

      if (this.providers.elevenlabs.isReady() && !this.currentProvider) {
        this.currentProvider = 'elevenlabs';
        logger.info('ElevenLabs TTS provider ready');
      }
    }

    // Initialize Amazon Polly if enabled or as fallback
    if (AmazonPollyTTS && ttsConfig.polly.enabled && !this.currentProvider) {
      logger.info('Initializing Amazon Polly TTS provider');

      this.providers.polly = new AmazonPollyTTS({
        region: ttsConfig.polly.region,
        voiceId: ttsConfig.polly.voiceId,
        engine: ttsConfig.polly.engine,
        enabled: true
      });

      if (this.providers.polly.isReady()) {
        this.currentProvider = 'polly';
        logger.info('Amazon Polly TTS provider ready');
      }
    }

    // Fallback to default if no provider configured
    if (!this.currentProvider) {
      logger.warn('No TTS provider configured, using default Alexa voice');
      this.currentProvider = 'default';
    }

    return this.currentProvider;
  }

  /**
   * Get active TTS provider instance
   */
  getProvider() {
    if (this.currentProvider === 'googleCloud' && this.providers.googleCloud) {
      return this.providers.googleCloud;
    }

    if (this.currentProvider === 'elevenlabs' && this.providers.elevenlabs) {
      return this.providers.elevenlabs;
    }

    if (this.currentProvider === 'polly' && this.providers.polly) {
      return this.providers.polly;
    }

    return null;
  }

  /**
   * Generate speech using active provider
   * Automatically falls back to alternative provider if primary fails
   */
  async generateSpeech(text, options = {}) {
    const provider = this.getProvider();

    if (!provider) {
      // Default Alexa voice (no TTS)
      logger.debug('Using default Alexa voice (no TTS provider)');
      return null;
    }

    logger.info('Generating speech', {
      provider: this.currentProvider,
      textLength: text.length,
      options: options
    });

    try {
      const result = await provider.generateSpeech(text, options);
      logger.info('Speech generation success', {
        provider: this.currentProvider,
        audioSize: result.audio ? result.audio.length : 0
      });
      return result;
    } catch (error) {
      logger.error('Speech generation failed', {
        provider: this.currentProvider,
        error: error.message
      });

      // Try fallback provider
      const fallbackProvider = this._getFallbackProvider();
      if (fallbackProvider) {
        logger.warn('Attempting fallback provider', {
          from: this.currentProvider,
          to: fallbackProvider.getServiceName()
        });

        try {
          const result = await fallbackProvider.generateSpeech(text, options);
          logger.info('Fallback provider success', {
            provider: fallbackProvider.getServiceName(),
            audioSize: result.audio ? result.audio.length : 0
          });
          return result;
        } catch (fallbackError) {
          logger.error('Fallback provider also failed', {
            error: fallbackError.message
          });
          throw new Error('All TTS providers failed');
        }
      }

      throw error;
    }
  }

  /**
   * Get fallback provider
   */
  _getFallbackProvider() {
    // Google Cloud TTS falls back to ElevenLabs, then Polly
    if (this.currentProvider === 'googleCloud') {
      if (this.providers.elevenlabs && this.providers.elevenlabs.isReady()) {
        return this.providers.elevenlabs;
      }
      if (this.providers.polly && this.providers.polly.isReady()) {
        return this.providers.polly;
      }
    }

    // ElevenLabs falls back to Google Cloud, then Polly
    if (this.currentProvider === 'elevenlabs') {
      if (this.providers.googleCloud && this.providers.googleCloud.isReady()) {
        return this.providers.googleCloud;
      }
      if (this.providers.polly && this.providers.polly.isReady()) {
        return this.providers.polly;
      }
    }

    // Polly falls back to Google Cloud, then ElevenLabs
    if (this.currentProvider === 'polly') {
      if (this.providers.googleCloud && this.providers.googleCloud.isReady()) {
        return this.providers.googleCloud;
      }
      if (this.providers.elevenlabs && this.providers.elevenlabs.isReady()) {
        return this.providers.elevenlabs;
      }
    }

    return null;
  }

  /**
   * Get current provider name
   */
  getCurrentProviderName() {
    return this.currentProvider || 'none';
  }

  /**
   * Check if TTS is enabled
   */
  isTTSEnabled() {
    return this.currentProvider !== 'default';
  }
}

// Singleton instance
let factoryInstance = null;

function getInstance() {
  if (!factoryInstance) {
    factoryInstance = new TTSServiceFactory();
    factoryInstance.initialize();
  }

  return factoryInstance;
}

module.exports = { getInstance, TTSServiceFactory };
