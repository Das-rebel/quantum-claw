/**
 * Query Classifier - Distinguishes between simple and complex queries
 *
 * Determines query complexity to apply appropriate response optimization:
 * - Simple queries: Short, direct answers (e.g., "2+2", "what's the weather")
 * - Complex queries: Detailed explanations required (e.g., "explain theory of relativity")
 * - Long queries: Stories, narratives (e.g., "tell me a story about...")
 *
 * Also provides query type classification for provider routing:
 * - Knowledge queries: Definitions, explanations, "What is..."
 * - Technical queries: Programming, technology, systems
 * - News queries: Current events, news, updates
 * - Fact-check queries: Verification, true/false
 */

class QueryClassifier {
  constructor(options = {}) {
    // Complexity detection thresholds
    this.simpleWordThreshold = options.simpleWordThreshold || 15; // Words ≤ this = simple
    this.complexWordThreshold = options.complexWordThreshold || 25; // Words ≥ this = complex
    this.explanationKeywords = options.explanationKeywords || [
      'explain', 'describe', 'what is', 'how does', 'why does',
      'tell me about', 'tell me more', 'how', 'why', 'history of',
      'theory of', 'principles of', 'basics of', 'introduction to',
      'overview of', 'detail', 'elaborate', 'clarify', 'define',
      'understand', 'learn about', 'know about', 'information on'
    ];

    // Provider routing patterns
    this.providerPatterns = {
      // Knowledge queries - definitions, explanations, "What is..."
      knowledge: [
        /^(what\s+(is|are|does|do|did|was|were|means?)\s+)/i,
        /^(explain|explain\s+(to\s+me\s+)?)|describe\s+/i,
        /^(tell\s+me\s+(about|regarding)\s+)/i,
        /^(how\s+(does|do|did|works?|work\s+the)?\s+)/i,
        /^(why\s+(does|do|did|is|are|was|were)\s+)/i,
        /^(define|definition\s+(of|for)\s+)/i,
        /^(who\s+(is|are|was|were)\s+)/i,
        /^(when\s+(did|do|does|is|are|was|were)\s+)/i,
        /^(where\s+(is|are|was|were|did|do|does)\s+)/i,
        /\b(meaning|definition|concept|overview|introduction)\b/i,
        /\b(understand|learn|know)\b\s+(about|of)\s+/i
      ],

      // Technical queries - programming, technology, systems
      technical: [
        /\b(programming|coding|development|software|algorithm|data\s+structure)\b/i,
        /\b(distributed\s+systems|microservices|architecture|design\s+pattern)\b/i,
        /\b(computer\s+science|technology|system\s+design)\b/i,
        /\b(api|database|server|client|frontend|backend|fullstack)\b/i,
        /\b(devops|cloud\s+computing|docker|kubernetes)\b/i,
        /\b(machine\s+learning|artificial\s+intelligence|neural\s+network)\b/i,
        /\b(cybersecurity|networking|protocol|tcp\/ip|http|https)\b/i,
        /\b(blockchain|cryptocurrency|web3|smart\s+contract)\b/i,
        /\b(version\s+control|git|github|gitlab)\b/i,
        /\b(testing|debugging|unit\s+test|integration\s+test)\b/i
      ],

      // News queries - current events, news, updates
      news: [
        /^(latest|breaking|recent|current|today['']?s|yesterday['']?s)\s+news/i,
        /\b(news|headlines|updates|trending|breaking|latest)\b/i,
        /^(what['']?(s\s+)?happening|what['']?(s\s+)?going\s+on)\b/i,
        /\b(updates|announcements|release)\b/i
      ],

      // Fact-check queries - verification, true/false
      factCheck: [
        /^(is\s+(this|that|the|it)\s+(true|correct|accurate|right|false|wrong|real|fake))/i,
        /^(verify|confirm|check|validate|fact\s+check)/i,
        /^(is\s+(a|an|the)\s+myth|rumor|hoax)/i,
        /\b(true\s+or\s+false|fact\s+or\s+fiction|verify)\b/i,
        /\b(is\s+(climate\s+change|global\s+warming|evolution|vaccines)\s+(real|true|fake|false|hoax|myth))/i,
        // Simple yes/no questions about facts (most flexible pattern)
        /^(is|are|was|were|do|does|did|can|could|would)\s+.+\?/i
      ]
    };

    this.complexityIndicators = options.complexityIndicators || [
      'because', 'therefore', 'however', 'although', 'consequently',
      'moreover', 'furthermore', 'nevertheless', 'thus', 'hence',
      'relationship', 'connection', 'difference', 'comparison',
      'effect', 'impact', 'influence', 'mechanism', 'process',
      'principle', 'concept', 'theory', 'framework', 'approach'
    ];
    this.questionWords = options.questionWords || ['what', 'how', 'why', 'when', 'where', 'who', 'which'];
    this.narrativeKeywords = options.narrativeKeywords || [
      'tell me a story', 'tell me about', 'story about', 'narrative',
      'history of', 'biography', 'life of', 'tale of', 'once upon',
      'legend', 'myth', 'fable', 'account', 'chronicle'
    ];
  }

