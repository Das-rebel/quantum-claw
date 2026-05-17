/**
 * Response Validator
 * Provides validation for API responses
 */
class ResponseValidator {
  constructor(options = {}) {
    this.type = options.type || 'generic';
    this.stats = { validated: 0, failed: 0 };
  }

  validate(response) {
    this.stats.validated++;
    return { valid: true, response };
  }

  // Reddit validation
  validateRedditResponse(response) {
    this.stats.validated++;
    if (!response || !response.data) {
      this.stats.failed++;
      return { valid: false, error: 'Invalid Reddit response' };
    }
    return { valid: true, response };
  }

  // Twitter validation  
  validateTwitterResponse(response) {
    this.stats.validated++;
    if (!response || !response.data) {
      this.stats.failed++;
      return { valid: false, error: 'Invalid Twitter response' };
    }
    return { valid: true, response };
  }

  // News validation
  validateNewsResponse(response) {
    this.stats.validated++;
    if (!response) {
      this.stats.failed++;
      return { valid: false, error: 'Invalid News response' };
    }
    return { valid: true, response };
  }

  getStats() {
    return this.stats;
  }

  resetStats() {
    this.stats = { validated: 0, failed: 0 };
  }
}

/**
 * Create a validator instance
 */
function createValidator(type, options = {}) {
  return new ResponseValidator({ ...options, type });
}

module.exports = { ResponseValidator, createValidator };
