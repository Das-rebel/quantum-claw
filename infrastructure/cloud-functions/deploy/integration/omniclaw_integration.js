/**
 * OmniClaw 2.0 Integration Layer
 *
 * Connects all simplification components:
 * - Smart Router for intent routing
 * - Unified Response for consistent formatting
 * - Progressive Disclosure for feature discovery
 * - Context-Aware Simplification for platform optimization
 *
 * This is the entry point that replaces complex intent routing with
 * simple, natural language interaction.
 */

const SmartRouter = require('../core/smart_router');
const UnifiedResponse = require('../shared/responses/unified_response');
const PlatformAdapters = require('../shared/responses/platform_adapters');
const ProgressiveDisclosure = require('../core/progressive_disclosure');
const ContextAwareSimplifier = require('../core/context_aware_simplifier');
const TransparencyLayer = require('../core/transparency_layer');
const SmartDefaults = require('../core/smart_defaults');

class OmniClawIntegration {
  constructor() {
    this.smartRouter = new SmartRouter();
    this.progressiveDisclosure = new ProgressiveDisclosure();
    this.contextSimplifier = new ContextAwareSimplifier();
    this.transparencyLayer = new TransparencyLayer();
    this.smartDefaults = new SmartDefaults();

    // User context tracking
    this.userSessions = new Map();  // sessionId -> user context
  }

  /**
   * Main entry point for all user queries
   * Replaces complex intent routing with simple natural language understanding
   *
   * @param {string} query - User's natural language query
   * @param {Object} options - Options including platform, sessionId, etc.
   * @returns {Object} Formatted response for the platform
   */
  async processQuery(query, options = {}) {
    const { platform = 'alexa', sessionId = 'default' } = options;

    console.log(`[OmniClaw 2.0] Processing query: "${query}"`);

    // Get or create user context
    const userContext = this._getOrCreateUserContext(sessionId, platform);

    // Simplify query based on context (time of day, platform)
    const timeContext = this.contextSimplifier.getTimeContext();
    const platformContext = this.contextSimplifier.getPlatformContext(platform);

    // Route query to appropriate capability using AI
    let routingResult = await this.smartRouter.route(query, {
      platform,
      sessionId,
      userContext
    });

    console.log(`[OmniClaw 2.0] Routed to: ${routingResult.capability} (confidence: ${routingResult.confidence})`);

    // Apply transparency layer
    routingResult = this.transparencyLayer.enhanceRoutingResult(routingResult, query);

    // Check for corrections
    const correction = this.smartDefaults.detectCorrection(query, userContext);
    if (correction) {
      const correctionResult = this.smartDefaults.handleCorrection(correction, userContext);
      if (correctionResult.type === 'clarification') {
        const clarifyResponse = UnifiedResponse.clarify(correctionResult.message, platform);
        return PlatformAdapters.adapt(clarifyResponse, platform);
      }
      // Re-route with corrected query
      routingResult = await this.smartRouter.route(correctionResult.newQuery, {
        platform,
        sessionId,
        userContext
      });
      routingResult = this.transparencyLayer.enhanceRoutingResult(routingResult, correctionResult.newQuery);
    }

    // Apply smart defaults
    routingResult = this.smartDefaults.applyDefaults(routingResult, {
      ...userContext,
      originalQuery: query
    });

    // If action requires confirmation, build confirmation request
    if (routingResult.requiresConfirmation) {
      const confirmation = this.transparencyLayer.buildConfirmation(routingResult, {
        platform,
        sessionId
      });

      return {
        response: {
          outputSpeech: { type: 'PlainText', text: confirmation.message },
          shouldEndSession: false
        },
        requiresConfirmation: true,
        confirmationData: confirmation
      };
    }

    // Execute the routed intent (this would call the actual service)
    const executionResult = await this._executeIntent(routingResult, {
      query,
      platform,
      sessionId,
      userContext
    });

    // Build unified response
    const unifiedResponse = UnifiedResponse.success(
      executionResult.response,
      {
        details: executionResult.details || '',
        actionTaken: executionResult.actionTaken || '',
        confidence: routingResult.confidence,
        suggestions: this._getSuggestions(routingResult, userContext),
        platform
      }
    );

    // Add transparency information
    const transparencyInfo = this.transparencyLayer.formatTransparencyForPlatform(
      routingResult,
      platform
    );
    unifiedResponse.transparency = transparencyInfo;

    // Add default suggestion if defaults were applied
    if (routingResult.defaultsApplied && routingResult.defaultsApplied.length > 0) {
      const defaultSuggestion = this.smartDefaults.generateDefaultSuggestion(
        routingResult,
        platform
      );
      if (defaultSuggestion) {
        unifiedResponse.suggestions.unshift(defaultSuggestion);
      }
    }

    // Add progressive disclosure hint if appropriate
    const hint = this.progressiveDisclosure.getHint(
      routingResult.capability,
      userContext
    );

    if (hint && this.progressiveDisclosure.shouldShowHint(hint, userContext)) {
      const hintText = this.progressiveDisclosure.formatHintForPlatform(hint, platform);
      unifiedResponse.suggestions.push(hintText);
    }

    // Adapt response for platform
    const platformResponse = PlatformAdapters.adapt(unifiedResponse, platform);

    // Update user context
    this._updateUserContext(sessionId, {
      lastQuery: query,
      lastCapability: routingResult.capability,
      lastAction: routingResult.intent,
      interactionCount: (userContext.interactionCount || 0) + 1,
      lastInteractionTime: Date.now()
    });

    // Learn from user behavior
    const learning = this.smartDefaults.learnFromBehavior(
      routingResult.capability,
      routingResult.slots,
      userContext
    );

    if (learning.defaultsUpdated) {
      console.log(`[OmniClaw 2.0] Learned new preferences for ${routingResult.capability}`);
      this._updateUserPreferences(sessionId, routingResult.capability, learning.defaultsUpdated);
    }

    console.log(`[OmniClaw 2.0] Response sent (interaction #${userContext.interactionCount + 1})`);

    return platformResponse;
  }