  /**
     * Classify query complexity
     * @param {string} query - The query to classify
     * @returns {Object} Classification result
     */
  classify(query) {
    if (!query || typeof query !== 'string') {
      return {
        complexity: 'unknown',
        confidence: 0,
        reason: 'Invalid query'
      };
    }

    const lowerQuery = query.toLowerCase().trim();
    const words = this._tokenize(lowerQuery);
    const wordCount = words.length;

    // Calculate various signals
    const signals = {
      wordCount: wordCount,
      hasExplanationKeyword: this._hasExplanationKeyword(lowerQuery),
      explanationKeywordCount: this._countExplanationKeywords(lowerQuery),
      hasComplexityIndicator: this._hasComplexityIndicator(lowerQuery),
      complexityIndicatorCount: this._countComplexityIndicators(lowerQuery),
      hasQuestionWord: this._hasQuestionWord(lowerQuery),
      questionWordCount: this._countQuestionWords(lowerQuery),
      hasNarrativeKeyword: this._hasNarrativeKeyword(lowerQuery),
      questionMark: query.includes('?'),
      averageWordLength: this._averageWordLength(words),
      uniqueWords: new Set(words).size,
      hasMultipleSentences: query.split(/[.!?]+/).filter(s => s.trim()).length > 1
    };

    // Calculate complexity score (0-1, where 1 is most complex)
    const complexityScore = this._calculateComplexityScore(signals);

    // Determine complexity level
    const complexity = this._determineComplexityLevel(complexityScore, signals);

    return {
      complexity,
      confidence: this._calculateConfidence(complexityScore, signals),
      score: complexityScore,
      signals,
      reason: this._getReason(complexity, signals)
    };
  }

  /**
     * Check if query is simple (direct, short answer expected)
     * @param {string} query - The query to check
     * @returns {boolean}
     */
  isSimple(query) {
    const classification = this.classify(query);
    return classification.complexity === 'simple';
  }

  /**
     * Check if query is complex (detailed explanation expected)
     * @param {string} query - The query to check
     * @returns {boolean}
     */
  isComplex(query) {
    const classification = this.classify(query);
    return classification.complexity === 'complex';
  }

  /**
     * Check if query is narrative (story, biography, etc.)
     * @param {string} query - The query to check
     * @returns {boolean}
     */
  isNarrative(query) {
    const classification = this.classify(query);
    return classification.complexity === 'narrative';
  }

  /**
     * Get recommended word limit based on query complexity
     * @param {string} query - The query to analyze
     * @returns {Object} Recommended limits
     */
  getRecommendedLimits(query) {
    const classification = this.classify(query);

    switch (classification.complexity) {
    case 'simple':
      return {
        maxWords: 20,      // Very short, direct
        maxSentences: 2,
        voiceOptimized: true
      };
    case 'complex':
      return {
        maxWords: 150,     // Detailed but not overwhelming
        maxSentences: 10,
        voiceOptimized: true
      };
    case 'narrative':
      return {
        maxWords: 200,     // Longer for stories
        maxSentences: 15,
        voiceOptimized: false  // Don't truncate narratives
      };
    default:
      return {
        maxWords: 100,     // Balanced default
        maxSentences: 6,
        voiceOptimized: true
      };
    }
  }

