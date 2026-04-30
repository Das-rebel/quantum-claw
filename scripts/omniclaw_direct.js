#!/usr/bin/env node
/**
 * OmniClaw Direct WhatsApp - Uses OpenClaw's session credentials directly
 * Run: node ~/omniclaw_direct.js
 */

const { makeWASocket, useMultiFileAuthState, Browsers } = require('/Users/Subho/.npm-global/lib/node_modules/openclaw/node_modules/@whiskeysockets/baileys');
const fs = require('fs');
const readline = require('readline');

const AUTH_DIR = '/Users/Subho/.openclaw/credentials/whatsapp/default';
const TARGET_JID = '917977110915@s.whatsapp.net'; // Client to auto-reply

async function main() {
  console.log('[OmniClaw] Starting direct WhatsApp connection...');
  
  // Load auth state from OpenClaw's credentials
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    emitOwnEvents: false,
  });

  // Save credentials when updated
  sock.ev.on('creds.update', saveCreds);

  // Connection handling
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log('[OmniClaw] ✓ Connected to WhatsApp');
      const jid = sock.user?.id;
      console.log(`[OmniClaw] My JID: ${jid}`);
    }
    
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || 'unknown';
      console.log(`[OmniClaw] Connection closed: ${reason}`);
      if (reason !== 405) {
        process.exit(1);
      }
    }
  });

  // INBOUND MESSAGE HANDLER - THE KEY PART
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (msg.key.fromMe) continue; // Skip own messages
      
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text ||
                   msg.message?.imageMessage?.caption || '';
      
      if (!text) continue;
      
      console.log(`[OmniClaw] INCOMING from ${from}: ${text}`);
      
      // Auto-reply logic
      let reply = '';
      const lower = text.toLowerCase().trim();
      
      if (lower === 'hi' || lower === 'hello' || lower === 'hey') {
        reply = 'Hi! This is OmniClaw assistant. How can I help you today?';
      } else if (lower === 'ping') {
        reply = 'Pong! OmniClaw is online and ready.';
      } else if (lower === 'status') {
        reply = '✅ OmniClaw is running smoothly. All systems operational.';
      } else if (lower === 'help') {
        reply = 'Available commands:\n• ping - Check if OmniClaw is alive\n• status - System status\n• hi - Greeting\n• help - This help message\n• Anything else - AI response';
      } else {
        reply = `I received your message: "${text}"\n\nOmniClaw auto-reply is active. Type "help" for available commands.`;
      }
      
      // Send reply
      try {
        await sock.sendMessage(from, { text: reply });
        console.log(`[OmniClaw] REPLIED to ${from}: ${reply}`);
      } catch (err) {
        console.error(`[OmniClaw] Send failed: ${err.message}`);
      }
    }
  });

  // Keep alive
  sock.ev.on('disconnect.error', (err) => {
    console.error('[OmniClaw] Disconnect error:', err);
  });
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('[OmniClaw] Unhandled rejection:', err);
});

process.on('SIGINT', () => {
  console.log('\n[OmniClaw] Shutting down...');
  process.exit(0);
});

main().catch(console.error);
