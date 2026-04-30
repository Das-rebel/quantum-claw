/**
 * Input Sanitizer
 *
 * Provides security validation for user input to prevent:
 * - SQL injection attacks
 * - XSS (Cross-Site Scripting) attacks
 * - Command injection
 */

class InputSanitizer {
  /**
     * Check if input contains SQL injection patterns
     * @param {string} input - User input to check
     * @returns {Object} - Result with sanitized flag and reason
     */
  static detectSQLInjection(input) {
    const patterns = [
      /['"]*;\s*DROP\s+TABLE/i,
      /['"]*;\s*DELETE\s+FROM/i,
      /['"]*;\s*UPDATE\s+.*SET/i,
      /['"]*;\s*INSERT\s+INTO/i,
      /UNION\s+SELECT/i,
      /OR\s+1\s*=\s*1/i,
      /OR\s+1\s*=\s*'1'/i,
      /AND\s+1\s*=\s*1/i,
      /--/,
      /\/\*/,
      /\*\//,
      /EXEC\s*\(/i,
      /xp_cmdshell/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          pattern: pattern.toString(),
          reason: 'SQL injection attempt detected'
        };
      }
    }

    return {
      detected: false,
      reason: null
    };
  }

  /**
     * Check if input contains XSS patterns
     * @param {string} input - User input to check
     * @returns {Object} - Result with sanitized flag and reason
     */
  static detectXSS(input) {
    const patterns = [
      /<script[^>]*>.*?<\/script>/i,
      /<iframe[^>]*>.*?<\/iframe>/i,
      /on\w+\s*=\s*["'][^"']*["']/i,
      /javascript:\s*\w+/i,
      /data:\s*text\/html/i,
      /<img[^>]*onerror[^>]*>/i,
      /<body[^>]*onload[^>]*>/i,
      /<input[^>]*onfocus[^>]*>/i,
      /<a[^>]*href\s*=\s*["']javascript:/i,
      /document\.cookie/i,
      /<\?php/i,
      /<\?=/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          pattern: pattern.toString(),
          reason: 'XSS attempt detected'
        };
      }
    }

    return {
      detected: false,
      reason: null
    };
  }

  /**
     * Check if input contains command injection patterns
     * @param {string} input - User input to check
     * @returns {Object} - Result with sanitized flag and reason
     */
  static detectCommandInjection(input) {
    const patterns = [
      /;\s*(ls|cat|rm|mv|cp|chmod|chown)/i,
      /\|\s*(ls|cat|rm|mv|cp|chmod|chown)/i,
      /&\s*(ls|cat|rm|mv|cp|chmod|chown)/i,
      /\$\([^)]*\)/,
      /`[^`]*`/,
      /\$\(.*\)/,
      /&&\s*(rm|del)/i,
      /\|\|\s*(rm|del)/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return {
          detected: true,
          pattern: pattern.toString(),
          reason: 'Command injection attempt detected'
        };
      }
    }

    return {
      detected: false,
      reason: null
    };
  }

  /**
     * Sanitize input by removing dangerous patterns
     * @param {string} input - User input to sanitize
     * @returns {Object} - Result with sanitized text and warnings
     */
  static sanitize(input) {
    const warnings = [];

    // Check for SQL injection
    const sqlCheck = this.detectSQLInjection(input);
    if (sqlCheck.detected) {
      warnings.push({
        type: 'SQL_INJECTION',
        pattern: sqlCheck.pattern,
        reason: sqlCheck.reason
      });
    }

    // Check for XSS
    const xssCheck = this.detectXSS(input);
    if (xssCheck.detected) {
      warnings.push({
        type: 'XSS',
        pattern: xssCheck.pattern,
        reason: xssCheck.reason
      });
    }

    // Check for command injection
    const cmdCheck = this.detectCommandInjection(input);
    if (cmdCheck.detected) {
      warnings.push({
        type: 'COMMAND_INJECTION',
        pattern: cmdCheck.pattern,
        reason: cmdCheck.reason
      });
    }

    // If any threats detected, reject the input
    if (warnings.length > 0) {
      return {
        safe: false,
        warnings,
        message: 'Input contains potentially malicious content'
      };
    }

    // Additional sanitization: escape HTML special characters
    let sanitized = input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    return {
      safe: true,
      sanitized,
      warnings: []
    };
  }

  /**
     * Quick validation for API endpoints
     * @param {string} input - User input to validate
     * @returns {Object} - Validation result
     */
  static validate(input) {
    if (!input || typeof input !== 'string') {
      return {
        valid: false,
        error: 'Invalid input type'
      };
    }

    if (input.length > 10000) {
      return {
        valid: false,
        error: 'Input too long (max 10000 characters)'
      };
    }

    // Check for security threats
    const result = this.sanitize(input);
    if (!result.safe) {
      return {
        valid: false,
        error: result.message,
        warnings: result.warnings
      };
    }

    return {
      valid: true,
      sanitized: result.sanitized,
      warnings: []
    };
  }
}

module.exports = InputSanitizer;
