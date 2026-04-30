/**
 * Vault Memory - Integrates vault content with conversation memory
 *
 * Allows vault references to be stored in conversation context and
 * surfaced in future conversations.
 */

const VaultClient = require('../clients/vault_client');

class VaultMemory {
  constructor(options = {}) {
    this.conversationMemory = options.conversationMemory;
    this.vaultClient = options.vaultClient || new VaultClient();
    this.maxReferences = options.maxReferences || 10;
  }

  /**
   * Store a vault item reference in conversation memory
   * @param {string} conversationId - Conversation/session ID
   * @param {Object} vaultItem - Vault item { id, type, name, vlTags, url }
   * @param {Object} context - Additional context { why, timestamp }
   */
  rememberVaultItem(conversationId, vaultItem, context = {}) {
    const vaultRef = {
      id: vaultItem.id,
      type: vaultItem.type,
      name: vaultItem.name,
      vlTags: vaultItem.vlTags || [],
      url: vaultItem.url,
      why: context.why || 'referenced',
      rememberedAt: Date.now()
    };

    // Store as a system message with vault reference metadata
    this.conversationMemory.storeMessage(
      conversationId,
      'system',
      `vault_reference:${JSON.stringify(vaultRef)}`,
      { type: 'vault_reference', vaultRef }
    );
  }

  /**
   * Get vault items referenced in this conversation
   * @param {string} conversationId - Conversation/session ID
   * @returns {Array} Vault items from this conversation
   */
  getConversationVaultRefs(conversationId) {
    const messages = this.conversationMemory.getMessages(conversationId);
    const refs = [];

    for (const msg of messages) {
      if (msg.metadata?.type === 'vault_reference') {
        refs.push(msg.metadata.vaultRef);
      }
    }

    // Limit to maxReferences
    return refs.slice(-this.maxReferences);
  }

  /**
   * Surface relevant vault content based on conversation topic
   */
  async surfaceRelevantVault(conversationId, currentTopic) {
    let vaultResults = [];
    try {
      vaultResults = this.vaultClient.findKnowledge(currentTopic);
    } catch (err) {
      console.error('Vault query failed:', err);
    }

    const existingRefs = this.getConversationVaultRefs(conversationId);
    const existingIds = new Set(existingRefs.map(r => r.id));

    const directMatches = [];
    const tangential = [];

    for (const item of vaultResults.topics || vaultResults.skills || vaultResults.places || vaultResults.food || []) {
      if (existingIds.has(item.id)) {
        tangential.push(item);
      } else {
        directMatches.push(item);
      }
    }

    return {
      directMatches,
      tangential,
      confidence: directMatches.length > 0 ? 'high' : tangential.length > 0 ? 'medium' : 'low'
    };
  }

  /**
   * Update memory with new vault saves
   * @param {string} conversationId - Conversation/session ID
   * @param {Array} recentPosts - Recently saved vault items
   * @returns {Promise<Object>} { newConnections, updatedContext }
   */
  async syncNewVaultContent(conversationId, recentPosts) {
    const existingRefs = this.getConversationVaultRefs(conversationId);
    const existingIds = new Set(existingRefs.map(r => r.id));

    const newConnections = [];

    for (const post of recentPosts) {
      if (!existingIds.has(post.id)) {
        // New connection discovered
        this.rememberVaultItem(conversationId, post, {
          why: 'new_vault_save'
        });
        newConnections.push(post);
      }
    }

    return {
      newConnections,
      updatedContext: {
        totalRefs: this.getConversationVaultRefs(conversationId).length
      }
    };
  }

  /**
   * Clear vault memory for a conversation
   * @param {string} conversationId - Conversation/session ID
   */
  clearConversationMemory(conversationId) {
    // Get all messages and filter out vault references
    const messages = this.conversationMemory.getMessages(conversationId);
    const nonVaultMessages = messages.filter(
      msg => msg.metadata?.type !== 'vault_reference'
    );

    // Clear the session and re-add non-vault messages
    this.conversationMemory.clearSession(conversationId);

    for (const msg of nonVaultMessages) {
      this.conversationMemory.storeMessage(
        conversationId,
        msg.role,
        msg.content,
        msg.metadata
      );
    }
  }
}

module.exports = { VaultMemory };
