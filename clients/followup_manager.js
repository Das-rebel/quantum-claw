/**
 * Follow-up Manager - Proactive Follow-up Question Management
 *
 * Provides:
 * - Track open questions and unresolved queries
 * - Schedule proactive follow-ups based on context
 * - Priority-based queue for follow-up questions
 * - Intelligent follow-up suggestion generation
 */

class FollowupManager {
  constructor(options = {}) {
    this.maxQueueSize = options.maxQueueSize || 10;
    this.maxAgeMinutes = options.maxAgeMinutes || 60;
    this.priorityWeights = options.priorityWeights || {
      urgent: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.3
    };

    // Follow-up queue
    this.queue = new Map(); // userId -> Array of follow-ups

    // Follow-up patterns
    this.followupPatterns = {
      clarification: [
        'Would you like me to clarify that?',
        'Do you want more details about this?',
        'Should I explain that further?'
      ],
      expansion: [
        'Would you like to know more about this?',
        'Should I explore related topics?',
        'Want me to go deeper into this?'
      ],
      action: [
        'Would you like me to help you with the next steps?',
        'Do you need guidance on what to do next?',
        'Should I provide some action items?'
      ],
      alternative: [
        'Would you like to explore a different approach?',
        'Should I consider other options?',
        'Want to see alternative solutions?'
      ]
    };

    // Priority keywords
    this.priorityKeywords = {
      urgent: ['urgent', 'emergency', 'critical', 'immediately', 'asap', 'right now'],
      high: ['important', 'priority', 'soon', 'quickly', 'help needed'],
      medium: ['want', 'need', 'looking for', 'interested in'],
      low: ['maybe', 'consider', 'think about', 'wondering']
    };
  }

  /**
     * Add a follow-up to the queue
     * @param {string} userId - User identifier
     * @param {string} sessionId - Session identifier
     * @param {object} followup - Follow-up object
     * @returns {string} - Follow-up ID or false if failed
     */
  addFollowup(userId, sessionId, followup) {
    if (!followup || !followup.question) {
      return false;
    }

    // Ensure user queue exists
    if (!this.queue.has(userId)) {
      this.queue.set(userId, []);
    }

    const userQueue = this.queue.get(userId);

    // Create follow-up entry
    const id = this._generateId();
    const entry = {
      id: id,
      userId: userId,
      sessionId: sessionId,
      question: followup.question,
      type: followup.type || 'expansion',
      priority: this._determinePriority(followup),
      context: followup.context || {},
      createdAt: Date.now(),
      lastAttemptedAt: null,
      attemptCount: 0,
      status: 'pending'
    };

    // Add to queue
    userQueue.push(entry);

    // Sort by priority
    this._sortQueue(userQueue);

    // Trim queue if needed
    if (userQueue.length > this.maxQueueSize) {
      userQueue.shift();
    }

    console.log(`[FollowupManager] Added follow-up for ${userId}: ${entry.question.substring(0, 50)}...`);

    return id;
  }

  /**
     * Get next follow-up for a user
     * @param {string} userId - User identifier
     * @returns {object|null} - Next follow-up or null
     */
  getNextFollowup(userId) {
    if (!this.queue.has(userId)) {
      return null;
    }

    const userQueue = this.queue.get(userId);

    // Filter for pending follow-ups
    const pending = userQueue.filter(f => f.status === 'pending');

    if (pending.length === 0) {
      return null;
    }

    // Get highest priority follow-up
    const next = pending[0];

    // Mark as attempted
    next.lastAttemptedAt = Date.now();
    next.attemptCount++;

    return next;
  }

  /**
     * Get all pending follow-ups for a user
     * @param {string} userId - User identifier
     * @returns {Array} - Array of pending follow-ups
     */
  getPendingFollowups(userId) {
    if (!this.queue.has(userId)) {
      return [];
    }

    const userQueue = this.queue.get(userId);
    return userQueue.filter(f => f.status === 'pending');
  }

