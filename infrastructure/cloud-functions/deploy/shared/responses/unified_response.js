/**
 * UnifiedResponse - Standardized Response Format for OmniClaw
 *
 * Consistent response structure across all platforms (Alexa, WhatsApp, Web)
 * Following Jony Ive's design principles: clarity, simplicity, transparency
 */

class UnifiedResponse {
  /**
   * Create a standardized response
   *
   * @param {Object} options - Response options
   * @param {string} options.directAnswer - Brief, direct answer to user's query
   * @param {string} options.details - Additional context (shown on demand)
   * @param {string} options.actionTaken - What action was performed (if any)
   * @param {number} options.confidence - Confidence level (0-1)
   * @param {Array<string>} options.suggestions - Related actions user can take
   * @param {string} options.platform - Platform identifier (alexa, whatsapp, web)
   * @param {boolean} options.success - Whether the action was successful
   * @param {string} options.error - Error message if not successful
   */
  constructor(options = {}) {
    this.directAnswer = options.directAnswer || '';
    this.details = options.details || '';
    this.actionTaken = options.actionTaken || '';
    this.confidence = options.confidence || 0.5;
    this.suggestions = options.suggestions || [];
    this.platform = options.platform || 'default';
    this.success = options.success !== undefined ? options.success : true;
    this.error = options.error || '';
    this.timestamp = new Date().toISOString();
  }

  /**
   * Create a successful response
   */
  static success(directAnswer, options = {}) {
    return new UnifiedResponse({
      directAnswer,
      success: true,
      ...options
    });
  }

  /**
   * Create a failure response
   */
  static failure(error, options = {}) {
    return new UnifiedResponse({
      directAnswer: options.directAnswer || "I'm sorry, I couldn't do that.",
      error,
      success: false,
      ...options
    });
  }

  /**
   * Create a response with action confirmation
   */
  static confirm(action, options = {}) {
    return new UnifiedResponse({
      directAnswer: `Should I ${action}?`,
      actionTaken: `Awaiting confirmation for: ${action}`,
      confidence: 0.5,
      suggestions: ['Yes, do it', 'No, cancel'],
      ...options
    });
  }

  /**
   * Create a response with low confidence asking for clarification
   */
  static clarify(question, options = {}) {
    return new UnifiedResponse({
      directAnswer: `I think you mean "${question}", but I want to be sure.`,
      confidence: 0.3,
      suggestions: ['Yes, that\'s right', 'No, I meant something else'],
      ...options
    });
  }

  /**
   * Convert response to platform-specific format
   */
  toPlatform(platform) {
    const adapters = {
      alexa: this._toAlexa.bind(this),
      whatsapp: this._toWhatsApp.bind(this),
      web: this._toWeb.bind(this),
      default: this._toDefault.bind(this)
    };

    const adapter = adapters[platform] || adapters.default;
    return adapter();
  }

  /**
   * Format for Alexa (voice-first, brief)
   */
  _toAlexa() {
    // Alexa gets only the direct answer for TTS
    let response = this.directAnswer;

    // Add action confirmation if pending
    if (this.actionTaken && this.confidence < 0.9) {
      response += `. ${this.actionTaken}`;
    }

    return {
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: response
        },
        shouldEndSession: true,
        card: {
          type: 'Simple',
          title: 'OmniClaw 2.0',
          content: response.substring(0, 200)
        }
      }
    };
  }

  /**
   * Format for WhatsApp (text-first, detailed)
   */
  _toWhatsApp() {
    let message = this.directAnswer;

    // Add details if available
    if (this.details) {
      message += `\n\n*Details:* ${this.details}`;
    }

    // Add action taken
    if (this.actionTaken) {
      message += `\n\n✅ ${this.actionTaken}`;
    }

    // Add suggestions if available
    if (this.suggestions.length > 0) {
      message += `\n\n*What else can I do?*\n`;
      this.suggestions.forEach((s, i) => {
        message += `${i + 1}. ${s}\n`;
      });
    }

    return {
      text: message,
      formatted: true
    };
  }

  /**
   * Format for Web (visual-first, rich)
   */
  _toWeb() {
    return {
      directAnswer: this.directAnswer,
      details: this.details,
      actionTaken: this.actionTaken,
      confidence: this.confidence,
      suggestions: this.suggestions,
      success: this.success,
      error: this.error,
      timestamp: this.timestamp,
      expandable: true
    };
  }

  /**
   * Default format (generic JSON)
   */
  _toDefault() {
    return {
      response: this.directAnswer,
      details: this.details,
      actionTaken: this.actionTaken,
      confidence: this.confidence,
      suggestions: this.suggestions,
      success: this.success,
      error: this.error
    };
  }

  /**
   * Get confidence level category
   */
  getConfidenceLevel() {
    if (this.confidence >= 0.9) return 'high';
    if (this.confidence >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Check if this response needs user confirmation
   */
  needsConfirmation() {
    return this.confidence < 0.9 && this.confidence >= 0.5;
  }

  /**
   * Check if this response needs clarification
   */
  needsClarification() {
    return this.confidence < 0.5;
  }
}

module.exports = UnifiedResponse;
