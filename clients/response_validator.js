/**
 * Provider Response Validator
 *
 * Validates responses from various provider clients to ensure:
 * - Proper structure and data types
 * - Required fields are present
 * - No null/undefined critical values
 * - Graceful handling of invalid responses
 *
 * Validation failures are logged but don't crash the system
 */

class ResponseValidator {
  constructor(providerName) {
    this.providerName = providerName || 'UnknownProvider';
    this.validationErrors = [];
  }

  /**
     * Validate response structure and content
     * @param {*} response - The response to validate
     * @param {Object} schema - Schema definition for validation
     * @returns {Object} - Validated response or throws error
     */
  validate(response, schema = {}) {
    this.validationErrors = [];

    // Check if response exists
    if (!this._exists(response)) {
      this._logError('Response is null, undefined, or empty');
      throw new Error(`[${this.providerName}] Invalid response: response is null or undefined`);
    }

    // Validate based on schema if provided
    if (schema.type) {
      this._validateType(response, schema.type);
    }

    if (schema.requiredFields) {
      this._validateRequiredFields(response, schema.requiredFields);
    }

    if (schema.allowedFields) {
      this._validateAllowedFields(response, schema.allowedFields);
    }

    // If there are validation errors, throw
    if (this.validationErrors.length > 0) {
      const errorMessages = this.validationErrors.join('; ');
      this._logError(errorMessages);
      throw new Error(`[${this.providerName}] Validation failed: ${errorMessages}`);
    }

    return response;
  }

  /**
     * Validate LLM-style chat completion response
     */
  validateLLMResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['choices']
    });
  }

  /**
     * Validate translation response
     */
  validateTranslationResponse(response) {
    return this.validate(response, {
      type: 'string'
    });
  }

  /**
     * Validate search results response
     */
  validateSearchResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['results']
    });
  }

  /**
     * Validate news response
     */
  validateNewsResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['news', 'success']
    });
  }

  /**
     * Validate Reddit response
     */
  validateRedditResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['posts']
    });
  }

  /**
     * Validate Arxiv response
     */
  validateArxivResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['papers']
    });
  }

  /**
     * Validate YouTube response
     */
  validateYouTubeResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['videos']
    });
  }

  /**
     * Validate Tavily response
     */
  validateTavilyResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['answer']
    });
  }

  /**
     * Validate health check response
     */
  validateHealthCheckResponse(response) {
    return this.validate(response, {
      type: 'object',
      requiredFields: ['status', 'provider']
    });
  }

  /**
     * Check if value exists (not null/undefined/empty string)
     * @private
     */
  _exists(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return false;
    }
    return true;
  }

  /**
     * Validate type of response
     * @private
     */
  _validateType(response, expectedType) {
    const actualType = Array.isArray(response) ? 'array' : typeof response;

    if (actualType !== expectedType) {
      this.validationErrors.push(
        `Expected type '${expectedType}' but got '${actualType}'`
      );
    }
  }

  /**
     * Validate required fields exist in object
     * @private
     */
  _validateRequiredFields(response, requiredFields) {
    if (typeof response !== 'object' || response === null) {
      this.validationErrors.push('Cannot validate fields on non-object response');
      return;
    }

    for (const field of requiredFields) {
      if (!this._exists(response[field])) {
        this.validationErrors.push(`Required field '${field}' is missing or empty`);
      }
    }
  }

  /**
     * Validate only allowed fields are present (optional strict mode)
     * @private
     */
  _validateAllowedFields(response, allowedFields) {
    if (typeof response !== 'object' || response === null) {
      return;
    }

    const actualFields = Object.keys(response);
    const unexpectedFields = actualFields.filter(
      field => !allowedFields.includes(field)
    );

    if (unexpectedFields.length > 0) {
      // Log as warning, not error
      console.warn(
        `[${this.providerName}] Unexpected fields in response:`,
        unexpectedFields
      );
    }
  }

  /**
     * Log validation error
     * @private
     */
  _logError(message) {
    console.error(`[${this.providerName}] Validation Error: ${message}`);
  }

  /**
     * Get all validation errors
     */
  getValidationErrors() {
    return [...this.validationErrors];
  }

  /**
     * Check if validation passed
     */
  isValid() {
    return this.validationErrors.length === 0;
  }
}

/**
 * Create a validator instance for a provider
 */
function createValidator(providerName) {
  return new ResponseValidator(providerName);
}

/**
 * Safely validate a response with fallback
 * Returns validated response or fallback value if validation fails
 */
function safeValidate(response, validatorFn, fallback = null) {
  try {
    return validatorFn(response);
  } catch (error) {
    console.warn(`Validation failed, using fallback: ${error.message}`);
    return fallback;
  }
}

module.exports = {
  ResponseValidator,
  createValidator,
  safeValidate
};
