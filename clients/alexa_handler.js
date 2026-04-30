/**
 * Alexa Request Handler - Alexa-specific logic only
 *
 * Responsibilities:
 * - Parse Alexa request format
 * - Map Alexa user to TMLPD session
 * - Add Alexa-specific context
 * - Format responses for Alexa
 */

const TMLPDClient = require('./tmlpd_client');
const SarvamClient = require('./sarvam_client');
const GoogleTranslateClient = require('./google_translate_client');
const { hashValue } = require('./logger');

class AlexaRequestHandler {
  constructor(options = {}) {
    this.tmlpdClient = new TMLPDClient(options.tmlpd);
    this.sarvamClient = new SarvamClient(options.sarvamApiKey);
    this.googleTranslateClient = new GoogleTranslateClient(options.googleTranslate || {});
    this.voiceConfig = options.voice || null;
    this.logVerbose = Boolean(options.logVerbose);
    this.userLanguagePrefs = new Map(); // userId -> language preference

    // Language detection method tracking
    this.detectionMethodStats = {
      google: 0,
      enhanced: 0,
      fallback: 0,
      total: 0
    };
  }

  /**
     * Initialize TMLPD connection
     */
  async initialize() {
    await this.tmlpdClient.connect();
    const status = await this.tmlpdClient.getStatus();
    console.log('[Alexa] TMLPD Status:', status);

    // Check Sarvam API
    const sarvamStatus = await this.sarvamClient.healthCheck();
    console.log('[Alexa] Sarvam API Status:', sarvamStatus.status);

    // Check Google Translate API
    const googleHealth = await this.googleTranslateClient.healthCheck();
    console.log('[Alexa] Google Translate API Status:', googleHealth ? 'Healthy' : 'Unhealthy');
  }

  /**
     * Handle incoming Alexa request
     */
  async handleRequest(request) {
    try {
      // 1. Parse Alexa request
      const intent = this.parseIntent(request);
      const userId = this.getUserId(request);
      const query = this.extractQuery(request, intent);

      const userHash = hashValue(userId);
      console.log(`[Alexa] Request: intent=${intent.name}, user=${userHash || 'unknown'}`);
      if (this.logVerbose) {
        console.log(`[Alexa] Query: ${query}`);
      }

      // 2. Detect language using Google Translate API with fallback to enhanced detector
      const detectionResult = await this.detectLanguageWithFallback(query);
      const detectedLang = detectionResult.language;
      const detectionMethod = detectionResult.method;
      const detectionConfidence = detectionResult.confidence;

      // Track detection method statistics
      this.trackDetectionMethod(detectionMethod);

      const userLangPref = this.getUserLanguagePreference(userId);
      const targetLang = userLangPref || detectedLang;

      let translatedQuery = query;
      let originalLanguage = detectedLang;
      const isMixedLanguage = detectionResult.isTransliterated || detectionResult.enhancedDetails?.isMixedLanguage;

      // Enhanced mixed language handling with confidence scores
      if (isMixedLanguage) {
        console.log(`[Alexa] Mixed language detected (${detectedLang}-EN) using ${detectionMethod}`);
        console.log(`[Alexa] Detection confidence: ${(detectionConfidence * 100).toFixed(1)}%`);
        console.log(`[Alexa] Processing time: ${detectionResult.processingTime}ms`);

        // Use advanced mixed language processing
        if (detectedLang !== 'en') {
          if (detectionMethod === 'google') {
            // Use Google-detected language for translation with fallback
            translatedQuery = await this.translateWithSarvamOrFallback(query, detectedLang);
          } else {
            // Use enhanced detection details for mixed language processing with fallback
            translatedQuery = await this.translateMixedLanguageAdvanced(query, detectedLang, detectionResult.enhancedDetails);
          }
        }
      } else if (detectedLang !== 'en') {
        // Pure non-English language - translate using Sarvam with fallback
        console.log(`[Alexa] Language detected: ${detectedLang} using ${detectionMethod} (confidence: ${(detectionConfidence * 100).toFixed(1)}%)`);
        translatedQuery = await this.translateWithSarvamOrFallback(query, detectedLang);
      } else {
        console.log(`[Alexa] English detected using ${detectionMethod} (confidence: ${(detectionConfidence * 100).toFixed(1)}%)`);
      }

      if (this.logVerbose) {
        console.log(`[Alexa] Original query: ${query}`);
        console.log(`[Alexa] Translated query: ${translatedQuery}`);
      }

      // 3. Map to TMLPD session
      const sessionId = this.tmlpdClient.getTMLPDSession(userId);

      // 4. Build context (include language info)
      const context = this.buildContext(request, intent);
      context.language = detectedLang;
      context.originalQuery = query;

      // 5. Determine execution mode
      const mode = this.selectExecutionMode(intent, translatedQuery);

      // 6. Execute via TMLPD (with translated query)
      const tmlpdResponse = await this.executeViaTMLPD(translatedQuery, sessionId, context, mode);

      // 6. Store in memory for continuity
      await this.storeInteraction(sessionId, query, tmlpdResponse, intent);

      // 7. Translate response back to original language if needed
      let finalResponse = tmlpdResponse;
      if (originalLanguage !== 'en' && tmlpdResponse.content) {
        console.log(`[Alexa] Translating response back to ${originalLanguage}...`);
        const translatedBack = await this.sarvamClient.translateFromEnglish(
          tmlpdResponse.content,
          originalLanguage
        );
        finalResponse = {
          ...tmlpdResponse,
          content: translatedBack,
          originalEnglish: tmlpdResponse.content
        };
        if (this.logVerbose) {
          console.log(`[Alexa] Translated response: ${translatedBack.substring(0, 100)}...`);
        }
      }

      // 8. Format for Alexa
      return this.formatAlexaResponse(finalResponse);

    } catch (error) {
      console.error('[Alexa] Request failed:', error);
      return this.handleError(error);
    }
  }

