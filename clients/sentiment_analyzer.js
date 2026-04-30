/**
 * Sentiment Analyzer - Emotional Intelligence Module
 *
 * Provides:
 * - Sentiment detection (happy, sad, frustrated, angry, neutral)
 * - Emotion intensity scoring (0-1 scale)
 * - Tone adaptation based on detected emotion
 * - Empathetic language generation
 * - NLP-based sentiment analysis with rule-based enhancement
 */

class SentimentAnalyzer {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.useNLPAPI = options.useNLPAPI !== false; // Default to true
    this.language = options.language || 'en';

    // Emotion keywords with intensity weights
    this.emotionKeywords = {
      happy: {
        primary: [
          'happy', 'glad', 'pleased', 'delighted', 'joyful', 'cheerful',
          'excited', 'thrilled', 'elated', 'ecstatic', 'wonderful',
          'great', 'awesome', 'fantastic', 'amazing', 'excellent',
          'love', 'enjoy', 'appreciate', 'thank', 'thanks'
        ],
        secondary: [
          'good', 'nice', 'positive', 'positive', 'success', 'successful',
          'win', 'winning', 'best', 'better', 'perfect'
        ],
        intensity: 1.0
      },
      sad: {
        primary: [
          'sad', 'upset', 'disappointed', 'depressed', 'unhappy', 'miserable',
          'heartbroken', 'devastated', 'crushed', 'down', 'low',
          'sorry', 'regret', 'miss', 'grief', 'loss'
        ],
        secondary: [
          'bad', 'terrible', 'awful', 'horrible', 'worst', 'negative',
          'fail', 'failure', 'disappointment', 'struggle', 'difficult'
        ],
        intensity: 0.9
      },
      frustrated: {
        primary: [
          'frustrated', 'annoyed', 'irritated', 'bothered', 'upset',
          'tired of', 'sick of', 'fed up', 'had enough', 'stuck',
          'confused', 'don\'t understand', 'doesn\'t work', 'not working'
        ],
        secondary: [
          'problem', 'issue', 'error', 'wrong', 'broken', 'failed',
          'difficult', 'hard', 'complicated', 'confusing', 'trouble'
        ],
        intensity: 0.85
      },
      angry: {
        primary: [
          'angry', 'mad', 'furious', 'outraged', 'livid', 'irate',
          'hate', 'despise', 'disgusted', 'furious', 'enraged',
          'unacceptable', 'ridiculous', 'absurd', 'insane', 'crazy'
        ],
        secondary: [
          'terrible', 'horrible', 'awful', 'worst', 'stupid',
          'dumb', 'idiotic', 'useless', 'worthless', 'pathetic'
        ],
        intensity: 1.0
      }
    };

    // Positive/negative word lists for sentiment scoring
    this.positiveWords = [
      'good', 'great', 'awesome', 'excellent', 'amazing', 'wonderful',
      'fantastic', 'perfect', 'love', 'like', 'enjoy', 'happy',
      'pleased', 'satisfied', 'delighted', 'thrilled', 'excited',
      'helpful', 'useful', 'effective', 'successful', 'win', 'winning',
      'best', 'better', 'improve', 'improvement', 'progress', 'achievement'
    ];

