/**
 * Input Validation Utilities
 * Provides secure input validation and sanitization
 */

class InputValidator {
  /**
     * Validate and sanitize user input
     */
  static validateUserInput(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Invalid input: must be a non-empty string');
    }

    // Remove potentially dangerous content
    const sanitized = this.sanitizeInput(input);

    // Validate length
    if (sanitized.length > 10000) {
      throw new Error('Input too long: maximum 10000 characters');
    }

    return sanitized;
  }

  /**
     * Sanitize input to prevent XSS and injection attacks
     */
  static sanitizeInput(input) {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  /**
     * Validate API key format
     */
  static validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Basic validation - in production, use more sophisticated checks
    const isValid = apiKey.length >= 20 && apiKey.length <= 200;

    return isValid;
  }

  /**
     * Validate language code
     */
  static validateLanguage(language) {
    const validLanguages = ['english', 'hindi', 'hinglish', 'bengali'];

    return validLanguages.includes(language?.toLowerCase());
  }

  /**
     * Validate provider
     */
  static validateProvider(provider) {
    const validProviders = ['zai', 'cerebras', 'groq', 'gemini', 'sarvam'];

    return validProviders.includes(provider?.toLowerCase());
  }

  /**
     * Validate message content
     */
  static validateMessage(message) {
    if (!message || typeof message !== 'string') {
      return { valid: false, error: 'Invalid message' };
    }

    if (message.trim().length === 0) {
      return { valid: false, error: 'Empty message' };
    }

    if (message.length > 10000) {
      return { valid: false, error: 'Message too long' };
    }

    // Check for potentially malicious content
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(message)) {
        return { valid: false, error: 'Potentially malicious content detected' };
      }
    }

    return { valid: true, sanitizedMessage: this.sanitizeInput(message) };
  }
}

module.exports = InputValidator;
