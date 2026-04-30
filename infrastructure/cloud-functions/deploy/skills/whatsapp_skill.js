/**
 * WhatsApp Skill for HALO Orchestration
 * Handles all WhatsApp-related intents with HALO integration
 */

class WhatsAppSkill {
  constructor(options = {}) {
    this.name = 'whatsapp';
    this.serviceUrl = options.serviceUrl || process.env.WHATSAPP_SERVICE_URL || 'http://localhost:9377';
    this.timeout = options.timeout || 15000;
    this.retryAttempts = options.retryAttempts || 3;
  }

  /**
   * Execute WhatsApp intent
   */
  async execute(intent, params, context = {}) {
    switch (intent) {
      case 'WhatsAppIntent':
      case 'SendWhatsAppMessage':
        return this.sendMessage(params, context);

      case 'GetWhatsAppStatus':
        return this.getStatus();

      case 'GetWhatsAppContacts':
        return this.getContacts();

      case 'GetWhatsAppChats':
        return this.getChats();

      case 'GetWhatsAppMessages':
        return this.getMessages(params);

      default:
        return { success: false, error: `Unknown intent: ${intent}` };
    }
  }

  /**
   * Send WhatsApp message
   * Params: { to: string, message: string }
   */
  async sendMessage(params, context = {}) {
    const { to, message } = params;

    if (!to || !message) {
      return { success: false, error: 'Missing required params: to, message' };
    }

    try {
      const response = await this.proxyRequest('/whatsapp/send', {
        method: 'POST',
        body: { to, message }
      });

      return {
        success: true,
        messageId: response.messageId,
        to: response.to,
        timestamp: Date.now()
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get WhatsApp connection status
   */
  async getStatus() {
    try {
      const response = await this.proxyRequest('/whatsapp/status', { method: 'GET' });
      return {
        success: true,
        connected: response.connected,
        phone: response.phone,
        name: response.name
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get all contacts
   */
  async getContacts() {
    try {
      const response = await this.proxyRequest('/whatsapp/contacts/all', { method: 'GET' });
      return {
        success: true,
        contacts: response.contacts,
        count: response.count
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get recent chats
   */
  async getChats() {
    try {
      const response = await this.proxyRequest('/whatsapp/chats', { method: 'GET' });
      return {
        success: true,
        chats: response.chats
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get message history
   * Params: { jid?: string, limit?: number }
   */
  async getMessages(params = {}) {
    const { jid, limit = 50 } = params;

    try {
      const query = jid ? `?jid=${encodeURIComponent(jid)}&limit=${limit}` : `?limit=${limit}`;
      const response = await this.proxyRequest(`/whatsapp/messages${query}`, { method: 'GET' });
      return {
        success: true,
        messages: response.messages,
        count: response.count
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Delete chat messages
   * Params: { jid: string }
   */
  async deleteChat(params) {
    const { jid } = params;

    if (!jid) {
      return { success: false, error: 'Missing required param: jid' };
    }

    try {
      const response = await this.proxyRequest(`/whatsapp/chat/${encodeURIComponent(jid)}`, {
        method: 'DELETE'
      });
      return { success: true, deleted: jid };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Proxy request to WhatsApp service
   */
  async proxyRequest(path, options = {}) {
    const url = `${this.serviceUrl}${path}`;
    const { method = 'GET', body } = options;

    const fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: this.timeout
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`WhatsApp service error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check if service is healthy
   */
  async healthCheck() {
    try {
      await this.proxyRequest('/health', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get skill metadata for HALO
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      capabilities: [
        'send_message',
        'get_status',
        'get_contacts',
        'get_chats',
        'get_messages',
        'delete_chat'
      ],
      intents: [
        'WhatsAppIntent',
        'SendWhatsAppMessage',
        'GetWhatsAppStatus',
        'GetWhatsAppContacts',
        'GetWhatsAppChats',
        'GetWhatsAppMessages'
      ],
      endpoint: this.serviceUrl
    };
  }
}

module.exports = WhatsAppSkill;
