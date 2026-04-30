/**
 * Conversation Context - Multi-turn conversation management
 *
 * Provides:
 * - Conversation history tracking (last 5 turns)
 * - Entity tracking with mention counts
 * - Follow-up question detection
 * - Pronoun resolution (it, that, those)
 */

class ConversationContext {
  constructor(userId, sessionId, options = {}) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.maxHistory = options.maxHistory || 5;
    this.maxEntities = options.maxEntities || 20;

    this.history = [];
    this.entities = new Map();
    this.context = {
      previousTopics: [],
      currentDomain: null,
      waitingForFollowUp: false,
      lastIntent: null
    };

    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  /**
     * Update context with new query and response
     * @param {string} query - User query
     * @param {string} response - System response
     * @param {object} metadata - Additional metadata (intent, model, etc.)
     */
  update(query, response, metadata = {}) {
    const now = Date.now();
    this.updatedAt = now;

    // Add to history
    this.history.push({
      query,
      response,
      intent: metadata.intent || 'GeneralQuery',
      model: metadata.model || 'unknown',
      complexity: metadata.complexity || 0,
      timestamp: now,
      duration: metadata.duration || 0
    });

    // Trim history to max size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Extract and track entities
    const resolvedQuery = this.resolvePronouns(query);
    this.extractEntities(resolvedQuery);

    // Update context
    if (metadata.intent) {
      this.context.lastIntent = metadata.intent;
      this.context.waitingForFollowUp = this.isFollowUpIntent(metadata.intent);
    }

    // Update previous topics (keep last 3)
    const topic = this.extractTopic(query);
    if (topic) {
      this.context.previousTopics.unshift(topic);
      if (this.context.previousTopics.length > 3) {
        this.context.previousTopics.pop();
      }
    }
  }