  /**
     * Parse intent from Alexa request
     */
  parseIntent(request) {
    const intent = request.request.intent;
    return {
      name: intent ? intent.name : 'GeneralQueryIntent',
      slots: intent ? intent.slots : {},
      confirmationStatus: intent ? intent.confirmationStatus : 'NONE'
    };
  }

  /**
     * Extract user ID from Alexa request
     */
  getUserId(request) {
    return request.session.user.userId;
  }

  /**
     * Extract query from Alexa request
     */
  extractQuery(request, intent) {
    // Try to get from intent slot (handle both uppercase and lowercase slot names)
    if (intent.slots) {
      // Check for lowercase 'query' slot (Alexa standard)
      if (intent.slots.query && intent.slots.query.value) {
        return intent.slots.query.value;
      }
      // Check for uppercase 'Query' slot (fallback)
      if (intent.slots.Query && intent.slots.Query.value) {
        return intent.slots.Query.value;
      }
      // Check for WhatsApp 'fullRequest' slot
      if (intent.slots.fullRequest && intent.slots.fullRequest.value) {
        return intent.slots.fullRequest.value;
      }
    }

    // Fallback to request body
    return request.request.intent?.name || 'General query';
  }

  /**
     * Build context for TMLPD
     */
  buildContext(request, intent) {
    return {
      platform: 'alexa',
      deviceId: request.context?.System?.device?.deviceId || 'unknown-device',
      intent: intent.name,
      capabilities: this.getCapabilities(request),
      timestamp: new Date().toISOString()
    };
  }

  /**
     * Get device capabilities
     */
  getCapabilities(request) {
    const capabilities = [];

    try {
      if (request.context?.System?.device?.supportedInterfaces) {
        const interfaces = request.context.System.device.supportedInterfaces;
        if (interfaces.AudioPlayer) capabilities.push('AudioPlayer');
        if (interfaces.Display) capabilities.push('Display');
        if (interfaces.VideoApp) capabilities.push('VideoApp');
      }
    } catch (error) {
      // In test environment or missing context, return default capabilities
      capabilities.push('AudioPlayer');
    }

    return capabilities;
  }