  /**
     * Mark follow-up as completed
     * @param {string} userId - User identifier
     * @param {string} followupId - Follow-up identifier
     * @returns {boolean} - Success status
     */
  markCompleted(userId, followupId) {
    if (!this.queue.has(userId)) {
      return false;
    }

    const userQueue = this.queue.get(userId);
    const followup = userQueue.find(f => f.id === followupId);

    if (!followup) {
      return false;
    }

    followup.status = 'completed';
    followup.completedAt = Date.now();

    console.log(`[FollowupManager] Marked follow-up ${followupId} as completed`);

    return true;
  }

  /**
     * Mark follow-up as dismissed
     * @param {string} userId - User identifier
     * @param {string} followupId - Follow-up identifier
     * @returns {boolean} - Success status
     */
  markDismissed(userId, followupId) {
    if (!this.queue.has(userId)) {
      return false;
    }

    const userQueue = this.queue.get(userId);
    const followup = userQueue.find(f => f.id === followupId);

    if (!followup) {
      return false;
    }

    followup.status = 'dismissed';
    followup.dismissedAt = Date.now();

    console.log(`[FollowupManager] Marked follow-up ${followupId} as dismissed`);

    return true;
  }

  /**
     * Suggest follow-up based on context
     * @param {string} userId - User identifier
     * @param {string} query - User query
     * @param {string} response - System response
     * @param {object} context - Additional context
     * @returns {string|null} - Suggested follow-up or null
     */
  suggestFollowup(userId, query, response, context = {}) {
    // Determine if follow-up is appropriate
    const shouldSuggest = this._shouldSuggestFollowup(query, response, context);

    if (!shouldSuggest) {
      return null;
    }

    // Determine follow-up type
    const type = this._determineFollowupType(query, response, context);

    // Get suggestion template
    const templates = this.followupPatterns[type] || this.followupPatterns.expansion;
    const suggestion = templates[Math.floor(Math.random() * templates.length)];

    // Add to queue
    this.addFollowup(userId, context.sessionId || 'default', {
      question: suggestion,
      type: type,
      context: {
        originalQuery: query,
        response: response,
        ...context
      }
    });

    return suggestion;
  }

  /**
     * Determine if follow-up should be suggested
     * @private
     */
  _shouldSuggestFollowup(query, response, context) {
    // Don't suggest if response is very long (already comprehensive)
    if (response && response.split(/\s+/).length > 120) {
      return false;
    }

    // Don't suggest if user is in a hurry
    if (context.isUrgent) {
      return false;
    }

    // Don't suggest if this is a simple factual question
    const simplePatterns = [
      /^(what|who|where|when)\s+(is|was|are|were)\s+/i,
      /^(how many|how much)\s+/i,
      /^(yes|no)\s*$/i
    ];

    if (simplePatterns.some(p => p.test(query.trim()))) {
      return false;
    }

    // Don't suggest if user has many pending follow-ups
    const pending = this.getPendingFollowups(context.userId || '');
    if (pending.length >= 3) {
      return false;
    }

    return true;
  }

  /**
     * Determine follow-up type
     * @private
     */
  _determineFollowupType(query, response, context) {
    const lowerQuery = query.toLowerCase();
    const lowerResponse = response ? response.toLowerCase() : '';

    // Check for clarification needs
    if (lowerQuery.includes('confused') ||
            lowerQuery.includes('don\'t understand') ||
            lowerQuery.includes('what do you mean')) {
      return 'clarification';
    }

    // Check for action needs
    if (lowerQuery.includes('how to') ||
            lowerQuery.includes('help me') ||
            lowerQuery.includes('what should i do') ||
            lowerResponse.includes('steps') ||
            lowerResponse.includes('you can')) {
      return 'action';
    }

    // Check for alternative needs
    if (lowerQuery.includes('other') ||
            lowerQuery.includes('different') ||
            lowerQuery.includes('better') ||
            lowerQuery.includes('alternative')) {
      return 'alternative';
    }

    // Default to expansion
    return 'expansion';
  }

