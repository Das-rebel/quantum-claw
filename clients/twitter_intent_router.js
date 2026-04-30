/**
 * Twitter Intent Router
 * Detects Twitter-specific queries and routes appropriately
 *
 * Prioritizes Twitter API for:
 * - Elon Musk tweets
 * - Specific user tweets
 * - Trending topics
 * - Twitter/X search
 * - Social media opinions
 */

class TwitterIntentRouter {
  constructor() {
    this.patterns = {
      // Elon Musk specific (highest priority)
      elonMusk: /elon\s+musk|what did elon tweet|elon's latest|elon's recent/i,

      // Specific user with @ or "tweet from"
      specificUser: /(?:tweets?\s+(?:from|by)|@)(\w+)/i,

      // "tweet from {name}" or "{name}'s tweet" - more flexible to catch multi-word names
      userTweet: /(?:recent|latest)?\s*tweet\s+(?:from|by)\s+[\w\s]+|[\w']+(?:\s+(?:recent|latest)?\s*tweet)/i,

      // Trending topics
      trending: /trending|what'?s\s+hot|what'?s\s+popular|latest\s+trends|what'?s\s+trending/i,

      // Opinion/Sentiment queries
      opinion: /what does?\s+(?:twitter|x|people)\s+say\s+about|opinions?\s+(?:on|about)|twitter\s+(?:think|feel|say)/i,

      // General Twitter/X mentions - expanded patterns
      twitterSearch: /(?:search\s+)?(?:twitter|x|tweets?)(?:\s+for|\s+about|from|on)|on\s+(?:twitter|x)|tweet|from/i,

      // Latest news (Twitter is fastest for breaking news)
      latestNews: /latest\s+news|breaking\s+news|what'?s\s+happening\s+now|current\s+news/i
    };
  }

  /**
     * Detect intent from query
     * @param {string} query - User's query
     * @returns {Object|null} Intent object with type and metadata
     */
  detect(query) {
    const trimmedQuery = query.trim();

    // 1. Check for Elon Musk (highest priority)
    if (this.patterns.elonMusk.test(trimmedQuery)) {
      return {
        type: 'elon-musk',
        priority: 'high',
        source: 'twitter-api',
        handler: 'getElonMuskTweets'
      };
    }

    // 2. Check for specific user
    const userMatch = trimmedQuery.match(this.patterns.specificUser);
    if (userMatch) {
      const username = userMatch[1];
      return {
        type: 'user-tweets',
        priority: 'high',
        source: 'twitter-api',
        handler: 'getUserTweets',
        metadata: { username }
      };
    }

    // 3. Check for trending topics
    if (this.patterns.trending.test(trimmedQuery)) {
      return {
        type: 'trending',
        priority: 'medium',
        source: 'twitter-api',
        handler: 'getTrendingTopics'
      };
    }

    // 4. Check for opinion/sentiment queries
    if (this.patterns.opinion.test(trimmedQuery)) {
      return {
        type: 'opinion',
        priority: 'medium',
        source: 'twitter-api',
        handler: 'searchTwitter',
        metadata: { extractTopic: true }
      };
    }

    // 5. Check for latest news (Twitter is fastest source)
    if (this.patterns.latestNews.test(trimmedQuery)) {
      return {
        type: 'latest-news',
        priority: 'medium',
        source: 'hybrid', // Try Twitter first, fallback to Tavily
        handler: 'getLatestNews'
      };
    }

    // 6. Check for general Twitter/X search
    if (this.patterns.twitterSearch.test(trimmedQuery)) {
      return {
        type: 'twitter-search',
        priority: 'medium',
        source: 'twitter-api',
        handler: 'searchTwitter',
        metadata: { extractTopic: true }
      };
    }

    // No Twitter-specific intent detected
    return null;
  }

  /**
     * Check if query is Twitter-related
     * @param {string} query - User's query
     * @returns {boolean}
     */
  isTwitterQuery(query) {
    return this.detect(query) !== null;
  }

  /**
     * Extract search topic from query
     * @param {string} query - User's query
     * @param {string} intentType - Type of intent
     * @returns {string} Extracted topic
     */
  extractTopic(query, intentType) {
    const lowerQuery = query.toLowerCase();

    switch (intentType) {
    case 'opinion':
      // Extract what comes after "say about"
      const opinionMatch = lowerQuery.match(/say about\s+(.+)|opinions?\s+(?:on|about)\s+(.+)/i);
      return opinionMatch ? opinionMatch[1].trim() : query;

    case 'twitter-search':
      // Extract what comes after "for" or "about"
      const searchMatch = lowerQuery.match(/(?:search\s+)?(?:twitter|x|tweets?)\s+(?:for|about)\s+(.+)/i);
      return searchMatch ? searchMatch[1].trim() : query;

    case 'latest-news':
      // Extract topic after "news"
      const newsMatch = lowerQuery.match(/news\s+(?:about|on)?\s*(.+)/i);
      return newsMatch ? newsMatch[1].trim() : 'news';

    default:
      return query;
    }
  }

  /**
     * Get confidence score for intent detection
     * @param {string} query - User's query
     * @returns {Object} Confidence score and reasoning
     */
  getConfidence(query) {
    const intent = this.detect(query);

    if (!intent) {
      return {
        score: 0,
        reasoning: 'No Twitter-specific patterns detected'
      };
    }

    let score = 0.5; // Base score
    let reasoning = [];

    // Boost score based on intent type
    if (intent.type === 'elon-musk') {
      score = 0.95;
      reasoning.push('Explicit mention of Elon Musk');
    } else if (intent.type === 'user-tweets') {
      score = 0.9;
      reasoning.push('Specific username or "tweet from" pattern');
    } else if (intent.type === 'trending') {
      score = 0.85;
      reasoning.push('Trending keywords detected');
    } else if (intent.type === 'opinion') {
      score = 0.8;
      reasoning.push('Opinion/sentiment query pattern');
    } else if (intent.type === 'twitter-search') {
      score = 0.75;
      reasoning.push('Twitter/X keyword detected');
    } else if (intent.type === 'latest-news') {
      score = 0.7;
      reasoning.push('Latest news query (Twitter is fastest source)');
    }

    return {
      score,
      reasoning: reasoning.join(', '),
      intent
    };
  }
}

module.exports = TwitterIntentRouter;
