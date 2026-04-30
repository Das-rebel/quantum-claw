/**
 * Platform Adapters - Convert UnifiedResponse to Platform-Specific Formats
 *
 * Ensures consistent but optimized responses for each platform
 * Following Jony Ive's principle: "Consistency across platforms"
 */

const UnifiedResponse = require('./unified_response');

class PlatformAdapters {
  /**
   * Adapt response for specific platform
   *
   * @param {UnifiedResponse} response - Unified response object
   * @param {string} platform - Platform identifier
   * @returns {Object} Platform-formatted response
   */
  static adapt(response, platform) {
    const adapters = {
      alexa: PlatformAdapters._adaptAlexa,
      whatsapp: PlatformAdapters._adaptWhatsApp,
      web: PlatformAdapters._adaptWeb,
      default: PlatformAdapters._adaptDefault
    };

    const adapter = adapters[platform] || adapters.default;
    return adapter(response);
  }

  /**
   * Alexa adapter (voice-first, minimal text)
   *
   * Design decisions:
   * - Only directAnswer for TTS (keep it brief)
   * - No technical details in speech
   * - Simple, conversational tone
   * - Card for additional context (shown in Alexa app)
   */
  static _adaptAlexa(response) {
    let speechText = response.directAnswer;

    // Truncate very long responses for voice
    if (speechText.length > 500) {
      speechText = speechText.substring(0, 497) + '...';
    }

    const alexaResponse = {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: speechText
        },
        shouldEndSession: true,
        card: response.details ? {
          type: 'Simple',
          title: 'OmniClaw 2.0',
          content: response.details.substring(0, 200)
        } : undefined
      }
    };

    // Add session attributes for context
    if (response.actionTaken || response.suggestions.length > 0) {
      alexaResponse.sessionAttributes = {
        lastAction: response.actionTaken,
        lastResponse: response.directAnswer,
        suggestions: response.suggestions,
        confidence: response.confidence
      };
    }

    return alexaResponse;
  }

  /**
   * WhatsApp adapter (text-first, rich formatting)
   *
   * Design decisions:
   * - Show directAnswer prominently
   * - Include details in formatted sections
   - Use emoji for visual hierarchy
   - Show action confirmations with checkmarks
   * - Suggestions as numbered list
   */
  static _adaptWhatsApp(response) {
    let message = '';

    // Main response
    message += `${response.directAnswer}\n`;

    // Action taken (if successful)
    if (response.success && response.actionTaken) {
      message += `\n✅ ${response.actionTaken}`;
    }

    // Error (if failed)
    if (!response.success && response.error) {
      message += `\n❌ Error: ${response.error}`;
    }

    // Additional details (if any)
    if (response.details) {
      message += `\n\n📝 *Details*\n${response.details}`;
    }

    // Confidence indicator (if low)
    if (response.confidence < 0.7) {
      message += `\n\n⚠️ Confidence: ${Math.round(response.confidence * 100)}%`;
    }

    // Suggestions (if any)
    if (response.suggestions.length > 0) {
      message += '\n\n💡 *What else?*\n';
      response.suggestions.forEach((s, i) => {
        message += `${i + 1}. ${s}\n`;
      });
    }

    return {
      text: message,
      parse_mode: 'Markdown',
      formatted: true
    };
  }

  /**
   * Web adapter (visual-first, rich interactions)
   *
   * Design decisions:
   * - Full JSON with all fields
   * - Expandable sections
   * - Visual confidence indicator
   * - Action buttons for suggestions
   * - Rich formatting with HTML support
   */
  static _adaptWeb(response) {
    return {
      success: response.success,
      data: {
        answer: response.directAnswer,
        details: response.details,
        action: response.actionTaken,
        confidence: {
          level: response.getConfidenceLevel(),
          value: response.confidence
        },
        suggestions: response.suggestions.map(s => ({
          text: s,
          action: s
        })),
        metadata: {
          error: response.error,
          timestamp: response.timestamp
        },
        ui: {
          expandable: true,
          showConfidence: response.confidence < 0.9,
          showSuggestions: response.suggestions.length > 0
        }
      }
    };
  }

  /**
   * Default adapter (generic JSON format)
   */
  static _adaptDefault(response) {
    return {
      response: response.directAnswer,
      details: response.details,
      actionTaken: response.actionTaken,
      confidence: response.confidence,
      confidenceLevel: response.getConfidenceLevel(),
      suggestions: response.suggestions,
      success: response.success,
      error: response.error,
      timestamp: response.timestamp,
      needsConfirmation: response.needsConfirmation(),
      needsClarification: response.needsClarification()
    };
  }

  /**
   * Batch adapt multiple responses
   */
  static adaptBatch(responses, platform) {
    return responses.map(r => this.adapt(r, platform));
  }

  /**
   * Create platform-specific error response
   */
  static error(message, platform, originalError = null) {
    const response = UnifiedResponse.failure(message, {
      error: originalError ? originalError.message : message,
      details: originalError ? originalError.stack : '',
      suggestions: ['Try again', 'Get help']
    });

    return this.adapt(response, platform);
  }

  /**
   * Create platform-specific confirmation request
   */
  static confirm(action, platform, options = {}) {
    const response = UnifiedResponse.confirm(action, options);
    return this.adapt(response, platform);
  }

  /**
   * Create platform-specific clarification request
   */
  static clarify(question, platform, options = {}) {
    const response = UnifiedResponse.clarify(question, options);
    return this.adapt(response, platform);
  }
}

module.exports = PlatformAdapters;
