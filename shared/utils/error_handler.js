/**
 * Comprehensive Error Handler
 * Provides centralized error handling and logging
 */

class ErrorHandler {
  /**
     * Handle API errors with appropriate responses
     */
  static handleApiError(error, provider) {
    console.error(`API Error from ${provider}:`, error);

    // Log error details for monitoring
    this.logError({
      type: 'API_ERROR',
      provider,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // Determine appropriate response
    if (error.response) {
      return {
        success: false,
        error: 'API request failed',
        statusCode: error.response.status,
        provider
      };
    }

    if (error.request) {
      return {
        success: false,
        error: 'Network error - no response received',
        provider
      };
    }

    return {
      success: false,
      error: error.message || 'Unknown error occurred',
      provider
    };
  }

  /**
     * Handle validation errors
     */
  static handleValidationError(error) {
    console.error('Validation Error:', error);

    this.logError({
      type: 'VALIDATION_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: error.message || 'Validation failed',
      suggestion: 'Please check your input and try again'
    };
  }

  /**
     * Log errors for monitoring and debugging
     */
  static logError(errorDetails) {
    // In production, this would send to error tracking service
    console.error('Error logged:', JSON.stringify(errorDetails, null, 2));
  }

  /**
     * Create user-friendly error messages
     */
  static getUserFriendlyMessage(error) {
    const errorMessages = {
      'API_KEY_INVALID': 'Please check your API key configuration',
      'RATE_LIMIT_EXCEEDED': 'Too many requests. Please try again later',
      'NETWORK_ERROR': 'Network connection failed. Please check your internet connection',
      'TIMEOUT': 'Request timed out. Please try again',
      'INVALID_INPUT': 'Please check your input and try again'
    };

    return errorMessages[error.code] || 'An error occurred. Please try again.';
  }
}

module.exports = ErrorHandler;
