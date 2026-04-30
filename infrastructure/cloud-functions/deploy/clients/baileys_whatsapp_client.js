/**
 * Baileys WhatsApp Client for OmniClaw
 * Uses @whiskeysockets/baileys for WhatsApp Web communication
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');

class BaileysWhatsAppClient {
  constructor(options = {}) {
    this.authDir = options.authDir || path.join(__dirname, '../../whatsapp-qr-cloud/whatsapp_auth');
    this.socket = null;
    this.state = null;
    this.saveCreds = null;
    this.isConnected = false;
    this.lastQR = null;
    this.connectionUpdate = null;
  }

  /**
   * Connect to WhatsApp and authenticate
   */
  async connect() {
    try {
      // Ensure auth directory exists
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // Load existing auth state or initialize new
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      this.state = state;
      this.saveCreds = saveCreds;

      // Create socket connection
      this.socket = makeWASocket({
        auth: this.state,
        printQRInTerminal: false,
        browser: ['OmniClaw WhatsApp', 'Chrome', '104.0.0.0'],
        defaultQuotedMsg: {},
        emojiVersion: '15',
      });

      // Handle connection events
      this.socket.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          console.log('[WhatsApp] QR Code received - scan within 60 seconds');
          this.lastQR = qr;
          if (this.connectionUpdate) {
            this.connectionUpdate({ qr, status: 'waiting_for_scan' });
          }
        }

        if (connection === 'open') {
          this.isConnected = true;
          console.log('[WhatsApp] Connected successfully');
          if (this.connectionUpdate) {
            this.connectionUpdate({ status: 'connected' });
          }
        }

        if (connection === 'close') {
          this.isConnected = false;
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log('[WhatsApp] Connection closed, reconnecting:', shouldReconnect);
          if (shouldReconnect && this.socket) {
            // Will auto-reconnect due to WaSocket setup
          }
        }
      });

      // Save credentials on update
      this.socket.ev.on('creds.update', () => {
        if (this.saveCreds) {
          this.saveCreds();
        }
      });

      // Wait for connection to establish
      await this._waitForConnection();

      return this;
    } catch (error) {
      console.error('[WhatsApp] Connection error:', error.message);
      throw error;
    }
  }

  /**
   * Wait for connection to establish
   */
  async _waitForConnection(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeoutMs);

      if (this.isConnected) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      const checkConnection = setInterval(() => {
        if (this.isConnected) {
          clearTimeout(timeout);
          clearInterval(checkConnection);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Send a text message
   * @param {string} jid - WhatsApp user ID (phone@c.us format)
   * @param {string} text - Message text
   */
  async sendMessage(jid, text) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to WhatsApp');
    }

    // Ensure JID format
    const formattedJid = this._ensureJID(jid);

    try {
      const result = await this.socket.sendMessage(formattedJid, { text });
      console.log(`[WhatsApp] Message sent to ${formattedJid}`);
      return { success: true, messageId: result.key.id, jid: formattedJid };
    } catch (error) {
      console.error(`[WhatsApp] Send error to ${formattedJid}:`, error.message);
      throw error;
    }
  }

  /**
   * Send message to multiple recipients (broadcast)
   * @param {string[]} jids - Array of WhatsApp user IDs
   * @param {string} text - Message text
   */
  async broadcast(jids, text) {
    const results = [];
    for (const jid of jids) {
      try {
        const result = await this.sendMessage(jid, text);
        results.push({ jid, success: true, messageId: result.messageId });
      } catch (error) {
        results.push({ jid, success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Get QR code for authentication (if not already connected)
   */
  async getQRCode() {
    if (this.isConnected) {
      return null; // Already connected, no QR needed
    }
    return this.lastQR;
  }

  /**
   * Get current connection status
   */
  async getConnectionStatus() {
    return {
      connected: this.isConnected,
      hasQR: !!this.lastQR && !this.isConnected,
      authDir: this.authDir,
      canSend: this.isConnected && !!this.socket
    };
  }

  /**
   * Get list of contacts
   */
  async getContacts() {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected');
    }

    try {
      const contacts = await this.socket.fetchContacts();
      return Object.values(contacts).map(c => ({
        id: c.id,
        name: c.name || c.notify || c.verifiedName || c.formattedName || 'Unknown',
        isBusiness: c.isBusiness,
        isContact: c.isContact
      }));
    } catch (error) {
      console.error('[WhatsApp] Get contacts error:', error.message);
      return [];
    }
  }

  /**
   * Get chat history / recent messages
   */
  async getChats(limit = 20) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected');
    }

    try {
      const chats = Object.values(this.socket.store.chats || {})
        .filter(c => c.messages)
        .sort((a, b) => (b.messages[b.messages.length - 1]?.messageTimestamp || 0) - (a.messages[a.messages.length - 1]?.messageTimestamp || 0))
        .slice(0, limit);

      return chats.map(c => ({
        jid: c.jid,
        name: c.name || c.jid,
        unreadCount: c.unreadCount || 0,
        lastMessage: c.messages ? this._extractLastMessage(c.messages) : null
      }));
    } catch (error) {
      console.error('[WhatsApp] Get chats error:', error.message);
      return [];
    }
  }

  /**
   * Extract last message from chat messages
   */
  _extractLastMessage(messages) {
    const sorted = Object.values(messages).sort((a, b) =>
      (b.message?.messageTimestamp || 0) - (a.message?.messageTimestamp || 0)
    );
    const last = sorted[0]?.message;
    if (!last) return null;

    return {
      text: last.conversation || last.extendedTextMessage?.text || '',
      timestamp: last.messageTimestamp,
      fromMe: last.key?.fromMe
    };
  }

  /**
   * Ensure JID format is correct
   */
  _ensureJID(identifier) {
    if (!identifier) return null;

    // Already has @ suffix
    if (identifier.includes('@')) {
      return identifier;
    }

    // Remove all non-digits
    const num = identifier.replace(/\D/g, '');

    // Convert to JID format
    if (num.length > 15) {
      return `${num}@c.us`;
    } else {
      return `${num}@s.whatsapp.net`;
    }
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect() {
    if (this.socket) {
      try {
        await this.socket.logout();
      } catch (e) {
        // Ignore logout errors
      }
      this.socket = null;
      this.isConnected = false;
      console.log('[WhatsApp] Disconnected');
    }
  }

  /**
   * Set callback for connection updates
   */
  onConnectionUpdate(callback) {
    this.connectionUpdate = callback;
  }
}

module.exports = BaileysWhatsAppClient;