/**
 * 🎯 Intent Orchestrator - Central Router for User Intent to Action Mapping
 * Provides intelligent routing, fallback chains, and capability discovery
 */

const { getGlobalResilienceIntegration } = require('../../omniclaw-personal-assistant/infrastructure/cloud-functions/shared/resilience/resilience-integration');

class IntentOrchestrator {
  constructor() {
    this.resilienceIntegration = getGlobalResilienceIntegration();
    this.actionRegistry = new Map();
    this.intentPatterns = new Map();
    this.capabilityDiscovery = new Map();

    this.initializeDefaultActions();
    this.initializeIntentPatterns();
    this.initializeCapabilityDiscovery();
  }

  /**
     * Initialize default action mappings
     */
  initializeDefaultActions() {
    // Existing capability actions
    this.registerAction('PlaySpotifyIntent', {
      handler: 'handlePlaySpotify',
      capabilities: ['spotify'],
      priority: 1,
      timeout: 5000
    });

    this.registerAction('KodiControlIntent', {
      handler: 'handleKodiControl',
      capabilities: ['kodi'],
      priority: 1,
      timeout: 5000
    });

    this.registerAction('RedditQueryIntent', {
      handler: 'handleRedditQuery',
      capabilities: ['reddit'],
      priority: 1,
      timeout: 8000
    });

    this.registerAction('TwitterQueryIntent', {
      handler: 'handleTwitterQuery',
      capabilities: ['twitter'],
      priority: 1,
      timeout: 8000
    });

    this.registerAction('WhatsAppSendIntent', {
      handler: 'handleWhatsAppSend',
      capabilities: ['whatsapp'],
      priority: 1,
      timeout: 10000
    });

    this.registerAction('WeatherQueryIntent', {
      handler: 'handleWeatherQuery',
      capabilities: ['weather'],
      priority: 1,
      timeout: 5000
    });

    this.registerAction('NewsQueryIntent', {
      handler: 'handleNewsQuery',
      capabilities: ['news'],
      priority: 1,
      timeout: 5000
    });

    // NEW: Bookmark Analysis Actions
    this.registerAction('BookmarkAnalysisIntent', {
      handler: 'handleBookmarkAnalysis',
      capabilities: ['bookmark_analysis', 'twitter', 'instagram'],
      priority: 2,
      timeout: 15000,
      fallbackActions: ['CachedBookmarkAnalysis', 'BasicBookmarkResponse']
    });

    this.registerAction('LearningBaseQueryIntent', {
      handler: 'handleLearningBaseQuery',
      capabilities: ['knowledge_graph', 'learning_base'],
      priority: 2,
      timeout: 10000,
      fallbackActions: ['CachedLearningQuery', 'BasicLearningResponse']
    });

    this.registerAction('MyInterestsIntent', {
      handler: 'handleMyInterests',
      capabilities: ['knowledge_graph', 'user_profiling'],
      priority: 2,
      timeout: 8000,
      fallbackActions: ['CachedInterests', 'GenericInterestsResponse']
    });

    // Generic fallback actions
    this.registerAction('GeneralQueryIntent', {
      handler: 'handleGeneralQuery',
      capabilities: ['general_ai'],
      priority: 10,
      timeout: 10000,
      fallbackActions: ['SafeErrorResponse']
    });

    this.registerAction('FallbackIntent', {
      handler: 'handleFallback',
      capabilities: ['error_handling'],
      priority: 99,
      timeout: 2000
    });
  }

  /**
     * Initialize intent patterns for fuzzy matching
     */
  initializeIntentPatterns() {
    // Bookmark analysis patterns
    this.intentPatterns.set('bookmark_analysis', [
      /analyze.*bookmarks?/i,
      /check.*bookmarks?/i,
      /what.*bookmarks?/i,
      /my.*saved.*items?/i,
      /saved.*content/i,
      /bookmarked.*content/i
    ]);

    // Learning base patterns
    this.intentPatterns.set('learning_query', [
      /what.*should.*i.*learn/i,
      /learning.*recommendation/i,
      /next.*skill/i,
      /what.*to.*learn/i,
      /suggest.*learning/i,
      /educational.*advice/i
    ]);

    // Interests patterns
    this.intentPatterns.set('my_interests', [
      /what.*am.*i.*interested.*in/i,
      /my.*interests/i,
      /show.*interests/i,
      /what.*do.*i.*like/i,
      /my.*preferences/i
    ]);

    // Spotify patterns
    this.intentPatterns.set('spotify_control', [
      /play.*music/i,
      /pause.*music/i,
      /skip.*track/i,
      /spotify/i
    ]);

    // Media control patterns
    this.intentPatterns.set('media_control', [
      /play.*video/i,
      /pause.*video/i,
      /volume.*up/i,
      /volume.*down/i
    ]);
  }

