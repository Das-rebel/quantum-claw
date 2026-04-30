/**
 * WhatsApp Client (Wrapper)
 * Acts as an alias/bridge to BaileysWhatsAppClient
 */

const BaileysWhatsAppClient = require('./baileys_whatsapp_client');

class WhatsAppClient extends BaileysWhatsAppClient {
  constructor(config = {}) {
    super(config);
    this.clientId = 'WhatsApp';
  }
}

module.exports = WhatsAppClient;