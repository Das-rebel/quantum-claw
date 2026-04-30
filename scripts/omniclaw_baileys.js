#!/usr/bin/env node
/**
 * OmniClaw Direct WhatsApp Bridge using Baileys v7
 * Fresh start with proper QR code handling
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs');

const SESSION_DIR = '/tmp/omniclaw-baileys-fresh';
const LOG_FILE = '/tmp/omniclaw-baileys.log';

function log(msg) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function sendAgentResponse(sender, message) {
    return new Promise((resolve) => {
        log(`🤖 Calling agent for: ${message.substring(0, 50)}...`);
        
        const proc = spawn('openclaw', [
            'agent', '--local', '--agent', 'main',
            '--message', `You received a WhatsApp message from ${sender}. Message: "${message}". Provide a brief, helpful response.`
        ], { env: { ...process.env } });

        let stdout = '';
        proc.stdout.on('data', (data) => { stdout += data.toString(); });

        const timer = setTimeout(() => {
            proc.kill();
            resolve('Sorry, that took too long.');
        }, 60000);

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                const lines = stdout.split('\n')
                    .filter(l => l.trim() && !l.startsWith('│') && !l.startsWith('◇'))
                    .join('\n');
                resolve(lines.substring(0, 500) || 'Message received!');
            } else {
                resolve('Sorry, I had trouble processing that.');
            }
        });
    });
}

function generateASCIIQR(qrData) {
    // Simple ASCII QR code display
    const QR_SIZE = 25;
    const qr = [];
    
    // This is a placeholder - in reality you'd use a QR library
    // For now, we'll just show the raw data
    return `📱 QR DATA:\n${qrData}`;
}

async function main() {
    // Use existing OpenClaw WhatsApp credentials instead of fresh start
    const OPENCLAW_WA_DIR = '/Users/Subho/.openclaw/credentials/whatsapp/default';
    
    if (!fs.existsSync(OPENCLAW_WA_DIR)) {
        log('❌ OpenClaw WhatsApp credentials not found!');
        return;
    }
    
    log('🚀 OmniClaw Direct WhatsApp Bridge - Using existing session');
    log(`📁 Using credentials from: ${OPENCLAW_WA_DIR}`);
    
    const { state, saveCreds } = await useMultiFileAuthState(OPENCLAW_WA_DIR);
    
    const sock = makeWASocket({
        auth: state,
        browser: ['OmniClaw-Bridge', 'Desktop', '1.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            log('📱📱📱 SCAN THIS QR CODE NOW! 📱📱📱');
            log('   WhatsApp > Settings > Linked Devices > Link a Device');
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            log(`QR Data: ${qr}`);
            log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }
        
        if (connection === 'close') {
            const status = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = status !== DisconnectReason.loggedOut;
            log(`⚠️ Connection closed (${status}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) main();
        } else if (connection === 'open') {
            log('✅✅✅ WhatsApp Web CONNECTED! Ready! ✅✅✅');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        log(`📩 messages.upsert event fired with ${messages.length} messages`);
        
        for (const msg of messages) {
            if (msg.key.fromMe) continue;
            
            const jid = msg.key.remoteJid;
            const sender = msg.key.participant || jid;
            
            let text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text ||
                       msg.message?.textMessage?.text || '';
            
            if (!text) {
                log('📩 Received message but no text content');
                continue;
            }
            
            const senderNum = sender.replace('@s.whatsapp.net', '').replace('@lid', '');
            log(`📩 From ${senderNum}: ${text}`);
            
            const response = await sendAgentResponse(senderNum, text);
            try {
                await sock.sendMessage(jid, { text: response });
                log(`✅ Auto-reply sent: ${response.substring(0, 50)}...`);
            } catch (err) {
                log(`❌ Send failed: ${err.message}`);
            }
        }
    });

    process.on('SIGINT', () => {
        log('👋 Shutting down...');
        sock.end();
        process.exit(0);
    });
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
