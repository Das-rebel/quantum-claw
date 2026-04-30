const path = require('path');
const dotenv = require('dotenv');

let cachedConfig = null;

function loadEnv() {
  if (process.env.CONFIG_LOADED === 'true') {
    return;
  }

  dotenv.config({
    path: process.env.ENV_FILE || path.join(process.cwd(), '.env')
  });
  process.env.CONFIG_LOADED = 'true';
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseList(value, fallback = []) {
  if (!value) {
    return fallback;
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireEnv(keys, optional = false) {
  loadEnv();
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length && !optional) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    throw new Error(message);
  }
  if (missing.length && optional) {
    console.warn(`⚠️  Optional services not configured: ${missing.join(', ')}`);
    console.warn('   These services will be disabled.');
  }
  return missing.length === 0;
}

function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  loadEnv();

  cachedConfig = {
    bridgePort: parseNumber(process.env.BRIDGE_PORT, 3000),
    openclawBinaryPath: process.env.OPENCLAW_BINARY_PATH || process.env.OPENCLAW_BIN || 'openclaw',
    openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:18789',
    openclawAuthToken: process.env.OPENCLAW_AUTH_TOKEN,
    tmlpdHost: process.env.TMLPD_HOST || 'localhost',
    tmlpdPort: parseNumber(process.env.TMLPD_PORT, 18790),
    ngrokUrl: process.env.NGROK_URL || 'https://localhost:3000',
    sarvamApiKey: process.env.SARVAM_API_KEY,
    cerebrasApiKey: process.env.CEREBRAS_API_KEY,
    tavilyApiKey: process.env.TAVILY_API_KEY,
    googleTtsApiKey: process.env.GOOGLE_API_KEY,
    twitterBearerToken: process.env.TWITTER_BEARER_TOKEN,
    logVerbose: parseBoolean(process.env.LOG_VERBOSE, false),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    rateLimitEnabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
    rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, 60),
    alexaSkillId: process.env.ALEXA_SKILL_ID,
    alexaVerifySignature: parseBoolean(
      process.env.ALEXA_VERIFY_SIGNATURE,
      process.env.NODE_ENV === 'production'
    ),
    alexaTimestampToleranceMs: parseNumber(
      process.env.ALEXA_TIMESTAMP_TOLERANCE_MS,
      150000
    ),
    adminApiKey: process.env.ADMIN_API_KEY || process.env.BRIDGE_ADMIN_KEY,
    adminAuthHeader: process.env.ADMIN_AUTH_HEADER || 'x-admin-key',
    adminAllowLocal: parseBoolean(process.env.ADMIN_ALLOW_LOCAL, true),
    maxQueryLength: parseNumber(process.env.MAX_QUERY_LENGTH, 500),
    tmlpdParallelMode: parseBoolean(process.env.TMLPD_PARALLEL_MODE, false),
    tmlpdEnabled: parseBoolean(
      process.env.TMLPD_ENABLED,
      parseBoolean(process.env.TMLPD_PARALLEL_MODE, false)
    ),
    tmlpdModels: parseList(process.env.TMLPD_MCP_MODELS),
    tmlpdTimeoutMs: parseNumber(process.env.TMLPD_MCP_TIMEOUT_MS, 60000),
    modelRouterPrimary: process.env.MODEL_ROUTER_PRIMARY,
    modelRouterFallback: parseList(process.env.MODEL_ROUTER_FALLBACK),
    modelRouterResetMs: parseNumber(process.env.MODEL_ROUTER_RESET_MS, 60000)
  };

  return cachedConfig;
}

module.exports = {
  getConfig,
  requireEnv,
  parseBoolean,
  parseNumber,
  parseList
};
