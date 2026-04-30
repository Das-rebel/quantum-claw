#!/usr/bin/env node
/**
 * OmniClaw Direct WhatsApp Bridge using Baileys
 * Receives inbound messages and auto-responds using AI
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, proto } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = '/Users/Subho/.openclaw/credentials/whatsapp/default';
const MY_NUMBER = '+919003349852';
const LOG_FILE = '/tmp/omniclaw-baileys.log';

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
    console.log(line.trim());
}

async function sendAgentResponse(sender, message) {
    return new Promise((resolve, reject) => {
        log(`🤖 Calling agent for: ${message.substring(0, 50)}...`);
        
        const proc = spawn('openclaw', [
            'agent', '--local', '--agent', 'main',
            '--message', `You received a WhatsApp message from ${sender}. Message: "${message}". Provide a brief, helpful response.`
        ], {
            env: { ...process.env }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                // Clean response - remove box-drawing chars and empty lines
                const lines = stdout.split('\n')
                    .filter(l => l.trim() && !l.startsWith('│') && !l.startsWith('◇'))
                    .join('\n');
                resolve(lines.substring(0, 500) || 'Message received!');
            } else {
                log(`❌ Agent error: ${stderr.substring(0, 100)}`);
                resolve('Sorry, I had trouble processing that.');
            }
        });

        // Timeout after 60s
        setTimeout(() => {
            proc.kill();
            resolve('Sorry, that took too long.');
        }, 60000);
    });
}

async function sendWhatsAppMessage(sock, jid, text) {
    try {
        await sock.sendMessage(jid, { text });
        log(`✅ Sent to ${jid}: ${text.substring(0, 50)}...`);
    } catch (err) {
        log(`❌ Send failed: ${err.message}`);
    }
}

async function main() {
    log('🚀 OmniClaw Direct WhatsApp Bridge Starting');
    
    const { state, saveState, clearState } = await useMultiFileAuthState(SESSION_DIR);
    
    const sock = makeWASocket({
        auth: state,
        browser: ['OmniClaw', 'Desktop', '1.0.0']
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            log('📱 QR Code received - scan with WhatsApp!');
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            log(`⚠️ Connection closed. Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) main();
        } else if (connection === 'open') {
            log('✅ WhatsApp Web connected!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // Skip own messages
            if (msg.key.fromMe) continue;
            
            const jid = msg.key.remoteJid;
            const sender = msg.key.participant || jid;
            
            // Get message text
            let text = '';
            if (msg.message?.conversation) {
                text = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
                text = msg.message.extendedTextMessage.text;
            } else if (msg.message?.textMessage?.text) {
                text = msg.message.textMessage.text;
            }
            
            if (!text) continue;
            
            // Clean sender number
            const senderNum = sender.replace('@s.whatsapp.net', '');
            log(`📩 From ${senderNum}: ${text}`);
            
            // Send auto-reply
            const response = await sendAgentResponse(senderNum, text);
            await sendWhatsAppMessage(sock, jid, response);
        }
    });

    // Keep process alive
    process.on('SIGINT', () => {
        log('👋 Shutting down...');
        sock.end();
        process.exit(0);
    });
}

main().catch(console.error);
