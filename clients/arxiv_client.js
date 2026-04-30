/**
 * Arxiv API Client - Academic paper search with AI-powered summarization
 *
 * Provides:
 * - Arxiv API integration for research paper search
 * - Query optimization for better results
 * - Pagination support with relevance/lastUpdatedDate sorting
 * - AI-powered abstract summarization for voice delivery (100 words limit)
 * - Graceful fallback to AI search when Arxiv fails
 * - Caching strategy with 60-second TTL to reduce API calls
 */

const { getCacheManager } = require('./cache_manager');
const { getModelRouter } = require('./model_router');
const { createValidator } = require('./response_validator');

class ArxivClient {
  constructor(config = {}) {
    this.apiUrl = 'https://export.arxiv.org/api/query';
    this.cacheManager = getCacheManager({
      maxSize: 200,
      ttl: 60000 // 60 seconds TTL
    });
    this.modelRouter = getModelRouter(config.modelRouter);
    this.validator = createValidator('Arxiv');

    // Provider configurations for AI summarization
    this.providers = {
      cerebras: {
        baseUrl: 'https://api.cerebras.ai/v1',
        model: 'llama3.1-8b',
        apiKey: config.cerebrasApiKey || process.env.CEREBRAS_API_KEY
      },
      groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        apiKey: config.groqApiKey || process.env.GROQ_API_KEY
      }
    };

