/**
 * Attention-Weighted Memory
 *
 * Memory system that weights messages by attention/relevance:
 * - Recent messages have higher weight
 * - Messages from user have different weight than assistant
 * - Important messages (flagged) get boosted weight
 * - Decay over time for older messages
 */

class AttentionWeightedMemory {
  constructor(options = {}) {
    this.decayFactor = options.decayFactor || 0.95; // Older messages decay
    this.recentWeightBoost = options.recentWeightBoost || 1.5;
    this.userMessageBoost = options.userMessageBoost || 1.2;
    this.maxMemoryAge = options.maxMemoryAge || 7 * 86400000; // 7 days

    // Storage: sessionId -> weightedMessages[]
    this.sessions = new Map();
  }

  /**
   * Store a message with attention weighting
   *
   * @param {string} sessionId - Session identifier
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @param {Object} options - Additional options
   */
  storeMessage(sessionId, role, content, options = {}) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        messages: [],
        importanceMap: new Map()
      });
    }

    const session = this.sessions.get(sessionId);

    const message = {
      role,
      content,
      timestamp: Date.now(),
      baseWeight: 1.0,
      metadata: options.metadata || {}
    };

    session.messages.push(message);

    // Store importance if provided
    if (options.important) {
      session.importanceMap.set(session.messages.length - 1, options.importance);
    }

    // Recalculate weights
    this._recalculateWeights(sessionId);
  }

  /**
   * Get weighted context for a session
   *
   * @param {string} sessionId - Session identifier
   * @param {number} maxMessages - Maximum messages to return
   * @returns {Array} Weighted messages
   */
  getWeightedContext(sessionId, maxMessages = 20) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    // Calculate weights for all messages
    const now = Date.now();
    const weightedMessages = session.messages.map((msg, index) => {
      let weight = msg.baseWeight;

      // Recency boost (messages within last hour)
      const age = now - msg.timestamp;
      if (age < 3600000) {
        weight *= this.recentWeightBoost;
      }

      // User message boost
      if (msg.role === 'user') {
        weight *= this.userMessageBoost;
      }

      // Importance boost
      const importance = session.importanceMap.get(index);
      if (importance) {
        weight *= importance;
      }

      // Time decay
      const decayMultiplier = Math.pow(this.decayFactor, age / this.maxMemoryAge);
      weight *= decayMultiplier;

      return {
        ...msg,
        weight,
        age
      };
    });

    // Sort by weight descending
    weightedMessages.sort((a, b) => b.weight - a.weight);

    return weightedMessages.slice(0, maxMessages);
  }

  /**
   * Get conversation summary
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object} Summary
   */
  getSummary(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const now = Date.now();
    const messages = session.messages;

    let totalUserMessages = 0;
    let totalAssistantMessages = 0;
    let totalWeight = 0;

    messages.forEach((msg, index) => {
      if (msg.role === 'user') totalUserMessages++;
      else totalAssistantMessages++;

      const importance = session.importanceMap.get(index) || 1;
      totalWeight += importance;
    });

    return {
      sessionId,
      totalMessages: messages.length,
      userMessages: totalUserMessages,
      assistantMessages: totalAssistantMessages,
      averageImportance: totalWeight / messages.length,
      oldestMessage: messages.length > 0 ? now - messages[0].timestamp : 0,
      newestMessage: messages.length > 0 ? now - messages[messages.length - 1].timestamp : 0
    };
  }

  /**
   * Recalculate all weights for a session
   *
   * @param {string} sessionId - Session identifier
   * @private
   */
  _recalculateWeights(sessionId) {
    // Weights are calculated on retrieval, not storage
    // This method is here for future optimization needs
  }

  /**
   * Mark a message as important
   *
   * @param {string} sessionId - Session identifier
   * @param {number} messageIndex - Index of message
   * @param {number} importance - Importance multiplier (1.0-3.0)
   */
  markImportant(sessionId, messageIndex, importance = 2.0) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.importanceMap.set(messageIndex, importance);
  }

  /**
   * Clear session memory
   *
   * @param {string} sessionId - Session identifier
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all sessions
   *
   * @returns {Array} Session IDs
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }
}

module.exports = { AttentionWeightedMemory };