  /**
     * Select execution mode based on intent
     */
  selectExecutionMode(intent, query) {
    const intentName = intent.name;

    // Complex tasks use HALO orchestration
    if (intentName === 'ComplexTaskIntent' || intentName === 'CodeGenerationIntent') {
      return 'halo_orchestration';
    }

    // Follow-up questions use memory
    if (intentName === 'FollowUpIntent' || intentName === 'ClarificationIntent') {
      return 'use_memory';
    }

    // Comparison queries use parallel execution
    if (intentName === 'ComparisonIntent') {
      return 'parallel';
    }

    // Default: Let TMLPD decide
    return 'auto';
  }

  /**
     * Execute query via TMLPD
     */
  async executeViaTMLPD(query, sessionId, context, mode) {
    const prompt = this.buildPrompt(query, context);

    switch (mode) {
    case 'halo_orchestration':
      return await this.tmlpdClient.executeAgentParallel(prompt, {
        models: ['claude-3-5-sonnet-20241022', 'anthropic/claude-opus-4-5-20251101']
      });

    case 'parallel':
      return await this.tmlpdClient.executeAgentParallel(prompt);

    case 'use_memory':
      // Recall context first
      const history = await this.tmlpdClient.recallMemory(sessionId, { topK: 3 });
      const contextPrompt = this.addContextToPrompt(prompt, history);
      return await this.tmlpdClient.executeAgent(contextPrompt, { sessionId });

    default:
      return await this.tmlpdClient.executeAgent(prompt, { sessionId });
    }
  }

  /**
     * Build prompt for TMLPD
     */
  buildPrompt(query, context) {
    let prompt = query;

    // Add platform context
    if (context.platform === 'alexa') {
      prompt += '\n\n[Platform: Alexa Voice Assistant]';
    }

    // Add capability hints
    if (context.capabilities.includes('Display')) {
      prompt += ' [Note: User has a screen-enabled device]';
    }

    return prompt;
  }

  /**
     * Add conversation context to prompt
     */
  addContextToPrompt(prompt, history) {
    if (!history || history.length === 0) {
      return prompt;
    }

    let contextPrompt = 'Previous conversation:\n';
    history.forEach((entry, index) => {
      contextPrompt += `${index + 1}. User: ${entry.query}\n   Assistant: ${entry.response.substring(0, 100)}...\n\n`;
    });

    contextPrompt += `\nCurrent question: ${prompt}`;
    return contextPrompt;
  }

  /**
     * Store interaction in memory
     */
  async storeInteraction(sessionId, query, response, intent) {
    await this.tmlpdClient.storeMemory(sessionId, {
      query: query,
      response: response.content || response,
      intent: intent.name,
      timestamp: Date.now(),
      platform: 'alexa',
      language: response.language || 'en'
    });
  }

  /**
     * Get user's language preference
     */
  getUserLanguagePreference(userId) {
    return this.userLanguagePrefs.get(userId);
  }

  /**
     * Set user's language preference
     */
  setUserLanguagePreference(userId, language) {
    const validLanguages = ['en', 'hi', 'bn'];
    if (validLanguages.includes(language)) {
      this.userLanguagePrefs.set(userId, language);
      console.log(`[Alexa] Set language preference for ${userId}: ${language}`);
      return true;
    }
    return false;
  }

  /**
     * Handle language change command
     */
  handleLanguageChange(userId, newLanguage) {
    if (this.setUserLanguagePreference(userId, newLanguage)) {
      return {
        success: true,
        message: `Language changed to ${newLanguage === 'hi' ? 'Hindi' : newLanguage === 'bn' ? 'Bengali' : 'English'}`
      };
    }
    return {
      success: false,
      message: 'Invalid language. Supported: English, Hindi, Bengali'
    };
  }