    console.log('📚 Arxiv Client initialized with 60s cache');
  }

  /**
     * Search Arxiv for academic papers
     * @param {string} query - Search query
     * @param {number} maxResults - Maximum number of results (default: 5)
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Search results with summaries
     */
  async searchArxiv(query, maxResults = 5, options = {}) {
    const {
      sortBy = 'lastUpdatedDate',
      sortOrder = 'descending',
      start = 0,
      skipCache = false
    } = options;

    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query must be a non-empty string');
    }

    if (maxResults < 1 || maxResults > 20) {
      throw new Error('maxResults must be between 1 and 20');
    }

    const normalizedQuery = query.trim();
    const cacheKey = `arxiv:${normalizedQuery}:${maxResults}:${sortBy}`;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        console.log(`📚 Cache hit for query: "${normalizedQuery}"`);
        return cached;
      }
    }

    console.log(`📚 Searching Arxiv: "${normalizedQuery}" (maxResults: ${maxResults})`);

    try {
      // Optimize query for Arxiv API
      const optimizedQuery = this.optimizeQuery(normalizedQuery);

      // Build Arxiv API URL
      const searchUrl = this.buildSearchUrl(optimizedQuery, {
        start,
        maxResults,
        sortBy,
        sortOrder
      });

      // Fetch from Arxiv API
      const papers = await this.fetchArxivPapers(searchUrl);

      // Summarize abstracts using AI
      const summarizedPapers = await this.summarizePapers(papers, normalizedQuery);

      const result = {
        success: true,
        query: normalizedQuery,
        papers: summarizedPapers,
        totalResults: summarizedPapers.length,
        timestamp: new Date().toISOString()
      };

      // Validate response
      try {
        this.validator.validateArxivResponse(result);
      } catch (validationError) {
        console.warn(`[Arxiv] Response validation warning: ${validationError.message}`);
      }

      // Cache the result
      this.cacheManager.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`❌ Arxiv search failed: ${error.message}`);

      // Graceful fallback to AI search
      console.log('📚 Falling back to AI-powered search');
      return await this.aiFallbackSearch(normalizedQuery, maxResults);
    }
  }

  /**
     * Optimize query for better Arxiv API results
     * @param {string} query - Original query
     * @returns {string} - Optimized query
     */
  optimizeQuery(query) {
    // Remove common stop words and focus on key terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'with', 'by', 'from', 'about', 'find', 'search', 'look', 'get', 'tell', 'me'
    ]);

    const words = query.toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // If too few words left, use original query
    if (words.length < 2) {
      return `all:${query}`;
    }

    // Build optimized query with field operators
    const optimized = words.map(word => `all:${word}`).join(' AND ');
    return optimized;
  }

  /**
     * Build Arxiv API search URL
     * @param {string} query - Search query
     * @param {object} params - URL parameters
     * @returns {string} - Complete URL
     */
  buildSearchUrl(query, params = {}) {
    const {
      start = 0,
      maxResults = 5,
      sortBy = 'lastUpdatedDate',
      sortOrder = 'descending'
    } = params;

    const searchParams = new URLSearchParams({
      search_query: query,
      start: start.toString(),
      max_results: maxResults.toString(),
      sortBy: sortBy,
      sortOrder: sortOrder
    });

    return `${this.apiUrl}?${searchParams.toString()}`;
  }

  /**
     * Fetch papers from Arxiv API
     * @param {string} url - Arxiv API URL
     * @returns {Promise<Array>} - Array of paper objects
     */
  async fetchArxivPapers(url) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/atom+xml'
        },
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Arxiv API returned ${response.status}`);
      }

      const xml = await response.text();
      return this.parseArxivXml(xml);
    } catch (error) {
      throw new Error(`Failed to fetch Arxiv papers: ${error.message}`);
    }
  }

  /**
     * Parse Arxiv Atom XML response
     * @param {string} xml - XML string
     * @returns {Array} - Array of paper objects
     */
  parseArxivXml(xml) {
    const papers = [];

    // Simple XML parsing without external dependencies
    const entries = this.extractXmlEntries(xml);

    for (const entry of entries) {
      const paper = {
        id: this.extractXmlContent(entry, 'id'),
        title: this.cleanXmlContent(this.extractXmlContent(entry, 'title')),
        authors: this.extractAuthors(entry),
        summary: this.cleanXmlContent(this.extractXmlContent(entry, 'summary')),
        published: this.extractXmlContent(entry, 'published'),
        updated: this.extractXmlContent(entry, 'updated'),
        categories: this.extractCategories(entry),
        url: this.extractXmlContent(entry, 'id')
      };

      // Extract Arxiv ID
      const idMatch = paper.id.match(/arxiv\.org\/abs\/(.+)/);
      if (idMatch) {
        paper.arxivId = idMatch[1];
      }

      papers.push(paper);
    }

    return papers;
  }

  /**
     * Extract entries from XML
     * @param {string} xml - XML string
     * @returns {Array} - Array of entry strings
     */
  extractXmlEntries(xml) {
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      entries.push(match[1]);
    }

    return entries;
  }

  /**
     * Extract content from XML tag
     * @param {string} xml - XML string
     * @param {string} tagName - Tag name
     * @returns {string} - Tag content
     */
  extractXmlContent(xml, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = regex.exec(xml);
    return match ? match[1].trim() : '';
  }

  /**
     * Clean XML content (remove HTML tags, normalize whitespace)
     * @param {string} content - Raw content
     * @returns {string} - Cleaned content
     */
  cleanXmlContent(content) {
    return content
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
     * Extract authors from entry
     * @param {string} entry - Entry XML
     * @returns {Array} - Array of author names
     */
  extractAuthors(entry) {
    const authors = [];
    const nameRegex = /<name>([\s\S]*?)<\/name>/g;
    let match;

    while ((match = nameRegex.exec(entry)) !== null) {
      authors.push(match[1].trim());
    }

    return authors.slice(0, 5); // Limit to first 5 authors
  }

  /**
     * Extract categories from entry
     * @param {string} entry - Entry XML
     * @returns {Array} - Array of category terms
     */
  extractCategories(entry) {
    const categories = [];
    const categoryRegex = /<category[^>]*term="([^"]+)"/g;
    let match;

    while ((match = categoryRegex.exec(entry)) !== null) {
      categories.push(match[1]);
    }

    return categories.slice(0, 5); // Limit to first 5 categories
  }

  /**
     * Summarize papers using AI for voice delivery
     * @param {Array} papers - Array of paper objects
     * @param {string} originalQuery - Original search query
     * @returns {Promise<Array>} - Array of papers with summaries
     */
  async summarizePapers(papers, originalQuery) {
    const summarizedPapers = [];

    for (const paper of papers) {
      try {
        const summary = await this.summarizeAbstract(paper.abstract, paper.title, originalQuery);

        summarizedPapers.push({
          title: paper.title,
          authors: paper.authors.slice(0, 3).join(', '),
          summary: summary,
          published: new Date(paper.published).toLocaleDateString(),
          arxivId: paper.arxivId,
          url: paper.url
        });
      } catch (error) {
        console.warn(`⚠️ Failed to summarize paper "${paper.title.substring(0, 50)}...": ${error.message}`);

        // Fallback to truncated abstract
        const truncatedSummary = paper.summary.substring(0, 100).trim() + '...';
        summarizedPapers.push({
          title: paper.title,
          authors: paper.authors.slice(0, 3).join(', '),
          summary: truncatedSummary,
          published: new Date(paper.published).toLocaleDateString(),
          arxivId: paper.arxivId,
          url: paper.url
        });
      }
    }

    return summarizedPapers;
  }

  /**
     * Summarize abstract using AI (100 words limit for voice delivery)
     * @param {string} abstract - Paper abstract
     * @param {string} title - Paper title
     * @param {string} query - Original search query
     * @returns {Promise<string>} - Summarized abstract
     */
  async summarizeAbstract(abstract, title, query) {
    const prompt = `Summarize this research paper abstract in exactly 100 words or less for voice delivery. Focus on key findings and relevance.

