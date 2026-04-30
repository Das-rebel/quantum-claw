/**
 * Request Validation Middleware
 * Validates all incoming requests
 */

const Joi = require('joi');

/**
 * Alexa request validator
 */
const alexaRequestSchema = Joi.object({
  version: Joi.string().valid('1.0').required(),
  request: Joi.object({
    type: Joi.string().required(),
    requestId: Joi.string(),
    timestamp: Joi.string(),
    locale: Joi.string(),
    intent: Joi.object({
      name: Joi.string(),
      slots: Joi.object()
    })
  }).required(),
  session: Joi.object({
    new: Joi.boolean(),
    sessionId: Joi.string(),
    application: Joi.object({
      applicationId: Joi.string()
    }),
    user: Joi.object({
      userId: Joi.string(),
      accessToken: Joi.string()
    })
  }).required()
});

/**
 * Validate Alexa request
 */
function validateAlexaRequest(req, res, next) {
  const { error, value } = alexaRequestSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: 'Invalid Alexa request format',
      details: error.details
    });
  }

  // Validate application ID if set
  const expectedApplicationId = process.env.ALEXA_APPLICATION_ID;
  if (expectedApplicationId && value.session.application.applicationId !== expectedApplicationId) {
    return res.status(403).json({
      error: 'Invalid application ID'
    });
  }

  req.validatedBody = value;
  next();
}

/**
 * Rate limiting configuration
 */
const rateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  keyGenerator: (req) => {
    // Use userId or IP as key
    return req.body.session?.user?.userId || req.ip;
  }
};

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

module.exports = {
  validateAlexaRequest,
  rateLimitConfig,
  securityHeaders
};
