/**
 * Conversation Manager - Advanced Multi-Turn Conversation Memory
 *
 * Provides:
 * - Cross-session conversation history (10+ turns)
 * - Topic context tracking with automatic topic drift detection
 * - Reference to previous queries with intelligent context retrieval
 * - Multi-turn coherence through context continuity
 * - Session-based memory with optional persistence
 */

class ConversationManager {
  constructor(options = {}) {
    this.maxHistoryPerSession = options.maxHistoryPerSession || 15;
    this.maxSessions = options.maxSessions || 5;
    this.maxTopicHistory = options.maxTopicHistory || 20;
    this.contextDecayMinutes = options.contextDecayMinutes || 30;
    this.enablePersistence = options.enablePersistence || false;

    // Session storage: userId -> Map of sessions
    this.sessions = new Map();

    // Global conversation context for cross-session references
    this.globalContext = {
      userTopics: new Map(), // userId -> topic history
      userEntities: new Map(), // userId -> entity frequency
      userPreferences: new Map(), // userId -> preferences
      recentTopics: [] // Recent topics across all users (for trending)
    };

    // Topic tracking with automatic drift detection
    this.topicTransitions = new Map(); // topic -> next topics
  }

  /**
     * Get or create a conversation session
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @returns {object} - Session object
     */
  getSession(userId, sessionId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, new Map());
    }

    const userSessions = this.sessions.get(userId);
    let session = userSessions.get(sessionId);

    if (!session) {
      session = this._createSession(userId, sessionId);
      userSessions.set(sessionId, session);

      // Limit number of sessions per user
      if (userSessions.size > this.maxSessions) {
        this._evictOldestSession(userId);
      }
    }

    // Update last accessed time
    session.lastAccessedAt = Date.now();

    return session;
  }

  /**
     * Create a new session
     * @private
     */
  _createSession(userId, sessionId) {
    return {
      id: sessionId,
      userId: userId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      history: [],
      currentTopic: null,
      topicHistory: [],
      entities: new Map(),
      context: {
        lastIntent: null,
        waitingForFollowUp: false,
        previousQueries: [],
        unresolvedReferences: []
      },
      metadata: {
        turnCount: 0,
        topicDrifts: 0,
        coherenceScore: 1.0
      }
    };
  }

  /**
     * Evict oldest session for a user
     * @private
     */
  _evictOldestSession(userId) {
    const userSessions = this.sessions.get(userId);
    let oldestSessionId = null;
    let oldestTimestamp = Infinity;

    for (const [sessionId, session] of userSessions) {
      if (session.lastAccessedAt < oldestTimestamp) {
        oldestTimestamp = session.lastAccessedAt;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      userSessions.delete(oldestSessionId);
      console.log(`[ConversationManager] Evicted oldest session: ${oldestSessionId}`);
    }
  }

  /**
     * Add a conversation turn to the session
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @param {string} query - User query
     * @param {string} response - System response
     * @param {object} metadata - Additional metadata
     * @returns {object} - Updated session summary
     */
  addTurn(userId, sessionId, query, response, metadata = {}) {
    const session = this.getSession(userId, sessionId);
    const now = Date.now();

    // Extract topic from query
    const topic = this._extractTopic(query);
    const previousTopic = session.currentTopic;

    // Detect topic drift
    const topicDrifted = previousTopic && topic && previousTopic !== topic;
    if (topicDrifted) {
      session.metadata.topicDrifts++;
      session.metadata.coherenceScore = Math.max(0.5, session.metadata.coherenceScore - 0.1);

      // Record topic transition
      this._recordTopicTransition(previousTopic, topic);
    }

    // Update current topic
    session.currentTopic = topic;
    if (topic) {
      session.topicHistory.unshift(topic);
      if (session.topicHistory.length > this.maxTopicHistory) {
        session.topicHistory.pop();
      }
    }

    // Extract entities
    const entities = this._extractEntities(query);
    for (const entity of entities) {
      const count = session.entities.get(entity) || 0;
      session.entities.set(entity, count + 1);
    }

    // Create turn entry
    const turn = {
      id: `${sessionId}-${session.metadata.turnCount}`,
      query: query,
      response: response,
      intent: metadata.intent || 'GeneralQuery',
      topic: topic,
      entities: entities,
      timestamp: now,
      metadata: metadata
    };

    // Add to history
    session.history.push(turn);

    // Trim history if needed
    if (session.history.length > this.maxHistoryPerSession) {
      session.history.shift();
    }

    // Update metadata
    session.metadata.turnCount++;

    // Update context
    session.context.lastIntent = metadata.intent;
    session.context.previousQueries.push(query);
    if (session.context.previousQueries.length > 5) {
      session.context.previousQueries.shift();
    }
    session.context.waitingForFollowUp = this._isFollowUpQuestion(query);

    // Update global context
    this._updateGlobalContext(userId, topic, entities);

    return this.getSessionSummary(userId, sessionId);
  }

  /**
     * Get conversation history for context
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @param {number} limit - Number of recent turns to retrieve
     * @returns {Array} - Conversation history
     */
  getHistory(userId, sessionId, limit = null) {
    const session = this.getSession(userId, sessionId);

    if (limit) {
      return session.history.slice(-limit);
    }

    return [...session.history];
  }

  /**
     * Get relevant context for a query
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @param {string} query - Current query
     * @param {number} maxTurns - Maximum turns to include
     * @returns {object} - Relevant context
     */
  getRelevantContext(userId, sessionId, query, maxTurns = 5) {
    const session = this.getSession(userId, sessionId);
    const history = this.getHistory(userId, sessionId, maxTurns);

    // Extract keywords from query
    const queryKeywords = this._extractKeywords(query);

    // Score each turn based on relevance
    const scoredHistory = history.map(turn => {
      let relevanceScore = 0;

      // Boost for same topic
      if (turn.topic && session.currentTopic === turn.topic) {
        relevanceScore += 0.5;
      }

      // Boost for shared entities
      const sharedEntities = turn.entities.filter(e =>
        queryKeywords.includes(e.toLowerCase())
      );
      relevanceScore += sharedEntities.length * 0.2;

      // Recency boost
      const ageInMinutes = (Date.now() - turn.timestamp) / (1000 * 60);
      const recencyScore = Math.max(0, 1 - (ageInMinutes / this.contextDecayMinutes));
      relevanceScore += recencyScore * 0.3;

      return { ...turn, relevanceScore };
    });

    // Sort by relevance and return top N
    const relevant = scoredHistory
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxTurns);

    return {
      history: relevant,
      currentTopic: session.currentTopic,
      topicHistory: session.topicHistory.slice(0, 5),
      topEntities: this._getTopEntities(session.entities, 5),
      coherenceScore: session.metadata.coherenceScore,
      hasContext: relevant.length > 0
    };
  }

  /**
     * Check if query references previous context
     * @param {string} query - Current query
     * @param {object} context - Current context
     * @returns {boolean} - True if query references previous context
     */
  referencesPreviousContext(query, context) {
    const lowerQuery = query.toLowerCase();

    // Check for pronouns
    const pronouns = ['it', 'that', 'this', 'those', 'these', 'they', 'them'];
    const hasPronoun = pronouns.some(p => lowerQuery.includes(p));

    // Check for follow-up patterns
    const followUpPatterns = [
      /^(tell me more|what about|and|continue|go on|what else)/i,
      /^(what do you mean|explain that|clarify)/i,
      /^(how about|what if|why)/i,
      /\b(more|also|besides|additionally)\b/i
    ];

    const hasFollowUp = followUpPatterns.some(p => p.test(lowerQuery));

    // Check for reference to previous entities
    const hasEntityReference = context.topEntities.some(e =>
      lowerQuery.includes(e.entity.toLowerCase())
    );

    return hasPronoun || hasFollowUp || hasEntityReference;
  }

  /**
     * Resolve references in query using context
     * @param {string} query - Query with potential references
     * @param {object} context - Current context
     * @returns {string} - Query with resolved references
     */
  resolveReferences(query, context) {
    let resolved = query;
    const lowerQuery = query.toLowerCase();

    // Get top entity to replace pronouns with
    const topEntity = context.topEntities[0]?.entity;
    if (!topEntity) {
      return resolved;
    }

    // Replace pronouns with top entity
    const pronouns = ['it', 'that', 'this', 'those', 'these'];
    for (const pronoun of pronouns) {
      const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      resolved = resolved.replace(regex, topEntity);
    }

    return resolved;
  }

  /**
     * Get session summary
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @returns {object} - Session summary
     */
  getSessionSummary(userId, sessionId) {
    const session = this.getSession(userId, sessionId);

    return {
      userId: userId,
      sessionId: sessionId,
      turnCount: session.metadata.turnCount,
      currentTopic: session.currentTopic,
      topicHistory: session.topicHistory.slice(0, 5),
      entityCount: session.entities.size,
      topEntities: this._getTopEntities(session.entities, 5),
      coherenceScore: session.metadata.coherenceScore,
      topicDrifts: session.metadata.topicDrifts,
      lastIntent: session.context.lastIntent,
      waitingForFollowUp: session.context.waitingForFollowUp,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt
    };
  }

  /**
     * Get all sessions for a user
     * @param {string} userId - User identifier
     * @returns {Array} - Session summaries
     */
  getUserSessions(userId) {
    const userSessions = this.sessions.get(userId);
    if (!userSessions) {
      return [];
    }

    return Array.from(userSessions.entries()).map(([sessionId, session]) =>
      this.getSessionSummary(userId, sessionId)
    );
  }

  /**
     * Clear a session
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     */
  clearSession(userId, sessionId) {
    const userSessions = this.sessions.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
    }
  }

  /**
     * Clear all sessions for a user
     * @param {string} userId - User identifier
     */
  clearUserSessions(userId) {
    this.sessions.delete(userId);
    this.globalContext.userTopics.delete(userId);
    this.globalContext.userEntities.delete(userId);
  }

  /**
     * Get global context summary
     * @returns {object} - Global context summary
     */
  getGlobalContextSummary() {
    const totalSessions = Array.from(this.sessions.values())
      .reduce((sum, userSessions) => sum + userSessions.size, 0);

    return {
      totalUsers: this.sessions.size,
      totalSessions: totalSessions,
      recentTopics: this.globalContext.recentTopics.slice(0, 10),
      topicTransitions: Array.from(this.topicTransitions.entries())
        .slice(0, 10)
        .map(([topic, nextTopics]) => ({
          topic,
          nextTopics: nextTopics.slice(0, 5)
        }))
    };
  }

  /**
     * Extract topic from query
     * @private
     */
  _extractTopic(query) {
    if (!query || typeof query !== 'string') {
      return null;
    }

    // Split by whitespace and strip punctuation from each word
    const words = query.toLowerCase().split(/\s+/).map(word =>
      word.replace(/[?!.;,]/g, '').trim()
    );
    const stopWords = new Set([
      'what', 'how', 'why', 'where', 'when', 'who', 'which', 'is', 'are',
      'was', 'were', 'the', 'a', 'an', 'tell', 'me', 'about', 'and', 'or',
      'to', 'in', 'of', 'for', 'with', 'on', 'at', 'from', 'by'
    ]);

    for (const word of words) {
      if (!stopWords.has(word) && word.length > 2) {
        return word;
      }
    }

    return null;
  }

  /**
     * Extract entities from query
     * @private
     */
  _extractEntities(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const entities = [];
    const words = query.match(/\b[\w'-]+\b/g) || [];

    const stopWords = new Set([
      'what', 'how', 'why', 'where', 'when', 'who', 'which', 'is', 'are',
      'was', 'were', 'the', 'a', 'an', 'tell', 'me', 'about', 'and', 'or',
      'to', 'in', 'of', 'for', 'with', 'on', 'at', 'from', 'by'
    ]);

    // Extract capitalized words
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      if (word.length > 2 && /^[A-Z][a-z]+$/.test(word) && !stopWords.has(lowerWord)) {
        entities.push(lowerWord);
      }
    }

    // Extract quoted phrases
    const quoted = query.match(/"([^"]+)"/g);
    if (quoted) {
      for (const phrase of quoted) {
        entities.push(phrase.replace(/"/g, '').toLowerCase());
      }
    }

    return entities;
  }

  /**
     * Extract keywords from query
     * @private
     */
  _extractKeywords(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const stopWords = new Set([
      'what', 'how', 'why', 'where', 'when', 'who', 'which', 'is', 'are',
      'was', 'were', 'the', 'a', 'an', 'tell', 'me', 'about', 'and', 'or',
      'to', 'in', 'of', 'for', 'with', 'on', 'at', 'from', 'by'
    ]);

    const words = query.toLowerCase().split(/\s+/);
    return words.filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
     * Check if query is a follow-up question
     * @private
     */
  _isFollowUpQuestion(query) {
    const patterns = [
      /^(tell me more|what about|and|continue|go on|what else)/i,
      /^(what do you mean|explain that|clarify)/i,
      /^(how about|what if|why)/i,
      /\b(it|that|this|those|these)\b/i
    ];

    return patterns.some(p => p.test(query));
  }

  /**
     * Get top N entities from entity map
     * @private
     */
  _getTopEntities(entityMap, n) {
    const sorted = Array.from(entityMap.entries())
      .sort((a, b) => b[1] - a[1]);

    return sorted.slice(0, n).map(([entity, count]) => ({ entity, count }));
  }

  /**
     * Update global context
     * @private
     */
  _updateGlobalContext(userId, topic, entities) {
    // Update user topics
    if (topic) {
      const userTopics = this.globalContext.userTopics.get(userId) || [];
      userTopics.unshift(topic);
      if (userTopics.length > this.maxTopicHistory) {
        userTopics.pop();
      }
      this.globalContext.userTopics.set(userId, userTopics);

      // Update recent topics (across all users)
      this.globalContext.recentTopics.unshift({
        topic: topic,
        userId: userId,
        timestamp: Date.now()
      });
      if (this.globalContext.recentTopics.length > 50) {
        this.globalContext.recentTopics.pop();
      }
    }

    // Update user entities
    if (entities.length > 0) {
      const userEntities = this.globalContext.userEntities.get(userId) || new Map();
      for (const entity of entities) {
        const count = userEntities.get(entity) || 0;
        userEntities.set(entity, count + 1);
      }
      this.globalContext.userEntities.set(userId, userEntities);
    }
  }

  /**
     * Record topic transition for drift analysis
     * @private
     */
  _recordTopicTransition(fromTopic, toTopic) {
    if (!fromTopic || !toTopic) {
      return;
    }

    const transitions = this.topicTransitions.get(fromTopic) || [];
    transitions.unshift({
      to: toTopic,
      timestamp: Date.now()
    });

    // Keep only last 10 transitions
    if (transitions.length > 10) {
      transitions.pop();
    }

    this.topicTransitions.set(fromTopic, transitions);
  }

  /**
     * Export conversation manager state
     */
  exportState() {
    const sessionsExport = {};
    for (const [userId, userSessions] of this.sessions) {
      sessionsExport[userId] = {};
      for (const [sessionId, session] of userSessions) {
        sessionsExport[userId][sessionId] = {
          ...session,
          entities: Array.from(session.entities.entries())
        };
      }
    }

    return {
      sessions: sessionsExport,
      globalContext: {
        userTopics: Array.from(this.globalContext.userTopics.entries()),
        userEntities: Array.from(this.globalContext.userEntities.entries()).map(([userId, entities]) => ({
          userId,
          entities: Array.from(entities.entries())
        })),
        recentTopics: this.globalContext.recentTopics
      },
      topicTransitions: Array.from(this.topicTransitions.entries()),
      exportedAt: new Date().toISOString()
    };
  }

  /**
     * Import conversation manager state
     */
  importState(state) {
    if (!state) {
      return;
    }

    // Import sessions
    if (state.sessions) {
      this.sessions.clear();
      for (const [userId, userSessions] of Object.entries(state.sessions)) {
        const userSessionsMap = new Map();
        for (const [sessionId, session] of Object.entries(userSessions)) {
          userSessionsMap.set(sessionId, {
            ...session,
            entities: new Map(session.entities)
          });
        }
        this.sessions.set(userId, userSessionsMap);
      }
    }

    // Import global context
    if (state.globalContext) {
      if (state.globalContext.userTopics) {
        this.globalContext.userTopics = new Map(state.globalContext.userTopics);
      }
      if (state.globalContext.userEntities) {
        this.globalContext.userEntities = new Map(
          state.globalContext.userEntities.map(item => [item.userId, new Map(item.entities)])
        );
      }
      if (state.globalContext.recentTopics) {
        this.globalContext.recentTopics = state.globalContext.recentTopics;
      }
    }

    if (state.topicTransitions) {
      this.topicTransitions = new Map(state.topicTransitions);
    }
  }
}

module.exports = { ConversationManager };