  /**
     * Format TMLPD response for Alexa
     */
  formatAlexaResponse(tmlpdResponse) {
    let text;

    // Handle different response formats
    if (typeof tmlpdResponse === 'string') {
      text = tmlpdResponse;
    } else if (tmlpdResponse.content) {
      text = tmlpdResponse.content;
    } else if (tmlpdResponse.responses && tmlpdResponse.responses.length > 0) {
      // Use best response from parallel execution
      const bestResponse = tmlpdResponse.responses[0];
      text = bestResponse.content || bestResponse;
    } else {
      text = "I apologize, but I couldn't process that request.";
    }

    // Clean up text (remove markdown, code blocks, etc.)
    text = this.cleanTextForAlexa(text);

    // Build Alexa response
    const response = {
      version: '1.0',
      response: {
        outputSpeech: this.buildSpeech(text),
        shouldEndSession: this.shouldEndSession(tmlpdResponse)
      }
    };

    // Add card if display is available
    if (tmlpdResponse.metadata && tmlpdResponse.metadata.capabilities?.includes('Display')) {
      response.response.card = {
        type: 'Simple',
        title: 'Response',
        content: text.substring(0, 500) // Truncate for card
      };
    }

    return response;
  }

  /**
     * Build speech output (with or without voice)
     */
  buildSpeech(text) {
    const escapedText = this.escapeXml(text);

    if (this.voiceConfig && this.voiceConfig.voice) {
      return {
        type: 'SSML',
        ssml: `<speak><voice name="${this.voiceConfig.voice}">${escapedText}</voice></speak>`
      };
    }

    return {
      type: 'PlainText',
      text: text
    };
  }

  /**
     * Clean text for Alexa speech
     */
  cleanTextForAlexa(text) {
    return text
      .replace(/```[\s\S]*?```/g, 'See the code for details.') // Remove code blocks
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
      .replace(/\n{3,}/g, '\n\n') // Reduce excessive newlines
      .trim();
  }

  /**
     * Escape XML for SSML
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
     * Determine if session should end
     */
  shouldEndSession(response) {
    // Keep session open for follow-up questions
    if (response.metadata && response.metadata.source === 'tmlpd_memory') {
      return false;
    }

    // End session for complete answers
    return true;
  }

  /**
     * Handle errors with enhanced recovery logic
     */
  handleError(error) {
    console.error('[Alexa] Error:', error);

    // Determine error type and recovery strategy
    let recoveryStrategy = this.determineRecoveryStrategy(error);

    switch (recoveryStrategy) {
    case 'translation_error':
      return this.handleTranslationError(error);

    case 'tmlpd_error':
      return this.handleTMLPDError(error);

    case 'network_error':
      return this.handleNetworkError(error);

    case 'user_input_error':
      return this.handleUserInputError(error);

    case 'system_error':
      return this.handleSystemError(error);

    default:
      return this.handleGenericError(error);
    }
  }

  /**
     * Determine recovery strategy based on error type
     */
  determineRecoveryStrategy(error) {
    const errorMessage = error.message?.toLowerCase() || error.toString().toLowerCase();

    // Translation errors
    if (errorMessage.includes('translation') ||
            errorMessage.includes('sarvam') ||
            errorMessage.includes('api') ||
            errorMessage.includes('translate')) {
      return 'translation_error';
    }

    // TMLPD errors
    if (errorMessage.includes('tmlpd') ||
            errorMessage.includes('backend') ||
            errorMessage.includes('ai') ||
            errorMessage.includes('connection')) {
      return 'tmlpd_error';
    }

    // Network errors
    if (errorMessage.includes('network') ||
            errorMessage.includes('connection') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('fetch') ||
            errorMessage.includes('econnrefused')) {
      return 'network_error';
    }

    // User input errors
    if (errorMessage.includes('invalid') ||
            errorMessage.includes('undefined') ||
            errorMessage.includes('null') ||
            errorMessage.includes('format')) {
      return 'user_input_error';
    }

    // System errors
    return 'system_error';
  }

