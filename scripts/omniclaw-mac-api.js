#!/usr/bin/env node
/**
 * OmniCloud REST API Server
 * Runs on Mac, exposes WhatsApp operations to Cloud Run
 */

const express = require('express');
const https = require('https');
const { exec } = require('child_process');
const app = express();

const PORT = 3000;
const CLOUD_AI_URL = 'alexa-handler-338789220059.asia-south1.run.app';

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'omniclaw-mac-api' });
});

// Process message with Cloud AI
async function processWithCloudAI(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const req = https.request({
      hostname: CLOUD_AI_URL,
      path: '/alexa',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result?.response?.outputSpeech?.text || 'OK');
        } catch (e) {
          resolve('OK');
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); resolve('OK'); });
    req.write(body);
    req.end();
  });
}

// Send WhatsApp message via OpenClaw
function sendWhatsApp(to, message) {
  return new Promise((resolve, reject) => {
    const cmd = `openclaw message send --target ${to} --message "${message.replace(/"/g, '\\"')}" --channel whatsapp`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Send error:', stderr);
        reject(err);
        return;
      }
      resolve({ success: true });
    });
  });
}

// Process incoming message
app.post('/process', async (req, res) => {
  try {
    const { from, text } = req.body;
    console.log('[Msg]', from, text?.substring(0, 50));
    
    // Get AI response
    const response = await processWithCloudAI(text);
    
    // Send reply
    await sendWhatsApp(from, response);
    
    res.json({ success: true, response });
  } catch (e) {
    console.error('Process error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Send message only (for testing)
app.post('/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    await sendWhatsApp(to, message);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Expose OpenClaw status
app.get('/status', async (req, res) => {
  exec('openclaw health', (err, stdout) => {
    if (err) {
      res.json({ status: 'unknown' });
      return;
    }
    res.json({ status: 'connected', details: stdout });
  });
});

app.listen(PORT, () => {
  console.log(`OmniCloud API running on http://localhost:${PORT}`);
  console.log(`WhatsApp: OpenClaw on Mac`);
  console.log(`AI: Cloud Run at ${CLOUD_AI_URL}`);
});