  /**
   * Get contextual greeting for new session
   */
  getContextualGreeting(platform) {
    const contextualGreeting = this.contextSimplifier.getContextualGreeting(platform);

    const capabilities = this.smartRouter.getCoreCapabilities();
    const capabilityList = capabilities.map(cap => cap.description).join(', ');

    const greeting = `${contextualGreeting.greeting} I can help you with ${capabilityList}. Just say what you need!`;

    return {
      response: {
        outputSpeech: { type: 'PlainText', text: greeting },
        shouldEndSession: false
      }
    };
  }

  /**
   * Get "What can you do?" discovery response
   */
  getDiscoveryResponse(platform, userContext) {
    const discovery = this.progressiveDisclosure.getDiscoveryResponse(userContext);

    let message = discovery.message;
    if (discovery.examples && discovery.examples.length > 0) {
      message += '\n\nFor example: ' + discovery.examples[0];
      if (discovery.examples.length > 1) {
        message += ' or ' + discovery.examples[1];
      }
    }

    return {
      response: {
        outputSpeech: { type: 'PlainText', text: message },
        shouldEndSession: false
      }
    };
  }

  /**
   * Execute the routed intent (calls actual service)
   * This is where the real capability execution happens
   */
  async _executeIntent(routingResult, context) {
    // This would integrate with existing services:
    // - AgentOrchestrator for complex queries
    // - Direct client calls for simple intents
    // - Multi-provider query for general questions

    const { intent, slots, capability } = routingResult;

    // For now, return a mock response
    // In production, this would call the actual service
    return {
      response: `I'll help you ${this._getCapabilityDescription(capability)}.`,
      details: `Routed to ${intent} via smart routing`,
      actionTaken: `Intent executed: ${intent}`
    };
  }

