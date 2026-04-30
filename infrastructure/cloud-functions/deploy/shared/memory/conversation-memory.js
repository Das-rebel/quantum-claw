/**
 * Conversation Memory - Session-level memory storage
 *
 * Stores conversation history for each session with:
 * - Message storage and retrieval
 * - Context preservation across interactions
 * - Automatic cleanup of old sessions
 */

class ConversationMemory {
  constructor(options = {}) {
    this.maxMemoryAge = options.maxMemoryAge || 86400000; // 24 hours
    this.maxMessagesPerSession = options.maxMessagesPerSession || 100;

    // Storage: sessionId -> messages[]
    this.sessions = new Map();
  }

  /**
   * Store a message in the session
   *
   * @param {string} sessionId - Session identifier
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @param {Object} metadata - Additional message metadata
   */
  storeMessage(sessionId, role, content, metadata = {}) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        createdAt: Date.now(),
        messages: [],
        metadata: {}
      });
    }

    const session = this.sessions.get(sessionId);

    const message = {
      role,
      content,
      timestamp: Date.now(),
      metadata
    };

    session.messages.push(message);

    // Trim if exceeds max
    if (session.messages.length > this.maxMessagesPerSession) {
      session.messages = session.messages.slice(-this.maxMessagesPerSession);
    }

    // Update last activity
    session.lastActivity = Date.now();
  }

  /**
   * Get all messages for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {Array} Messages array
   */
  getMessages(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.messages : [];
  }

  /**
   * Get recent messages (last N)
   *
   * @param {string} sessionId - Session identifier
   * @param {number} count - Number of recent messages
   * @returns {Array} Recent messages
   */
  getRecentMessages(sessionId, count = 10) {
    const messages = this.getMessages(sessionId);
    return messages.slice(-count);
  }

  /**
   * Get session context summary
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object} Session context
   */
  getSessionContext(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId,
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      duration: Date.now() - session.createdAt
    };
  }

  /**
   * Clear a session's memory
   *
   * @param {string} sessionId - Session identifier
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up old sessions
   *
   * @returns {number} Number of sessions removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.maxMemoryAge) {
        this.sessions.delete(sessionId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get all active session IDs
   *
   * @returns {Array} Session IDs
   */
  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }
}

module.exports = { ConversationMemory };