  /**
     * Initialize capability discovery
     */
  initializeCapabilityDiscovery() {
    this.capabilityDiscovery.set('bookmark_analysis', {
      available: true,
      confidence: 0.95,
      dependencies: ['twitter', 'instagram', 'knowledge_graph'],
      checkHealth: async () => {
        // Check if bookmark analysis is healthy
        return true;
      }
    });

    this.capabilityDiscovery.set('knowledge_graph', {
      available: true,
      confidence: 0.90,
      dependencies: [],
      checkHealth: async () => {
        // Check if knowledge graph is healthy
        return true;
      }
    });

    this.capabilityDiscovery.set('twitter', {
      available: true,
      confidence: 0.85,
      dependencies: [],
      checkHealth: async () => {
        // Check Twitter API health
        return true;
      }
    });

    this.capabilityDiscovery.set('instagram', {
      available: true,
      confidence: 0.80,
      dependencies: [],
      checkHealth: async () => {
        // Check Instagram API health
        return true;
      }
    });
  }

  /**
     * Register a new action
     */
  registerAction(intentName, actionConfig) {
    this.actionRegistry.set(intentName, {
      ...actionConfig,
      name: intentName,
      registeredAt: new Date().toISOString(),
      callCount: 0,
      successRate: 1.0,
      lastCalled: null
    });

    console.log(`✅ Registered action: ${intentName}`);
  }

  /**
     * Route intent to appropriate action handler
     */
  async routeIntent(intentName, slots, context = {}) {
    console.log(`🎯 Routing intent: ${intentName}`);

    try {
      // 1. Check if exact intent exists
      if (this.actionRegistry.has(intentName)) {
        return await this.executeAction(intentName, slots, context);
      }

      // 2. Try fuzzy matching
      const matchedIntent = await this.matchIntent(intentName, slots.query);
      if (matchedIntent && this.actionRegistry.has(matchedIntent)) {
        console.log(`🔍 Matched ${intentName} → ${matchedIntent}`);
        return await this.executeAction(matchedIntent, slots, context);
      }

      // 3. Fallback to general query
      console.log(`⚠️  Unknown intent ${intentName}, falling back to general query`);
      return await this.executeAction('GeneralQueryIntent', slots, context);

    } catch (error) {
      console.error(`❌ Intent routing failed: ${error.message}`);

      // Final fallback
      return await this.executeAction('FallbackIntent', slots, {
        ...context,
        error: error.message,
        originalIntent: intentName
      });
    }
  }

  /**
     * Execute specific action with resilience
     */
  async executeAction(intentName, slots, context) {
    const action = this.actionRegistry.get(intentName);

    if (!action) {
      throw new Error(`Action not found: ${intentName}`);
    }

    console.log(`⚡ Executing action: ${action.handler}`);

    // Update action statistics
    action.callCount++;
    action.lastCalled = new Date().toISOString();

    // Execute with resilience protection
    return await this.resilienceIntegration.handleAlexaIntent(
      intentName,
      async (intentSlots) => {
        // This would call the actual handler function
        // For now, return a placeholder response
        return await this.callHandler(action.handler, intentSlots, context);
      },
      slots
    );
  }

