/**
 * Response Summarizer - Intelligent Text Summarization
 *
 * Provides intelligent summarization for long responses while maintaining
 * key information and readability for voice delivery.
 *
 * Features:
 * - Intelligent sentence-level truncation at natural boundaries
 * - Preserves key phrases and important information
 * - Maintains 150-word limit for voice responses
 * - Retains full content for text responses
 * - Confidence-based importance scoring
 */

class ResponseSummarizer {
  constructor(options = {}) {
    // Configuration
    this.maxWords = options.maxWords || 150;
    this.maxSentences = options.maxSentences || 8;
    this.minSummaryWords = options.minSummaryWords || 30;
    this.preserveKeyPhrases = options.preserveKeyPhrases !== false;

    // Importance weights for different sentence features
    this.weights = {
      firstSentence: 1.5,          // First sentence is most important
      lastSentence: 1.2,           // Last sentence often contains conclusions
      keyPhrasePresence: 1.3,      // Sentences with key phrases
      numericalData: 1.1,         // Sentences with numbers/stats
      sentenceLength: 1.0,         // Base weight for all sentences
      questionSentence: 0.3,      // Downweight questions
      transitionWord: 0.8         // Moderate weight for transition words
    };

    // Key phrases to preserve (expandable)
    this.keyPhrases = [
      'important', 'significant', 'crucial', 'essential', 'key',
      'result', 'conclusion', 'finding', 'discovery', 'breakthrough',
      'therefore', 'consequently', 'thus', 'so', 'hence',
      'first', 'second', 'third', 'finally', 'in summary',
      'benefit', 'advantage', 'improvement', 'success', 'effective',
      'risk', 'danger', 'warning', 'caution', 'concern',
      'because', 'since', 'due to', 'as a result'
    ];

    // Transition words (indicate continuation, not new important info)
    this.transitionWords = [
      'also', 'additionally', 'furthermore', 'moreover', 'plus',
      'similarly', 'likewise', 'in addition',
      'for example', 'for instance', 'such as', 'like',
      'however', 'but', 'although', 'despite', 'nevertheless',
      'on the other hand', 'conversely'
    ];

    // Sentence end markers
    this.sentenceEndings = /[.!?]+/;

    // Stats tracking
    this.stats = {
      totalSummaries: 0,
      totalWordsProcessed: 0,
      averageCompressionRatio: 0
    };
  }

  /**
     * Main summarization function
     *
     * @param {string} text - The text to summarize
     * @param {string} targetFormat - 'voice' or 'text'
     * @returns {Object} Summarized text with metadata
     */
  summarize(text, targetFormat = 'voice') {
    if (!text || typeof text !== 'string') {
      return {
        summary: '',
        originalLength: 0,
        summaryLength: 0,
        compressionRatio: 0,
        wasSummarized: false
      };
    }

    const originalWords = this._countWords(text);

    // If text is short enough or target is text, return as-is
    if (targetFormat === 'text' || originalWords <= this.maxWords) {
      return {
        summary: text,
        originalLength: originalWords,
        summaryLength: originalWords,
        compressionRatio: 1.0,
        wasSummarized: false
      };
    }

    // Perform intelligent summarization
    const summary = this._intelligentSummarize(text);

    const summaryWords = this._countWords(summary);
    const compressionRatio = originalWords > 0 ? summaryWords / originalWords : 1;

    // Update stats
    this.stats.totalSummaries++;
    this.stats.totalWordsProcessed += originalWords;
    this.stats.averageCompressionRatio =
            (this.stats.averageCompressionRatio * (this.stats.totalSummaries - 1) + compressionRatio) /
            this.stats.totalSummaries;

    return {
      summary,
      originalLength: originalWords,
      summaryLength: summaryWords,
      compressionRatio,
      wasSummarized: true
    };
  }

  /**
     * Intelligent summarization algorithm
     * @private
     */
  _intelligentSummarize(text) {
    // Split into sentences
    const sentences = this._splitIntoSentences(text);

    if (sentences.length <= this.maxSentences) {
      // If sentence count is low, just truncate by words
      return this._intelligentWordTruncate(text);
    }

    // Score each sentence
    const scoredSentences = this._scoreSentences(sentences);

    // Select top sentences based on scores
    const selectedSentences = this._selectSentences(scoredSentences);

    // Maintain original order
    selectedSentences.sort((a, b) => a.originalIndex - b.originalIndex);

    // Build summary
    let summary = selectedSentences.map(s => s.text).join(' ');

    // Ensure we're within word limit
    if (this._countWords(summary) > this.maxWords) {
      summary = this._intelligentWordTruncate(summary);
    }

    return summary;
  }

  /**
     * Split text into sentences
     * @private
     */
  _splitIntoSentences(text) {
    // Split on sentence endings
    const parts = text.split(this.sentenceEndings);

    const sentences = [];
    let currentSentence = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();

      if (part.length === 0) continue;

      currentSentence = part + (i < parts.length - 1 ? '.' : '');

      // Skip very short fragments (likely not real sentences)
      if (currentSentence.length > 3) {
        sentences.push(currentSentence);
      }
    }

