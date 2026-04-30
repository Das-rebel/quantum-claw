/**
 * Smart Defaults - Reducing Cognitive Load Through Intelligent Defaults
 *
 * Following Jony Ive's principle: "Eliminate choice paralysis"
 * Make smart decisions so users don't have to
 *
 * This system provides:
 * - Smart defaults for common actions (resume, auto-detect)
 * - Elimination of unnecessary choices
 * - Undo/correction handling
 * - Learning from user behavior
 */

class SmartDefaults {
  constructor() {
    // Default preferences per capability
    this.defaults = {
      music: {
        playback: 'resume_last',  // Resume last played song
        playlist: 'road_trip',    // Default playlist
        device: 'last_used',      // Last active device
        volume: 50                // Moderate volume
      },
      tv: {
        action: 'resume_last',    // Resume last watched
        addon: 'seren',           // Default addon
        search_source: 'library'  // Search local library first
      },
      answers: {
        source: 'wikipedia',      // Start with Wikipedia
        fallback: 'web_search',   // Then web search
        detail_level: 'brief'     // Brief by default
      },
      news: {
        source: 'headlines',      // Top headlines
        category: 'general',      // General news
        count: 5                  // 5 headlines
      },
      messages: {
        platform: 'whatsapp',     // Default to WhatsApp
        read_receipt: true        // Send read receipts
      }
    };

    // Auto-detection patterns
    this.autoDetectionPatterns = {
      music: {
        spotify: ['spotify', 'music', 'song', 'playlist', 'album', 'artist'],
        kodi: ['tv', 'kodi', 'video', 'movie', 'show']
      },
      search: {
        wikipedia: ['who is', 'what is', 'tell me about', 'explain'],
        web: ['search for', 'find information', 'look up'],
        youtube: ['youtube', 'video', 'watch'],
        twitter: ['twitter', 'tweet'],
        reddit: ['reddit', 'thread']
      }
    };

    // Correction patterns
    this.correctionPatterns = [
      /^no(?:,)? i meant/i,
      /^that('s| is) not right/i,
      /^wrong/i,
      /^not (that|what i meant)/i,
      /^actually/i,
      /^wait/i
    ];
  }

  /**
   * Apply smart defaults to routing result
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {Object} context - User context (history, preferences, etc.)
   * @returns {Object} Enhanced routing result with defaults applied
   */
  applyDefaults(routingResult, context = {}) {
    const enhanced = { ...routingResult };

    // Ensure slots object exists
    if (!enhanced.slots) {
      enhanced.slots = {};
    }

    // Apply capability-specific defaults
    const capability = enhanced.capability;
    if (this.defaults[capability]) {
      enhanced.slots = this._applyCapabilityDefaults(
        capability,
        enhanced.slots,
        context
      );
    }

    // Auto-detect platform/service if not specified
    enhanced.slots = this._autoDetectService(enhanced, context);

    // Track that defaults were applied
    enhanced.defaultsApplied = Object.keys(enhanced.slots).filter(
      key => enhanced.slots[key] !== (routingResult.slots?.[key])
    );

    return enhanced;
  }

  /**
   * Apply capability-specific defaults
   *
   * @param {string} capability - Capability name
   * @param {Object} slots - Current slots
   * @param {Object} context - User context
   * @returns {Object} Slots with defaults applied
   */
  _applyCapabilityDefaults(capability, slots, context) {
    const enhancedSlots = { ...slots };
    const capabilityDefaults = this.defaults[capability];
    const userHistory = context.recentCapabilities || [];

    // Music defaults
    if (capability === 'music') {
      // If no query specified, resume last song
      if (!enhancedSlots.query) {
        const lastMusic = userHistory.find(cap => cap === 'music');
        if (lastMusic && context.lastQuery) {
          enhancedSlots.query = context.lastQuery;
          enhancedSlots.defaultApplied = 'resume_last';
        } else {
          enhancedSlots.query = capabilityDefaults.playlist;
          enhancedSlots.defaultApplied = 'default_playlist';
        }
      }

      // If no device specified, use last used
      if (!enhancedSlots.device) {
        enhancedSlots.device = capabilityDefaults.device;
        enhancedSlots.defaultApplied = 'last_device';
      }
    }

    // TV defaults
    if (capability === 'tv') {
      // If no query specified, resume last
      if (!enhancedSlots.query) {
        const lastTV = userHistory.find(cap => cap === 'tv');
        if (lastTV && context.lastQuery) {
          enhancedSlots.query = context.lastQuery;
          enhancedSlots.defaultApplied = 'resume_last';
        } else {
          enhancedSlots.query = 'recent';
          enhancedSlots.defaultApplied = 'recent_content';
        }
      }

      // If no addon specified, use default
      if (!enhancedSlots.addon) {
        enhancedSlots.addon = capabilityDefaults.addon;
        enhancedSlots.defaultApplied = 'default_addon';
      }
    }

    // Answers defaults
    if (capability === 'answers') {
      // If no source specified, use default
      if (!enhancedSlots.source) {
        enhancedSlots.source = capabilityDefaults.source;
        enhancedSlots.defaultApplied = 'default_source';
      }

      // Set detail level
      if (!enhancedSlots.detailLevel) {
        enhancedSlots.detailLevel = capabilityDefaults.detail_level;
      }
    }

    // News defaults
    if (capability === 'news') {
      // If no category specified, use general
      if (!enhancedSlots.category) {
        enhancedSlots.category = capabilityDefaults.category;
      }

      // Set headline count
      if (!enhancedSlots.count) {
        enhancedSlots.count = capabilityDefaults.count;
      }
    }

    // Messages defaults
    if (capability === 'messages') {
      // If no platform specified, use default
      if (!enhancedSlots.platform) {
        enhancedSlots.platform = capabilityDefaults.platform;
        enhancedSlots.defaultApplied = 'default_platform';
      }
    }

    return enhancedSlots;
  }

  /**
   * Auto-detect service/platform from query
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {Object} context - User context
   * @returns {Object} Enhanced slots with auto-detected service
   */
  _autoDetectService(routingResult, context) {
    const enhancedSlots = { ...routingResult.slots };
    const query = (context.originalQuery || '').toLowerCase();

    // Skip if service already specified
    if (enhancedSlots.service || enhancedSlots.platform) {
      return enhancedSlots;
    }

    // Detect for music capability
    if (routingResult.capability === 'music') {
      // Check for Spotify keywords
      if (this.autoDetectionPatterns.music.spotify.some(keyword =>
        query.includes(keyword)
      )) {
        enhancedSlots.service = 'spotify';
        enhancedSlots.detected = 'auto';
      }

      // Check for Kodi keywords
      if (this.autoDetectionPatterns.music.kodi.some(keyword =>
        query.includes(keyword)
      )) {
        enhancedSlots.service = 'kodi';
        enhancedSlots.detected = 'auto';
      }
    }

    // Detect for answers capability
    if (routingResult.capability === 'answers') {
      // Check various search sources
      for (const [source, patterns] of Object.entries(this.autoDetectionPatterns.search)) {
        if (patterns.some(pattern => query.includes(pattern))) {
          enhancedSlots.source = source;
          enhancedSlots.detected = 'auto';
          break;
        }
      }
    }

    return enhancedSlots;
  }

  /**
   * Check if user is correcting previous action
   *
   * @param {string} query - Current query
   * @param {Object} context - User context
   * @returns {Object|null} Correction info or null
   */
  detectCorrection(query, context = {}) {
    if (!query) {
      return null;
    }

    const lowerQuery = query.toLowerCase();

    // Check if query matches correction patterns
    const isCorrection = this.correctionPatterns.some(pattern =>
      pattern.test(lowerQuery)
    );

    if (!isCorrection) {
      return null;
    }

    // Extract what user actually meant
    const correction = this._extractCorrectionIntent(query, context);

    return {
      type: 'correction',
      originalAction: context.lastAction,
      intended: correction.intended,  // Property name matches handleCorrection expectation
      clarification: correction.clarification
    };
  }

  /**
   * Extract what user actually meant from correction
   *
   * @param {string} query - Correction query
   * @param {Object} context - User context
   * @returns {Object} Intended action
   */
  _extractCorrectionIntent(query, context) {
    if (!query) {
      return {
        intended: null,
        clarification: 'No query provided'
      };
    }

    const lowerQuery = query.toLowerCase();

    // "No, I meant X" -> X is the correction
    const meantMatch = lowerQuery.match(/(?:no|wrong)(?:,)? i meant (.+)/i);
    if (meantMatch) {
      return {
        intended: meantMatch[1].trim(),
        clarification: 'User corrected previous action'
      };
    }

    // "That's not right" -> Ask what they meant
    if (/that'?s not right|wrong/i.test(lowerQuery)) {
      return {
        intended: null,
        clarification: 'Previous action was incorrect'
      };
    }

    // "Wait, X" -> X might be correction or pause
    const waitMatch = lowerQuery.match(/^wait,?\s*(.+)/i);
    if (waitMatch) {
      const afterWait = waitMatch[1].trim();

      // If they started a new request, that's the correction
      if (afterWait.length > 5) {
        return {
          intended: afterWait,
          clarification: 'User stopped and changed request'
        };
      }

      // Just "wait" -> pause
      return {
        intended: 'pause',
        clarification: 'User wants to pause'
      };
    }

    return {
      intended: null,
      clarification: 'Correction intent unclear'
    };
  }

  /**
   * Generate suggestion after applying defaults
   *
   * @param {Object} routingResult - Result with defaults applied
   * @param {string} platform - Platform identifier
   * @returns {string} Suggestion message
   */
  generateDefaultSuggestion(routingResult, platform) {
    const defaultsApplied = routingResult.defaultsApplied || [];

    if (defaultsApplied.length === 0) {
      return null;
    }

    const suggestions = {
      resume_last: {
        alexa: "I'll pick up where we left off.",
        whatsapp: '▶️ Resuming last played',
        web: { action: 'resume', reason: 'Last played' }
      },
      default_playlist: {
        alexa: "I'll play your road trip playlist.",
        whatsapp: '🎵 Using default playlist',
        web: { action: 'playlist', value: 'road_trip' }
      },
      last_device: {
        alexa: "I'll use your last device.",
        whatsapp: '🔊 Using last device',
        web: { action: 'device', value: 'last_used' }
      },
      default_source: {
        alexa: "I'll search Wikipedia.",
        whatsapp: '📚 Searching Wikipedia',
        web: { action: 'source', value: 'wikipedia' }
      }
    };

    const firstDefault = defaultsApplied[0];
    const suggestion = suggestions[firstDefault];

    if (!suggestion) {
      return null;
    }

    return suggestion[platform] || suggestion.alexa;
  }

  /**
   * Learn from user behavior and update defaults
   *
   * @param {string} capability - Capability being used
   * @param {Object} slots - Slots user provided
   * @param {Object} context - User context
   * @returns {Object} Updated defaults
   */
  learnFromBehavior(capability, slots, context = {}) {
    const updates = {};

    // If user explicitly specified a value, it might become their new default
    if (slots.query && slots.query !== this.defaults[capability]?.query) {
      // User chose specific content, might prefer this going forward
      updates.preferredContent = slots.query;
    }

    if (slots.device && slots.device !== 'last_used') {
      // User chose specific device, remember it
      updates.preferredDevice = slots.device;
    }

    if (slots.source && slots.source !== this.defaults[capability]?.source) {
      // User chose specific source, might prefer it
      updates.preferredSource = slots.source;
    }

    // Track frequency of choices
    if (!context.usageStats) {
      context.usageStats = {};
    }

    if (!context.usageStats[capability]) {
      context.usageStats[capability] = {};
    }

    Object.keys(slots).forEach(key => {
      if (slots[key]) {
        context.usageStats[capability][key] =
          (context.usageStats[capability][key] || 0) + 1;
      }
    });

    return {
      defaultsUpdated: Object.keys(updates).length > 0 ? updates : null,
      usageStats: context.usageStats
    };
  }

  /**
   * Get personalization suggestions based on usage patterns
   *
   * @param {Object} usageStats - Usage statistics
   * @returns {Array<string>} Personalization suggestions
   */
  getPersonalizationSuggestions(usageStats) {
    const suggestions = [];

    // Find most-used options
    Object.entries(usageStats).forEach(([capability, stats]) => {
      const mostUsed = Object.entries(stats).sort((a, b) => b[1] - a[1])[0];

      if (mostUsed && mostUsed[1] >= 3) {
        // Used at least 3 times
        const [option, count] = mostUsed;
        suggestions.push(
          `You often use ${option} for ${capability}. Want to make it your default?`
        );
      }
    });

    return suggestions.slice(0, 2); // Max 2 suggestions
  }

  /**
   * Handle "No, I meant" correction
   *
   * @param {Object} correction - Correction info from detectCorrection()
   * @param {Object} context - User context
   * @returns {Object} New routing result
   */
  handleCorrection(correction, context) {
    if (!correction.intended) {
      // Ask for clarification
      return {
        type: 'clarification',
        message: 'What did you mean?',
        originalAction: correction.originalAction
      };
    }

    // Re-route with corrected intent
    return {
      type: 'correction',
      originalAction: correction.originalAction,
      newQuery: correction.intended,
      clarification: correction.clarification,
      shouldRetry: true
    };
  }

  /**
   * Eliminate unnecessary choices by auto-selecting best option
   *
   * @param {Array} options - Available options
   * @param {string} capability - Current capability
   * @param {Object} context - User context
   * @returns {*} Best option or null if can't decide
   */
  eliminateChoice(options, capability, context) {
    if (!options || options.length === 0) {
      return null;
    }

    // Single option: No choice needed
    if (options.length === 1) {
      return options[0];
    }

    // Check user's preferred option
    const userPrefs = context.userPreferences || {};
    if (userPrefs[capability]) {
      const preferred = options.find(opt =>
        opt.toLowerCase() === userPrefs[capability].toLowerCase()
      );
      if (preferred) {
        return preferred;
      }
    }

    // Check recent usage
    const recent = context.recentCapabilities || [];
    const lastUsed = recent.find(cap => cap === capability);
    if (lastUsed) {
      const lastOption = options.find(opt =>
        opt.toLowerCase().includes(lastUsed.toLowerCase())
      );
      if (lastOption) {
        return lastOption;
      }
    }

    // Can't eliminate choice, return null to ask user
    return null;
  }
}

module.exports = SmartDefaults;