  /**
     * Tokenize query into words
     * @private
     */
  _tokenize(query) {
    return query.split(/\s+/).filter(word => word.length > 0);
  }

  /**
     * Check if query has explanation keywords
     * @private
     */
  _hasExplanationKeyword(query) {
    return this.explanationKeywords.some(keyword =>
      query.includes(keyword)
    );
  }

  /**
     * Count explanation keywords in query
     * @private
     */
  _countExplanationKeywords(query) {
    return this.explanationKeywords.filter(keyword =>
      query.includes(keyword)
    ).length;
  }

  /**
     * Check if query has complexity indicators
     * @private
     */
  _hasComplexityIndicator(query) {
    return this.complexityIndicators.some(indicator =>
      query.includes(indicator)
    );
  }

  /**
     * Count complexity indicators in query
     * @private
     */
  _countComplexityIndicators(query) {
    return this.complexityIndicators.filter(indicator =>
      query.includes(indicator)
    ).length;
  }

  /**
     * Check if query has question words
     * @private
     */
  _hasQuestionWord(query) {
    return this.questionWords.some(word =>
      query.startsWith(word) || query.includes(` ${word}`)
    );
  }

  /**
     * Count question words in query
     * @private
     */
  _countQuestionWords(query) {
    return this.questionWords.filter(word =>
      query.startsWith(word) || query.includes(` ${word}`)
    ).length;
  }

  /**
     * Check if query has narrative keywords
     * @private
     */
  _hasNarrativeKeyword(query) {
    return this.narrativeKeywords.some(keyword =>
      query.includes(keyword)
    );
  }

  /**
     * Calculate average word length
     * @private
     */
  _averageWordLength(words) {
    if (words.length === 0) return 0;
    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    return totalLength / words.length;
  }

