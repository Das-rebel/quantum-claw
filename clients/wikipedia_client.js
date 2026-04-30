/**
 * Wikipedia API Client - Quick facts and general knowledge retrieval
 *
 * Provides:
 * - Wikipedia API integration for article search and retrieval
 * - Entity extraction from user queries
 * - Voice-optimized summaries (150 words max)
 * - Entity disambiguation for ambiguous terms
 * - Rate limiting (500 requests/hour)
 * - Graceful fallback to AI when unavailable
 * - Caching strategy with 60-second TTL
 */

const { getCacheManager } = require('./cache_manager');
const { createValidator } = require('./response_validator');

class WikipediaClient {
  constructor(config = {}) {
    this.apiUrl = 'https://en.wikipedia.org/api/rest_v1';
    this.searchUrl = 'https://en.wikipedia.org/w/api.php';
    this.userAgent = config.userAgent || 'OpenClawAlexaBridge/1.0';

    // Cache configuration
    this.cacheManager = getCacheManager({
      maxSize: 200,
      ttl: 60000 // 60 seconds TTL
    });

    // Response validator
    this.validator = createValidator('Wikipedia');

    // Rate limiting configuration (500 requests/hour)
    this.rateLimit = {
      maxRequests: 500,
      windowMs: 3600000, // 1 hour
      requests: []
    };

    // AI fallback configuration
    this.cerebrasKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
    this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';

    // Disambiguation cache
    this.disambiguationCache = new Map();

    console.log('📖 Wikipedia Client initialized with 60s cache');
  }

  /**
     * Search Wikipedia for articles matching a query
     * @param {string} query - Search query
     * @param {number} limit - Maximum number of results (default: 5)
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Search results
     */
  async searchWikipedia(query, limit = 5, options = {}) {
    const { skipCache = false, locale = 'en' } = options;

    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query must be a non-empty string');
    }

    if (limit < 1 || limit > 10) {
      throw new Error('limit must be between 1 and 10');
    }

