/**
 * Google Secret Manager Integration Utility
 * Provides secure access to API secrets for Cloud Functions
 */

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'omniclaw-personal-assistant';

// Initialize Secret Manager client
const client = new SecretManagerServiceClient();

/**
 * Get the latest version of a secret
 * @param {string} secretId - Secret ID (e.g., 'cerebras-api-key')
 * @returns {Promise<string>} - Secret value
 */
async function getSecret(secretId) {
  try {
    const secretName = `projects/${PROJECT_ID}/secrets/${secretId}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretName });
    const secretValue = version.payload.toString('utf8');

    console.log(`✅ Loaded secret: ${secretId}`);
    return secretValue;
  } catch (error) {
    console.error(`❌ Failed to load secret: ${secretId}`, error.message);
    throw new Error(`Secret ${secretId} not found or inaccessible`);
  }
}

/**
 * Get multiple secrets at once
 * @param {string[]} secretIds - Array of secret IDs
 * @returns {Promise<Object>} - Object with secret values
 */
async function getSecrets(secretIds) {
  const secrets = {};

  for (const secretId of secretIds) {
    try {
      secrets[secretId] = await getSecret(secretId);
    } catch (error) {
      console.warn(`⚠️  Could not load ${secretId}, using undefined`);
      secrets[secretId] = undefined;
    }
  }

  return secrets;
}

/**
 * Load all API keys needed for OmniClaw
 * @returns {Promise<Object>} - Object containing all API keys
 */
async function loadAllApiKeys() {
  console.log('🔑 Loading API keys from Secret Manager...');

  const requiredKeys = [
    'cerebras-api-key',
    'glm-api-key',
    'groq-api-key',
    'sarvam-api-key',
    'elevenlabs-api-key',
    'google-tts-api-key',
    'youtube-api-key'
  ];

  const optionalKeys = [
    'anthropic-api-key',
    'openai-api-key',
    'news-api-key',
    'tavily-api-key',
    'arxiv-api-key'
  ];

  const [requiredSecrets, optionalSecrets] = await Promise.all([
    getSecrets(requiredKeys),
    getSecrets(optionalKeys)
  ]);

  // Validate required secrets
  const missingRequired = requiredKeys.filter(key => !requiredSecrets[key]);
  if (missingRequired.length > 0) {
    throw new Error(`Missing required API keys: ${missingRequired.join(', ')}`);
  }

  console.log('✅ All required API keys loaded');
  console.log(`ℹ️  Optional keys loaded: ${Object.keys(optionalSecrets).filter(k => optionalSecrets[k]).length}/${optionalKeys.length}`);

  return {
    ...requiredSecrets,
    ...optionalSecrets
  };
}

/**
 * Environment variable helper
 * Maps secret IDs to environment variable names
 */
const SECRET_TO_ENV_MAP = {
  'anthropic-api-key': 'ANTHROPIC_API_KEY',
  'openai-api-key': 'OPENAI_API_KEY',
  'cerebras-api-key': 'CEREBRAS_API_KEY',
  'glm-api-key': 'GLM_API_KEY',
  'groq-api-key': 'GROQ_API_KEY',
  'sarvam-api-key': 'SARVAM_API_KEY',
  'elevenlabs-api-key': 'ELEVENLABS_API_KEY',
  'google-tts-api-key': 'GOOGLE_TTS_API_KEY',
  'youtube-api-key': 'YOUTUBE_API_KEY',
  'news-api-key': 'NEWS_API_KEY',
  'tavily-api-key': 'TAVILY_API_KEY',
  'arxiv-api-key': 'ARXIV_API_KEY',
  'twitter-api-key': 'TWITTER_API_KEY',
  'reddit-client-id': 'REDDIT_CLIENT_ID'
};

/**
 * Load secrets and set as environment variables
 * @param {string[]} secretIds - Array of secret IDs to load
 */
async function loadSecretsAsEnv(secretIds) {
  const secrets = await getSecrets(secretIds);

  for (const [secretId, value] of Object.entries(secrets)) {
    if (value && SECRET_TO_ENV_MAP[secretId]) {
      const envVar = SECRET_TO_ENV_MAP[secretId];
      process.env[envVar] = value;
      console.log(`✅ Set ${envVar} from secret ${secretId}`);
    }
  }
}

module.exports = {
  getSecret,
  getSecrets,
  loadAllApiKeys,
  loadSecretsAsEnv,
  SECRET_TO_ENV_MAP
};