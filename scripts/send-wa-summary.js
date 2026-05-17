#!/usr/bin/env node
/**
 * One-shot WhatsApp message sender — FALLBACK ONLY
 *
 * ONLY used when the main bot (omniclaw_direct_whatsapp.js) is NOT running.
 * Connects, sends one message, disconnects immediately.
 *
 * CRITICAL SAFETY:
 *   - NEVER saves credentials (no saveCreds)
 *   - Disconnects within 10 seconds max
 *   - Should NOT be used while the main bot is running
 *
 * Usage:
 *   node send-wa-summary.js <jid> <message>
 *   node send-wa-summary.js <jid> < <message_file>
 *   echo "message" | node send-wa-summary.js <jid> -
 *
 * If the main bot IS running, use the outbox instead:
 *   echo -e "JID\nmessage" > /tmp/omniclaw_baileys/outbox/filename.msg
 */

const {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const AUTH_DIR = '/Users/Subho/.openclaw/credentials/whatsapp/default';
const TIMEOUT_MS = 15000; // hard timeout: 15 seconds

async function sendOneShot(targetJid, message) {
  console.log('[OneShot] Starting...');

  // Safety check: refuse if main bot is running
  try {
    const { execSync } = require('child_process');
    const pids = execSync('pgrep -f omniclaw_direct_whatsapp').toString().trim();
    if (pids) {
      console.error('[OneShot] ABORT: Main bot is running (PIDs: ' + pids + '). Use outbox instead.');
      console.error('[OneShot] Write to /tmp/omniclaw_baileys/outbox/<name>.msg');
      process.exit(1);
    }
  } catch (e) {
    // pgrep exits non-zero when no match — bot is NOT running, proceed
  }

  // Hard timeout safety
  const hardTimeout = setTimeout(() => {
    console.error('[OneShot] Hard timeout — forcing exit');
    process.exit(2);
  }, TIMEOUT_MS);

  try {
    // Load auth — we do NOT register any saveCreds handler
    const { state } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
      version,
      printQRInTerminal: false,
      browser: ['OmniClaw-OneShot', 'Desktop', '1.0.0'],
      syncFullHistory: false,  // don't sync history for one-shot
      markOnlineOnConnect: false
    });

    // Wait for connection open
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
      sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
          clearTimeout(timeout);
          resolve();
        }
        if (update.connection === 'close') {
          clearTimeout(timeout);
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            reject(new Error('Logged out — need new QR scan'));
          } else {
            reject(new Error('Connection closed: ' + statusCode));
          }
        }
      });
    });

    console.log('[OneShot] Connected, sending...');

    // Send message
    const sent = await sock.sendMessage(targetJid, { text: message });
    console.log('[OneShot] Sent! msgId:', sent?.key?.id);

    // Disconnect gracefully
    await sock.logout();
    console.log('[OneShot] Disconnected cleanly');

    clearTimeout(hardTimeout);
    process.exit(0);

  } catch (e) {
    console.error('[OneShot] Error:', e.message);
    clearTimeout(hardTimeout);
    process.exit(1);
  }
}

// ─── CLI ──────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node send-wa-summary.js <jid> <message>');
  console.error('       echo "msg" | node send-wa-summary.js <jid> -');
  process.exit(1);
}

const jid = args[0];
let message = args.slice(1).join(' ');

if (message === '-') {
  // Read from stdin
  const chunks = [];
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    message = chunks.join('').trim();
    if (!message) {
      console.error('Empty message from stdin');
      process.exit(1);
    }
    sendOneShot(jid, message);
  });
} else {
  sendOneShot(jid, message);
}