  /**
     * Determine priority of follow-up
     * @private
     */
  _determinePriority(followup) {
    const question = followup.question ? followup.question.toLowerCase() : '';
    const context = followup.context || {};

    // Check for priority keywords
    for (const [priority, keywords] of Object.entries(this.priorityKeywords)) {
      for (const keyword of keywords) {
        if (question.includes(keyword)) {
          return priority;
        }
      }
    }

    // Check context for urgency
    if (context.isUrgent || context.priority === 'urgent') {
      return 'urgent';
    }

    // Default to medium
    return 'medium';
  }

  /**
     * Sort queue by priority
     * @private
     */
  _sortQueue(queue) {
    const weights = this.priorityWeights;

    queue.sort((a, b) => {
      // First by priority
      const weightA = weights[a.priority] || 0.5;
      const weightB = weights[b.priority] || 0.5;

      if (weightA !== weightB) {
        return weightB - weightA; // Higher priority first
      }

      // Then by creation time (older first)
      return a.createdAt - b.createdAt;
    });
  }

  /**
     * Clean up old follow-ups
     * @param {string} userId - User identifier (optional, cleans all if not provided)
     */
  cleanup(userId = null) {
    const now = Date.now();
    const maxAge = this.maxAgeMinutes * 60 * 1000;

    if (userId) {
      // Clean up specific user
      if (this.queue.has(userId)) {
        const userQueue = this.queue.get(userId);
        const originalLength = userQueue.length;

        const filtered = userQueue.filter(f => {
          const age = now - f.createdAt;
          return age < maxAge;
        });

        this.queue.set(userId, filtered);

        const removed = originalLength - filtered.length;
        if (removed > 0) {
          console.log(`[FollowupManager] Cleaned up ${removed} old follow-ups for ${userId}`);
        }
      }
    } else {
      // Clean up all users
      for (const [uid, userQueue] of this.queue) {
        this.cleanup(uid);
      }
    }
  }

  /**
     * Get follow-up statistics
     * @param {string} userId - User identifier (optional, global stats if not provided)
     * @returns {object} - Statistics
     */
  getStats(userId = null) {
    let stats = {
      total: 0,
      pending: 0,
      completed: 0,
      dismissed: 0,
      byPriority: {
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      byType: {
        clarification: 0,
        expansion: 0,
        action: 0,
        alternative: 0
      }
    };

    if (userId) {
      if (this.queue.has(userId)) {
        const userQueue = this.queue.get(userId);
        this._calculateStats(userQueue, stats);
      }
    } else {
      // Global stats
      for (const userQueue of this.queue.values()) {
        this._calculateStats(userQueue, stats);
      }
    }

    return stats;
  }

  /**
     * Calculate statistics for a queue
     * @private
     */
  _calculateStats(queue, stats) {
    for (const followup of queue) {
      stats.total++;

      if (followup.status === 'pending') stats.pending++;
      else if (followup.status === 'completed') stats.completed++;
      else if (followup.status === 'dismissed') stats.dismissed++;

      if (stats.byPriority[followup.priority] !== undefined) {
        stats.byPriority[followup.priority]++;
      }

      if (stats.byType[followup.type] !== undefined) {
        stats.byType[followup.type]++;
      }
    }
  }

  /**
     * Generate unique ID
     * @private
     */
  _generateId() {
    return `followup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
     * Clear all follow-ups for a user
     * @param {string} userId - User identifier
     */
  clearUser(userId) {
    this.queue.delete(userId);
    console.log(`[FollowupManager] Cleared all follow-ups for ${userId}`);
  }

  /**
     * Export follow-up manager state
     */
  exportState() {
    const state = {};

    for (const [userId, userQueue] of this.queue) {
      state[userId] = userQueue;
    }

    return {
      queue: state,
      exportedAt: new Date().toISOString()
    };
  }

  /**
     * Import follow-up manager state
     */
  importState(state) {
    if (!state || !state.queue) {
      return;
    }

    this.queue.clear();

    for (const [userId, userQueue] of Object.entries(state.queue)) {
      this.queue.set(userId, userQueue);
    }

    console.log('[FollowupManager] Imported state');
  }
}

module.exports = { FollowupManager };