    this.negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'worst', 'hate',
      'dislike', 'disappointed', 'sad', 'upset', 'angry', 'frustrated',
      'annoyed', 'problem', 'issue', 'error', 'fail', 'failure',
      'wrong', 'broken', 'stuck', 'difficult', 'hard', 'complicated',
      'confusing', 'useless', 'worthless', 'stupid', 'dumb'
    ];

    // Intensifier words that amplify emotion
    this.intensifiers = [
      'very', 'really', 'extremely', 'absolutely', 'completely', 'totally',
      'utterly', 'thoroughly', 'incredibly', 'exceptionally', 'remarkably'
    ];

    // Negation words that flip sentiment
    this.negations = [
      'not', 'no', 'never', 'don\'t', 'doesn\'t', 'didn\'t',
      'won\'t', 'wouldn\'t', 'couldn\'t', 'shouldn\'t', 'can\'t',
      'neither', 'nor', 'hardly', 'barely', 'scarcely'
    ];

    // Empathetic response templates
    this.empathyTemplates = {
      happy: [
        'I\'m glad to hear that!',
        'That\'s wonderful!',
        'I\'m happy that helped!',
        'Great to hear!',
        'That\'s fantastic news!'
      ],
      sad: [
        'I understand this is difficult.',
        'I\'m here to help you through this.',
        'Let\'s work through this together.',
        'I appreciate you sharing that with me.',
        'I\'m here for you.'
      ],
      frustrated: [
        'I understand your frustration.',
        'Let me help you with that.',
        'I see what you mean.',
        'Let\'s try to solve this step by step.',
        'I\'m here to help make this easier.'
      ],
      angry: [
        'I understand this is upsetting.',
        'I apologize for any inconvenience.',
        'Let me help resolve this for you.',
        'I hear you, and I\'m here to help.',
        'Let\'s address this together.'
      ],
      neutral: [
        'I\'m here to help.',
        'How can I assist you?',
        'What would you like to know?',
        'I\'m listening.',
        'Go ahead, I\'m ready to help.'
      ]
    };

    // Tone adaptation patterns
    this.toneAdaptations = {
      happy: {
        prefix: ['Great question!', 'That\'s interesting!', 'Wonderful to help!'],
        style: 'enthusiastic',
        pacing: 'normal'
      },
      sad: {
        prefix: ['I understand.', 'I hear you.', 'Let me help.'],
        style: 'gentle',
        pacing: 'slow'
      },
      frustrated: {
        prefix: ['I see what you mean.', 'Let me help clarify.', 'Let\'s work through this.'],
        style: 'patient',
        pacing: 'measured'
      },
      angry: {
        prefix: ['I understand your concern.', 'Let me address this.', 'I\'m here to help.'],
        style: 'calm',
        pacing: 'measured'
      },
      neutral: {
        prefix: ['Let me help with that.', 'Here\'s what I found.', 'I can help you.'],
        style: 'professional',
        pacing: 'normal'
      }
    };
  }

  /**
     * Analyze sentiment of text
     * @param {string} text - Text to analyze
     * @returns {Promise<object>} - Sentiment analysis result
     */
  async analyzeSentiment(text) {
    if (!text || typeof text !== 'string') {
      return this._getNeutralResult();
    }

    const lowerText = text.toLowerCase();

    // Rule-based sentiment analysis
    const ruleBased = this._ruleBasedAnalysis(lowerText);

    // If NLP API is available, use it for higher accuracy
    if (this.useNLPAPI) {
      try {
        const nlpResult = await this._nlpAnalysis(text);
        // Combine rule-based and NLP results
        return this._combineResults(ruleBased, nlpResult);
      } catch (error) {
        console.warn('[SentimentAnalyzer] NLP analysis failed, using rule-based:', error.message);
        return ruleBased;
      }
    }

    return ruleBased;
  }

  /**
     * Rule-based sentiment analysis
     * @private
     */
  _ruleBasedAnalysis(text) {
    let emotionScores = {
      happy: 0,
      sad: 0,
      frustrated: 0,
      angry: 0
    };

    let posScore = 0;
    let negScore = 0;
    let hasNegation = false;

    const words = text.split(/\s+/);

    // Check for negations
    hasNegation = this.negations.some(neg => words.includes(neg));

    // Analyze emotion keywords
    for (const [emotion, keywords] of Object.entries(this.emotionKeywords)) {
      const intensity = keywords.intensity;

      // Primary keywords (higher weight)
      for (const keyword of keywords.primary) {
        const matches = (text.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
        emotionScores[emotion] += matches * intensity * 1.5;
      }

      // Secondary keywords (lower weight)
      for (const keyword of keywords.secondary) {
        const matches = (text.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
        emotionScores[emotion] += matches * intensity * 1.0;
      }
    }

    // Check for intensifiers
    const hasIntensifier = this.intensifiers.some(int => words.includes(int));
    const intensityMultiplier = hasIntensifier ? 1.5 : 1.0;

    // Apply intensifier and negation
    for (const emotion in emotionScores) {
      emotionScores[emotion] *= intensityMultiplier;
      if (hasNegation) {
        emotionScores[emotion] *= 0.5; // Reduce if negated
      }
    }

    // Calculate positive/negative sentiment
    for (const word of words) {
      // Normalize word by removing punctuation and lowercasing
      const normalizedWord = word.toLowerCase().replace(/[!?.;,:]$/, '');
      if (this.positiveWords.includes(normalizedWord)) {
        posScore += hasNegation ? -0.5 : 1.0;
      }
      if (this.negativeWords.includes(normalizedWord)) {
        negScore += hasNegation ? -0.5 : 1.0;
      }
    }

    // Find dominant emotion
    let dominantEmotion = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(emotionScores)) {
      if (score > maxScore) {
        maxScore = score;
        dominantEmotion = emotion;
      }
    }

    // If no dominant emotion, check overall sentiment
    if (maxScore < 0.5) {
      if (posScore > negScore * 1.5) {
        dominantEmotion = 'happy';
      } else if (negScore > posScore * 1.5) {
        dominantEmotion = 'sad';
      }
    }

    // Calculate confidence
    const totalScore = Object.values(emotionScores).reduce((sum, s) => sum + s, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0.3;

    // Calculate sentiment value (-1 to 1)
    const sentimentValue = posScore > 0 || negScore > 0
      ? (posScore - negScore) / Math.max(posScore, negScore)
      : 0;

    return {
      emotion: dominantEmotion,
      confidence: Math.min(1, confidence),
      sentimentValue: Math.max(-1, Math.min(1, sentimentValue)),
      emotionScores: emotionScores,
      hasNegation: hasNegation,
      hasIntensifier: hasIntensifier,
      method: 'rule-based'
    };
  }

  /**
     * NLP-based sentiment analysis (placeholder for future integration)
     * @private
     */
  async _nlpAnalysis(text) {
    // In a production system, this would call an NLP API
    // For now, return null to fall back to rule-based
    return null;
  }

  /**
     * Combine rule-based and NLP results
     * @private
     */
  _combineResults(ruleBased, nlpResult) {
    if (!nlpResult) {
      return ruleBased;
    }

    // Weighted combination (70% rule-based, 30% NLP)
    const combined = {
      emotion: ruleBased.confidence > nlpResult.confidence
        ? ruleBased.emotion
        : nlpResult.emotion,
      confidence: (ruleBased.confidence * 0.7) + (nlpResult.confidence * 0.3),
      sentimentValue: (ruleBased.sentimentValue * 0.7) + (nlpResult.sentimentValue * 0.3),
      emotionScores: ruleBased.emotionScores,
      hasNegation: ruleBased.hasNegation,
      hasIntensifier: ruleBased.hasIntensifier,
      method: 'combined'
    };

    return combined;
  }

  /**
     * Get neutral result
     * @private
     */
  _getNeutralResult() {
    return {
      emotion: 'neutral',
      confidence: 0.3,
      sentimentValue: 0,
      emotionScores: {
        happy: 0,
        sad: 0,
        frustrated: 0,
        angry: 0
      },
      hasNegation: false,
      hasIntensifier: false,
      method: 'fallback'
    };
  }

  /**
     * Adapt response tone based on detected emotion
     * @param {object} sentiment - Sentiment analysis result
     * @param {string} response - Original response
     * @returns {string} - Tone-adapted response
     */
  adaptTone(sentiment, response) {
    if (!sentiment || !response) {
      return response;
    }

    const emotion = sentiment.emotion;
    const adaptation = this.toneAdaptations[emotion];

    if (!adaptation) {
      return response;
    }

    let adapted = response;

    // Add empathetic prefix if emotion is not neutral
    if (emotion !== 'neutral' && sentiment.confidence > this.confidenceThreshold) {
      const empathy = this._getEmpathyPhrase(emotion);
      adapted = `${empathy} ${response.charAt(0).toLowerCase()}${response.slice(1)}`;
    }

    // Adjust tone based on emotion
    adapted = this._adjustForEmotion(adapted, emotion);

    return adapted;
  }

  /**
     * Get empathetic phrase for emotion
     * @private
     */
  _getEmpathyPhrase(emotion) {
    const templates = this.empathyTemplates[emotion] || this.empathyTemplates.neutral;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  /**
     * Adjust response for specific emotion
     * @private
     */
  _adjustForEmotion(response, emotion) {
    let adjusted = response;

    switch (emotion) {
    case 'happy':
      // Use more enthusiastic language
      adjusted = adjusted.replace(/(is|are|was|were)/g, '$1');
      adjusted = adjusted.replace(/very/g, 'really');
      break;

    case 'sad':
      // Use gentler, more supportive language
      adjusted = adjusted.replace(/you should/g, 'you might want to');
      adjusted = adjusted.replace(/you need to/g, 'it could help to');
      break;

    case 'frustrated':
      // Use clear, patient language
      adjusted = adjusted.replace(/simply/g, '');
      adjusted = adjusted.replace(/just/g, '');
      break;

    case 'angry':
      // Use calm, professional language
      adjusted = adjusted.replace(/actually/g, '');
      adjusted = adjusted.replace(/obviously/g, '');
      break;

    default:
      // Neutral - no adjustments needed
      break;
    }

    return adjusted;
  }

  /**
     * Batch analyze sentiment for multiple texts
     * @param {Array<string>} texts - Array of texts to analyze
     * @returns {Promise<Array<object>>} - Array of sentiment results
     */
  async batchAnalyze(texts) {
    const results = [];
    for (const text of texts) {
      const result = await this.analyzeSentiment(text);
      results.push(result);
    }
    return results;
  }

  /**
     * Detect emotion intensity
     * @param {string} text - Text to analyze
     * @returns {Promise<number>} - Intensity score (0-1)
     */
  async detectIntensity(text) {
    const sentiment = await this.analyzeSentiment(text);
    const emotionScores = sentiment.emotionScores;

    // Calculate intensity based on max emotion score
    const maxScore = Math.max(...Object.values(emotionScores));

    // Normalize to 0-1 range
    const normalizedIntensity = Math.min(1, maxScore / 2);

    return normalizedIntensity;
  }

  /**
     * Get sentiment summary
     * @param {object} sentiment - Sentiment analysis result
     * @returns {string} - Human-readable summary
     */
  getSentimentSummary(sentiment) {
    if (!sentiment) {
      return 'Neutral sentiment';
    }

    const emotion = sentiment.emotion.charAt(0).toUpperCase() + sentiment.emotion.slice(1);
    const confidence = (sentiment.confidence * 100).toFixed(0);
    const sentimentStr = sentiment.sentimentValue > 0.2 ? 'positive'
      : sentiment.sentimentValue < -0.2 ? 'negative'
        : 'neutral';

    return `${emotion} (${confidence}% confidence, ${sentimentStr})`;
  }

  /**
     * Check if sentiment is negative
     * @param {object} sentiment - Sentiment analysis result
     * @returns {boolean} - True if negative
     */
  isNegative(sentiment) {
    if (!sentiment) {
      return false;
    }
    return sentiment.sentimentValue < -0.2 ||
               ['sad', 'frustrated', 'angry'].includes(sentiment.emotion);
  }

  /**
     * Check if sentiment is positive
     * @param {object} sentiment - Sentiment analysis result
     * @returns {boolean} - True if positive
     */
  isPositive(sentiment) {
    if (!sentiment) {
      return false;
    }
    return sentiment.sentimentValue > 0.2 && sentiment.emotion === 'happy';
  }

  /**
     * Get empathy level (0-1) based on sentiment
     * @param {object} sentiment - Sentiment analysis result
     * @returns {number} - Empathy level
     */
  getEmpathyLevel(sentiment) {
    if (!sentiment) {
      return 0;
    }

    // High empathy for negative emotions
    if (this.isNegative(sentiment)) {
      return sentiment.confidence;
    }

    // Low empathy for neutral
    if (sentiment.emotion === 'neutral') {
      return 0;
    }

    // Moderate empathy for positive
    return sentiment.confidence * 0.3;
  }

  /**
     * Export sentiment analyzer configuration
     */
  exportConfig() {
    return {
      confidenceThreshold: this.confidenceThreshold,
      useNLPAPI: this.useNLPAPI,
      language: this.language,
      emotionCount: Object.keys(this.emotionKeywords).length,
      positiveWordCount: this.positiveWords.length,
      negativeWordCount: this.negativeWords.length
    };
  }
}

module.exports = { SentimentAnalyzer };
