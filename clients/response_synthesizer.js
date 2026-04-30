/**
 * Response Synthesizer - Multi-Source Response Aggregator and Formatter
 *
 * Aggregates results from multiple sources (news, arxiv, reddit, AI providers)
 * and synthesizes them into a coherent, voice-optimized response.
 *
 * Features:
 * - Weighted prioritization based on source authority and recency
 * - Clear source attribution for each fact
 * - Conflict resolution with confidence scores
 * - Voice-optimized output (150 words max)
 * - Natural language patterns for conversational delivery
 */

class ResponseSynthesizer {
  constructor(options = {}) {
    this.maxWords = options.maxWords || 150;
    this.maxSentences = options.maxSentences || 8;
    this.confidenceThreshold = options.confidenceThreshold || 0.3;

    // Source authority weights (higher = more trusted)
    this.sourceWeights = {
      arxiv: 1.0,           // Peer-reviewed research
      news: 0.85,           // Journalism
      reddit: 0.6,          // User discussions
      twitter: 0.55,        // Social media
      ai: 0.75,             // AI-generated insights
      wikipedia: 0.9,       // Encyclopedia
      youtube: 0.7,         // Video content
      video: 0.7,           // General video content
      general: 0.5         // Default for unknown sources
    };

    // Recency decay (results older than this get lower priority)
    this.recencyDecayDays = options.recencyDecayDays || 7;

    // Source attribution templates
    this.attributionTemplates = {
      arxiv: ['According to research on Arxiv', 'Studies on Arxiv suggest', 'Arxiv research indicates'],
      news: ['News reports indicate', 'According to news sources', 'Recent news reports'],
      reddit: ['Reddit users discuss', 'On Reddit, users mention', 'Reddit discussions highlight'],
      twitter: ['On Twitter, people are saying', 'Twitter users note', 'Social media mentions'],
      ai: ['AI analysis suggests', 'According to AI insights', 'AI analysis indicates'],
      wikipedia: ['Wikipedia states', 'According to Wikipedia', 'Wikipedia information shows'],
      youtube: ['YouTube videos show', 'On YouTube, creators explain', 'Video content demonstrates'],
      video: ['Videos indicate', 'According to video content', 'Video creators mention'],
      general: ['Sources indicate', 'Information suggests', 'Reports mention']
    };

    // Voice transition phrases
    this.voiceTransitions = [
      'also',
      'additionally',
      'furthermore',
      'in addition',
      'meanwhile',
      'on the other hand',
      'similarly'
    ];

    // Confidence phrase templates
    this.confidencePhrases = {
      high: [
        'confidently',
        'clearly',
        'definitely',
        'strongly indicates'
      ],
      medium: [
        'suggests',
        'appears',
        'likely',
        'probably'
      ],
      low: [
        'might',
        'possibly',
        'could be',
        'appears uncertain'
      ],
      conflict: [
        'however',
        'on the other hand',
        'conversely',
        'some sources disagree'
      ]
    };
  }

  /**
     * Main synthesis function - aggregate and format multi-source results
     *
     * @param {string} query - The original query
     * @param {Array} sources - Array of source results with metadata
     * @param {Object} options - Synthesis options
     * @returns {Promise<Object>} Synthesized response with metadata
     */
  async synthesizeResponse(query, sources = [], options = {}) {
    const startTime = Date.now();

    // Validate inputs
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid query: must be a non-empty string');
    }

    if (!Array.isArray(sources)) {
      throw new Error('Invalid sources: must be an array');
    }

    // Normalize and validate source data
    const normalizedSources = this._normalizeSources(sources);

    // If no sources, return fallback response
    if (normalizedSources.length === 0) {
      return {
        response: this._generateFallbackResponse(query),
        confidence: 0,
        sources: [],
        wordCount: 0,
        conflicts: [],
        metadata: {
          synthesisTime: Date.now() - startTime,
          sourceCount: 0,
          hasConflicts: false
        }
      };
    }

    // Calculate priority scores for each source
    const scoredSources = this._calculateScores(normalizedSources, query);

    // Sort by priority score
    scoredSources.sort((a, b) => b.priorityScore - a.priorityScore);

