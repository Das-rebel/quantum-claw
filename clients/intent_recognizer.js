/**
 * Intent Recognizer - Pattern-based intent recognition with confidence scoring
 *
 * Provides:
 * - Pattern matching for intents
 * - Confidence scoring
 * - Slot extraction
 * - Context-aware recognition
 */

class Intent {
  constructor(name, patterns, handler = null, options = {}) {
    this.name = name;
    this.patterns = patterns.map(p => new RegExp(p, 'i'));
    this.handler = handler;
    this.priority = options.priority || 1;
    this.requiresContext = options.requiresContext || false;
  }

  /**
     * Test if query matches this intent
     * @param {string} query - Query text
     * @returns {object|null} - Match result or null
     */
  match(query) {
    const lowerQuery = query.toLowerCase();

    for (const pattern of this.patterns) {
      let match = query.match(pattern);
      let usedPattern = pattern;

      if (!match && pattern.source.startsWith('^')) {
        const relaxedPattern = new RegExp(pattern.source.replace(/^\^/, ''), pattern.flags);
        match = query.match(relaxedPattern);
        if (match) {
          usedPattern = relaxedPattern;
        }
      }
      if (match) {
        // Calculate confidence based on match quality
        let confidence = 0.8; // Base confidence

        // Higher confidence for exact matches at start of query
        if (match.index === 0) confidence += 0.1;

        // Higher confidence for longer patterns (more specific)
        if (pattern.source.length > 20) confidence += 0.05;

        // Higher confidence if query is short (more focused)
        if (query.split(/\s+/).length < 10) confidence += 0.05;

        return {
          intent: this.name,
          confidence: Math.min(confidence, 1),
          slots: this.extractSlots(match, query),
          pattern: usedPattern.source
        };
      }
    }

    return null;
  }

  /**
     * Extract slots from regex match
     * @param {RegExpMatchArray} match - Regex match
     * @param {string} query - Original query
     * @returns {object} - Extracted slots
     */
  extractSlots(match, query) {
    const slots = {};

    // Named groups become slots
    if (match.groups) {
      Object.assign(slots, match.groups);
    }

    // All capture groups
    for (let i = 1; i < match.length; i++) {
      if (match[i]) {
        slots[`slot${i}`] = match[i].trim();
      }
    }

    return slots;
  }
}

class IntentRecognizer {
  constructor(options = {}) {
    this.intents = new Map();
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    this.defaultIntent = options.defaultIntent || 'GeneralQuery';

    // Register built-in intents
    this.registerBuiltinIntents();
  }

  /**
     * Register built-in intents
     */
  registerBuiltinIntents() {
    // FollowUp Intent
    this.registerIntent('FollowUpIntent', [
      '^(tell me more|what about|and|continue|go on|what else|anything else)',
      '^(tell me more about|more about|continue about)',
      '\\b(and then|after that|next)\\b',
      '\\b(it|that|this|those|these)\\b.*\\?$'
    ]);

    // Clarification Intent
    this.registerIntent('ClarificationIntent', [
      '^(what do you mean|explain that|clarify)',
      '^(what does|what do you mean by|define)',
      '\\b(meaning of|definition of)\\b'
    ]);

    // Comparison Intent
    this.registerIntent('ComparisonIntent', [
      '^(compare|difference between|versus|vs)',
      '\\b(compare|vs|versus|better than|worse than)\\b',
      '\\b(difference between|differences between)\\b',
      '^(which is better|which one is)\\b'
    ]);

    // Summarization Intent
    this.registerIntent('SummarizationIntent', [
      '^(summarize|summary|give me a summary)',
      '\\b(briefly|in short|in a nutshell)\\b',
      '\\b(tldr|tl;dr)\\b'
    ]);

    // Help Intent
    this.registerIntent('HelpIntent', [
      '^(help|what can you do|how do i|how to use)',
      '\\b(how do i ask|what can i ask)\\b'
    ]);

    // Video/YouTube Intent
    this.registerIntent('VideoIntent', [
      '^(find|search|show|look for|get|watch)\\s+(videos?|youtube)',
      '\\b(youtube|video|tutorial|how\\s+to)\\s+(about|on|for)\\b',
      '\\bvideos?(\\s+(about|on|for|regarding))?\\b',
      '\\bwatch\\s+(a\\s+)?(video|tutorial)\\b',
      '\\b(content\\s+(creator|maker|channel))\\b'
    ], null, { priority: 2 });

    // Media Content Intent
    this.registerIntent('MediaIntent', [
      '\\b(review|unboxing|vlog|stream|playlist)\\b',
      '\\b(creator|channel|subscribe|like)\\b',
      '\\b(demonstration|demo|walkthrough)\\b'
    ], null, { priority: 1.5 });

    // Wikipedia/Factual Query Intent
    this.registerIntent('WikipediaIntent', [
      '\\b(wikipedia|wiki|encyclopedia|encyclopædia)\\b',
      '\\b(according to wikipedia|on wikipedia|from wikipedia|search wikipedia)\\b',
      '\\b(wikipedia entry|wiki page|wikipedia article)\\s+(for|about)\\b',
      '\\b(give me (a summary of|information about|facts about)\\w+ from wikipedia)\\b'
    ], null, { priority: 2 });
  }

  /**
     * Register a new intent
     * @param {string} name - Intent name
     * @param {Array<string>} patterns - Regex patterns
     * @param {Function} handler - Optional handler function
     * @param {object} options - Intent options
     */
  registerIntent(name, patterns, handler = null, options = {}) {
    const intent = new Intent(name, patterns, handler, options);
    this.intents.set(name, intent);
    return this;
  }

