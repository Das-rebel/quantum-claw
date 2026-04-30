/**
 * Transparency Layer - Making AI Behavior Visible and Explainable
 *
 * Following Jony Ive's principle: "Clarity through transparency"
 * Users should understand what AI is doing and why
 *
 * This layer provides:
 * - Confidence indicators for uncertain actions
 * - Action confirmations before irreversible changes
 * - Explainable decisions (why routing to specific service)
 * - Clear communication of limitations
 */

class TransparencyLayer {
  constructor() {
    // Confidence thresholds
    this.thresholds = {
      high: 0.9,      // Direct action, no confirmation needed
      medium: 0.5,    // Confirm before action
      low: 0.5        // Ask for clarification
    };

    // Irreversible actions that require confirmation
    this.irreversibleActions = [
      'send_message',
      'delete_item',
      'purchase',
      'modify_settings',
      'share_data'
    ];

    // Explainability templates
    this.explanationTemplates = {
      routing: {
        music: 'I chose music control because you mentioned "{trigger}"',
        answers: 'I searched for answers because you asked "{trigger}"',
        tv: 'I routed to TV control because you said "{trigger}"',
        messages: 'I prepared a message because you mentioned "{trigger}"',
        news: 'I fetched news because you asked about "{trigger}"',
        translation: 'I detected translation intent from "{trigger}"'
      },
      fallback: {
        no_match: 'I wasn\'t sure what you meant, so I need clarification',
        low_confidence: 'I\'m {confidence}% sure you want to {action}. Should I proceed?',
        multiple_matches: 'You could mean {options}. Which one did you want?'
      }
    };
  }

  /**
   * Add transparency information to routing result
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {string} query - Original user query
   * @returns {Object} Enhanced routing result with transparency info
   */
  enhanceRoutingResult(routingResult, query) {
    const enhanced = { ...routingResult };

    // Add confidence level categorization
    enhanced.confidenceLevel = this._categorizeConfidence(routingResult.confidence);

    // Add explanation
    enhanced.explanation = this._generateExplanation(routingResult, query);

    // Add confirmation requirement
    enhanced.requiresConfirmation = this._requiresConfirmation(routingResult);

    // Add human-readable confidence
    enhanced.confidencePercent = Math.round(routingResult.confidence * 100);

    return enhanced;
  }

  /**
   * Build confirmation message for actions requiring user approval
   *
   * @param {Object} routingResult - Enhanced routing result
   * @param {Object} context - User context (platform, sessionId, etc.)
   * @returns {Object} Confirmation request formatted for platform
   */
  buildConfirmation(routingResult, context = {}) {
    const { platform = 'alexa' } = context;

    const confidenceLevel = routingResult.confidenceLevel;
    const action = this._getActionDescription(routingResult);

    let message;

    if (confidenceLevel === 'low') {
      // Low confidence: Ask for clarification
      message = this._buildClarification(routingResult, platform);
    } else if (confidenceLevel === 'medium') {
      // Medium confidence: Confirm action
      message = this._buildMediumConfirmation(routingResult, action, platform);
    } else {
      // High confidence + irreversible action: Still confirm
      message = this._buildHighConfirmation(routingResult, action, platform);
    }

    return {
      type: 'confirmation',
      message,
      action: routingResult.intent,
      slots: routingResult.slots,
      confidence: routingResult.confidence,
      explanation: routingResult.explanation,
      platform
    };
  }

  /**
   * Generate explanation for why specific routing was chosen
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {string} query - Original user query
   * @returns {string} Human-readable explanation
   */
  _generateExplanation(routingResult, query) {
    const { capability, intent, matchedKeywords } = routingResult;

    // Check if we have a template for this capability
    if (this.explanationTemplates.routing[capability]) {
      const trigger = matchedKeywords && matchedKeywords.length > 0
        ? matchedKeywords[0]
        : 'relevant terms';

      return this.explanationTemplates.routing[capability]
        .replace('{trigger}', trigger);
    }

    // Fallback explanation
    return `I routed to ${intent} because it matched your request best.`;
  }

  /**
   * Categorize confidence score
   *
   * @param {number} confidence - Confidence score (0-1)
   * @returns {string} Confidence level (high/medium/low)
   */
  _categorizeConfidence(confidence) {
    if (confidence >= this.thresholds.high) return 'high';
    if (confidence >= this.thresholds.low) return 'medium';
    return 'low';
  }

  /**
   * Check if action requires confirmation
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @returns {boolean} Whether confirmation is needed
   */
  _requiresConfirmation(routingResult) {
    // Low confidence always requires confirmation
    if (routingResult.confidence < this.thresholds.low) {
      return true;
    }

    // Medium confidence requires confirmation
    if (routingResult.confidence < this.thresholds.high) {
      return true;
    }

    // High confidence but irreversible action
    const intent = routingResult.intent.toLowerCase();
    const isIrreversible = this.irreversibleActions.some(action =>
      intent.includes(action)
    );

    return isIrreversible;
  }

  /**
   * Get human-readable action description
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @returns {string} Action description
   */
  _getActionDescription(routingResult) {
    const { intent, slots, capability } = routingResult;

    const descriptions = {
      music: slots?.query
        ? `play "${slots.query}" on Spotify`
        : 'play music on Spotify',
      answers: slots?.query
        ? `search for "${slots.query}"`
        : 'search for that information',
      tv: slots?.query
        ? `play "${slots.query}" on Kodi`
        : 'control your TV with Kodi',
      messages: slots?.recipient
        ? `send a message to ${slots.recipient}`
        : 'send a message',
      news: 'get the latest news headlines',
      translation: slots?.text && slots?.targetLanguage
        ? `translate "${slots.text}" to ${slots.targetLanguage}`
        : 'translate that text'
    };

    return descriptions[capability] || `execute ${intent}`;
  }

