/**
 * Session Manager - User session tracking and lifecycle management
 *
 * Provides:
 * - Session creation and tracking per user
 * - Session timeout handling
 * - In-memory storage with active session tracking
 */

const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor(options = {}) {
    this.sessionTimeout = options.sessionTimeout || 30 * 60 * 1000; // 30 minutes
    this.sessions = new Map();
    this.userSessions = new Map(); // userId -> sessionId mapping
    this.onSessionEnd = typeof options.onSessionEnd === 'function' ? options.onSessionEnd : null;

    // Start cleanup interval
    if (SessionManager.cleanupInterval) {
      clearInterval(SessionManager.cleanupInterval);
    }
    SessionManager.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
    this.cleanupInterval = SessionManager.cleanupInterval;
  }

  /**
     * Create or get existing session for user
     * @param {string} userId - User identifier
     * @returns {Session} - Session object
     */
  createOrUpdateSession(userId) {
    const now = Date.now();

    // Check if user has an active session
    const existingSessionId = this.userSessions.get(userId);
    if (existingSessionId) {
      const session = this.sessions.get(existingSessionId);
      if (session && !this.isSessionExpired(session)) {
        // Update existing session
        session.lastActivity = now;
        return session;
      }
    }

    // Create new session
    const sessionId = uuidv4();
    const session = {
      sessionId,
      userId,
      startedAt: now,
      lastActivity: now,
      isActive: true
    };

    this.sessions.set(sessionId, session);
    this.userSessions.set(userId, sessionId);

    return session;
  }

  /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @returns {Session|null} - Session object or null
     */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return null;
    }
    return session;
  }

  /**
     * Get active session for user
     * @param {string} userId - User identifier
     * @returns {Session|null} - Session object or null
     */
  getUserSession(userId) {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  /**
     * Update session activity
     * @param {string} sessionId - Session ID
     * @returns {boolean} - True if updated successfully
     */
  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.lastActivity = Date.now();
    return true;
  }

  /**
     * End session
     * @param {string} sessionId - Session ID
     * @returns {boolean} - True if ended successfully
     */
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.isActive = false;
    session.endedAt = Date.now();

    if (this.onSessionEnd) {
      try {
        this.onSessionEnd(session);
      } catch (error) {
        console.warn('⚠️ Session end callback failed:', error.message);
      }
    }

    // Remove from user sessions mapping
    this.userSessions.delete(session.userId);

    // Remove from sessions map
    this.sessions.delete(sessionId);

    return true;
  }

  /**
     * Check if session is expired
     * @param {Session} session - Session object
     * @returns {boolean} - True if expired
     */
  isSessionExpired(session) {
    if (!session || typeof session.lastActivity !== 'number') {
      return true;
    }
    const inactiveTime = Date.now() - session.lastActivity;
    return inactiveTime > this.sessionTimeout;
  }

  /**
     * Cleanup expired sessions
     * @returns {number} - Number of sessions cleaned up
     */
  cleanupExpiredSessions() {
    let cleaned = 0;
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        this.endSession(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
     * Get all active sessions
     * @returns {Array<Session>} - Array of active sessions
     */
  getActiveSessions() {
    const active = [];
    for (const session of this.sessions.values()) {
      if (!this.isSessionExpired(session)) {
        active.push(session);
      }
    }
    return active;
  }

  /**
     * Get session statistics
     * @returns {object} - Statistics object
     */
  getStats() {
    const activeSessions = this.getActiveSessions();
    const now = Date.now();

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeSessions.length,
      uniqueUsers: this.userSessions.size,
      sessionTimeout: this.sessionTimeout,
      averageSessionDuration: this.calculateAverageDuration(activeSessions, now)
    };
  }

  /**
     * Calculate average session duration
     * @param {Array<Session>} sessions - Active sessions
     * @param {number} now - Current timestamp
     * @returns {number} - Average duration in minutes
     */
  calculateAverageDuration(sessions, now) {
    if (sessions.length === 0) return 0;

    const total = sessions.reduce((sum, session) => {
      return sum + (now - session.startedAt);
    }, 0);

    return Math.round(total / sessions.length / 1000 / 60 * 10) / 10; // Minutes to 1 decimal
  }

  /**
     * Stop cleanup interval
     */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (SessionManager.cleanupInterval === this.cleanupInterval) {
      SessionManager.cleanupInterval = null;
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create session manager singleton
 * @param {object} options - Configuration options
 * @returns {SessionManager} - Session manager instance
 */
function getSessionManager(options) {
  if (!instance) {
    instance = new SessionManager(options);
  }
  return instance;
}

module.exports = { SessionManager, getSessionManager };