  /**
     * Extract entities from query
     * @param {string} query - Query text
     */
  extractEntities(query) {
    if (!query || typeof query !== 'string') {
      return;
    }

    const counts = new Map();
    const quotedPhrases = new Set();
    const tokens = query.match(/\b[\w'-]+\b/g) || [];

    const techTerms = [
      'javascript', 'python', 'java', 'react', 'angular', 'vue',
      'node', 'database', 'api', 'http', 'json', 'xml',
      'machine learning', 'ai', 'blockchain', 'quantum',
      'algorithm', 'protocol', 'server', 'client'
    ];

    const techTermsSingle = new Set(
      techTerms.filter(term => !term.includes(' '))
    );
    const techTermsMulti = techTerms.filter(term => term.includes(' '));
    const stopWords = new Set([
      'what', 'how', 'why', 'where', 'when', 'who', 'which', 'is', 'are',
      'was', 'were', 'the', 'a', 'an', 'tell', 'me', 'about', 'and', 'or',
      'to', 'in', 'of'
    ]);

    // Extract capitalized words and single-word tech terms
    for (const token of tokens) {
      const lowerToken = token.toLowerCase();
      const isTechTerm = techTermsSingle.has(lowerToken);
      if (token.length <= 2 && !isTechTerm) {
        continue;
      }
      const isCapitalized = /^[A-Z][a-z]+$/.test(token);
      if (stopWords.has(lowerToken)) {
        continue;
      }
      if (isCapitalized || isTechTerm) {
        counts.set(lowerToken, (counts.get(lowerToken) || 0) + 1);
      }
    }

    // Extract quoted phrases
    const quoted = query.match(/"([^"]+)"/g);
    if (quoted) {
      for (const phrase of quoted) {
        const cleaned = phrase.replace(/"/g, '').trim().toLowerCase();
        if (!cleaned) {
          continue;
        }
        counts.set(cleaned, (counts.get(cleaned) || 0) + 1);
        quotedPhrases.add(cleaned);
      }
    }

    // Extract multi-word tech terms without double-counting quoted phrases
    const lowerQuery = query.toLowerCase();
    const escapeRegExp = value => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    for (const term of techTermsMulti) {
      if (quotedPhrases.has(term)) {
        continue;
      }
      const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
      const matches = lowerQuery.match(regex);
      if (matches) {
        counts.set(term, (counts.get(term) || 0) + matches.length);
      }
    }

    for (const [entity, count] of counts.entries()) {
      this.incrementEntity(entity, count);
    }
  }

  /**
     * Increment entity count
     * @param {string} entity - Entity name
     */
  incrementEntity(entity, count = 1) {
    const key = entity.toLowerCase();
    const current = this.entities.get(key) || 0;
    this.entities.set(key, current + count);

    // Limit entity count
    if (this.entities.size > this.maxEntities) {
      this.removeLeastMentionedEntity();
    }
  }

  /**
     * Remove least mentioned entity
     */
  removeLeastMentionedEntity() {
    let minKey = null;
    let minCount = Infinity;

    for (const [key, count] of this.entities.entries()) {
      if (count < minCount) {
        minCount = count;
        minKey = key;
      }
    }

    if (minKey) {
      this.entities.delete(minKey);
    }
  }

  /**
     * Extract main topic from query
     * @param {string} query - Query text
     * @returns {string|null} - Topic or null
     */
  extractTopic(query) {
    // Simple topic extraction: first noun phrase
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = new Set(['what', 'how', 'why', 'where', 'when', 'who', 'is', 'are', 'the', 'a', 'an', 'tell', 'me', 'about']);

    for (let i = 0; i < words.length; i++) {
      if (!stopWords.has(words[i]) && words[i].length > 2) {
        return words[i];
      }
    }

    return null;
  }

  /**
     * Check if intent is a follow-up intent
     * @param {string} intent - Intent name
     * @returns {boolean} - True if follow-up intent
     */
  isFollowUpIntent(intent) {
    return intent === 'FollowUpIntent' || intent === 'ClarificationIntent';
  }

  /**
     * Check if query is a follow-up question
     * @param {string} query - Query text
     * @returns {boolean} - True if follow-up
     */
  isFollowUp(query) {
    const followUpPatterns = [
      /^(tell me more|what about|and|continue|go on|what else)/i,
      /^(what do you mean|explain that|clarify)/i,
      /^(how about|what if|why)/i,
      /\b(it|that|this|those|these)\b/i
    ];

    for (const pattern of followUpPatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  /**
     * Resolve pronouns in query based on context
     * @param {string} query - Query text
     * @returns {string} - Query with resolved pronouns
     */
  resolvePronouns(query) {
    let resolved = query;
    const lowerQuery = query.toLowerCase();

    // Get most mentioned entity
    const topEntity = this.getTopEntity();
    if (!topEntity) return resolved;

    // Replace pronouns with top entity
    resolved = resolved
      .replace(/\bit\b/gi, topEntity)
      .replace(/\bthat\b/gi, topEntity)
      .replace(/\bthis\b/gi, topEntity)
      .replace(/\bthose\b/gi, topEntity)
      .replace(/\bthese\b/gi, topEntity);

    return resolved;
  }

  /**
     * Get most mentioned entity
     * @returns {string|null} - Top entity or null
     */
  getTopEntity() {
    if (this.entities.size === 0) return null;

    let maxKey = null;
    let maxCount = 0;

    for (const [key, count] of this.entities.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxKey = key;
      }
    }

    return maxKey;
  }

  /**
     * Get conversation history
     * @param {number} limit - Optional limit on entries
     * @returns {Array} - History entries
     */
  getHistory(limit = null) {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
     * Get last turn in history
     * @returns {object|null} - Last turn or null
     */
  getLastTurn() {
    if (this.history.length === 0) return null;
    return this.history[this.history.length - 1];
  }

  /**
     * Get context summary
     * @returns {object} - Context summary
     */
  getSummary() {
    return {
      userId: this.userId,
      sessionId: this.sessionId,
      historyLength: this.history.length,
      entityCount: this.entities.size,
      topEntities: this.getTopEntities(5),
      previousTopics: this.context.previousTopics,
      currentDomain: this.context.currentDomain,
      lastIntent: this.context.lastIntent,
      waitingForFollowUp: this.context.waitingForFollowUp
    };
  }

  /**
     * Get top N entities
     * @param {number} n - Number of entities
     * @returns {Array} - Top entities
     */
  getTopEntities(n) {
    const limit = Math.max(0, Number(n) || 0);
    const sorted = Array.from(this.entities.entries())
      .sort((a, b) => b[1] - a[1]);

    return sorted.slice(0, limit).map(([entity, count]) => ({ entity, count }));
  }

  /**
     * Clear context
     */
  clear() {
    this.history = [];
    this.entities.clear();
    this.context = {
      previousTopics: [],
      currentDomain: null,
      waitingForFollowUp: false,
      lastIntent: null
    };
    this.updatedAt = Date.now();
  }

  /**
     * Export context to JSON
     * @returns {object} - JSON representation
     */
  toJSON() {
    return {
      userId: this.userId,
      sessionId: this.sessionId,
      history: this.history,
      entities: Array.from(this.entities.entries()),
      context: this.context,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
     * Import context from JSON
     * @param {object} json - JSON representation
     * @returns {ConversationContext} - Context instance
     */
  static fromJSON(json) {
    const context = new ConversationContext(json.userId, json.sessionId);
    context.history = json.history || [];
    context.entities = new Map(json.entities || []);
    context.context = json.context || {};
    context.createdAt = json.createdAt || Date.now();
    context.updatedAt = json.updatedAt || Date.now();
    return context;
  }
}

module.exports = { ConversationContext };
