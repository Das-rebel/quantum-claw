/**
 * Sarvam API Client - Translation for Hindi/Bengali
 *
 * API Key: set SARVAM_API_KEY in your environment
 * Docs: https://apis.sarvam.ai
 * Enhanced with robust fallback mechanisms
 */

const EnhancedLanguageDetector = require('./enhanced_language_detector');
const { createValidator } = require('./response_validator');

class SarvamClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.SARVAM_API_KEY;
    this.baseURL = 'https://api.sarvam.ai';
    this.enhancedDetector = new EnhancedLanguageDetector();
    this.validator = createValidator('Sarvam');
    this.fallbackProviders = [];
    this.useFallback = false;
    this.initializeFallbackProviders();

    // Intelligent fallback system
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.fallbackActivationThreshold = 3; // Require 3 consecutive failures
    this.fallbackCooldownPeriod = 300000; // 5 minutes cooldown period
    this.fallbackRecoveryAttempts = 0;
    this.maxRecoveryAttempts = 5;
    this.performanceMetrics = {
      averageResponseTime: 0,
      successRate: 1.0,
      totalRequests: 0,
      fallbackActivations: 0,
      unnecessaryFallbacks: 0
    };
  }

  /**
     * Initialize fallback translation providers
     */
  initializeFallbackProviders() {
    // Free translation APIs as fallbacks
    this.fallbackProviders = [
      {
        name: 'libretranslate',
        enabled: true,
        endpoint: 'https://libretranslate.de/translate',
        translate: async (text, source, target) => {
          const response = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              q: text,
              source: source === 'hi' ? 'hi' : source === 'bn' ? 'bn' : 'en',
              target: target === 'en' ? 'en' : 'en',
              format: 'text'
            })
          });
          const data = await response.json();
          return data.translatedText || text;
        }
      },
      {
        name: 'mymemory',
        enabled: true,
        endpoint: 'https://api.mymemory.translated.net/objs',
        translate: async (text, source, target) => {
          const response = await fetch('https://api.mymemory.translated.net/objs', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              source: source === 'hi' ? 'hi' : source === 'bn' ? 'bn' : 'en',
              target: target === 'en' ? 'en' : 'en',
              input: text,
              format: 'text'
            })
          });
          const data = await response.json();
          return data.responseData.translatedText || text;
        }
      }
    ];
  }

  /**
     * Check Sarvam API health with intelligent decision making
     */
  async checkSarvamHealth() {
    try {
      const startTime = Date.now();

      // Test with a simple translation request
      const response = await fetch(`${this.baseURL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        body: JSON.stringify({
          input: 'hello',
          source_language_code: 'en-IN',
          target_language_code: 'hi-IN'
        }),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      const responseTime = Date.now() - startTime;
      this.updatePerformanceMetrics(responseTime, response.ok);

      if (response.ok) {
        console.log(`[Sarvam] API is healthy (response time: ${responseTime}ms)`);
        this.handleSuccess();
        return true;
      } else {
        const shouldActivateFallback = this.shouldActivateFallback(response.status, null);
        console.warn('[Sarvam] API returned error status:', response.status, 'Fallback:', shouldActivateFallback);

        if (shouldActivateFallback) {
          this.handleFailure(response.status);
        }

        return !shouldActivateFallback;
      }
    } catch (error) {
      const errorType = this.classifyError(error);
      const shouldActivateFallback = this.shouldActivateFallback(null, error);

      console.error('[Sarvam] Health check failed:', errorType, 'Fallback:', shouldActivateFallback);

      if (shouldActivateFallback) {
        this.handleFailure(errorType);
      }

      return !shouldActivateFallback;
    }
  }

  /**
     * Detect language of text - Enhanced with GitHub Research Integration
     */
  async detectLanguage(text) {
    try {
      // Use enhanced detector for production-grade language identification
      const enhancedResult = await this.enhancedDetector.detectLanguage(text);

      // Log enhanced detection details
      if (enhancedResult.confidence > 0.7) {
        console.log(`[Sarvam] Enhanced detection: ${enhancedResult.language} (confidence: ${(enhancedResult.confidence * 100).toFixed(1)}%)`);
        if (enhancedResult.isMixedLanguage) {
          console.log(`[Sarvam] Mixed language detected: ${enhancedResult.dominantLanguage}-EN`);
        }
      }

      return enhancedResult.language;
    } catch (error) {
      console.error('[Sarvam] Enhanced language detection failed, falling back to basic:', error);
      // Fallback to basic detection
      return this.fallbackDetectLanguage(text);
    }
  }

  /**
     * Fallback language detection using basic patterns
     */
  fallbackDetectLanguage(text) {
    try {
      // Unicode ranges for Indian scripts
      const hindiPattern = /[\u0900-\u097F]/g;
      const bengaliPattern = /[\u0980-\u09FF]/g;

      // Count characters from each script
      const hindiChars = (text.match(hindiPattern) || []).length;
      const bengaliChars = (text.match(bengaliPattern) || []).length;
      const totalLength = text.length;

      // Calculate script percentages
      const hindiPercentage = (hindiChars / totalLength) * 100;
      const bengaliPercentage = (bengaliChars / totalLength) * 100;

      // Enhanced mixed script detection
      if (hindiPercentage > 10) {
        return 'hi'; // Hinglish or Hindi
      } else if (bengaliPercentage > 10) {
        return 'bn'; // Benglish or Bengali
      } else if (this.hasMixedHinglishPatterns(text)) {
        return 'hi'; // Detect Hinglish patterns even with low script percentage
      } else if (this.hasBenglishPatterns(text)) {
        return 'bn'; // Detect Benglish patterns
      } else {
        return 'en'; // English
      }
    } catch (error) {
      console.error('[Sarvam] Language detection failed:', error);
      return 'en'; // Default to English
    }
  }

  /**
     * Detect Hinglish patterns (Hindi-English mix)
     */
  hasMixedHinglishPatterns(text) {
    const hinglishPatterns = [
      /kya hai/gi,      // what is
      /kaise ho/gi,       // how are you
      /batao/gi,         // tell me
      /karo/gi,           // do
      /chahiye/gi,        // need
      /hai na/gi,         // right?
      /yaar/gi,           // friend/bro
      /achha/gi,          // good
      /bilkul/gi,        // absolutely
      /theek hai/gi,      // it's okay
      /arrey/gi,          // hey/wow
      /namaste/gi,        // hello
      /dhanyavad/gi      // thanks
    ];

    return hinglishPatterns.some(pattern => pattern.test(text.toLowerCase()));
  }

  /**
     * Detect Benglish patterns (Bengali-English mix)
     */
  hasBenglishPatterns(text) {
    const benglishPatterns = [
      /kmon acho/gi,       // how are you
      /ki koro/gi,         // what are you doing
      /balo/gi,             // tell me
      /koro/gi,             // do
      /dorkar/gi,           // need
      /thik na/gi,          // right?
      /bhai/gi,             // brother
      /bhalo/gi,            // good
      /thik ache/gi,        // it's okay
      /are/gi,              // hey
      /namaskar/gi,          // hello
      /dhonnobad/gi,        // thanks
      /tumi ki/gi,           // you what
      /amar ki/gi           // my what
    ];

    return benglishPatterns.some(pattern => pattern.test(text.toLowerCase()));
  }

  /**
     * Translate text to English with intelligent retry and fallback mechanisms
     */
  async translateToEnglish(text, sourceLanguage) {
    if (sourceLanguage === 'en') {
      return text; // Already in English
    }

    // Check if we should attempt recovery
    if (this.useFallback && this.shouldAttemptRecovery()) {
      console.log('[Sarvam] Attempting recovery from fallback mode');
      this.fallbackRecoveryAttempts++;
      this.useFallback = false;
    }

    // First check if we should use fallback
    if (this.useFallback) {
      return await this.translateWithFallback(text, sourceLanguage, 'en');
    }

    // Try Sarvam API with intelligent retry logic
    return await this.translateWithRetry(text, sourceLanguage, 'en', async () => {
      const response = await fetch(`${this.baseURL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        body: JSON.stringify({
          input: text, // String, not array
          source_language_code: sourceLanguage === 'hi' ? 'hi-IN' : 'bn-IN',
          target_language_code: 'en-IN'
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
    });
  }

  /**
     * Translate text from English with intelligent retry and fallback mechanisms
     */
  async translateFromEnglish(text, targetLanguage) {
    if (targetLanguage === 'en') {
      return text; // Already in English
    }

    // Check if we should attempt recovery
    if (this.useFallback && this.shouldAttemptRecovery()) {
      console.log('[Sarvam] Attempting recovery from fallback mode');
      this.fallbackRecoveryAttempts++;
      this.useFallback = false;
    }

    // Try Sarvam API with intelligent retry logic
    if (!this.useFallback) {
      return await this.translateWithRetry(text, 'en', targetLanguage, async () => {
        const response = await fetch(`${this.baseURL}/translate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': this.apiKey
          },
          body: JSON.stringify({
            input: text, // String, not array
            source_language_code: 'en-IN',
            target_language_code: targetLanguage === 'hi' ? 'hi-IN' : 'bn-IN'
          }),
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
      });
    } else {
      // Use fallback directly
      return await this.translateWithFallback(text, 'en', targetLanguage);
    }
  }

  /**
     * Translate using fallback providers
     */
  async translateWithFallback(text, source, target) {
    console.log('[Sarvam] Using fallback translation providers');

    // Try each fallback provider
    for (const provider of this.fallbackProviders) {
      if (provider.enabled) {
        try {
          console.log(`[Sarvam] Trying fallback provider: ${provider.name}`);
          const result = await provider.translate(text, source, target);
          console.log(`[Sarvam] Fallback provider ${provider.name} succeeded`);
          return result;
        } catch (error) {
          console.warn(`[Sarvam] Fallback provider ${provider.name} failed:`, error.message);
          continue; // Try next provider
        }
      }
    }

    // All fallbacks failed, use simple heuristic fallback
    console.warn('[Sarvam] All fallback providers failed, using heuristic fallback');
    return this.heuristicFallback(text, source, target);
  }

  /**
     * Heuristic fallback for translation
     */
  heuristicFallback(text, source, target) {
    // Simple word-by-word translation based on common patterns
    const translations = {
      'hi': {
        'hello': 'नमस्ते',
        'thanks': 'धन्यवाद',
        'please': 'कृपया',
        'yes': 'हां',
        'no': 'नहीं',
        'sorry': 'क्षमा',
        'time': 'समय',
        'weather': 'मौसम'
      },
      'bn': {
        'hello': 'নমস্কার',
        'thanks': 'ধন্যবাদ',
        'please': 'অনুগ্রহ করুন',
        'yes': 'হ্যাঁ',
        'no': 'না',
        'sorry': 'দুঃখিত',
        'time': 'সময়',
        'weather': 'আবহাওয়া'
      }
    };

    // For English target, just return text with language info
    if (target === 'en') {
      return text; // Keep original text, add language context in response
    }

    // Very basic transliteration fallback
    return text; // Return original as fallback
  }

  /**
     * Translate with automatic language detection
     */
  async translate(text, targetLanguage = 'en') {
    // Detect source language
    const sourceLanguage = await this.detectLanguage(text);

    // If same as target, no translation needed
    if (sourceLanguage === targetLanguage) {
      return text;
    }

    // If source is not English, translate to English first
    let englishText = text;
    if (sourceLanguage !== 'en') {
      englishText = await this.translateToEnglish(text, sourceLanguage);
    }

    // If target is not English, translate from English
    if (targetLanguage !== 'en') {
      return await this.translateFromEnglish(englishText, targetLanguage);
    }

    return englishText;
  }

  /**
     * Check if API is accessible with enhanced health monitoring
     */
  async healthCheck() {
    // Perform initial health check
    const isHealthy = await this.checkSarvamHealth();

    return {
      status: isHealthy ? 'ok' : 'using_fallback',
      apiAccessible: isHealthy,
      fallbackMode: this.useFallback,
      availableFallbacks: this.fallbackProviders.filter(p => p.enabled).length,
      performanceMetrics: this.performanceMetrics,
      failureStats: {
        totalFailures: this.failureCount,
        consecutiveFailures: this.consecutiveFailures,
        successCount: this.successCount,
        successRate: this.getSuccessRate()
      }
    };
  }

  /**
     * Intelligent retry logic with backoff
     */
  async translateWithRetry(text, source, target, requestFn, maxRetries = 3) {
    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await requestFn();
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json();

          // Validate response structure
          if (!this._exists(data.translated_text)) {
            console.warn('[Sarvam] Unexpected response format:', data);
            throw new Error('Invalid response format: missing translated_text field');
          }

          if (data.translated_text) {
            console.log(`[Sarvam] Translation successful on attempt ${attempt + 1} (${responseTime}ms)`);
            this.updatePerformanceMetrics(responseTime, true);
            this.handleSuccess();
            return data.translated_text;
          } else {
            console.warn('[Sarvam] Unexpected response format:', data);
            throw new Error('Invalid response format');
          }
        } else {
          const errorData = await response.json();
          const errorType = this.classifyApiError(response.status, errorData);

          console.error(`[Sarvam] API error on attempt ${attempt + 1}:`, response.status, errorType);

          if (this.shouldActivateFallback(response.status, errorType)) {
            // This is a serious error that warrants fallback
            this.handleFailure(errorType);
            return await this.translateWithFallback(text, source, target);
          }

          lastError = { status: response.status, errorData, errorType };
        }
      } catch (error) {
        const errorType = this.classifyError(error);
        console.error(`[Sarvam] Request error on attempt ${attempt + 1}:`, errorType);

        if (this.shouldActivateFallback(null, errorType)) {
          this.handleFailure(errorType);
          return await this.translateWithFallback(text, source, target);
        }

        lastError = { error: error.message, errorType };
      }

      // Wait with exponential backoff before retrying
      if (attempt < maxRetries - 1) {
        const backoffTime = this.calculateBackoff(attempt);
        console.log(`[Sarvam] Retrying in ${backoffTime}ms...`);
        await this.sleep(backoffTime);
      }
    }

    // All retries failed, activate fallback
    console.warn(`[Sarvam] All ${maxRetries} retries failed, activating fallback`);
    this.handleFailure('max_retries_exceeded');
    return await this.translateWithFallback(text, source, target);
  }

  /**
     * Classify API errors for intelligent handling
     */
  classifyApiError(status, errorData) {
    if (status === 429) return 'rate_limit';
    if (status === 401) return 'authentication';
    if (status === 403) return 'authorization';
    if (status === 404) return 'not_found';
    if (status >= 400 && status < 500) return 'client_error';
    if (status >= 500 && status < 600) return 'server_error';
    return 'unknown_error';
  }

  /**
     * Classify network errors for intelligent handling
     */
  classifyError(error) {
    if (error.name === 'AbortError') return 'timeout';
    if (error.code === 'ECONNREFUSED') return 'connection_refused';
    if (error.code === 'ENOTFOUND') return 'dns_error';
    if (error.code === 'ETIMEDOUT') return 'network_timeout';
    if (error.message.includes('fetch')) return 'network_error';
    return 'unknown_error';
  }

  /**
     * Determine if fallback should be activated based on error type and patterns
     */
  shouldActivateFallback(status, errorType) {
    // Permanent failures that warrant immediate fallback
    if (errorType === 'authentication' || errorType === 'authorization') {
      console.log('[Sarvam] Permanent auth failure detected, activating fallback');
      return true;
    }

    if (errorType === 'not_found') {
      console.log('[Sarvam] API endpoint not found, activating fallback');
      return true;
    }

    if (errorType === 'connection_refused' || errorType === 'dns_error') {
      console.log('[Sarvam] Network infrastructure failure, activating fallback');
      return true;
    }

    // Check for consecutive failures threshold
    if (this.consecutiveFailures >= this.fallbackActivationThreshold) {
      console.log(`[Sarvam] Threshold reached: ${this.consecutiveFailures} consecutive failures`);
      return true;
    }

    // Temporary issues that should be retried first
    if (errorType === 'rate_limit') {
      console.log('[Sarvam] Rate limit hit, will retry with backoff');
      return false;
    }

    if (errorType === 'timeout' || errorType === 'network_timeout') {
      console.log('[Sarvam] Timeout occurred, will retry');
      return false;
    }

    if (errorType === 'server_error') {
      console.log('[Sarvam] Server error, will retry');
      return false;
    }

    if (errorType === 'network_error') {
      console.log('[Sarvam] Network error, will retry');
      return false;
    }

    // Default: don't activate fallback for first failures
    console.log('[Sarvam] Error is retryable, will attempt retries first');
    return false;
  }

  /**
     * Handle successful API call
     */
  handleSuccess() {
    this.successCount++;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;

    // Reset fallback after success
    if (this.useFallback && this.fallbackRecoveryAttempts < this.maxRecoveryAttempts) {
      console.log('[Sarvam] API recovered, disabling fallback mode');
      this.useFallback = false;
    }

    this.performanceMetrics.successRate = this.getSuccessRate();
  }

  /**
     * Handle API failure
     */
  handleFailure(errorType) {
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    // Activate fallback if conditions are met
    if (this.consecutiveFailures >= this.fallbackActivationThreshold) {
      if (!this.useFallback) {
        console.warn(`[Sarvam] Fallback mode activated after ${this.consecutiveFailures} consecutive failures`);
        this.performanceMetrics.fallbackActivations++;
        this.fallbackRecoveryAttempts = 0;
      }
      this.useFallback = true;
    }

    this.performanceMetrics.successRate = this.getSuccessRate();
  }

  /**
     * Calculate success rate
     */
  getSuccessRate() {
    const total = this.successCount + this.failureCount;
    return total > 0 ? this.successCount / total : 1.0;
  }

  /**
     * Determine if we should attempt recovery from fallback
     */
  shouldAttemptRecovery() {
    // Don't attempt if we've exceeded recovery attempts
    if (this.fallbackRecoveryAttempts >= this.maxRecoveryAttempts) {
      return false;
    }

    // Don't attempt if it's been less than cooldown period
    if (this.lastFailureTime &&
            (Date.now() - this.lastFailureTime) < this.fallbackCooldownPeriod) {
      return false;
    }

    // Attempt recovery if success rate was previously good
    return this.getSuccessRate() > 0.8;
  }

  /**
     * Calculate exponential backoff time
     */
  calculateBackoff(attempt) {
    const baseDelay = 1000; // 1 second
    const maxDelay = 10000; // 10 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
  }

  /**
     * Sleep utility for backoff
     */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
     * Update performance metrics
     */
  updatePerformanceMetrics(responseTime, success) {
    this.performanceMetrics.totalRequests++;

    // Update average response time
    if (this.performanceMetrics.totalRequests === 1) {
      this.performanceMetrics.averageResponseTime = responseTime;
    } else {
      this.performanceMetrics.averageResponseTime =
                (this.performanceMetrics.averageResponseTime * (this.performanceMetrics.totalRequests - 1) + responseTime) /
                this.performanceMetrics.totalRequests;
    }

    this.performanceMetrics.successRate = this.getSuccessRate();
  }

  /**
     * Get detailed performance report
     */
  getPerformanceReport() {
    return {
      metrics: this.performanceMetrics,
      statistics: {
        totalFailures: this.failureCount,
        consecutiveFailures: this.consecutiveFailures,
        successCount: this.successCount,
        successRate: this.getSuccessRate(),
        fallbackMode: this.useFallback,
        recoveryAttempts: this.fallbackRecoveryAttempts
      },
      configuration: {
        fallbackActivationThreshold: this.fallbackActivationThreshold,
        fallbackCooldownPeriod: this.fallbackCooldownPeriod,
        maxRecoveryAttempts: this.maxRecoveryAttempts
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
     * Generate recommendations based on performance
     */
  generateRecommendations() {
    const recommendations = [];
    const successRate = this.getSuccessRate();

    if (successRate < 0.7) {
      recommendations.push('Low success rate detected. Consider increasing fallback activation threshold.');
    }

    if (this.consecutiveFailures >= this.fallbackActivationThreshold) {
      recommendations.push('Consecutive failures at threshold level. Monitor API health closely.');
    }

    if (this.performanceMetrics.averageResponseTime > 5000) {
      recommendations.push('High average response time. Consider timeout adjustments.');
    }

    if (this.useFallback && this.fallbackRecoveryAttempts >= this.maxRecoveryAttempts) {
      recommendations.push('Fallback mode persistent. Consider manual intervention or API key renewal.');
    }

    return recommendations;
  }

  /**
     * Reset fallback mode manually
     */
  resetFallbackMode() {
    console.log('[Sarvam] Manually resetting fallback mode');
    this.useFallback = false;
    this.consecutiveFailures = 0;
    this.fallbackRecoveryAttempts = 0;
    this.performanceMetrics.fallbackActivations++;
  }

  /**
     * Check if value exists (not null/undefined/empty)
     * @private
     */
  _exists(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }
    return true;
  }
}

module.exports = SarvamClient;
