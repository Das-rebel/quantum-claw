/**
 * API Response Validator
 *
 * Provides comprehensive validation for external API responses
 * Ensures response structure integrity and data quality
 * Logs validation failures for debugging
 */

class ApiResponseValidator {
  constructor(apiName) {
    this.apiName = apiName;
    this.validationStats = {
      total: 0,
      valid: 0,
      invalid: 0,
      failures: []
    };
  }

  /**
     * Validate API response structure
     * @param {*} response - Response from external API
     * @param {Object} schema - Expected schema definition
     * @returns {Object} Validation result with success flag and error details
     */
  validate(response, schema = {}) {
    this.validationStats.total++;

    try {
      // Check if response exists
      if (response === null || response === undefined) {
        const error = 'Response is null or undefined';
        this.logValidationError(error, response);
        return { valid: false, error, response };
      }

      // Check if response is an object (for JSON APIs)
      // Note: Arrays are also 'object' type in JavaScript
      if (typeof response !== 'object' || Array.isArray(response)) {
        const error = `Response is not an object (type: ${typeof response})`;
        this.logValidationError(error, response);
        return { valid: false, error, response };
      }

      // Validate against schema if provided
      if (Object.keys(schema).length > 0) {
        const schemaResult = this.validateAgainstSchema(response, schema);
        if (!schemaResult.valid) {
          this.logValidationError(schemaResult.error, response);
          return schemaResult;
        }
      }

      // All validations passed
      this.validationStats.valid++;
      return { valid: true, response };
    } catch (error) {
      const errorDetails = `Validation error: ${error.message}`;
      this.logValidationError(errorDetails, response);
      this.validationStats.invalid++;
      return { valid: false, error: errorDetails, response };
    }
  }

  /**
     * Validate response against expected schema
     * @param {Object} response - API response
     * @param {Object} schema - Expected schema
     * @returns {Object} Validation result
     */
  validateAgainstSchema(response, schema) {
    for (const [field, fieldType] of Object.entries(schema)) {
      if (!(field in response)) {
        return {
          valid: false,
          error: `Missing required field: "${field}"`
        };
      }

      const actualType = Array.isArray(response[field]) ? 'array' : typeof response[field];

      if (fieldType === 'array' && !Array.isArray(response[field])) {
        return {
          valid: false,
          error: `Field "${field}" expected to be array, got ${actualType}`
        };
      }

      if (fieldType !== 'array' && actualType !== fieldType) {
        return {
          valid: false,
          error: `Field "${field}" expected ${fieldType}, got ${actualType}`
        };
      }
    }

    return { valid: true };
  }

  /**
     * Validate specific API response types
     */

  /**
     * Validate Tavily search response
     */
  validateTavilyResponse(response) {
    const schema = {
      answer: 'string',
      results: 'array'
    };

    const result = this.validate(response, schema);
    if (!result.valid) return result;

    // Additional Tavily-specific validation
    if (!response.results || response.results.length === 0) {
      return { valid: true, response }; // Allow empty results but log warning
    }

    return { valid: true, response };
  }

  /**
     * Validate Sarvam translation response
     */
  validateSarvamResponse(response) {
    // Sarvam can have translated_text or error field
    const result = this.validate(response);
    if (!result.valid) return result;

    if (!('translated_text' in response) && !('error' in response)) {
      const error = 'Sarvam response missing required fields (translated_text or error)';
      this.logValidationError(error, response);
      return { valid: false, error };
    }

    return { valid: true, response };
  }

  /**
     * Validate Reddit response
     */
  validateRedditResponse(response) {
    // Basic validation
    const baseResult = this.validate(response);
    if (!baseResult.valid) return baseResult;

    // Check for simulated responses (posts as string)
    if (response.simulated && typeof response.posts === 'string') {
      return { valid: true, response };
    }

    // Check for required fields for non-simulated responses
    const schema = {
      success: 'boolean',
      posts: 'array'
    };

    const schemaResult = this.validate(response, schema);
    if (!schemaResult.valid) return schemaResult;

    // Additional Reddit-specific validation
    if (response.posts && response.posts.length > 0) {
      const firstPost = response.posts[0];
      if (!firstPost.title && !firstPost.posts) {
        return {
          valid: true, response, // Allow for simulated responses
          warning: 'Reddit post missing title field'
        };
      }
    }

    return { valid: true, response };
  }

  /**
     * Validate Twitter response
     */
  validateTwitterResponse(response) {
    // Twitter can return array of tweets or simulated object
    // Handle arrays specially before base validation
    if (Array.isArray(response)) {
      // Validate array of tweets
      for (const tweet of response) {
        if (typeof tweet !== 'object') {
          return {
            valid: false,
            error: 'Twitter response contains non-object tweet'
          };
        }
      }
      return { valid: true, response };
    }

    // For non-array responses, use base validation
    const result = this.validate(response);
    if (!result.valid) return result;

    if (response.simulated) {
      // Simulated response
      const schema = {
        tweets: 'string'
      };
      const schemaResult = this.validateAgainstSchema(response, schema);
      if (!schemaResult.valid) return schemaResult;
    }

    return { valid: true, response };
  }

