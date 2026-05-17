/**
 * Simple HTTP server wrapper for bookmark-vault-scheduler
 * Wraps the Python scheduler functions
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());

const LOG = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOformat()} ${msg}`)
};

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'bookmark-vault-scheduler' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Trigger both scrapers
app.post('/run', async (req, res) => {
  LOG.info('Manual trigger received');
  
  const results = { twitter: null, instagram: null };
  
  // Run Twitter scraper
  try {
    const twitterPromise = runPython('twitter_scraper_gcs.py');
    const instagramPromise = runPython('instagram_scraper_gcs.py');
    
    const [twitterResult, instagramResult] = await Promise.all([
      twitterPromise.catch(e => ({ success: false, error: e.message })),
      instagramPromise.catch(e => ({ success: false, error: e.message }))
    ]);
    
    results.twitter = twitterResult;
    results.instagram = instagramResult;
  } catch (e) {
    LOG.error('Scheduler error: ' + e.message);
  }
  
  res.json({ success: true, results });
});

function runPython(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const proc = spawn('python3', [scriptPath], {
      env: { ...process.env }
    });
    
    let output = '';
    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', (data) => output += data.toString());
    
    proc.on('close', (code) => {
      LOG.info(`${scriptName} output: ${output.slice(0, 200)}`);
      resolve({ output, code });
    });
    
    proc.on('error', reject);
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  LOG.info(`Bookmark Vault Scheduler listening on port ${PORT}`);
});
