/**
 * Hybrid TTS Orchestrator
 *
 * Intelligently routes TTS requests to the best service:
 * - English: Use Alexa's built-in SSML (fastest)
 * - Short Hindi/Bengali (< 100 chars): Use Sarvam (fast)
 * - Long Hindi/Bengali (> 100 chars): Use Google TTS (best quality)
 *
 * This provides optimal balance of speed, quality, and cost.
 */

const AudioHostingService = require('./audio_hosting_service');
const GoogleTTSClient = require('./google_tts_client');
const SarvamTTSClient = require('./sarvam_tts_client');

class HybridTTSOrchestrator {
  constructor(config = {}) {
    // Initialize TTS clients with safe defaults
    this.googleTTS = config.googleApiKey ? new GoogleTTSClient(config.googleApiKey) : null;
    this.sarvamTTS = config.sarvamApiKey ? new SarvamTTSClient(config.sarvamApiKey) : null;

    // Initialize audio hosting
    this.audioHosting = new AudioHostingService({
      audioDir: config.audioDir,
      baseUrl: config.baseUrl,
      maxAge: config.maxAge || 3600000, // 1 hour
      cleanupInterval: config.cleanupInterval || 300000 // 5 minutes
    });

    // Configuration
    this.shortTextThreshold = config.shortTextThreshold || 100; // characters
    this.useWaveNetThreshold = config.useWaveNetThreshold || 100; // characters

    console.log('🎙️ Hybrid TTS Orchestrator initialized');
    console.log(`   Short text threshold: ${this.shortTextThreshold} chars`);
    console.log(`   Audio directory: ${config.audioDir || 'default'}`);
  }

  /**
     * Main method: Generate speech and return public URL
     * @param {string} text - Text to speak
     * @param {string} language - Language code ('en', 'hi', 'bn')
     * @param {object} options - Additional options
     * @returns {Promise<string|null>} Audio URL or null (for SSML)
     */
  async generateSpeech(text, language = 'en', options = {}) {
    console.log('\n🎯 TTS Orchestrator: Processing request');
    console.log(`   Language: ${language}`);
    console.log(`   Text length: ${text.length} chars`);
    console.log(`   Text: "${text.substring(0, 50)}..."`);

    // Route based on language
    if (language === 'en') {
      // English: Use SSML (no audio file needed)
      console.log('   ✅ English: Using SSML (no audio file)');
      return null; // Signal to use SSML instead
    }

    // Hindi/Bengali: Route based on text length
    if (text.length <= this.shortTextThreshold) {
      return await this.generateWithSarvam(text, language, options);
    } else {
      return await this.generateWithGoogle(text, language, options);
    }
  }

  /**
     * Generate speech using Sarvam TTS (fast, good for short text)
     * @param {string} text - Text to speak
     * @param {string} language - Language code
     * @param {object} options - Options
     * @returns {Promise<string>} Audio URL
     */
  async generateWithSarvam(text, language, options = {}) {
    console.log('   ⚡ Using Sarvam TTS (fast, short text)');

    try {
      // Generate audio
      const audioBuffer = await this.sarvamTTS.synthesize(
        text,
        language,
        options.gender || 'Female'
      );

      // Save and get URL
      const audioUrl = await this.audioHosting.saveAudioWithMetadata(audioBuffer, {
        text,
        language,
        service: 'sarvam',
        extension: 'wav'
      });

      console.log(`   ✅ Sarvam TTS complete: ${audioBuffer.length} bytes`);
      return audioUrl;

    } catch (error) {
      console.error(`   ❌ Sarvam TTS failed: ${error.message}`);
      // Fallback to Google TTS
      console.log('   🔄 Falling back to Google TTS...');
      return await this.generateWithGoogle(text, language, options);
    }
  }

  /**
     * Generate speech using Google TTS (best quality, good for long text)
     * @param {string} text - Text to speak
     * @param {string} language - Language code
     * @param {object} options - Options
     * @returns {Promise<string>} Audio URL
     */
  async generateWithGoogle(text, language, options = {}) {
    console.log('   🎵 Using Google TTS (best quality, long text)');

    try {
      // Auto-select voice type (WaveNet for long text, Standard for short)
      const audioBuffer = await this.googleTTS.synthesizeAuto(text, language);

      // Save and get URL
      const audioUrl = await this.audioHosting.saveAudioWithMetadata(audioBuffer, {
        text,
        language,
        service: 'google',
        extension: 'mp3'
      });

      console.log(`   ✅ Google TTS complete: ${audioBuffer.length} bytes`);
      return audioUrl;

    } catch (error) {
      console.error(`   ❌ Google TTS failed: ${error.message}`);
      // Always fallback to Sarvam TTS (regardless of text length)
      console.log('   🔄 Falling back to Sarvam TTS...');
      try {
        return await this.generateWithSarvam(text, language, options);
      } catch (sarvamError) {
        // If Sarvam also fails, throw the original error
        throw new Error(`Both TTS services failed: Google (${error.message}), Sarvam (${sarvamError.message})`);
      }
    }
  }

  /**
     * Build Alexa response (SSML or audio)
     * @param {string} text - Text to speak
     * @param {string} language - Language code
     * @param {boolean} shouldEndSession - End session after speech
     * @returns {Promise<object>} Alexa response object
     */
  async buildAlexaResponse(text, language = 'en', shouldEndSession = false) {
    // Generate speech
    const audioUrl = await this.generateSpeech(text, language);

    // Build response
    if (audioUrl === null) {
      // English: Use SSML
      return this.buildSSMLResponse(text, language, shouldEndSession);
    } else {
      // Hindi/Bengali: Use audio URL
      return this.buildAudioResponse(audioUrl, shouldEndSession);
    }
  }

  /**
     * Build SSML response (for English)
     * @param {string} text - Text to speak
     * @param {string} language - Language code
     * @param {boolean} shouldEndSession - End session
     * @returns {object} Alexa response
     */
  buildSSMLResponse(text, language = 'en', shouldEndSession = false) {
    const voiceConfig = require('../voice_config.json');

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'SSML',
          ssml: `<speak><voice name="${voiceConfig.voice}">${this.escapeXml(text)}</voice></speak>`
        },
        shouldEndSession: shouldEndSession
      }
    };
  }

  /**
     * Build audio response (for Hindi/Bengali)
     * @param {string} audioUrl - Public HTTPS URL to audio
     * @param {boolean} shouldEndSession - End session
     * @returns {object} Alexa response
     */
  buildAudioResponse(audioUrl, shouldEndSession = false) {
    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'SSML',
          ssml: `<speak><audio src="${audioUrl}"/></speak>`
        },
        shouldEndSession: shouldEndSession
      }
    };
  }

  /**
     * Escape special XML characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
  escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
     * Update base URL (for ngrok changes)
     * @param {string} baseUrl - New base URL
     */
  setBaseUrl(baseUrl) {
    this.audioHosting.setBaseUrl(baseUrl);
  }

  /**
     * Cleanup old audio files
     */
  cleanup() {
    this.audioHosting.cleanup();
  }

  /**
     * Stop orchestrator
     */
  stop() {
    this.audioHosting.stopCleanup();
    console.log('⏹️ Hybrid TTS Orchestrator stopped');
  }
}

module.exports = HybridTTSOrchestrator;