  /**
     * Validate YouTube response
     */
  validateYouTubeResponse(response) {
    const schema = {
      success: 'boolean',
      videos: 'array'
    };

    const result = this.validate(response, schema);
    if (!result.valid) return result;

    // Additional YouTube-specific validation
    if (response.videos && response.videos.length > 0) {
      const firstVideo = response.videos[0];
      if (!firstVideo.title) {
        return {
          valid: false,
          error: 'YouTube video missing title field'
        };
      }
    }

    return { valid: true, response };
  }

  /**
     * Validate Arxiv response
     */
  validateArxivResponse(response) {
    const schema = {
      success: 'boolean',
      papers: 'array'
    };

    const result = this.validate(response, schema);
    if (!result.valid) return result;

    // Additional Arxiv-specific validation
    if (response.papers && response.papers.length > 0) {
      const firstPaper = response.papers[0];
      if (!firstPaper.title) {
        return {
          valid: false,
          error: 'Arxiv paper missing title field'
        };
      }
    }

    return { valid: true, response };
  }

  /**
     * Validate News response
     */
  validateNewsResponse(response) {
    const schema = {
      success: 'boolean'
    };

    const result = this.validate(response, schema);
    if (!result.valid) return result;

    // Check for required fields based on operation type
    if (response.news && typeof response.news !== 'string') {
      return {
        valid: false,
        error: 'News response news field must be string'
      };
    }

    if (response.headlines && typeof response.headlines !== 'string') {
      return {
        valid: false,
        error: 'News response headlines field must be string'
      };
    }

    return { valid: true, response };
  }

  /**
     * Validate Wikipedia response
     */
  validateWikipediaResponse(response) {
    const result = this.validate(response);
    if (!result.valid) return result;

    // Wikipedia can have articles or summary
    if (response.articles) {
      if (!Array.isArray(response.articles)) {
        return {
          valid: false,
          error: 'Wikipedia articles field must be array'
        };
      }
    }

    if (response.summary && typeof response.summary !== 'string') {
      return {
        valid: false,
        error: 'Wikipedia summary field must be string'
      };
    }

    return { valid: true, response };
  }

  /**
     * Validate Google Translate response
     */
  validateGoogleTranslateResponse(response) {
    const result = this.validate(response);
    if (!result.valid) return result;

    // Check for required language field
    if (!response.language || typeof response.language !== 'string') {
      return {
        valid: false,
        error: 'Google Translate response missing language field'
      };
    }

    // Check confidence is present (optional but should be number if present)
    if (response.confidence && typeof response.confidence !== 'number') {
      return {
        valid: false,
        error: 'Google Translate confidence must be number'
      };
    }

    return { valid: true, response };
  }

  /**
     * Log validation failure
     * @param {string} error - Error message
     * @param {*} response - Response that failed validation
     */
  logValidationError(error, response) {
    this.validationStats.invalid++;
    this.validationStats.failures.push({
      error,
      timestamp: new Date().toISOString(),
      responseSnippet: this.getResponseSnippet(response)
    });

    console.error(`[${this.apiName}] Validation failed: ${error}`);
    console.error(`[${this.apiName}] Response snippet:`, this.getResponseSnippet(response));
  }

  /**
     * Get safe snippet of response for logging
     * @param {*} response - Response object
     * @returns {string} Safe string representation
     */
  getResponseSnippet(response) {
    try {
      if (typeof response === 'string') {
        return response.substring(0, 200);
      }
      if (typeof response === 'object' && response !== null) {
        const json = JSON.stringify(response);
        return json.substring(0, 200);
      }
      return String(response).substring(0, 200);
    } catch (error) {
      return '[Unable to serialize response]';
    }
  }

  /**
     * Get validation statistics
     * @returns {Object} Validation stats
     */
  getStats() {
    return {
      apiName: this.apiName,
      total: this.validationStats.total,
      valid: this.validationStats.valid,
      invalid: this.validationStats.invalid,
      successRate: this.validationStats.total > 0
        ? ((this.validationStats.valid / this.validationStats.total) * 100).toFixed(2) + '%'
        : '0%',
      recentFailures: this.validationStats.failures.slice(-5)
    };
  }

  /**
     * Reset validation statistics
     */
  resetStats() {
    this.validationStats = {
      total: 0,
      valid: 0,
      invalid: 0,
      failures: []
    };
    console.log(`[${this.apiName}] Validation stats reset`);
  }
}

/**
 * Factory function to create validators for specific APIs
 */
function createValidator(apiName) {
  return new ApiResponseValidator(apiName);
}

module.exports = {
  ApiResponseValidator,
  createValidator
};