  /**
   * Build clarification request for low confidence
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {string} platform - Platform identifier
   * @returns {string} Clarification message
   */
  _buildClarification(routingResult, platform) {
    const { intent, slots } = routingResult;

    // Extract key information for clarification
    const uncertainParts = [];
    if (slots && Object.keys(slots).length > 0) {
      Object.entries(slots).forEach(([key, value]) => {
        if (!value || value === 'unknown') {
          uncertainParts.push(key);
        }
      });
    }

    if (platform === 'alexa') {
      // Voice-first: Brief clarification
      if (uncertainParts.length > 0) {
        return `I need a bit more info. What did you mean by ${uncertainParts[0]}?`;
      }
      return `I'm not sure what you meant. Could you rephrase that?`;
    }

    if (platform === 'whatsapp') {
      // Text-first: Detailed clarification with options
      let message = '❓ **I need clarification**\n\n';
      message += `I think you want to ${intent}, but I'm not fully sure.\n\n`;
      message += 'Could you clarify:\n';
      uncertainParts.forEach(part => {
        message += `• ${part}\n`;
      });
      return message;
    }

    // Web: Rich clarification with possible intents
    return {
      title: 'Clarification Needed',
      message: `I'm ${routingResult.confidencePercent}% sure you want to ${intent}`,
      uncertainParts,
      suggestions: routingResult.suggestions || []
    };
  }

  /**
   * Build confirmation for medium confidence
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {string} action - Action description
   * @param {string} platform - Platform identifier
   * @returns {string} Confirmation message
   */
  _buildMediumConfirmation(routingResult, action, platform) {
    const confidence = routingResult.confidencePercent;

    if (platform === 'alexa') {
      // Voice-first: Brief confirmation
      return `I'm ${confidence}% sure you want to ${action}. Should I go ahead?`;
    }

    if (platform === 'whatsapp') {
      // Text-first: Rich confirmation with explanation
      let message = `🤔 **Confirm Action**\n\n`;
      message += `I think you want to ${action}.\n\n`;
      message += `**Confidence:** ${confidence}%\n`;
      message += `**Why:** ${routingResult.explanation}\n\n`;
      message += 'Should I proceed?';
      return message;
    }

    // Web: Full confirmation with details
    return {
      title: 'Confirm Action',
      action,
      confidence,
      explanation: routingResult.explanation,
      slots: routingResult.slots
    };
  }

  /**
   * Build confirmation for high confidence but irreversible action
   *
   * @param {Object} routingResult - Result from SmartRouter
   * @param {string} action - Action description
   * @param {string} platform - Platform identifier
   * @returns {string} Confirmation message
   */
  _buildHighConfirmation(routingResult, action, platform) {
    if (platform === 'alexa') {
      // Voice-first: Brief confirmation
      return `I'll ${action}. Is that okay?`;
    }

    if (platform === 'whatsapp') {
      // Text-first: Clear confirmation
      return `⚠️ **Confirmation Required**\n\nI'll ${action}.\n\nThis action can't be undone. Should I proceed?`;
    }

    // Web: Full confirmation
    return {
      title: 'Confirm Irreversible Action',
      action,
      warning: 'This action cannot be undone',
      explanation: routingResult.explanation
    };
  }

  /**
   * Format transparency information for platform
   *
   * @param {Object} routingResult - Enhanced routing result
   * @param {string} platform - Platform identifier
   * @returns {Object} Platform-specific transparency info
   */
  formatTransparencyForPlatform(routingResult, platform) {
    const transparency = {
      confidence: routingResult.confidencePercent,
      confidenceLevel: routingResult.confidenceLevel,
      explanation: routingResult.explanation
    };

    if (platform === 'alexa') {
      // Voice-first: Minimal transparency
      return {
        spoken: transparency.explanation
      };
    }

    if (platform === 'whatsapp') {
      // Text-first: Formatted transparency
      return {
        text: `📊 **Confidence:** ${transparency.confidence}%\n💡 ${transparency.explanation}`
      };
    }

    // Web: Full transparency
    return transparency;
  }

  /**
   * Generate failure explanation
   *
   * @param {Error} error - Error that occurred
   * @param {Object} context - Execution context
   * @returns {string} Human-readable failure explanation
   */
  explainFailure(error, context = {}) {
    const { intent, capability } = context;

    // Common error explanations
    const errorExplanations = {
      'SERVICE_UNAVAILABLE': `I couldn't reach ${capability || 'the service'}. It might be temporarily down.`,
      'NOT_FOUND': `I couldn't find what you're looking for. Could you rephrase?`,
      'PERMISSION_DENIED': `I don't have permission to do that. Check your settings.`,
      'RATE_LIMITED': `I'm making requests too quickly. Let's try again in a moment.`,
      'INVALID_INPUT': `I didn't understand part of your request. Could you clarify?`,
      'TIMEOUT': `The request took too long. Let's try again.`,
      'UNKNOWN': `Something went wrong. Let me try a different approach.`
    };

    // Try to match error type
    const errorType = error.code || error.name || 'UNKNOWN';
    const baseExplanation = errorExplanations[errorType] || errorExplanations['UNKNOWN'];

    // Add context-specific information
    let explanation = baseExplanation;
    if (intent) {
      explanation += ` (while trying to ${intent})`;
    }

    return explanation;
  }
}

module.exports = TransparencyLayer;
