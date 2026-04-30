const crypto = require('crypto');

const SENSITIVE_KEYS = new Set([
  'userId',
  'accessToken',
  'apiAccessToken',
  'authorization',
  'token',
  'deviceId',
  'personId',
  'sessionId',
  'apiKey'
]);

const MAX_STRING_LENGTH = 200;

function hashValue(value) {
  if (!value) {
    return null;
  }

  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function extractRequestSummary(req) {
  const request = req.body?.request || {};
  const session = req.body?.session || {};
  const context = req.body?.context || {};
  const system = context.System || {};

  const userId = session.user?.userId || system.user?.userId || null;
  const intentName = request.intent?.name || null;
  const requestId = request.requestId || null;

  return {
    requestType: request.type || 'unknown',
    requestId,
    intentName,
    userHash: hashValue(userId)
  };
}

function sanitizeValue(key, value) {
  if (SENSITIVE_KEYS.has(key)) {
    return value ? '[REDACTED]' : value;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return `${value.slice(0, MAX_STRING_LENGTH)}...`;
    }
    return value;
  }

  return value;
}

function sanitizePayload(payload) {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item));
  }

  if (typeof payload === 'object') {
    return Object.entries(payload).reduce((acc, [key, value]) => {
      const sanitized = sanitizeValue(key, value);
      acc[key] = sanitizePayload(sanitized);
      return acc;
    }, {});
  }

  return payload;
}

function createRequestLogger(options = {}) {
  const verbose = Boolean(options.verbose);

  return (req) => {
    const summary = extractRequestSummary(req);
    // console.log('🔔 Alexa request summary', JSON.stringify(summary));

    if (verbose) {
      const sanitized = sanitizePayload(req.body);
      // console.log('📦 Alexa request body', JSON.stringify(sanitized, null, 2));
    }
  };
}

module.exports = {
  createRequestLogger,
  extractRequestSummary,
  hashValue,
  sanitizePayload
};
