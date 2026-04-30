/**
 * Smart Router - AI-Powered Intent Routing for OmniClaw
 *
 * Unified entry point that routes natural language to appropriate capabilities
 * Following Jony Ive's principle: "One clear path" for all interactions
 *
 * This router eliminates the need for users to know specific intent names
 * and provides progressive discovery of all 19+ capabilities.
 */

const { multiProviderQuery } = require('../resilient-clients');

class SmartRouter {
  constructor() {
    // Core 5 capabilities (shown to new users)
    this.coreCapabilities = [
      {
        name: 'music',
        keywords: ['play', 'music', 'spotify', 'song', 'playlist', 'album'],
        intent: 'SpotifyIntent',
        description: 'play music on Spotify'
      },
      {
        name: 'answers',
        keywords: ['what', 'who', 'where', 'when', 'why', 'how', 'wikipedia', 'search'],
        intent: 'WikipediaIntent',
        description: 'get answers from Wikipedia'
      },
      {
        name: 'tv',
        keywords: ['kodi', 'tv', 'television', 'movie', 'show', 'play on tv'],
        intent: 'KodiIntent',
        description: 'control your TV with Kodi'
      },
      {
        name: 'messages',
        keywords: ['send', 'message', 'whatsapp', 'text', 'chat'],
        intent: 'WhatsAppIntent',
        description: 'send WhatsApp messages'
      },
      {
        name: 'news',
        keywords: ['news', 'headlines', 'update', 'breaking'],
        intent: 'NewsIntent',
        description: 'get the latest news'
      }
    ];

    // Advanced capabilities (progressively disclosed)
    this.advancedCapabilities = [
      {
        name: 'translation',
        keywords: ['translate', 'interpret', 'language'],
        intent: 'TranslateIntent',
        description: 'translate languages'
      },
      {
        name: 'stories',
        keywords: ['story', 'tell me', 'narrative'],
        intent: 'StoryIntent',
        description: 'spin epic stories'
      },
      {
        name: 'twitter',
        keywords: ['twitter', 'tweet', 'search twitter'],
        intent: 'TwitterIntent',
        description: 'search Twitter'
      },
      {
        name: 'reddit',
        keywords: ['reddit', 'search reddit'],
        intent: 'RedditIntent',
        description: 'search Reddit'
      },
      {
        name: 'youtube',
        keywords: ['youtube', 'video', 'watch'],
        intent: 'YouTubeIntent',
        description: 'search YouTube'
      },
      {
        name: 'arxiv',
        keywords: ['arxiv', 'paper', 'research', 'academic'],
        intent: 'ArxivIntent',
        description: 'search academic papers'
      },
      {
        name: 'vault',
        keywords: ['vault', 'my bookmarks', 'saved content', 'dig', 'knowledge graph',
                   'connect the dots', 'food recommendation', 'skill path', 'related knowledge',
                   'what do i know about', 'show me what i saved', 'my knowledge',
                   'search vault', 'vault search', 'random insight', 'from my vault',
                   'mood', 'how am i feeling', 'trending', 'what am i into',
                   'cross connect', 'cross-pollination', 'unexpected connection',
                   'serendipity', 'surprise me', 'hidden gem', 'rare find',
                   'deep dive', 'teach me', 'learning path', 'related posts',
                   'interest archaeology', 'how long have i been', 'oldest interest',
                   'resonance', 'quietly powerful', 'hit different',
                   'blind spot', 'missing connection', 'undiscovered',
                   'ghost topics', 'on my mind', 'keep thinking about',
                   'aesthetic', 'visual evolution', 'my taste', 'photo preference'],
        intent: 'VaultIntent',
        description: 'explore your personal knowledge vault'
      }
    ];
  }

  /**
   * Route natural language query to appropriate capability
   *
   * @param {string} query - User's natural language query
   * @param {Object} context - User context (platform, session, etc.)
   * @returns {Object} Routing result with intent and confidence
   */
  async route(query, context = {}) {
    console.log(`[SmartRouter] Routing query: "${query}"`);

    // Check for translation patterns (high confidence)
    const translationMatch = this._detectTranslation(query);
    if (translationMatch) {
      console.log(`[SmartRouter] → Translation intent (confidence: 0.95)`);
      return {
        intent: 'TranslateIntent',
        confidence: 0.95,
        slots: translationMatch,
        capability: 'translation',
        directAnswer: `I can translate "${translationMatch.text}" to ${translationMatch.language}.`
      };
    }

    // Search for keyword matches in capabilities
    const matches = this._findCapabilityMatches(query);

    if (matches.length > 0) {
      // Sort by confidence, tie-break with vault preference
      matches.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        // Vault wins ties
        if (a.name === 'vault') return -1;
        if (b.name === 'vault') return 1;
        return 0;
      });
      const bestMatch = matches[0];
      console.log(`[SmartRouter] → ${bestMatch.name} intent (confidence: ${bestMatch.confidence})`);