  /**
   * Get suggestions based on routing and context
   */
  _getSuggestions(routingResult, userContext) {
    const suggestions = [];

    // Add routing-specific suggestions
    if (routingResult.suggestions && routingResult.suggestions.length > 0) {
      suggestions.push(...routingResult.suggestions);
    }

    // Add contextual suggestions
    const contextualSuggestions = this.progressiveDisclosure.getRelatedCapabilities(
      routingResult.capability
    );

    contextualSuggestions.forEach(rel => {
      suggestions.push(rel.callToAction);
    });

    // Limit to 3 suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Get or create user context
   */
  _getOrCreateUserContext(sessionId, platform) {
    if (!this.userSessions.has(sessionId)) {
      this.userSessions.set(sessionId, {
        sessionId,
        platform,
        interactionCount: 0,
        createdAt: Date.now(),
        lastInteractionTime: Date.now(),
        lastQuery: null,
        lastCapability: null,
        recentCapabilities: []
      });
    }

    const context = this.userSessions.get(sessionId);

    // Update platform if changed
    context.platform = platform;

    return context;
  }

  /**
   * Update user context after interaction
   */
  _updateUserContext(sessionId, updates) {
    const context = this.userSessions.get(sessionId);
    if (!context) return;

    Object.assign(context, updates);

    // Update recent capabilities (keep last 5)
    if (updates.lastCapability) {
      context.recentCapabilities.push(updates.lastCapability);
      if (context.recentCapabilities.length > 5) {
        context.recentCapabilities.shift();
      }
    }

    this.userSessions.set(sessionId, context);
  }

  /**
   * Get capability description for user feedback
   */
  _getCapabilityDescription(capability) {
    const descriptions = {
      music: 'play some music',
      answers: 'find an answer for you',
      tv: 'control your TV',
      messages: 'send a message',
      news: 'get the latest news',
      translation: 'translate text',
      stories: 'tell a story',
      twitter: 'search Twitter',
      reddit: 'search Reddit',
      youtube: 'search YouTube',
      arxiv: 'search academic papers'
    };

    return descriptions[capability] || 'help you with that';
  }

  /**
   * Get session statistics for analytics
   */
  getSessionStats(sessionId) {
    const context = this.userSessions.get(sessionId);
    if (!context) {
      return null;
    }

    return {
      sessionId: context.sessionId,
      platform: context.platform,
      interactionCount: context.interactionCount,
      sessionDuration: Date.now() - context.createdAt,
      lastCapability: context.lastCapability,
      recentCapabilities: context.recentCapabilities
    };
  }

  /**
   * Clean up old sessions (maintenance)
   */
  cleanupOldSessions(maxAge = 86400000) {  // 24 hours
    const now = Date.now();
    const toDelete = [];

    for (const [sessionId, context] of this.userSessions.entries()) {
      const age = now - context.lastInteractionTime;
      if (age > maxAge) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(sessionId => {
      this.userSessions.delete(sessionId);
    });

    console.log(`[OmniClaw 2.0] Cleaned up ${toDelete.length} old sessions`);
    return toDelete.length;
  }

  /**
   * Update user preferences based on learned behavior
   */
  _updateUserPreferences(sessionId, capability, updates) {
    const context = this.userSessions.get(sessionId);
    if (!context) return;

    if (!context.userPreferences) {
      context.userPreferences = {};
    }

    if (!context.userPreferences[capability]) {
      context.userPreferences[capability] = {};
    }

    Object.assign(context.userPreferences[capability], updates);

    this.userSessions.set(sessionId, context);
  }

  /**
   * Handle user confirmation for action requiring approval
   */
  async handleConfirmation(sessionId, confirmed, confirmationData) {
    if (!confirmed) {
      return {
        response: {
          outputSpeech: { type: 'PlainText', text: 'Okay, I cancelled that action.' },
          shouldEndSession: false
        }
      };
    }

    // Execute the confirmed action
    const executionResult = await this._executeIntent(confirmationData, {
      sessionId
    });

    const unifiedResponse = UnifiedResponse.success(
      executionResult.response,
      {
        details: executionResult.details || '',
        actionTaken: executionResult.actionTaken || '',
        confidence: confirmationData.confidence,
        platform: confirmationData.platform
      }
    );

    const platformResponse = PlatformAdapters.adapt(unifiedResponse, confirmationData.platform);

    return platformResponse;
  }
}

module.exports = OmniClawIntegration;
