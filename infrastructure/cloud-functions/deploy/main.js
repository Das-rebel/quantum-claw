/**
 * Cloud Functions Gen 2 Entry Point
 * main.js - Required by Cloud Build
 *
 * Cloud Functions Gen 2 runs as Cloud Run containers which require
 * the application to listen on PORT environment variable (default 8080).
 */

const express = require('express');
const { healthHandler, alexaHandler, syncHandler, omniclaw2Handler, omniclaw2GreetingHandler, omniclaw2DiscoveryHandler } = require('./index');

const app = express();

// Access Control headers for all responses
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  next();
});

app.use(express.json());

// Health check endpoints
app.get('/health', healthHandler);
app.get('/healthHandler', healthHandler);
// Root path handles both GET (health) and POST (Alexa requests)
app.all('/', (req, res) => {
  if (req.method === 'POST') {
    return alexaHandler(req, res);
  }
  return healthHandler(req, res);
});

// Alexa handler - accepts POST and GET
app.all('/alexaHandler', alexaHandler);
app.all('/alexa', alexaHandler);

// Bookmark sync endpoint (for Cloud Scheduler)
app.post('/sync/bookmarks', async (req, res) => {
  try {
    const { syncHandler } = require('./index');
    await syncHandler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Instagram sync endpoint
app.post('/api/sync/instagram', async (req, res) => {
  try {
    const { instagramSyncHandler } = require('./index');
    await instagramSyncHandler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Instagram bookmarks endpoint
app.get('/api/bookmarks/instagram', async (req, res) => {
  try {
    const { instagramBookmarksHandler } = require('./index');
    await instagramBookmarksHandler(req, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Instagram bookmarks endpoint - reads from vault (synced by Python cron)
app.post('/scrape/instagram', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const vaultPath = path.join(__dirname, 'learning_base/instagram_scrape.json');

    let savedContent = [];
    if (fs.existsSync(vaultPath)) {
      const data = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      savedContent = Array.isArray(data) ? data : data.posts || [];
    }

    console.log(`📸 Instagram scrape: ${savedContent.length} posts from vault`);
    res.json({
      success: true,
      savedContent: savedContent.slice(0, 50)
    });
  } catch (error) {
    console.error('Instagram vault read failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// OmniClaw 2.0 Simplified Interface Routes
// Jony Ive-inspired UI/UX with all 19 capabilities
// ============================================

// OmniClaw 2.0 main query endpoint
// POST /api/omniclaw2 - Natural language query processing
app.post('/api/omniclaw2', (req, res) => {
  omniclaw2Handler(req, res);
});

// OmniClaw 2.0 contextual greeting
// GET /api/omniclaw2/greeting?platform=alexa
app.get('/api/omniclaw2/greeting', (req, res) => {
  omniclaw2GreetingHandler(req, res);
});

// OmniClaw 2.0 capability discovery
// GET /api/omniclaw2/discovery?platform=alexa
app.get('/api/omniclaw2/discovery', (req, res) => {
  omniclaw2DiscoveryHandler(req, res);
});

// WhatsApp proxy routes — forward to standalone whatsapp-qr-cloud service
// The cloud function acts as an API gateway; Baileys socket runs as a long-running service
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:9377';

function proxyToWhatsApp(req, res, options = {}) {
  const { method = 'GET', path, body } = options;
  const targetPath = path || req.path.replace(/^\/whatsapp/, '/whatsapp');
  const url = `${WHATSAPP_SERVICE_URL}${targetPath}`;

  console.log(`[WhatsApp Proxy] ${method} ${url}`);

  const fetchOptions = {
    method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json'
    }
  };
  if (body) fetchOptions.body = JSON.stringify(body);
  if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) fetchOptions.body = JSON.stringify(req.body);

  fetch(url, fetchOptions)
    .then(whatsappRes => {
      res.status(whatsappRes.status);
      // Copy CORS headers
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      return whatsappRes.json();
    })
    .then(data => res.json(data))
    .catch(err => {
      console.error('[WhatsApp Proxy] Error:', err.message);
      res.status(503).json({ error: 'WhatsApp service unavailable', detail: err.message });
    });
}

// WhatsApp routes
app.get('/whatsapp/status', (req, res) => proxyToWhatsApp(req, res));
app.get('/whatsapp/contacts', (req, res) => proxyToWhatsApp(req, res));
app.get('/whatsapp/chats', (req, res) => proxyToWhatsApp(req, res));
app.get('/whatsapp/qr-image', (req, res) => proxyToWhatsApp(req, res));
app.post('/whatsapp/send', (req, res) => proxyToWhatsApp(req, res, { method: 'POST' }));
app.post('/whatsapp/connect', (req, res) => proxyToWhatsApp(req, res, { method: 'POST' }));

// QR code as base64 PNG image
app.get('/whatsapp/qr', async (req, res) => {
  try {
    const url = `${WHATSAPP_SERVICE_URL}/whatsapp/qr-image`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.qr) {
      // Return QR as JSON with the raw base64 string
      res.json({ qr: data.qr });
    } else if (data.connected) {
      res.json({ message: 'Already connected', connected: true });
    } else {
      res.json({ message: 'Scan QR at /whatsapp/qr-image', hint: 'Call /whatsapp/connect first' });
    }
  } catch (err) {
    res.status(503).json({ error: 'WhatsApp service unavailable' });
  }
});

// Export handlers for Cloud Functions Gen 2
// These are invoked by the Cloud Functions framework
exports.alexaHandler = (req, res) => {
  app(req, res);
};

exports.healthHandler = healthHandler;
exports.syncHandler = (req, res) => {
  app(req, res);
};

// Export Express app for Cloud Functions Gen 2
// Named exports for individual handlers + default export for HTTP trigger
Object.assign(module.exports, { app });

// Start HTTP server on PORT=8080 for Cloud Run health checks
// This is required because Cloud Run containers must listen on the PORT env var
const PORT = process.env.PORT || 8080;

function startServer() {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`OmniClaw Cloud Function listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Alexa handler: http://localhost:${PORT}/alexaHandler`);
  });

  server.setTimeout(30 * 1000); // 30 second timeout for function invocations

  return server;
}

// Start server when run directly (local development)
if (require.main === module) {
  startServer();
}