      return {
        intent: bestMatch.intent,
        confidence: bestMatch.confidence,
        slots: bestMatch.slots,
        capability: bestMatch.name,
        directAnswer: `I'll help you ${bestMatch.description}.`,
        suggestions: this._getSuggestions(query, bestMatch.name)
      };
    }

    // No clear match - use AI to understand intent
    console.log(`[SmartRouter] No keyword match - using AI understanding`);

    return {
      intent: 'QueryIntent',
      confidence: 0.4,  // Clearly low confidence to trigger clarification
      slots: { Query: { value: query } },
      capability: 'general',
      directAnswer: `Let me help you with that.`,
      needsProcessing: true
    };
  }

  /**
   * Detect translation request with high confidence
   */
  _detectTranslation(query) {
    if (!query) {
      return null;
    }

    const patterns = [
      /^translate\s+(.+?)\s+to\s+(\w+)$/i,
      /^translate\s+(.+?)\s+in\s+(\w+)$/i,
      /^say\s+(.+?)\s+in\s+(\w+)$/i,
      /^convert\s+(.+?)\s+to\s+(\w+)$/i
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        return {
          text: match[1].trim(),
          language: match[2].trim()
        };
      }
    }

    return null;
  }

  /**
   * Find matching capabilities based on keywords
   */
  _findCapabilityMatches(query) {
    if (!query) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const allCapabilities = [...this.coreCapabilities, ...this.advancedCapabilities];
    const matches = [];

    for (const cap of allCapabilities) {
      let matchCount = 0;
      let matchedKeywords = [];

      for (const keyword of cap.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      }

      if (matchCount > 0) {
        // Calculate confidence based on keyword match specificity
        // Give extra weight to "vault" keyword as it's a strong indicator
        let confidence = Math.min(0.9, 0.5 + (matchCount * 0.1));
        if (matchedKeywords.some(k => k.toLowerCase() === 'vault')) {
          confidence = Math.max(confidence, 0.7); // Vault mention is strong signal
        }

        // Boost if query explicitly asks for vault search
        if (queryLower.includes('vault') && queryLower.includes('search')) {
          confidence = Math.max(confidence, 0.75);
        }

        matches.push({
          ...cap,
          confidence,
          matchedKeywords,
          slots: this._extractSlots(query, cap)
        });
      }
    }

    // Sort by confidence (highest first)
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Extract relevant slots from query based on capability
   */
  _extractSlots(query, capability) {
    const slots = {};
    if (!query) {
      return slots;
    }

    // Extract specific slots based on capability type
    if (capability.name === 'music') {
      const musicMatch = query.match(/play\s+(.+?)(?:\s+on\s+spotify)?$/i);
      if (musicMatch) {
        slots.Track = { value: musicMatch[1] };
      }
    } else if (capability.name === 'tv') {
      const tvMatch = query.match(/(?:play|watch|open)\s+(.+?)\s+(?:on\s+)?kodi$/i);
      if (tvMatch) {
        slots.Query = { value: tvMatch[1] };
      }
    } else if (capability.name === 'answers') {
      const answerMatch = query.match(/(?:what|who|where|when|why|how)\s+(is|are|was)\s+(.+)$/i);
      if (answerMatch) {
        slots.Topic = { value: answerMatch[2] };
      }
    }

    return slots;
  }

  /**
   * Get contextual suggestions based on query and matched capability
   */
  _getSuggestions(query, matchedCapability) {
    const suggestions = [];

    // Add capability-specific suggestions
    if (matchedCapability === 'music') {
      suggestions.push('Pause the music', 'Skip this song', 'Volume up');
    } else if (matchedCapability === 'tv') {
      suggestions.push('Pause playback', 'Show movies', 'Open Seren');
    } else if (matchedCapability === 'answers') {
      suggestions.push('Tell me more about this topic', 'Search on Wikipedia');
    }

    // Add "what else can you do?" suggestion
    suggestions.push('What else can you do?');

    return suggestions;
  }

  /**
   * Get "Core 5" capabilities for new users
   */
  getCoreCapabilities() {
    return this.coreCapabilities.map(cap => ({
      name: cap.name,
      description: cap.description,
      example: this._getExampleForCapability(cap.name)
    }));
  }

  /**
   * Get example query for a capability
   */
  _getExampleForCapability(capabilityName) {
    const examples = {
      music: 'Play my road trip playlist',
      answers: 'Who is Albert Einstein?',
      tv: 'Play the last movie on Kodi',
      messages: 'Send a WhatsApp message to mom',
      news: 'What are the latest headlines?'
    };

    return examples[capabilityName] || `Help me with ${capabilityName}`;
  }

  /**
   * Get progressively disclosed capabilities based on user experience
   */
  getCapabilitiesForUser(userContext) {
    const { interactionCount, lastCapabilities } = userContext;

    // New user: Show only Core 5
    if (interactionCount < 5) {
      return {
        capabilities: this.getCoreCapabilities(),
        message: `I can help you with 5 main things. Try saying: "${this._getExampleForCapability('music')}"`,
        suggestions: this._getDiscoverySuggestions()
      };
    }

    // Regular user: Show all capabilities
    const allCapabilities = [...this.coreCapabilities, ...this.advancedCapabilities];
    return {
      capabilities: allCapabilities.map(cap => ({
        name: cap.name,
        description: cap.description,
        example: this._getExampleForCapability(cap.name)
      })),
      message: `I can help you with ${allCapabilities.length} different things. Just ask naturally!`,
      suggestions: []
    };
  }

  /**
   * Get discovery suggestions for progressive disclosure
   */
  _getDiscoverySuggestions() {
    return [
      'Try asking: "Who is Albert Einstein?"',
      'Try asking: "Play my road trip playlist"',
      'Try asking: "Get the latest news"',
      'Show me everything you can do'
    ];
  }
}

module.exports = SmartRouter;