    return sentences;
  }

  /**
     * Score sentences based on importance
     * @private
     */
  _scoreSentences(sentences) {
    return sentences.map((sentence, index) => {
      let score = this.weights.sentenceLength;
      const lowerSentence = sentence.toLowerCase();

      // Position bonuses
      if (index === 0) {
        score *= this.weights.firstSentence;
      } else if (index === sentences.length - 1) {
        score *= this.weights.lastSentence;
      }

      // Key phrase bonus
      if (this.preserveKeyPhrases) {
        const hasKeyPhrase = this.keyPhrases.some(phrase =>
          lowerSentence.includes(phrase)
        );
        if (hasKeyPhrase) {
          score *= this.weights.keyPhrasePresence;
        }
      }

      // Numerical data bonus
      if (/\d+%|\d+\s*(percent|million|billion|thousand)/i.test(sentence)) {
        score *= this.weights.numericalData;
      }

      // Question penalty
      if (sentence.trim().endsWith('?')) {
        score *= this.weights.questionSentence;
      }

      // Transition word adjustment
      const hasTransition = this.transitionWords.some(word =>
        lowerSentence.startsWith(word + ',') ||
                lowerSentence.startsWith(word + ' ') ||
                lowerSentence.includes(' ' + word + ' ')
      );
      if (hasTransition && index > 0) {
        score *= this.weights.transitionWord;
      }

      // Length normalization (prefer medium-length sentences)
      const words = sentence.split(/\s+/).length;
      if (words < 5) {
        score *= 0.7; // Penalize very short
      } else if (words > 30) {
        score *= 0.8; // Penalize very long
      }

      return {
        text: sentence,
        score: Math.round(score * 100) / 100,
        originalIndex: index,
        wordCount: words
      };
    });
  }

  /**
     * Select top sentences based on scores and word limit
     * @private
     */
  _selectSentences(scoredSentences) {
    // Sort by score (descending)
    const sorted = [...scoredSentences].sort((a, b) => b.score - a.score);

    const selected = [];
    let totalWords = 0;

    for (const sentence of sorted) {
      const wouldExceed = totalWords + sentence.wordCount > this.maxWords;

      // Always include at least minSummaryWords words
      const mustInclude =
                totalWords < this.minSummaryWords ||
                selected.length < 2; // Always have at least 2 sentences

      if (!wouldExceed || mustInclude) {
        selected.push(sentence);
        totalWords += sentence.wordCount;
      }

      if (totalWords >= this.maxWords && selected.length >= this.maxSentences) {
        break;
      }
    }

    return selected;
  }

  /**
     * Intelligent word-level truncation
     * @private
     */
  _intelligentWordTruncate(text) {
    const words = text.split(/\s+/);

    if (words.length <= this.maxWords) {
      return text;
    }

    // Try to find a good stopping point
    const truncated = words.slice(0, this.maxWords);

    // Look for natural stopping point in last 20% of text
    const searchStart = Math.floor(this.maxWords * 0.8);
    let bestEndIndex = this.maxWords;

    for (let i = this.maxWords - 1; i >= searchStart; i--) {
      const word = words[i];

      // Check for sentence ending
      if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
        // Make sure it's not an abbreviation
        if (!/^[A-Z][a-z]{1,3}\.$/.test(word)) {
          bestEndIndex = i + 1;
          break;
        }
      }

      // Check for other good stopping points
      if (word.endsWith(',')) {
        // Replace comma with period for cleaner ending
        truncated[i] = word.slice(0, -1) + '.';
        bestEndIndex = i + 1;
        break;
      }
    }

    const result = truncated.slice(0, bestEndIndex).join(' ');

    // Add ellipsis if we didn't end at a complete sentence
    if (!result.endsWith('.') && !result.endsWith('!') && !result.endsWith('?')) {
      return result + '...';
    }

    return result;
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
     * Get statistics about summarization performance
     */
  getStats() {
    return { ...this.stats };
  }

  /**
     * Reset statistics
     */
  resetStats() {
    this.stats = {
      totalSummaries: 0,
      totalWordsProcessed: 0,
      averageCompressionRatio: 0
    };
  }

  /**
     * Add custom key phrases
     */
  addKeyPhrases(phrases) {
    if (Array.isArray(phrases)) {
      this.keyPhrases.push(...phrases);
    }
  }

  /**
     * Set max word limit
     */
  setMaxWords(limit) {
    if (typeof limit === 'number' && limit > 0) {
      this.maxWords = limit;
    }
  }

  /**
     * Get current configuration
     */
  getConfig() {
    return {
      maxWords: this.maxWords,
      maxSentences: this.maxSentences,
      minSummaryWords: this.minSummaryWords,
      preserveKeyPhrases: this.preserveKeyPhrases,
      weights: { ...this.weights }
    };
  }
}

/**
 * Convenience function to summarize text
 *
 * @param {string} text - The text to summarize
 * @param {string} targetFormat - 'voice' or 'text'
 * @param {Object} options - Summarizer options
 * @returns {Object} Summarized text with metadata
 */
function summarizeText(text, targetFormat, options = {}) {
  const summarizer = new ResponseSummarizer(options);
  return summarizer.summarize(text, targetFormat);
}

module.exports = {
  ResponseSummarizer,
  summarizeText
};
