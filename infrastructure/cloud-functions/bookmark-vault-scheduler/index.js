/**
 * Bookmark Vault Scheduler
 *
 * GCP Cloud Function that handles:
 * - Twitter bookmark scraping
 * - Instagram bookmark scraping (via Scrapling)
 * - Triggers VL agents for AI processing
 *
 * Cloud Scheduler triggers this daily
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  // Twitter
  TWITTER_USERNAME: process.env.TWITTER_USERNAME || 'sdas22',
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  TWITTER_COOKIES: process.env.TWITTER_COOKIES,
  BROWSERLESS_TOKEN: process.env.BROWSERLESS_TOKEN,

  // Instagram
  INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME,
  INSTAGRAM_PASSWORD: process.env.INSTAGRAM_PASSWORD,
  INSTAGRAM_COOKIES: process.env.INSTAGRAM_COOKIES,

  // AI Processing
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER || 'cerebras',

  // Vault
  VAULT_DIR: process.env.VAULT_DIR || path.join(__dirname, '..', 'data'),
  TWITTER_FILE: 'twitter_bookmarks_automated.json',
  INSTAGRAM_FILE: 'instagram_scrape.json',
  VAULT_FILE: 'bookmarks_vault.json'
};

const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`)
};

/**
 * Twitter Bookmark Scraper via Python/Scrapling
 */
async function scrapeTwitter() {
  LOG.info('Starting Twitter scrape via Scrapling...');

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'twitter_scraper.py');

    // Check if scraper exists
    fs.access(scriptPath)
      .then(() => {
        const env = {
          ...process.env,
          TWITTER_COOKIES: CONFIG.TWITTER_COOKIES || '',
          TWITTER_USERNAME: CONFIG.TWITTER_USERNAME || ''
        };

        const proc = spawn('python3', [scriptPath], { env });
        let output = '';

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
          LOG.info(`Twitter scraper output: ${output}`);
          resolve(output.includes('Added') ? true : false);
        });
      })
      .catch(() => {
        LOG.warn('Twitter scraper not found, skipping');
        resolve(false);
      });
  });
}

/**
 * Instagram scraper via Python/Scrapling
 */
async function scrapeInstagram() {
  LOG.info('Starting Instagram scrape via Scrapling...');

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'instagram_scraper.py');

    // Check if scraper exists
    fs.access(scriptPath)
      .then(() => {
        const env = {
          ...process.env,
          INSTAGRAM_COOKIES: CONFIG.INSTAGRAM_COOKIES || '',
          INSTAGRAM_USERNAME: CONFIG.INSTAGRAM_USERNAME || '',
          INSTAGRAM_PASSWORD: CONFIG.INSTAGRAM_PASSWORD || '',
          VAULT_DIR: CONFIG.VAULT_DIR
        };

        const proc = spawn('python3', [scriptPath], { env });
        let output = '';

        proc.stdout.on('data', (data) => { output += data.toString(); });
        proc.stderr.on('data', (data) => { output += data.toString(); });

        proc.on('close', (code) => {
          LOG.info(`Instagram scraper output: ${output}`);
          resolve(output.includes('Added') ? true : false);
        });
      })
      .catch(() => {
        LOG.warn('Instagram scraper not found, skipping');
        resolve(false);
      });
  });
}

/**
 * Trigger VL agents
 */
async function triggerVLAgents() {
  LOG.info('VL agents should be triggered via Cloud Run or separate scheduler');
  // VL agents are triggered separately via Cloud Run or the instagram_scraper.py
  // which calls vl_agents.js after scraping
}

/**
 * Save bookmarks to vault
 */
async function saveBookmarks(filename, data) {
  await fs.mkdir(CONFIG.VAULT_DIR, { recursive: true });
  const filepath = path.join(CONFIG.VAULT_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  LOG.info(`Saved ${data.length} items to ${filename}`);
}

/**
 * Merge new bookmarks (deduplicate by URL)
 */
function mergeBookmarks(existing, newItems) {
  const existingUrls = new Set(existing.map(item => item.url));
  return [...existing, ...newItems.filter(item => item.url && !existingUrls.has(item.url))];
}

/**
 * Main scheduler handler
 */
async function main(event = null, context = null) {
  LOG.info('=== Bookmark Vault Scheduler Started ===');
  const startTime = Date.now();

  await fs.mkdir(CONFIG.VAULT_DIR, { recursive: true });

  // Scrape Twitter
  const twitterScraped = await scrapeTwitter();

  // Scrape Instagram
  const instagramScraped = await scrapeInstagram();

  // Create combined vault
  const vault = {
    lastUpdated: new Date().toISOString(),
    twitterCount: twitterScraped ? 1 : 0,
    instagramCount: instagramScraped ? 1 : 0,
    source: 'bookmark-vault-scheduler'
  };
  await saveBookmarks(CONFIG.VAULT_FILE, vault);

  const duration = Date.now() - startTime;
  LOG.info(`=== Completed in ${duration}ms ===`);

  return {
    success: twitterScraped || instagramScraped,
    twitterScraped,
    instagramScraped,
    duration
  };
}

/**
 * Twitter scrape entry point (separate function)
 */
exports.twitter_scrape = async (event, context) => {
  LOG.info('=== Twitter Scraper Started ===');
  const startTime = Date.now();

  await fs.mkdir(CONFIG.VAULT_DIR, { recursive: true });

  // Run Twitter scraper
  const result = await scrapeTwitter();

  const duration = Date.now() - startTime;
  LOG.info(`=== Twitter scrape completed in ${duration}ms ===`);

  return {
    success: result,
    duration
  };
};

/**
 * Instagram scrape entry point (separate function)
 */
exports.instagram_scrape = async (event, context) => {
  LOG.info('=== Instagram Scraper Started ===');
  const startTime = Date.now();

  await fs.mkdir(CONFIG.VAULT_DIR, { recursive: true });

  // Run Instagram scraper
  const result = await scrapeInstagram();

  const duration = Date.now() - startTime;
  LOG.info(`=== Instagram scrape completed in ${duration}ms ===`);

  return {
    success: result,
    duration
  };
};

// Cloud Functions entry point
exports.scheduler = async (event, context) => {
  return main(event, context);
};

// Direct run
if (require.main === module) {
  main()
    .then(r => { console.log('Result:', r); process.exit(0); })
    .catch(e => { console.error('Error:', e); process.exit(1); });
}
