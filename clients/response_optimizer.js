/**
 * Response Optimizer for Twitter Data
 * Formats tweets and trends for Alexa speech
 *
 * Goals:
 * - Natural, conversational responses
 * - Under 280 characters (for speech)
 * - Remove URLs, mentions, hashtags
 * - Add appropriate attribution
 */

class ResponseOptimizer {
  constructor() {
    this.maxResponseLength = 280;
    this.maxTweetLength = 200;
  }

  /**
     * Format a single tweet for speech
     * @param {Object} tweet - Tweet object
     * @returns {string} Formatted text
     */
  formatTweet(tweet) {
    if (!tweet || !tweet.text) {
      return '';
    }

    // Extract text
    const text = tweet.text;

    // Clean up text for speech
    const cleanText = this._cleanText(text);

    // Truncate if necessary
    if (cleanText.length > this.maxTweetLength) {
      return this._truncate(cleanText, this.maxTweetLength);
    }

    return cleanText;
  }

  /**
     * Format multiple tweets for speech
     * @param {Array} tweets - Array of tweet objects
     * @param {number} maxTweets - Maximum tweets to include
     * @returns {string} Formatted text
     */
  formatMultipleTweets(tweets, maxTweets = 3) {
    if (!tweets || tweets.length === 0) {
      return 'No tweets found.';
    }

    const formatted = tweets
      .slice(0, maxTweets)
      .map(tweet => this.formatTweet(tweet))
      .filter(text => text.length > 0);

    if (formatted.length === 0) {
      return 'No tweet content available.';
    }

    return formatted.join('. ');
  }

  /**
     * Format Elon Musk tweets for speech
     * @param {Array} tweets - Array of Elon's tweets
     * @returns {string} Formatted text
     */
  formatElonMuskTweets(tweets) {
    if (!tweets || tweets.length === 0) {
      return "Elon Musk hasn't tweeted recently.";
    }

    const formatted = this.formatMultipleTweets(tweets, 3);

    return `Elon Musk recently tweeted: ${formatted}`;
  }

  /**
     * Format user tweets for speech
     * @param {Array} tweets - Array of tweets
     * @param {string} username - Username
     * @returns {string} Formatted text
     */
  formatUserTweets(tweets, username) {
    if (!tweets || tweets.length === 0) {
      return `Couldn't find recent tweets from ${username}.`;
    }

    const formatted = this.formatMultipleTweets(tweets, 3);

    return `According to ${username}'s recent tweets: ${formatted}`;
  }

  /**
     * Format trending topics for speech
     * @param {Array} trends - Array of trending topics
     * @param {number} maxTopics - Maximum topics to include
     * @returns {string} Formatted text
     */
  formatTrendingTopics(trends, maxTopics = 5) {
    if (!trends || trends.length === 0) {
      return 'No trending topics available right now.';
    }

    const top = trends.slice(0, maxTopics);
    const formatted = top.map((t, i) => t.name).join(', ');

    return `Here's what's trending on Twitter: ${formatted}`;
  }

  /**
     * Format Twitter search results for speech
     * @param {Array} tweets - Array of tweets
     * @param {string} topic - Search topic
     * @returns {string} Formatted text
     */
  formatSearchResults(tweets, topic) {
    if (!tweets || tweets.length === 0) {
      return `Couldn't find any tweets about ${topic}.`;
    }

    // Extract top 2-3 unique points
    const uniquePoints = tweets
      .slice(0, 3)
      .map(tweet => this.formatTweet(tweet))
      .filter(text => text.length > 0);

    if (uniquePoints.length === 0) {
      return `Found tweets about ${topic}, but couldn't extract readable content.`;
    }

    const points = uniquePoints.join('. ');
    return `According to Twitter, ${points}`;
  }

  /**
     * Format opinion/sentiment results for speech
     * @param {Array} tweets - Array of tweets
     * @param {string} topic - Topic being discussed
     * @returns {string} Formatted text
     */
  formatOpinionResults(tweets, topic) {
    if (!tweets || tweets.length === 0) {
      return `Couldn't find what people are saying about ${topic}.`;
    }

    const sampleSize = tweets.length;
    const formatted = this.formatMultipleTweets(tweets, 2);

    return `Here's what Twitter is saying about ${topic}: ${formatted}`;
  }

  /**
     * Optimize response for SSML speech
     * @param {string} text - Text to optimize
     * @returns {string} SSML-enhanced text
     */
  optimizeForSpeech(text) {
    if (!text) return '';

    // Add pauses for longer responses
    if (text.length > 200) {
      return text.replace(/\.\s+/g, '. <break time="300ms"/> ');
    }

    return text;
  }

  /**
     * Clean text for speech (remove URLs, mentions, hashtags)
     * @private
     */
  _cleanText(text) {
    return text
      .replace(/https?:\/\/\S+/g, '')  // Remove URLs
      .replace(/www\.\S+/g, '')         // Remove www URLs
      .replace(/@\w+/g, '')            // Remove mentions
      .replace(/#/g, '')               // Remove hashtag symbol
      .replace(/\s+/g, ' ')            // Normalize whitespace
      .trim();
  }

  /**
     * Truncate text at word boundary
     * @private
     */
  _truncate(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    // Find last complete word before maxLength
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      // Truncate at word boundary if it's not too far back
      return truncated.substring(0, lastSpace) + '...';
    }

    // Otherwise truncate at maxLength
    return truncated + '...';
  }

  /**
     * Add attribution to response
     * @param {string} response - Original response
     * @param {string} source - Source attribution
     * @returns {string} Response with attribution
     */
  addAttribution(response, source) {
    if (!response) return '';

    // Check if attribution already exists
    if (response.toLowerCase().includes('according to') ||
            response.toLowerCase().includes('twitter says') ||
            response.toLowerCase().includes('tweets')) {
      return response;
    }

    return `According to ${source}, ${response}`;
  }

  /**
     * Truncate response to max length
     * @param {string} response - Response to truncate
     * @returns {string} Truncated response
     */
  truncateResponse(response) {
    if (!response) return '';

    if (response.length <= this.maxResponseLength) {
      return response;
    }

    return this._truncate(response, this.maxResponseLength);
  }
}

module.exports = ResponseOptimizer;