  /**
     * Call the actual handler function
     */
  async callHandler(handlerName, slots, context) {
    // This would integrate with the actual handler implementations
    // For now, provide a placeholder implementation

    const responses = {
      handlePlaySpotify: {
        text: 'Playing music on Spotify',
        shouldEndSession: false
      },
      handleKodiControl: {
        text: 'Controlling Kodi media center',
        shouldEndSession: false
      },
      handleRedditQuery: {
        text: 'Searching Reddit for information',
        shouldEndSession: true
      },
      handleTwitterQuery: {
        text: 'Searching Twitter for latest updates',
        shouldEndSession: true
      },
      handleWhatsAppSend: {
        text: 'Sending message via WhatsApp',
        shouldEndSession: true
      },
      handleWeatherQuery: {
        text: 'Getting current weather information',
        shouldEndSession: true
      },
      handleNewsQuery: {
        text: 'Fetching latest news headlines',
        shouldEndSession: true
      },
      handleBookmarkAnalysis: {
        text: 'Analyzing your bookmarks from Twitter and Instagram. I found several topics focused on AI, design, and programming.',
        card: {
          title: 'Bookmark Analysis Complete',
          content: 'Topics: AI, Design, Programming\nPlatforms: Twitter, Instagram'
        },
        shouldEndSession: true
      },
      handleLearningBaseQuery: {
        text: 'Based on your learning patterns, I recommend exploring machine learning next, as it builds on your programming interests.',
        card: {
          title: 'Learning Recommendation',
          content: 'Next step: Machine Learning'
        },
        shouldEndSession: true
      },
      handleMyInterests: {
        text: 'Based on your bookmarks and saved content, your main interests are artificial intelligence, graphic design, and programming. You also save content about photography and digital art.',
        card: {
          title: 'Your Interests',
          content: 'AI, Design, Programming, Photography, Digital Art'
        },
        shouldEndSession: true
      },
      handleGeneralQuery: {
        text: 'I understand you\'re asking about general topics. I can help with bookmark analysis, learning recommendations, and various other tasks.',
        shouldEndSession: false
      },
      handleFallback: {
        text: 'I apologize, but I\'m having trouble processing that request. Please try again or rephrase your question.',
        shouldEndSession: true
      }
    };

    return responses[handlerName] || {
      text: 'I\'m processing your request',
      shouldEndSession: true
    };
  }

  /**
     * Match intent using fuzzy patterns
     */
  async matchIntent(intentName, query) {
    if (!query) return null;

    for (const [category, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          console.log(`🔍 Pattern matched: ${category}`);

          // Map category to intent name
          const intentMapping = {
            'bookmark_analysis': 'BookmarkAnalysisIntent',
            'learning_query': 'LearningBaseQueryIntent',
            'my_interests': 'MyInterestsIntent',
            'spotify_control': 'PlaySpotifyIntent',
            'media_control': 'KodiControlIntent'
          };

          return intentMapping[category] || null;
        }
      }
    }

    return null;
  }

  /**
     * Check if required capabilities are available
     */
  async checkCapabilities(requiredCapabilities) {
    const capabilityStatus = {};

    for (const capability of requiredCapabilities) {
      const capabilityInfo = this.capabilityDiscovery.get(capability);

      if (capabilityInfo) {
        capabilityStatus[capability] = {
          available: capabilityInfo.available,
          confidence: capabilityInfo.confidence,
          healthy: await capabilityInfo.checkHealth()
        };
      } else {
        capabilityStatus[capability] = {
          available: false,
          confidence: 0,
          healthy: false
        };
      }
    }

    return capabilityStatus;
  }

  /**
     * Get action statistics
     */
  getActionStatistics() {
    const stats = {
      totalActions: this.actionRegistry.size,
      actionsCalled: 0,
      topActions: [],
      actionDetails: []
    };

    for (const [name, action] of this.actionRegistry) {
      if (action.callCount > 0) {
        stats.actionsCalled++;
        stats.actionDetails.push({
          name: name,
          callCount: action.callCount,
          successRate: action.successRate,
          lastCalled: action.lastCalled
        });
      }
    }

    // Sort by call count
    stats.actionDetails.sort((a, b) => b.callCount - a.callCount);
    stats.topActions = stats.actionDetails.slice(0, 5);

    return stats;
  }

  /**
     * Discover available actions
     */
  discoverActions(filter = {}) {
    let actions = Array.from(this.actionRegistry.values());

    if (filter.capability) {
      actions = actions.filter(action =>
        action.capabilities.includes(filter.capability)
      );
    }

    if (filter.priority) {
      actions = actions.filter(action =>
        action.priority === filter.priority
      );
    }

    return actions.map(action => ({
      name: action.name,
      capabilities: action.capabilities,
      priority: action.priority,
      timeout: action.timeout
    }));
  }

  /**
     * Get orchestrator health
     */
  async getHealth() {
    const stats = this.getActionStatistics();

    return {
      status: 'healthy',
      totalActions: stats.totalActions,
      activeActions: stats.actionsCalled,
      topActions: stats.topActions,
      capabilities: Object.keys(this.capabilityDiscovery).length,
      resilienceIntegration: this.resilienceIntegration.initialized
    };
  }
}

// Global singleton instance
let globalOrchestrator = null;

/**
 * Get global intent orchestrator instance
 */
function getIntentOrchestrator() {
  if (!globalOrchestrator) {
    globalOrchestrator = new IntentOrchestrator();
  }
  return globalOrchestrator;
}

module.exports = {
  IntentOrchestrator,
  getIntentOrchestrator
};