  /**
     * Handle translation errors with user-friendly messages
     */
  handleTranslationError(error) {
    console.log('[Alexa] Translation error detected, activating recovery...');

    // Generate helpful error messages for translation failures
    const errorMessages = [
      "I'm having trouble translating that right now. Let me try a different approach.",
      "Translation service is temporarily unavailable. I'll use my fallback system.",
      "I can process your request, but I'm having translation issues.",
      'Let me help you with that using English instead.'
    ];

    const userMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)];

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: userMessage
        },
        shouldEndSession: false,
        card: {
          type: 'Simple',
          title: 'Translation Service Issue',
          content: userMessage + " I'm working to improve this experience."
        }
      }
    };
  }

  /**
     * Handle TMLPD errors with fallback
     */
  handleTMLPDError(error) {
    console.log('[Alexa] TMLPD error detected, activating fallback...');

    const fallbackResponses = [
      "I'm having some technical difficulties right now. Let me try to help you differently.",
      'Let me provide you with some general information instead.',
      "I'm working on improving my responses for you.",
      'Thank you for your patience while I resolve this issue.'
    ];

    const fallbackMessage = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: fallbackMessage
        },
        shouldEndSession: false,
        card: {
          type: 'Simple',
          title: 'Technical Issue',
          content: fallbackMessage + " I'm experiencing some technical challenges."
        }
      }
    };
  }

  /**
     * Handle network errors with retry logic
     */
  handleNetworkError(error) {
    console.log('[Alexa] Network error detected, implementing retry logic...');

    const retryMessages = [
      "I'm having trouble connecting right now. Let me try again.",
      'Network connection seems unstable. Please try again in a moment.',
      "I'm experiencing some connectivity issues. Let me help you with what I can do."
    ];

    const retryMessage = retryMessages[Math.floor(Math.random() * retryMessages.length)];

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: retryMessage
        },
        shouldEndSession: false,
        card: {
          type: 'Simple',
          title: 'Connection Issue',
          content: retryMessage + " I'll keep trying to provide the best service possible."
        }
      }
    };
  }

  /**
     * Handle user input errors with helpful guidance
     */
  handleUserInputError(error) {
    console.log('[Alexa] User input error, providing guidance...');

    const guidanceMessages = [
      "I didn't quite catch that. Could you please say it differently?",
      "I'm having some trouble understanding. Could you rephrase that?",
      "Let's try a different approach. What would you like to know about?",
      "I want to make sure I'm giving you the best help possible."
    ];

    const guidanceMessage = guidanceMessages[Math.floor(Math.random() * guidanceMessages.length)];

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: guidanceMessage
        },
        shouldEndSession: false,
        card: {
          type: 'Simple',
          title: 'Understanding Issue',
          content: guidanceMessage + " I'm here to help you in the best way I can."
        }
      }
    };
  }

  /**
     * Handle system errors gracefully
     */
  handleSystemError(error) {
    console.log('[Alexa] System error, using graceful degradation...');

    const gracefulMessages = [
      "I'm experiencing some technical difficulties. Thank you for your patience.",
      'My systems are working hard to serve you better.',
      "I apologize for the inconvenience. I'm improving my services.",
      'Thank you for your understanding as I work through this technical challenge.'
    ];

    const gracefulMessage = gracefulMessages[Math.floor(Math.random() * gracefulMessages.length)];

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: gracefulMessage
        },
        shouldEndSession: false,
        card: {
          type: 'Simple',
          title: 'Service Improvement',
          content: gracefulMessage + " I'm continuously working to enhance your experience."
        }
      }
    };
  }

  /**
     * Handle generic errors with fallback
     */
  handleGenericError(error) {
    console.error('[Alexa] Unhandled error:', error);

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: "I'm sorry, but I encountered an unexpected issue. Please try again."
        },
        shouldEndSession: true
      }
    };
  }

  /**
     * Close connection
     */
  close() {
    this.tmlpdClient.close();
  }

  /**
     * Detect if text is mixed language (Hinglish/Benglish)
     */
  isMixedLanguage(text, detectedLang) {
    if (detectedLang === 'en') {
      return false; // Pure English
    }

    // Check for mixed script patterns
    const englishPattern = /[a-zA-Z]/g;
    const englishChars = (text.match(englishPattern) || []).length;
    const totalLength = text.length;
    const englishPercentage = (englishChars / totalLength) * 100;

    // If it has significant English content but detected as Hindi/Bengali, it's mixed
    return englishPercentage > 20 && englishPercentage < 80;
  }

  /**
     * Translate mixed language text more intelligently using enhanced detection
     */
  async translateMixedLanguageAdvanced(text, sourceLang, enhancedDetection) {
    try {
      // Use word-level analysis from enhanced detection
      const wordLevelAnalysis = enhancedDetection.details?.wordLevel;

      if (wordLevelAnalysis && wordLevelAnalysis.wordLanguages) {
        // Process each word based on its detected language
        const processedWords = await Promise.all(
          wordLevelAnalysis.wordLanguages.map(async (wordData) => {
            const { word, language } = wordData;

            // Keep English words as is
            if (language === 'en') {
              return word;
            }

            // Translate non-English words
            try {
              const translated = await this.sarvamClient.translateToEnglish(word, language);
              return translated;
            } catch (e) {
              console.warn(`[Alexa] Failed to translate word "${word}":`, e.message);
              return word; // Keep original if translation fails
            }
          })
        );

        return processedWords.join(' ');
      }

      // Fallback to basic word-by-word translation
      return await this.translateMixedLanguage(text, sourceLang);
    } catch (error) {
      console.error('[Alexa] Enhanced mixed language translation failed:', error);
      return this.translateMixedLanguage(text, sourceLang); // Fallback
    }
  }

  /**
     * Translate mixed language text more intelligently (fallback method)
     */
  async translateMixedLanguage(text, sourceLang) {
    try {
      // For mixed languages, translate the non-English parts to English
      // This is a simplified approach - in production you'd want more sophisticated NLP

      // Split text into words and process
      const words = text.split(/\s+/);
      const translatedWords = await Promise.all(words.map(async (word) => {
        // Check if word contains non-English characters
        const hasNonEnglish = /[^\x00-\x7F]/.test(word);

        if (hasNonEnglish) {
          // Try to translate this word
          try {
            return await this.sarvamClient.translateToEnglish(word, sourceLang);
          } catch (e) {
            return word; // Keep original if translation fails
          }
        }
        return word; // Keep English words as is
      }));

      // Join back together
      return translatedWords.join(' ');
    } catch (error) {
      console.error('[Alexa] Mixed language translation failed:', error);
      return text; // Fallback to original
    }
  }

  /**
     * Translate using Sarvam API with fallback to alternative services
     * @param {string} text - Text to translate
     * @param {string} sourceLang - Source language code
     * @returns {Promise<string>} Translated text
     */
  async translateWithSarvamOrFallback(text, sourceLang) {
    try {
      // Primary: Use Sarvam API for translation
      console.log(`[Alexa] Attempting Sarvam API translation from ${sourceLang} to English...`);

      const translated = await this.sarvamClient.translateToEnglish(text, sourceLang);
      console.log('[Alexa] Sarvam API translation successful');

      return translated;

    } catch (sarvamError) {
      console.warn(`[Alexa] Sarvam API translation failed: ${sarvamError.message}`);
      console.log('[Alexa] Falling back to alternative translation services...');

      // Secondary: Try LibreTranslate
      try {
        console.log('[Alexa] Attempting LibreTranslate fallback...');
        const libreTranslated = await this.translateWithLibreTranslate(text, sourceLang, 'en');
        console.log('[Alexa] LibreTranslate fallback successful');
        return libreTranslated;
      } catch (libreError) {
        console.warn(`[Alexa] LibreTranslate failed: ${libreError.message}`);

        // Tertiary: Try MyMemory
        try {
          console.log('[Alexa] Attempting MyMemory fallback...');
          const memoryTranslated = await this.translateWithMyMemory(text, sourceLang, 'en');
          console.log('[Alexa] MyMemory fallback successful');
          return memoryTranslated;
        } catch (memoryError) {
          console.error(`[Alexa] All translation services failed: ${memoryError.message}`);
          // Ultimate fallback: Return original text
          console.log('[Alexa] Using original text as ultimate fallback');
          return text;
        }
      }
    }
  }

  /**
     * Translate using LibreTranslate
     * @param {string} text - Text to translate
     * @param {string} source - Source language code
     * @param {string} target - Target language code
     * @returns {Promise<string>} Translated text
     */
  async translateWithLibreTranslate(text, source, target) {
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

    if (!response.ok) {
      throw new Error(`LibreTranslate error: ${response.status}`);
    }

    const data = await response.json();
    return data.translatedText || text;
  }

  /**
     * Translate using MyMemory
     * @param {string} text - Text to translate
     * @param {string} source - Source language code
     * @param {string} target - Target language code
     * @returns {Promise<string>} Translated text
     */
  async translateWithMyMemory(text, source, target) {
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

    if (!response.ok) {
      throw new Error(`MyMemory error: ${response.status}`);
    }

    const data = await response.json();
    return data.responseData.translatedText || text;
  }

  /**
     * Detect language using Google Translate API with intelligent fallback
     * @param {string} text - Text to detect language from
     * @returns {Promise<Object>} Detection result with method info
     */
  async detectLanguageWithFallback(text) {
    try {
      // Try Google Translate API first
      console.log('[Alexa] Attempting Google Translate API detection...');
      const googleResult = await this.googleTranslateClient.detectLanguage(text);

      console.log(`[Alexa] Google Translate detection successful: ${googleResult.language} (confidence: ${(googleResult.confidence * 100).toFixed(1)}%)`);

      const shouldEnhance = googleResult.language === 'en' && (
        googleResult.confidence < 0.7 ||
                googleResult.isTransliterated ||
                googleResult.transliterationHint?.isTransliterated
      );

      if (shouldEnhance) {
        try {
          const enhancedResult = await this.sarvamClient.enhancedDetector.detectLanguage(text);
          console.log(`[Alexa] Enhanced detector override: ${enhancedResult.language} (confidence: ${(enhancedResult.confidence * 100).toFixed(1)}%)`);

          if (enhancedResult.language !== 'en' && enhancedResult.confidence >= 0.55) {
            return {
              language: enhancedResult.language,
              confidence: enhancedResult.confidence,
              method: 'enhanced_override',
              processingTime: enhancedResult.details?.processingTime || googleResult.processingTime,
              isTransliterated: true,
              googleLanguage: googleResult.googleLanguage,
              enhancedDetails: enhancedResult
            };
          }

          return {
            language: googleResult.language,
            confidence: googleResult.confidence,
            method: googleResult.method,
            processingTime: googleResult.processingTime,
            isTransliterated: googleResult.isTransliterated || enhancedResult.isMixedLanguage,
            googleLanguage: googleResult.googleLanguage,
            enhancedDetails: enhancedResult
          };
        } catch (enhancedError) {
          console.log(`[Alexa] Enhanced override failed: ${enhancedError.message}`);
        }
      }

      // Return enhanced result with metadata
      return {
        language: googleResult.language,
        confidence: googleResult.confidence,
        method: googleResult.method,
        processingTime: googleResult.processingTime,
        isTransliterated: googleResult.isTransliterated,
        googleLanguage: googleResult.googleLanguage,
        transliterationHint: googleResult.transliterationHint,
        enhancedDetails: null
      };

    } catch (error) {
      console.log(`[Alexa] Google Translate API failed: ${error.message}`);
      console.log('[Alexa] Falling back to enhanced language detector...');

      // Fallback to enhanced detector
      try {
        const enhancedResult = await this.sarvamClient.enhancedDetector.detectLanguage(text);

        console.log(`[Alexa] Enhanced detector successful: ${enhancedResult.language} (confidence: ${(enhancedResult.confidence * 100).toFixed(1)}%)`);

        return {
          language: enhancedResult.language,
          confidence: enhancedResult.confidence,
          method: 'enhanced_fallback',
          processingTime: enhancedResult.details?.processingTime || 'unknown',
          isTransliterated: enhancedResult.isMixedLanguage,
          googleLanguage: null,
          enhancedDetails: enhancedResult
        };

      } catch (fallbackError) {
        console.error(`[Alexa] Both detection methods failed: ${fallbackError.message}`);

        // Ultimate fallback to basic detection
        return {
          language: 'en',
          confidence: 0.5,
          method: 'ultimate_fallback',
          processingTime: 0,
          isTransliterated: false,
          googleLanguage: null,
          enhancedDetails: null,
          error: fallbackError.message
        };
      }
    }
  }

  /**
     * Track detection method usage statistics
     * @param {string} method - Detection method used
     */
  trackDetectionMethod(method) {
    this.detectionMethodStats.total++;

    if (method === 'google') {
      this.detectionMethodStats.google++;
    } else if (method === 'enhanced_fallback') {
      this.detectionMethodStats.enhanced++;
    } else {
      this.detectionMethodStats.fallback++;
    }

    // Log statistics periodically
    if (this.detectionMethodStats.total % 10 === 0) {
      console.log('[Alexa] Detection method statistics:', this.getDetectionMethodStats());
    }
  }

  /**
     * Get detection method statistics
     * @returns {Object} Detection method usage statistics
     */
  getDetectionMethodStats() {
    const stats = { ...this.detectionMethodStats };
    const total = stats.total || 1; // Avoid division by zero

    stats.googlePercentage = ((stats.google / total) * 100).toFixed(1) + '%';
    stats.enhancedPercentage = ((stats.enhanced / total) * 100).toFixed(1) + '%';
    stats.fallbackPercentage = ((stats.fallback / total) * 100).toFixed(1) + '%';

    return stats;
  }

  /**
     * Get comprehensive language detection performance metrics
     * @returns {Object} Combined performance metrics
     */
  getLanguageDetectionMetrics() {
    return {
      googleTranslate: this.googleTranslateClient.getPerformanceMetrics(),
      enhancedDetector: this.sarvamClient.enhancedDetector.getPerformanceMetrics(),
      methodStatistics: this.getDetectionMethodStats(),
      overallSuccessRate: this.calculateOverallSuccessRate()
    };
  }

  /**
     * Calculate overall success rate across detection methods
     * @returns {string} Overall success rate percentage
     */
  calculateOverallSuccessRate() {
    const googleMetrics = this.googleTranslateClient.getMetrics();
    const totalDetections = googleMetrics.totalDetections;
    const totalSuccesses = googleMetrics.totalSuccesses;

    if (totalDetections > 0) {
      return ((totalSuccesses / totalDetections) * 100).toFixed(1) + '%';
    }
    return '0%';
  }

  /**
     * Reset detection statistics
     */
  resetDetectionStats() {
    this.detectionMethodStats = {
      google: 0,
      enhanced: 0,
      fallback: 0,
      total: 0
    };
    this.googleTranslateClient.resetMetrics();
    this.sarvamClient.enhancedDetector.resetMetrics();
    console.log('[Alexa] Detection statistics reset');
  }
}

module.exports = AlexaRequestHandler;