  /**
     * Unregister an intent
     * @param {string} name - Intent name
     */
  unregisterIntent(name) {
    this.intents.delete(name);
  }

  /**
     * Recognize intent from query
     * @param {string} query - Query text
     * @param {object} context - Conversation context
     * @returns {object} - Recognition result
     */
  recognize(query, context = null) {
    if (!query || typeof query !== 'string') {
      return {
        intent: this.defaultIntent,
        confidence: 0,
        slots: {}
      };
    }

    const matches = [];

    // Try to match against all intents
    for (const intent of this.intents.values()) {
      const match = intent.match(query);
      if (match) {
        matches.push({
          ...match,
          priority: intent.priority,
          requiresContext: intent.requiresContext
        });
      }
    }

    // Sort by confidence, then priority
    matches.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.priority - a.priority;
    });

    // Get best match
    let bestMatch = matches[0];

    // Apply context awareness
    if (context && bestMatch && bestMatch.requiresContext) {
      // Check if context requirements are met
      if (!this.hasRequiredContext(bestMatch, context)) {
        // Try next best match
        bestMatch = matches[1] || null;
      }
    }

    // Return best match or default
    if (bestMatch && bestMatch.confidence >= this.confidenceThreshold) {
      return {
        intent: bestMatch.intent,
        confidence: bestMatch.confidence,
        slots: bestMatch.slots,
        matchedPattern: bestMatch.pattern
      };
    }

    // Check for follow-up based on pronouns even without explicit pattern
    if (this.isPronounQuery(query) && context && context.previousTopics.length > 0) {
      return {
        intent: 'FollowUpIntent',
        confidence: 0.6,
        slots: { topic: context.previousTopics[0] }
      };
    }

    return {
      intent: this.defaultIntent,
      confidence: 0.5,
      slots: {}
    };
  }

  /**
     * Check if query contains mainly pronouns
     * @param {string} query - Query text
     * @returns {boolean} - True if pronoun query
     */
  isPronounQuery(query) {
    const pronouns = ['it', 'that', 'this', 'those', 'these', 'he', 'she', 'they'];
    const words = query.toLowerCase().split(/\s+/);
    const pronounCount = words.filter(w => pronouns.includes(w)).length;
    return pronounCount > 0 && words.length < 10;
  }

  /**
     * Check if context requirements are met
     * @param {object} match - Intent match
     * @param {object} context - Conversation context
     * @returns {boolean} - True if requirements met
     */
  hasRequiredContext(match, context) {
    if (!match.requiresContext) return true;

    // Check for previous topics
    if (match.intent === 'FollowUpIntent') {
      return context.previousTopics && context.previousTopics.length > 0;
    }

    return true;
  }

  /**
     * Get all registered intents
     * @returns {Array<string>} - Intent names
     */
  getIntents() {
    return Array.from(this.intents.keys());
  }

  /**
     * Get intent details
     * @param {string} name - Intent name
     * @returns {object|null} - Intent details
     */
  getIntent(name) {
    const intent = this.intents.get(name);
    if (!intent) return null;

    return {
      name: intent.name,
      patterns: intent.patterns.map(p => p.source),
      priority: intent.priority,
      requiresContext: intent.requiresContext
    };
  }

  /**
     * Set confidence threshold
     * @param {number} threshold - New threshold
     */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  /**
     * Get recognizer statistics
     * @returns {object} - Statistics
     */
  getStats() {
    return {
      registeredIntents: this.intents.size,
      confidenceThreshold: this.confidenceThreshold,
      defaultIntent: this.defaultIntent,
      intents: Array.from(this.intents.keys())
    };
  }

  /**
     * Batch recognize multiple queries
     * @param {Array<string>} queries - Query array
     * @param {object} context - Shared context
     * @returns {Array<object>} - Recognition results
     */
  recognizeBatch(queries, context = null) {
    return queries.map(query => this.recognize(query, context));
  }

  /**
     * Export configuration
     * @returns {object} - Configuration export
     */
  export() {
    return {
      confidenceThreshold: this.confidenceThreshold,
      defaultIntent: this.defaultIntent,
      intents: Array.from(this.intents.values()).map(intent => ({
        name: intent.name,
        patterns: intent.patterns.map(p => p.source),
        priority: intent.priority,
        requiresContext: intent.requiresContext
      }))
    };
  }

  /**
     * Import configuration
     * @param {object} config - Configuration to import
     */
  import(config) {
    if (config.confidenceThreshold !== undefined) {
      this.confidenceThreshold = config.confidenceThreshold;
    }

    if (config.defaultIntent) {
      this.defaultIntent = config.defaultIntent;
    }

    if (config.intents) {
      this.intents.clear();
      for (const intentConfig of config.intents) {
        this.registerIntent(
          intentConfig.name,
          intentConfig.patterns,
          null,
          {
            priority: intentConfig.priority,
            requiresContext: intentConfig.requiresContext
          }
        );
      }
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create intent recognizer singleton
 * @param {object} options - Configuration options
 * @returns {IntentRecognizer} - Intent recognizer instance
 */
function getIntentRecognizer(options) {
  if (!instance) {
    instance = new IntentRecognizer(options);
  }
  return instance;
}

module.exports = { IntentRecognizer, Intent, getIntentRecognizer };