Title: ${title}

Abstract: ${abstract}

Make it conversational and easy to understand.`;

    const systemPrompt = 'You are a helpful research assistant. Summarize academic papers clearly and concisely for voice delivery. Maximum 100 words.';

    try {
      // Try primary provider first
      const result = await this.callAI(prompt, systemPrompt);
      if (result) {
        // Ensure 100 word limit
        const words = result.split(/\s+/);
        if (words.length > 100) {
          return words.slice(0, 100).join(' ') + '...';
        }
        return result;
      }
    } catch (error) {
      console.warn(`⚠️ AI summarization failed: ${error.message}`);
    }

    // Fallback to first 100 words of abstract
    const fallbackWords = abstract.split(/\s+/).slice(0, 100).join(' ');
    return fallbackWords + '...';
  }

  /**
     * Call AI provider for summarization
     * @param {string} prompt - User prompt
     * @param {string} systemPrompt - System prompt
     * @returns {Promise<string|null>} - AI response or null
     */
  async callAI(prompt, systemPrompt) {
    const providers = ['cerebras', 'groq'];

    for (const providerName of providers) {
      const provider = this.providers[providerName];

      if (!provider.apiKey) {
        console.warn(`⚠️ ${providerName} API key not configured`);
        continue;
      }

      try {
        console.log(`🤖 Calling ${providerName} for summarization...`);

        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            max_tokens: 200,
            temperature: 0.7
          }),
          timeout: 8000
        });

        if (!response.ok) {
          throw new Error(`${providerName} API returned ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices?.[0]?.message?.content?.trim();

        if (result) {
          console.log(`✅ ${providerName} summarization successful`);
          return result;
        }
      } catch (error) {
        console.warn(`⚠️ ${providerName} AI call failed: ${error.message}`);
        continue;
      }
    }

    return null;
  }

  /**
     * Fallback to AI search when Arxiv fails
     * @param {string} query - Original query
     * @param {number} maxResults - Maximum results
     * @returns {Promise<object>} - AI-generated research results
     */
  async aiFallbackSearch(query, maxResults) {
    const prompt = `Find and summarize ${maxResults} recent academic research papers about: "${query}"

For each paper, provide:
1. A brief title (if available)
2. A 100-word summary of key findings
3. The research area or field

Keep it conversational and easy to understand. If you cannot find specific papers, provide general information about the topic.`;

    const systemPrompt = 'You are a helpful research assistant. Provide accurate, current information about academic research. Be concise and conversational.';

    try {
      const result = await this.callAI(prompt, systemPrompt);

      return {
        success: true,
        query: query,
        papers: [{
          title: `Research on ${query}`,
          authors: 'Various researchers',
          summary: result || 'Research information not available at this time.',
          published: 'Recent',
          arxivId: null,
          url: null
        }],
        totalResults: 1,
        fallbackUsed: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ AI fallback also failed: ${error.message}`);

      return {
        success: false,
        query: query,
        papers: [],
        error: 'Unable to retrieve research information at this time. Please try again later.',
        fallbackUsed: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
     * Check if query is research-related
     * @param {string} query - Query string
     * @returns {boolean} - True if research-related
     */
  isResearchQuery(query) {
    const researchKeywords = [
      'research', 'paper', 'study', 'academic', 'publication', 'journal',
      'arxiv', 'citation', 'literature review', 'experiment', 'analysis',
      'theory', 'methodology', 'findings', 'conclusion', 'hypothesis'
    ];

    const lowerQuery = query.toLowerCase();
    return researchKeywords.some(keyword => lowerQuery.includes(keyword));
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
    console.log('📚 Arxiv cache cleared');
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

module.exports = ArxivClient;
