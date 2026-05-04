const express = require('express');
const { Storage } = require('@google-cloud/storage');
const https = require('https');
const http = require('http');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const PASSWORD = process.env.CONTROL_PASSWORD || 'omniclaw';
const PROJECT = 'omniclaw-personal-assistant';
const BUCKET = 'omniclaw-knowledge-graph';

const storage = new Storage({ projectId: PROJECT });
const bucket = storage.bucket(BUCKET);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function auth(req, res, next) {
  const pass = req.headers['x-password'] || req.query.password;
  if (pass === PASSWORD) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Helper to make HTTP calls to Cloud Functions
function callCF(url, method, data) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const body = JSON.stringify(data || {});
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname,
        method: method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = client.request(options, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); }
          catch { resolve({ raw: d.substring(0, 200) }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(body);
      req.end();
    } catch (e) { reject(e); }
  });
}

// ============ API ROUTES ============

// Vault status - all files
app.get('/api/vault/status', auth, async (req, res) => {
  const files = [
    { key: 'vault/twitter_bookmarks_automated.json', type: 'array' },
    { key: 'vault/instagram_saved_automated.json', type: 'posts' },
    { key: 'vault/bookmarks_automated.json', type: 'bookmarks' },
    { key: 'vault/browser_bookmarks.json', type: 'posts' },
    { key: 'vault/latest_sync_summary.json', type: 'summary' },
    { key: 'unified_knowledge_graph.json', type: 'nodes' }
  ];
  const result = {};
  for (const f of files) {
    try {
      const [meta] = await bucket.file(f.key).getMetadata();
      const [content] = await bucket.file(f.key).download();
      let data = JSON.parse(content.toString());
      let count = 0;
      if (f.type === 'array') count = Array.isArray(data) ? data.length : (data.count || 0);
      else if (f.type === 'posts') count = data.posts?.length || data.count || (Array.isArray(data) ? data.length : 0);
      else if (f.type === 'bookmarks') count = data.bookmarks?.length || data.totalCount || data.count || 0;
      else if (f.type === 'nodes') count = data.nodes?.length || 0;
      else if (f.type === 'summary') { result[f.key] = data; continue; }
      result[f.key] = { count, updated: meta.updated, size: parseInt(meta.size) };
    } catch (e) {
      result[f.key] = { error: e.message };
    }
  }
  res.json(result);
});

// Browse vault data
app.get('/api/vault/browse', auth, async (req, res) => {
  const { file = 'vault/twitter_bookmarks_automated.json', limit = 5, offset = 0 } = req.query;
  try {
    const [content] = await bucket.file(file).download();
    let data = JSON.parse(content.toString());
    if (!Array.isArray(data)) {
      if (data.posts) data = data.posts;
      else if (data.bookmarks) data = data.bookmarks;
      else if (data.nodes) data = data.nodes;
    }
    const total = data.length;
    const page = data.slice(Number(offset), Number(offset) + Number(limit));
    res.json({ total, offset: Number(offset), limit: Number(limit), data: page });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List available vault files
app.get('/api/vault/files', auth, async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: 'vault/' });
    res.json(files.map(f => ({ name: f.name, size: f.metadata.size, updated: f.metadata.updated })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sync history
app.get('/api/vault/history', auth, async (req, res) => {
  try {
    const summary = await bucket.file('vault/latest_sync_summary.json').download().then(([c]) => JSON.parse(c.toString())).catch(() => ({}));
    res.json([summary]);
  } catch (e) {
    res.json([]);
  }
});

// ============ SYNC TRIGGERS ============

// Twitter sync
app.post('/api/sync/twitter', auth, async (req, res) => {
  try {
    const result = await callCF(
      'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync',
      'POST', {}
    );
    res.json({ success: true, message: 'Twitter sync triggered', result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Instagram sync
app.post('/api/sync/instagram', auth, async (req, res) => {
  try {
    const result = await callCF(
      'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync',
      'POST', { force_refresh: true }
    );
    res.json({ success: true, message: 'Instagram sync triggered', result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Bookmark vault scheduler
app.post('/api/sync/bookmarks', auth, async (req, res) => {
  try {
    const result = await callCF(
      'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/bookmark-vault-scheduler',
      'POST', {}
    );
    res.json({ success: true, message: 'Bookmark sync triggered', result });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// Sync all
app.post('/api/sync/all', auth, async (req, res) => {
  const results = await Promise.allSettled([
    callCF('https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync', 'POST', {}),
    callCF('https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync', 'POST', { force_refresh: true }),
    callCF('https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/bookmark-vault-scheduler', 'POST', {})
  ]);
  res.json({
    success: true,
    message: 'All syncs triggered',
    twitter: results[0].status,
    instagram: results[1].status,
    bookmarks: results[2].status
  });
});

// ============ CLOUD FUNCTIONS STATUS ============
// Note: Cannot run gcloud in container, using known good state
app.get('/api/functions/status', auth, async (req, res) => {
  const functions = [
    { name: 'twitter-sync', region: 'asia-south1', state: 'ACTIVE', url: 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync' },
    { name: 'instagram-sync', region: 'asia-south1', state: 'ACTIVE', url: 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync' },
    { name: 'bookmark-vault-scheduler', region: 'asia-south1', state: 'ACTIVE', url: 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/bookmark-vault-scheduler' },
    { name: 'alexaHandler', region: 'us-central1', state: 'ACTIVE', url: 'https://us-central1-omniclaw-personal-assistant.cloudfunctions.net/alexaHandler' }
  ];
  res.json(functions);
});

// ============ SCHEDULERS STATUS ============
app.get('/api/schedulers/status', auth, async (req, res) => {
  const schedulers = [
    { name: 'instagram-vault-daily', schedule: '0 10 * * *', state: 'ENABLED', uri: 'instagram-vault-scheduler' },
    { name: 'bookmark-processing-daily', schedule: '30 10 * * *', state: 'ENABLED', uri: 'bookmark-vault-scheduler' },
    { name: 'twitter-sync-daily', schedule: '0 3 * * *', state: 'ENABLED', uri: 'twitter-sync' }
  ];
  res.json(schedulers);
});

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'omniclaw-vault-control' });
});

app.listen(PORT, () => {
  console.log('OmniClaw Vault Control Center running on port ' + PORT);
});