  /**
     * Calculate complexity score based on signals
     * @private
     */
  _calculateComplexityScore(signals) {
    let score = 0;

    // Word count contribution (0-0.3)
    if (signals.wordCount <= this.simpleWordThreshold) {
      score += 0.05;  // Very short = simple
    } else if (signals.wordCount >= this.complexWordThreshold) {
      score += 0.2;   // Long = more complex
    } else {
      score += 0.1;    // Medium
    }

    // Explanation keywords (0-0.3)
    if (signals.explanationKeywordCount > 0) {
      score += Math.min(signals.explanationKeywordCount * 0.15, 0.3);
    }

    // Complexity indicators (0-0.2)
    if (signals.complexityIndicatorCount > 0) {
      score += Math.min(signals.complexityIndicatorCount * 0.08, 0.2);
    }

    // Question words (0-0.1)
    if (signals.questionWordCount > 0) {
      score += 0.05;
    }

    // Multiple sentences (0-0.1)
    if (signals.hasMultipleSentences) {
      score += 0.1;
    }

    // Vocabulary diversity (unique words / total words) (0-0.1)
    if (signals.wordCount > 0) {
      const diversity = signals.uniqueWords / signals.wordCount;
      score += diversity * 0.1;
    }

    // Question mark indicates simple question (0-0.1)
    if (signals.questionMark) {
      score -= 0.05;  // Questions are often simpler
    }

    // Narrative keywords override to high complexity (0-0.1)
    if (signals.hasNarrativeKeyword) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
     * Determine complexity level from score
     * @private
     */
  _determineComplexityLevel(score, signals) {
    // Narrative queries get special handling
    if (signals.hasNarrativeKeyword) {
      return 'narrative';
    }

    // Very low score = simple
    if (score < 0.3) {
      return 'simple';
    }

    // High score = complex
    if (score >= 0.5) {
      return 'complex';
    }

    // Medium score = moderate (treat as simple for voice optimization)
    return 'simple';
  }

  /**
     * Calculate confidence in classification
     * @private
     */
  _calculateConfidence(score, signals) {
    // High confidence for extreme scores
    if (score < 0.2 || score > 0.7) {
      return 0.9;
    }

    // Medium confidence for scores near thresholds
    if (score < 0.3 || score > 0.5) {
      return 0.7;
    }

    // Lower confidence for ambiguous cases
    return 0.6;
  }

  /**
     * Get explanation for classification
     * @private
     */
  _getReason(complexity, signals) {
    const reasons = [];

    if (signals.wordCount <= this.simpleWordThreshold) {
      reasons.push('short query');
    } else if (signals.wordCount >= this.complexWordThreshold) {
      reasons.push('long query');
    }

    if (signals.explanationKeywordCount > 0) {
      reasons.push('contains explanation keywords');
    }

    if (signals.complexityIndicatorCount > 0) {
      reasons.push('contains complexity indicators');
    }

    if (signals.hasNarrativeKeyword) {
      reasons.push('narrative request');
    }

    if (signals.questionMark) {
      reasons.push('question format');
    }

    if (signals.hasMultipleSentences) {
      reasons.push('multiple sentences');
    }

    return reasons.join(', ') || 'mixed signals';
  }

  /**
     * Classify query type for provider routing
     * @param {string} query - The query text
     * @returns {object} - Classification result with type and confidence
     */
  classifyForRouting(query) {
    if (!query || typeof query !== 'string') {
      return {
        type: 'general',
        confidence: 0,
        scores: {}
      };
    }

    const lowerQuery = query.toLowerCase().trim();
    const scores = {
      knowledge: 0,
      technical: 0,
      news: 0,
      factCheck: 0,
      general: 0
    };

    // Score each pattern
    for (const [type, patterns] of Object.entries(this.providerPatterns)) {
      for (const pattern of patterns) {
        const match = lowerQuery.match(pattern);
        if (match) {
          // Higher score for matches at the start of query
          const position = match.index || 0;
          let score = 1 + (1 - position / lowerQuery.length);

          // Higher score for longer matches
          score += match[0].length / 10;

          // Priority boost for fact-check and news (security/verification queries)
          if (type === 'factCheck' || type === 'news') {
            score *= 2.0; // Double score for fact-check/news queries
          }

          scores[type] += score;
        }
      }
    }

    // Find the highest scoring type
    let bestType = 'general';
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestType = type;
        bestScore = score;
      }
    }

    // Calculate confidence based on score difference
    const allScores = Object.values(scores).filter(s => s > 0);
    const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
    const confidence = bestScore > 0 ? Math.min((bestScore / (bestScore + avgScore)), 1) : 0;

    return {
      type: bestType,
      confidence,
      scores,
      query
    };
  }

  /**
     * Check if query should use Tavily (for news/fact-check only)
     * @param {string} query - The query text
     * @returns {boolean} - True if should use Tavily
     */
  shouldUseTavily(query) {
    const classification = this.classifyForRouting(query);
    const shouldUse = classification.type === 'news' || classification.type === 'factCheck';
    console.log(`[QueryClassifier] Query: "${query}"`);
    console.log(`[QueryClassifier] Type: ${classification.type}, Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    console.log(`[QueryClassifier] Should use Tavily: ${shouldUse}`);
    return shouldUse;
  }

  /**
     * Get recommended provider for query
     * @param {string} query - The query text
     * @returns {string} - Provider name
     */
  getRecommendedProvider(query) {
    const classification = this.classifyForRouting(query);

    if (classification.type === 'news' || classification.type === 'factCheck') {
      return 'tavily';
    }

    // Knowledge and technical queries go to GLM/Cerebras
    if (classification.type === 'knowledge' || classification.type === 'technical') {
      return 'glm';
    }

    // Default to GLM for general queries
    return 'glm';
  }
}

module.exports = QueryClassifier;
