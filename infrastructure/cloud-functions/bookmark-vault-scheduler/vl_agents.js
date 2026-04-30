/**
 * VL Agents - Simple Processing Agent for Scraped Data
 * Processes Twitter bookmarks and Instagram posts with AI tagging
 */

const fs = require('fs');
const https = require('https');

// Configuration
const CONFIG = {
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY || '',
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  AI_PROVIDER: process.env.AI_PROVIDER || 'cerebras',
  VAULT_PATH: process.env.VAULT_PATH || '/workspace/data/twitter_bookmarks_automated.json',
  AGENT_ID: process.env.AGENT_ID || '1',
  START_INDEX: parseInt(process.env.START_INDEX || '0'),
  END_INDEX: parseInt(process.env.END_INDEX || '500')
};

/**
 * Fetch data from GCS or local file
 */
async function fetchData() {
  try {
    // Try local file first (for Cloud Functions)
    if (fs.existsSync(CONFIG.VAULT_PATH)) {
      const data = fs.readFileSync(CONFIG.VAULT_PATH, 'utf8');
      return JSON.parse(data);
    }

    // Try GCS URL
    if (CONFIG.VAULT_PATH.startsWith('http')) {
      return new Promise((resolve, reject) => {
        https.get(CONFIG.VAULT_PATH, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
    }

    return [];
  } catch (error) {
    console.error(`[AGENT-${CONFIG.AGENT_ID}] Error fetching data:`, error.message);
    return [];
  }
}

/**
 * Process items with AI tagging
 */
async function processItems(items) {
  const agentItems = items.slice(CONFIG.START_INDEX, CONFIG.END_INDEX);
  console.log(`[AGENT-${CONFIG.AGENT_ID}] Processing ${agentItems.length} items (${CONFIG.START_INDEX}-${CONFIG.END_INDEX})`);

  const processed = [];

  for (const item of agentItems) {
    try {
      // Add basic AI tags (simplified version)
      const processedItem = {
        ...item,
        vlTags: extractTags(item.text || item.caption || ''),
        vlSubject: extractSubject(item.text || item.caption || ''),
        vlStyle: extractStyle(item.text || item.caption || ''),
        vlMood: extractMood(item.text || item.caption || ''),
        processedBy: `agent-${CONFIG.AGENT_ID}`,
        processedAt: new Date().toISOString()
      };

      processed.push(processedItem);
      console.log(`[AGENT-${CONFIG.AGENT_ID}] Processed item ${processed.length}/${agentItems.length}`);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`[AGENT-${CONFIG.AGENT_ID}] Error processing item:`, error.message);
    }
  }

  return processed;
}

/**
 * Extract basic tags from text
 */
function extractTags(text) {
  if (!text) return [];

  const tags = [];
  const lowerText = text.toLowerCase();

  // Tech keywords
  const techKeywords = ['ai', 'ml', 'code', 'programming', 'javascript', 'python', 'data', 'api', 'cloud'];
  techKeywords.forEach(keyword => {
    if (lowerText.includes(keyword)) tags.push(keyword.toUpperCase());
  });

  // Add generic tag if no specific tags found
  if (tags.length === 0) tags.push('GENERAL');

  return tags.slice(0, 5);
}

/**
 * Extract subject from text
 */
function extractSubject(text) {
  if (!text) return 'General';

  const subjects = {
    'technology': ['tech', 'code', 'programming', 'software', 'app'],
    'AI': ['ai', 'machine learning', 'ml', 'neural', 'model'],
    'tutorial': ['how to', 'guide', 'tutorial', 'learn', 'step'],
    'news': ['breaking', 'news', 'update', 'announcement']
  };

  const lowerText = text.toLowerCase();

  for (const [subject, keywords] of Object.entries(subjects)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return subject;
    }
  }

  return 'General';
}

/**
 * Extract style from text
 */
function extractStyle(text) {
  if (!text) return 'neutral';

  if (text.includes('?')) return 'question';
  if (text.includes('!')) return 'excited';
  if (text.includes('http') || text.includes('://')) return 'informative';
  if (text.length > 200) return 'detailed';

  return 'concise';
}

/**
 * Extract mood from text
 */
function extractMood(text) {
  if (!text) return 'neutral';

  const lowerText = text.toLowerCase();

  if (lowerText.includes('great') || lowerText.includes('awesome') || lowerText.includes('love')) {
    return 'positive';
  }
  if (lowerText.includes('problem') || lowerText.includes('issue') || lowerText.includes('error')) {
    return 'problem-solving';
  }
  if (lowerText.includes('new') || lowerText.includes('launch') || lowerText.includes('release')) {
    return 'announcement';
  }

  return 'informative';
}

/**
 * Save processed data
 */
async function saveProcessedData(processedItems) {
  try {
    const outputPath = `/tmp/processed_agent_${CONFIG.AGENT_ID}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(processedItems, null, 2));

    // Try to upload to GCS if gsutil is available
    const { spawn } = require('child_process');
    const bucketPath = `gs://omniclaw-knowledge-graph/vault/processed_agent_${CONFIG.AGENT_ID}.json`;

    spawn('gsutil', ['cp', outputPath, bucketPath], {
      stdio: 'inherit',
      env: process.env
    });

    console.log(`[AGENT-${CONFIG.AGENT_ID}] Saved ${processedItems.length} processed items`);

    return {
      success: true,
      agentId: CONFIG.AGENT_ID,
      processedCount: processedItems.length,
      outputPath
    };

  } catch (error) {
    console.error(`[AGENT-${CONFIG.AGENT_ID}] Error saving data:`, error.message);
    return {
      success: false,
      agentId: CONFIG.AGENT_ID,
      error: error.message
    };
  }
}

/**
 * Main handler
 */
async function main() {
  console.log(`[AGENT-${CONFIG.AGENT_ID}] Starting VL Agent ${CONFIG.AGENT_ID}`);
  console.log(`[AGENT-${CONFIG.AGENT_ID}] Config:`, {
    START_INDEX: CONFIG.START_INDEX,
    END_INDEX: CONFIG.END_INDEX,
    VAULT_PATH: CONFIG.VAULT_PATH
  });

  try {
    // Fetch data
    const data = await fetchData();
    console.log(`[AGENT-${CONFIG.AGENT_ID}] Loaded ${data.length} total items`);

    if (data.length === 0) {
      return {
        success: true,
        agentId: CONFIG.AGENT_ID,
        message: 'No data to process'
      };
    }

    // Process items
    const processedItems = await processItems(data);

    // Save results
    const result = await saveProcessedData(processedItems);

    console.log(`[AGENT-${CONFIG.AGENT_ID}] Completed:`, result);
    return result;

  } catch (error) {
    console.error(`[AGENT-${CONFIG.AGENT_ID}] Fatal error:`, error);
    return {
      success: false,
      agentId: CONFIG.AGENT_ID,
      error: error.message
    };
  }
}

// Export for Cloud Function
exports.handler = async (req, res) => {
  const result = await main();
  res.status(200).json(result);
};

// Run directly if called as script
if (require.main === module) {
  main()
    .then(result => {
      console.log('[AGENT] Result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('[AGENT] Error:', error);
      process.exit(1);
    });
}

module.exports = { main };