    // Detect conflicts between sources
    const conflicts = this._detectConflicts(scoredSources);

    // Select top sources based on priority
    const topSources = this._selectTopSources(scoredSources, conflicts, options);

    // Build synthesized response
    const response = this._buildResponse(query, topSources, conflicts, options);

    // Optimize for voice delivery
    const voiceOptimized = this._optimizeForVoice(response);

    // Final word count check
    const wordCount = this._countWords(voiceOptimized);

    // If still too long, truncate
    const finalResponse = wordCount > this.maxWords
      ? this._truncateToWordLimit(voiceOptimized, this.maxWords)
      : voiceOptimized;

    // Calculate overall confidence
    const overallConfidence = this._calculateOverallConfidence(topSources, conflicts);

    return {
      response: finalResponse,
      confidence: overallConfidence,
      sources: topSources.map(s => ({
        type: s.source,
        content: s.content,
        score: s.priorityScore,
        confidence: s.confidence
      })),
      wordCount: this._countWords(finalResponse),
      conflicts: conflicts,
      metadata: {
        synthesisTime: Date.now() - startTime,
        sourceCount: normalizedSources.length,
        usedSourceCount: topSources.length,
        hasConflicts: conflicts.length > 0,
        topSourceType: topSources[0]?.source || 'none'
      }
    };
  }

  /**
     * Normalize source data to ensure consistent format
     * @private
     */
  _normalizeSources(sources) {
    return sources
      .filter(source => source && source.content)
      .map(source => ({
        content: String(source.content),
        source: (source.source || source.type || 'general').toLowerCase(),
        confidence: this._normalizeConfidence(source.confidence),
        timestamp: source.timestamp || source.date || new Date().toISOString(),
        relevance: source.relevance || source.score || 0.5,
        url: source.url || null,
        author: source.author || null
      }));
  }

  /**
     * Normalize confidence value to 0-1 range
     * @private
     */
  _normalizeConfidence(confidence) {
    if (typeof confidence === 'number') {
      return Math.max(0, Math.min(1, confidence));
    }
    if (typeof confidence === 'string') {
      const lower = confidence.toLowerCase();
      if (lower.includes('high')) return 0.8;
      if (lower.includes('medium')) return 0.5;
      if (lower.includes('low')) return 0.3;
    }
    return 0.5; // Default medium confidence
  }

  /**
     * Calculate priority scores for each source
     * @private
     */
  _calculateScores(sources, query) {
    return sources.map(source => {
      // Base score from relevance
      let score = source.relevance || 0.5;

      // Apply source authority weight
      const sourceWeight = this.sourceWeights[source.source] || this.sourceWeights.general;
      score *= sourceWeight;

      // Apply recency bonus
      const recencyBonus = this._calculateRecencyBonus(source.timestamp);
      score *= (1 + recencyBonus);

      // Apply confidence modifier
      score *= (0.5 + source.confidence);

      // Apply content quality metrics
      const qualityBonus = this._calculateContentQuality(source.content);
      score *= (1 + qualityBonus);

      // Query relevance bonus (keyword matching)
      const queryBonus = this._calculateQueryRelevance(source.content, query);
      score *= (1 + queryBonus);

      return {
        ...source,
        priorityScore: Math.round(score * 100) / 100
      };
    });
  }

  /**
     * Calculate recency bonus based on timestamp
     * @private
     */
  _calculateRecencyBonus(timestamp) {
    try {
      const sourceDate = new Date(timestamp);
      const now = new Date();
      const daysDiff = (now - sourceDate) / (1000 * 60 * 60 * 24);

      if (daysDiff < 1) return 0.3; // Very recent
      if (daysDiff < 3) return 0.2; // Recent
      if (daysDiff < 7) return 0.1; // This week
      if (daysDiff < 30) return 0.05; // This month
      return 0; // Older
    } catch (error) {
      return 0; // Invalid timestamp
    }
  }

  /**
     * Calculate content quality bonus
     * @private
     */
  _calculateContentQuality(content) {
    let bonus = 0;

    // Length bonus (prefer substantial content)
    const wordCount = content.split(/\s+/).length;
    if (wordCount > 20 && wordCount < 100) bonus += 0.1;
    else if (wordCount >= 100) bonus += 0.15;

    // Sentence structure bonus (prefer well-structured content)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 1 && sentences.length < 5) bonus += 0.05;

    // Penalize very short content
    if (wordCount < 5) bonus -= 0.2;

    return Math.max(-0.2, Math.min(0.2, bonus));
  }

  /**
     * Calculate query relevance based on keyword matching
     * @private
     */
  _calculateQueryRelevance(content, query) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const contentLower = content.toLowerCase();

    let matchCount = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matchCount++;
      }
    }

    // Bonus for multiple keyword matches
    if (queryWords.length > 0) {
      const matchRatio = matchCount / queryWords.length;
      return matchRatio * 0.3; // Max 30% bonus
    }

    return 0;
  }

  /**
     * Detect conflicts between sources
     * @private
     */
  _detectConflicts(sources) {
    const conflicts = [];

    // Compare each pair of sources
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const sourceA = sources[i];
        const sourceB = sources[j];

        const conflict = this._compareSources(sourceA, sourceB);
        if (conflict) {
          conflicts.push({
            sourceA: sourceA.source,
            sourceB: sourceB.source,
            contentA: sourceA.content,
            contentB: sourceB.content,
            severity: conflict.severity,
            description: conflict.description
          });
        }
      }
    }

    return conflicts;
  }

  /**
     * Compare two sources for conflicts
     * @private
     */
  _compareSources(sourceA, sourceB) {
    const contentA = sourceA.content.toLowerCase();
    const contentB = sourceB.content.toLowerCase();

    // Check for direct contradictions (opposite meanings)
    const contradictions = [
      ['positive', 'negative'],
      ['yes', 'no'],
      ['good', 'bad'],
      ['true', 'false'],
      ['success', 'failure'],
      ['effective', 'ineffective'],
      ['safe', 'dangerous'],
      ['beneficial', 'harmful']
    ];

    for (const [wordA, wordB] of contradictions) {
      if (contentA.includes(wordA) && contentB.includes(wordB)) {
        return {
          severity: 'high',
          description: 'Direct contradiction detected'
        };
      }
    }

    // Check for negation patterns
    const negationPatterns = [
      { pattern: /no\s+(side\s+)?effects/i, opposite: /side\s+effects/i },
      { pattern: /not\s+effective/i, opposite: /effective/i },
      { pattern: /not\s+safe/i, opposite: /safe/i },
      { pattern: /shows\s+(no|not)/i, opposite: /shows/i }
    ];

    for (const { pattern, opposite } of negationPatterns) {
      if (pattern.test(contentA) && opposite.test(contentB)) {
        return {
          severity: 'high',
          description: 'Negation contradiction detected'
        };
      }
      if (pattern.test(contentB) && opposite.test(contentA)) {
        return {
          severity: 'high',
          description: 'Negation contradiction detected'
        };
      }
    }

    // Check for significant confidence difference with similar content
    const confidenceDiff = Math.abs(sourceA.confidence - sourceB.confidence);
    if (confidenceDiff > 0.4) {
      // Check if they're talking about similar topics
      const wordsA = contentA.split(/\s+/);
      const wordsB = contentB.split(/\s+/);
      const commonWords = wordsA.filter(w => wordsB.includes(w) && w.length > 3);

      if (commonWords.length >= 2) {
        return {
          severity: 'medium',
          description: 'Conflicting confidence levels on similar topic'
        };
      }
    }

    // Check for topic similarity with opposing conclusions
    const wordsA = contentA.split(/\s+/);
    const wordsB = contentB.split(/\s+/);
    const commonWords = wordsA.filter(w => wordsB.includes(w));

    // If they share significant vocabulary but have different meanings
    if (commonWords.length > 4) {
      // Check for conflicting indicators
      const conflictingIndicators = ['however', 'but', 'although', 'despite', 'conversely'];
      const hasConflictIndicator = conflictingIndicators.some(indicator =>
        contentA.includes(indicator) || contentB.includes(indicator)
      );

      if (hasConflictIndicator || confidenceDiff > 0.2) {
        return {
          severity: 'low',
          description: 'Similar topic, different perspectives'
        };
      }
    }

    return null;
  }

  /**
     * Select top sources for inclusion
     * @private
     */
  _selectTopSources(scoredSources, conflicts, options) {
    const maxSources = options.maxSources || 3;
    let selected = [];

    // Always include the top source
    if (scoredSources.length > 0) {
      selected.push(scoredSources[0]);
    }

    // Add diverse sources (avoid same type)
    const usedTypes = new Set([scoredSources[0]?.source]);

    for (let i = 1; i < scoredSources.length && selected.length < maxSources; i++) {
      const source = scoredSources[i];

      if (!usedTypes.has(source.source)) {
        selected.push(source);
        usedTypes.add(source.source);
      }
    }

    // If we haven't filled slots and conflicts exist, add conflicting sources
    if (selected.length < maxSources && conflicts.length > 0) {
      for (const conflict of conflicts) {
        const conflictSource = scoredSources.find(s =>
          (s.source === conflict.sourceA || s.source === conflict.sourceB) &&
                    !selected.includes(s)
        );

        if (conflictSource && selected.length < maxSources) {
          selected.push(conflictSource);
        }
      }
    }

    return selected;
  }

  /**
     * Build the synthesized response from selected sources
     * @private
     */
  _buildResponse(query, sources, conflicts, options) {
    if (sources.length === 0) {
      return this._generateFallbackResponse(query);
    }

    let response = '';
    let transitionIndex = 0;

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];

      // Add attribution phrase
      const attribution = this._getAttributionPhrase(source.source);

      // Add confidence indicator if low confidence
      let confidencePrefix = '';
      if (source.confidence < 0.5) {
        const phrase = this._getConfidencePhrase(source.confidence);
        confidencePrefix = `${phrase} `;
      }

      // Format source content
      const formattedContent = this._formatSourceContent(source.content);

      // Build sentence
      const sentence = i === 0
        ? `${attribution} ${confidencePrefix}${formattedContent}.`
        : `${this.voiceTransitions[transitionIndex % this.voiceTransitions.length]}, ${attribution} ${confidencePrefix}${formattedContent}.`;

      response += sentence + ' ';
      transitionIndex++;
    }

    // Add conflict acknowledgment if needed
    if (conflicts.length > 0 && options.acknowledgeConflicts !== false) {
      response += this._acknowledgeConflicts(conflicts);
    }

    return response.trim();
  }

  /**
     * Get attribution phrase for a source type
     * @private
     */
  _getAttributionPhrase(sourceType) {
    const templates = this.attributionTemplates[sourceType] || this.attributionTemplates.general;
    // Rotate through templates for variety
    const index = Math.floor(Math.random() * templates.length);
    return templates[index];
  }

  /**
     * Get confidence phrase based on confidence level
     * @private
     */
  _getConfidencePhrase(confidence) {
    if (confidence >= 0.7) {
      const phrases = this.confidencePhrases.high;
      return phrases[Math.floor(Math.random() * phrases.length)];
    } else if (confidence >= 0.4) {
      const phrases = this.confidencePhrases.medium;
      return phrases[Math.floor(Math.random() * phrases.length)];
    } else {
      const phrases = this.confidencePhrases.low;
      return phrases[Math.floor(Math.random() * phrases.length)];
    }
  }

  /**
     * Format source content for voice delivery
     * @private
     */
  _formatSourceContent(content) {
    // Remove excessive punctuation
    let formatted = content.replace(/[!?]+/g, '.');

    // Remove URLs
    formatted = formatted.replace(/https?:\/\/[^\s]+/g, '');

    // Remove excessive whitespace
    formatted = formatted.replace(/\s+/g, ' ').trim();

    // Truncate if too long (max 20 words per source)
    const words = formatted.split(/\s+/);
    if (words.length > 20) {
      formatted = words.slice(0, 20).join(' ');
    }

    return formatted;
  }

  /**
     * Acknowledge conflicts in the response
     * @private
     */
  _acknowledgeConflicts(conflicts) {
    if (conflicts.length === 0) return '';

    const highSeverity = conflicts.filter(c => c.severity === 'high');
    const mediumSeverity = conflicts.filter(c => c.severity === 'medium');

    if (highSeverity.length > 0) {
      return ' However, there are some conflicting reports on this topic.';
    } else if (mediumSeverity.length > 0) {
      return ' Some sources present slightly different perspectives.';
    }

    return '';
  }

  /**
     * Optimize response for voice delivery
     * @private
     */
  _optimizeForVoice(response) {
    let optimized = response;

    // Replace formal phrases with conversational alternatives
    const replacements = [
      [/additionally,/gi, 'also,'],
      [/furthermore,/gi, 'plus,'],
      [/consequently,/gi, 'so,'],
      [/nevertheless,/gi, 'but,'],
      [/however,/gi, 'but,'],
      [/therefore,/gi, 'so,'],
      [/according to/gi, 'per'],
      [/indicates/gi, 'shows'],
      [/suggests/gi, 'means'],
      [/demonstrates/gi, 'shows'],
      [/approximately/gi, 'about'],
      [/approximately/gi, 'around'],
      [/individuals/gi, 'people'],
      [/persons/gi, 'people'],
      [/utilize/gi, 'use'],
      [/implement/gi, 'use'],
      [/facilitate/gi, 'help']
    ];

    for (const [pattern, replacement] of replacements) {
      optimized = optimized.replace(pattern, replacement);
    }

    // Add natural pauses (short sentences)
    optimized = optimized.replace(/\. /g, '. ');

    // Ensure proper capitalization
    optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1);

    return optimized;
  }

  /**
     * Count words in text
     * @private
     */
  _countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
     * Truncate response to word limit
     * @private
     */
  _truncateToWordLimit(response, maxWords) {
    const words = response.split(/\s+/);

    if (words.length <= maxWords) {
      return response;
    }

    const truncated = words.slice(0, maxWords).join(' ');

    // Try to end at a sentence boundary
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > maxWords * 0.7) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated + '...';
  }

  /**
     * Calculate overall confidence score
     * @private
     */
  _calculateOverallConfidence(sources, conflicts) {
    if (sources.length === 0) return 0;

    // Average confidence of all sources
    const avgConfidence = sources.reduce((sum, s) => sum + s.confidence, 0) / sources.length;

    // Reduce confidence based on conflicts
    const conflictPenalty = conflicts.length * 0.1;

    // Adjust for source count (more sources = slightly higher confidence)
    const sourceBonus = Math.min(sources.length * 0.05, 0.15);

    return Math.max(0, Math.min(1, avgConfidence - conflictPenalty + sourceBonus));
  }

  /**
     * Generate fallback response when no sources available
     * @private
     */
  _generateFallbackResponse(query) {
    const fallbacks = [
      `I couldn't find specific information about ${query}. Would you like me to try a different search?`,
      `I'm having trouble finding results for ${query}. Let me know if you'd like me to search for something else.`,
      `There aren't any clear results for ${query} right now. Is there anything else I can help you with?`
    ];

    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
     * Set source weight for a specific source type
     */
  setSourceWeight(sourceType, weight) {
    this.sourceWeights[sourceType.toLowerCase()] = weight;
  }

  /**
     * Get current source weights
     */
  getSourceWeights() {
    return { ...this.sourceWeights };
  }

  /**
     * Reset source weights to defaults
     */
  resetSourceWeights() {
    this.sourceWeights = {
      arxiv: 1.0,
      news: 0.85,
      reddit: 0.6,
      twitter: 0.55,
      ai: 0.75,
      wikipedia: 0.9,
      youtube: 0.7,
      video: 0.7,
      general: 0.5
    };
  }
}

/**
 * Convenience function to synthesize a response
 *
 * @param {string} query - The original query
 * @param {Array} sources - Array of source results
 * @param {Object} options - Synthesis options
 * @returns {Promise<Object>} Synthesized response
 */
async function synthesizeResponse(query, sources, options = {}) {
  const synthesizer = new ResponseSynthesizer(options);
  return await synthesizer.synthesizeResponse(query, sources, options);
}

module.exports = {
  ResponseSynthesizer,
  synthesizeResponse
};