    const normalizedQuery = query.trim();
    const cacheKey = `wikipedia:search:${normalizedQuery}:${limit}:${locale}`;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        console.log(`📖 Cache hit for search: "${normalizedQuery}"`);
        return cached;
      }
    }

    // Check rate limit
    if (!this._checkRateLimit()) {
      console.warn('⚠️ Wikipedia rate limit reached, using fallback');
      return await this._aiFallbackSearch(normalizedQuery, limit, locale);
    }

    console.log(`📖 Searching Wikipedia: "${normalizedQuery}" (limit: ${limit})`);

    try {
      // Extract entities from query
      const entities = this._extractEntities(normalizedQuery);
      const searchQuery = entities.length > 0 ? entities[0] : normalizedQuery;

      // Build search URL
      const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchQuery,
        srlimit: limit.toString(),
        format: 'json',
        origin: '*'
      });

      const url = `${this.searchUrl}?${searchParams.toString()}`;

      // Fetch from Wikipedia API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }

      const data = await response.json();
      const results = data.query?.search || [];

      // Check for disambiguation pages
      if (results.length > 0 && this._isDisambiguationPage(results[0])) {
        console.log('📖 Disambiguation page detected, fetching alternatives');
        const alternatives = await this._getDisambiguationAlternatives(searchQuery);

        const result = {
          success: true,
          query: normalizedQuery,
          disambiguation: true,
          alternatives: alternatives,
          totalResults: alternatives.length,
          timestamp: new Date().toISOString()
        };

        this.cacheManager.set(cacheKey, result);
        return result;
      }

      // Format results for voice delivery
      const formattedResults = await this._formatSearchResults(results, limit);

      const result = {
        success: true,
        query: normalizedQuery,
        articles: formattedResults,
        totalResults: formattedResults.length,
        timestamp: new Date().toISOString()
      };

      // Validate response
      const validationResult = this.validator.validateWikipediaResponse(result);
      if (!validationResult.valid) {
        console.warn(`[Wikipedia] Response validation warning: ${validationResult.error}`);
        result.validationWarning = validationResult.error;
      } else {
        console.log('[Wikipedia] Response validation passed');
      }

      this.cacheManager.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`❌ Wikipedia search failed: ${error.message}`);
      return await this._aiFallbackSearch(normalizedQuery, limit, locale);
    }
  }

  /**
     * Get a summary of a Wikipedia article
     * @param {string} title - Article title
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Article summary
     */
  async getSummary(title, options = {}) {
    const { skipCache = false, sentences = 3, locale = 'en' } = options;

    // Validate inputs
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Title must be a non-empty string');
    }

    const normalizedTitle = title.trim();
    const cacheKey = `wikipedia:summary:${normalizedTitle}:${sentences}:${locale}`;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        console.log(`📖 Cache hit for summary: "${normalizedTitle}"`);
        return cached;
      }
    }

    // Check rate limit
    if (!this._checkRateLimit()) {
      console.warn('⚠️ Wikipedia rate limit reached, using fallback');
      return await this._aiFallbackSummary(normalizedTitle, sentences, locale);
    }

    console.log(`📖 Fetching summary: "${normalizedTitle}"`);

    try {
      // Build summary URL
      const url = `${this.apiUrl}/page/summary/${encodeURIComponent(normalizedTitle)}`;

      // Fetch from Wikipedia API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }

      const data = await response.json();

      // Optimize for voice delivery (150 words max)
      const voiceOptimized = this._optimizeForVoice(data.extract || '', 150);

      const result = {
        success: true,
        title: data.title,
        summary: voiceOptimized,
        extract: data.extract,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(normalizedTitle)}`,
        image: data.thumbnail?.source || null,
        timestamp: new Date().toISOString()
      };

      // Validate response
      const validationResult = this.validator.validateWikipediaResponse(result);
      if (!validationResult.valid) {
        console.warn(`[Wikipedia] Summary validation warning: ${validationResult.error}`);
        result.validationWarning = validationResult.error;
      } else {
        console.log('[Wikipedia] Summary validation passed');
      }

      this.cacheManager.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`❌ Wikipedia summary failed: ${error.message}`);
      return await this._aiFallbackSummary(normalizedTitle, sentences, locale);
    }
  }

  /**
     * Get full article content
     * @param {string} title - Article title
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Article content
     */
  async getArticle(title, options = {}) {
    const { skipCache = false, locale = 'en' } = options;

    const normalizedTitle = title.trim();
    const cacheKey = `wikipedia:article:${normalizedTitle}:${locale}`;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        console.log(`📖 Cache hit for article: "${normalizedTitle}"`);
        return cached;
      }
    }

    // Check rate limit
    if (!this._checkRateLimit()) {
      console.warn('⚠️ Wikipedia rate limit reached, using fallback');
      return await this._aiFallbackSummary(normalizedTitle, 5, locale);
    }

    console.log(`📖 Fetching article: "${normalizedTitle}"`);

    try {
      // Build article URL
      const url = `${this.apiUrl}/page/html/${encodeURIComponent(normalizedTitle)}`;

      // Fetch from Wikipedia API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}`);
      }

      const html = await response.text();

      // Also get summary for metadata
      const summaryResult = await this.getSummary(normalizedTitle, { skipCache: true });

      const result = {
        success: true,
        title: summaryResult.title,
        summary: summaryResult.summary,
        content: html,
        url: summaryResult.url,
        image: summaryResult.image,
        timestamp: new Date().toISOString()
      };

      this.cacheManager.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`❌ Wikipedia article failed: ${error.message}`);
      return await this._aiFallbackSummary(normalizedTitle, 5, locale);
    }
  }

  /**
     * Extract entities from user query
     * @param {string} query - User query
     * @returns {Array} - Array of entity strings
     * @private
     */
  _extractEntities(query) {
    const entities = [];
    const words = query.split(/\s+/);

    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'with', 'by', 'from', 'about', 'find', 'search', 'look', 'get', 'tell', 'me',
      'what', 'who', 'when', 'where', 'why', 'how', 'is', 'are', 'was', 'were'
    ]);

    // Extract capitalized words (potential proper nouns)
    const properNouns = words.filter(word =>
      word.length > 2 &&
            !stopWords.has(word.toLowerCase()) &&
            /^[A-Z]/.test(word)
    );

    if (properNouns.length > 0) {
      entities.push(properNouns.join(' '));
    }

    // Extract quoted phrases
    const quotedPhrases = query.match(/"([^"]+)"/g);
    if (quotedPhrases) {
      entities.push(...quotedPhrases.map(phrase => phrase.replace(/"/g, '')));
    }

    // If no entities found, use the query without stop words
    if (entities.length === 0) {
      const filtered = words.filter(word => !stopWords.has(word.toLowerCase()));
      if (filtered.length > 0) {
        entities.push(filtered.join(' '));
      }
    }

    return entities;
  }

  /**
     * Check if page is a disambiguation page
     * @param {object} result - Search result
     * @returns {boolean} - True if disambiguation page
     * @private
     */
  _isDisambiguationPage(result) {
    const title = result.title?.toLowerCase() || '';
    const snippet = result.snippet?.toLowerCase() || '';

    // Check for disambiguation indicators
    const disambiguationIndicators = [
      'disambiguation',
      'may refer to',
      'refers to',
      'redirects here'
    ];

    return disambiguationIndicators.some(indicator =>
      title.includes(indicator) || snippet.includes(indicator)
    );
  }

  /**
     * Get disambiguation alternatives
     * @param {string} query - Original query
     * @returns {Promise<Array>} - Array of alternatives
     * @private
     */
  async _getDisambiguationAlternatives(query) {
    const cacheKey = `disambiguation:${query}`;

    // Check cache
    if (this.disambiguationCache.has(cacheKey)) {
      return this.disambiguationCache.get(cacheKey);
    }

    try {
      // Search for related articles
      const searchParams = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: `${query} (NOT disambiguation)`,
        srlimit: '10',
        format: 'json',
        origin: '*'
      });

      const url = `${this.searchUrl}?${searchParams.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent
        },
        timeout: 10000
      });

      const data = await response.json();
      const results = data.query?.search || [];

      // Format alternatives
      const alternatives = results.slice(0, 5).map(result => ({
        title: result.title,
        snippet: result.snippet.replace(/<[^>]+>/g, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`
      }));

      // Cache results
      this.disambiguationCache.set(cacheKey, alternatives);

      // Limit cache size
      if (this.disambiguationCache.size > 100) {
        const firstKey = this.disambiguationCache.keys().next().value;
        this.disambiguationCache.delete(firstKey);
      }

      return alternatives;

    } catch (error) {
      console.error(`❌ Disambiguation search failed: ${error.message}`);
      return [];
    }
  }

  /**
     * Format search results for voice delivery
     * @param {Array} results - Wikipedia search results
     * @param {number} limit - Maximum results
     * @returns {Promise<Array>} - Formatted results
     * @private
     */
  async _formatSearchResults(results, limit) {
    const formatted = [];

    for (const result of results.slice(0, limit)) {
      try {
        // Get summary for each result
        const summary = await this.getSummary(result.title, { skipCache: false });

        formatted.push({
          title: result.title,
          summary: summary.summary,
          snippet: result.snippet.replace(/<[^>]+>/g, ''),
          url: summary.url,
          image: summary.image,
          wordCount: summary.summary.split(/\s+/).length
        });
      } catch (error) {
        console.warn(`⚠️ Failed to format result "${result.title}": ${error.message}`);
        // Fallback to snippet
        formatted.push({
          title: result.title,
          summary: this._optimizeForVoice(result.snippet.replace(/<[^>]+>/g, ''), 50),
          snippet: result.snippet.replace(/<[^>]+>/g, ''),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
          image: null,
          wordCount: 50
        });
      }
    }

    return formatted;
  }

  /**
     * Optimize text for voice delivery
     * @param {string} text - Original text
     * @param {number} maxWords - Maximum word count
     * @returns {string} - Voice-optimized text
     * @private
     */
  _optimizeForVoice(text, maxWords) {
    if (!text) return '';

    // Remove HTML tags
    let optimized = text.replace(/<[^>]+>/g, '');

    // Remove excessive whitespace
    optimized = optimized.replace(/\s+/g, ' ').trim();

    // Split into words
    const words = optimized.split(/\s+/);

    // Truncate if too long
    if (words.length > maxWords) {
      optimized = words.slice(0, maxWords).join(' ');

      // Try to end at sentence boundary
      const lastPeriod = optimized.lastIndexOf('.');
      if (lastPeriod > maxWords * 0.7) {
        optimized = optimized.substring(0, lastPeriod + 1);
      } else {
        optimized += '...';
      }
    }

    return optimized;
  }

  /**
     * Check rate limit
     * @returns {boolean} - True if under rate limit
     * @private
     */
  _checkRateLimit() {
    const now = Date.now();

    // Remove old requests outside the window
    this.rateLimit.requests = this.rateLimit.requests.filter(
      timestamp => now - timestamp < this.rateLimit.windowMs
    );

    // Check if we're under the limit
    if (this.rateLimit.requests.length >= this.rateLimit.maxRequests) {
      return false;
    }

    // Add current request
    this.rateLimit.requests.push(now);
    return true;
  }

  /**
     * AI fallback search
     * @param {string} query - Original query
     * @param {number} limit - Maximum results
     * @param {string} locale - Locale
     * @returns {Promise<object>} - AI-generated results
     * @private
     */
  async _aiFallbackSearch(query, limit, locale) {
    console.log(`🤖 Using AI fallback for Wikipedia search: "${query}"`);

    const prompt = `Provide ${limit} concise facts about "${query}" for voice delivery.

For each fact:
1. Keep it under 30 words
2. Make it conversational and easy to understand
3. Focus on the most important information
4. Format as a numbered list

Keep the total response under 150 words.`;

    const systemPrompt = 'You are a helpful assistant providing factual information from general knowledge. Be accurate, concise, and conversational.';

    try {
      const result = await this._callAI(prompt, systemPrompt);

      if (result) {
        return {
          success: true,
          query: query,
          fallbackUsed: true,
          articles: [{
            title: query,
            summary: this._optimizeForVoice(result, 150),
            snippet: result,
            url: null,
            image: null,
            wordCount: result.split(/\s+/).length
          }],
          totalResults: 1,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`❌ AI fallback failed: ${error.message}`);
    }

    // Final fallback response
    return {
      success: false,
      query: query,
      fallbackUsed: true,
      articles: [],
      totalResults: 0,
      error: 'According to Wikipedia, I couldn\'t find specific information about that topic right now. Please try again later.',
      timestamp: new Date().toISOString()
    };
  }

  /**
     * AI fallback summary
     * @param {string} title - Article title
     * @param {number} sentences - Number of sentences
     * @param {string} locale - Locale
     * @returns {Promise<object>} - AI-generated summary
     * @private
     */
  async _aiFallbackSummary(title, sentences, locale) {
    console.log(`🤖 Using AI fallback for Wikipedia summary: "${title}"`);

    const prompt = `Provide a ${sentences}-sentence summary of "${title}" for voice delivery.

Keep it under 150 words. Make it conversational and easy to understand.
Start with "According to Wikipedia..."`;

    const systemPrompt = 'You are a helpful assistant providing factual summaries from general knowledge. Be accurate, concise, and conversational.';

    try {
      const result = await this._callAI(prompt, systemPrompt);

      if (result) {
        return {
          success: true,
          title: title,
          summary: this._optimizeForVoice(result, 150),
          extract: result,
          url: null,
          image: null,
          fallbackUsed: true,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error(`❌ AI fallback failed: ${error.message}`);
    }

    // Final fallback response
    return {
      success: false,
      title: title,
      summary: 'According to Wikipedia, I couldn\'t retrieve the summary at this time.',
      extract: null,
      url: null,
      image: null,
      fallbackUsed: true,
      error: 'Unable to retrieve Wikipedia summary',
      timestamp: new Date().toISOString()
    };
  }

  /**
     * Call AI API
     * @param {string} prompt - User prompt
     * @param {string} systemPrompt - System prompt
     * @returns {Promise<string|null>} - AI response or null
     * @private
     */
  async _callAI(prompt, systemPrompt) {
    const providers = [
      {
        name: 'cerebras',
        key: this.cerebrasKey,
        baseUrl: this.cerebrasBaseUrl,
        model: 'llama3.1-8b'
      },
      {
        name: 'groq',
        key: this.groqKey,
        baseUrl: this.groqBaseUrl,
        model: 'llama-3.3-70b-versatile'
      }
    ];

    for (const provider of providers) {
      if (!provider.key) {
        console.warn(`⚠️ ${provider.name} API key not configured`);
        continue;
      }

      try {
        console.log(`🤖 Calling ${provider.name} for Wikipedia...`);

        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.key}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            max_tokens: 300,
            temperature: 0.7
          }),
          timeout: 8000
        });

        if (!response.ok) {
          throw new Error(`${provider.name} API returned ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();

        if (result) {
          console.log(`✅ ${provider.name} Wikipedia response received`);
          return result;
        }
      } catch (error) {
        console.warn(`⚠️ ${provider.name} AI call failed: ${error.message}`);
        continue;
      }
    }

    return null;
  }

  /**
     * Check if query is Wikipedia-related
     * @param {string} query - Query string
     * @returns {boolean} - True if Wikipedia-related
     */
  isWikipediaQuery(query) {
    const wikipediaIndicators = [
      'wikipedia', 'wiki', 'encyclopedia', 'encyclopædia',
      'according to wikipedia', 'on wikipedia', 'from wikipedia',
      'tell me about', 'what is', 'who is', 'what are'
    ];

    const lowerQuery = query.toLowerCase();
    return wikipediaIndicators.some(indicator =>
      lowerQuery.includes(indicator.toLowerCase())
    );
  }

  /**
     * Get cache statistics
     * @returns {object} - Cache statistics
     */
  getCacheStats() {
    return this.cacheManager.getStats();
  }

  /**
     * Clear cache
     */
  clearCache() {
    this.cacheManager.clear();
    this.disambiguationCache.clear();
    console.log('📖 Wikipedia cache cleared');
  }

  /**
     * Get validation statistics
     */
  getValidationStats() {
    return this.validator.getStats();
  }

  /**
     * Reset validation statistics
     */
  resetValidationStats() {
    this.validator.resetStats();
  }
}

module.exports = WikipediaClient;
