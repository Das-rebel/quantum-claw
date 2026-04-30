/**
 * YouTube API Client - Video search and transcript processing
 *
 * Provides:
 * - YouTube Data API v3 integration
 * - Video search and metadata retrieval
 * - Transcript fetching when available
 * - AI-powered content summarization for voice delivery (150 words limit)
 * - Graceful fallback to AI search when API fails
 * - Caching strategy with 60-second TTL to reduce API calls
 * - API quota management (10,000 units/day)
 */

const { getCacheManager } = require('./cache_manager');
const { createValidator } = require('./response_validator');

class YouTubeClient {
  constructor(config = {}) {
    this.apiKey = config.youtubeApiKey || process.env.YOUTUBE_API_KEY;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    this.enabled = !!this.apiKey;

    // Cache manager with 60-second TTL and 200 max entries
    this.cacheManager = getCacheManager({
      maxSize: 200,
      ttl: 60000 // 60 seconds TTL
    });

    // Response validator
    this.validator = createValidator('YouTube');

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

    // API quota tracking (10,000 units/day)
    this.quotaLimit = 10000;
    this.quotaUsed = 0;
    this.quotaResetTime = null;

    // Default search parameters
    this.defaultMaxResults = 5;
    this.defaultOrder = 'relevance';

    console.log(this.enabled ? '🎬 YouTube Client initialized with 60s cache' : '🎬 YouTube Client initialized with AI fallback mode');
  }

  /**
     * Search YouTube for videos
     * @param {string} query - Search query
     * @param {number} maxResults - Maximum number of results (default: 5)
     * @param {object} options - Additional options
     * @returns {Promise<object>} - Search results with summaries
     */
  async searchVideos(query, maxResults = 5, options = {}) {
    const {
      order = 'relevance',
      duration = 'any', // any, short, medium, long
      skipCache = false,
      locale = 'en-US'
    } = options;

    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query must be a non-empty string');
    }

    if (maxResults < 1 || maxResults > 10) {
      throw new Error('maxResults must be between 1 and 10');
    }

    const normalizedQuery = query.trim();
    const cacheKey = `youtube:${normalizedQuery}:${maxResults}:${order}:${duration}:${locale}`;

    // Check cache first
    if (!skipCache) {
      const cached = this.cacheManager.get(cacheKey);
      if (cached) {
        console.log(`🎬 Cache hit for query: "${normalizedQuery}"`);
        return cached;
      }
    }

    console.log(`🎬 Searching YouTube: "${normalizedQuery}" (maxResults: ${maxResults})`);

    try {
      // Check API quota
      if (!this._checkQuota()) {
        console.warn('⚠️ YouTube API quota exceeded, using AI fallback');
        return await this._aiFallbackSearch(normalizedQuery, maxResults, locale);
      }

      // Search YouTube API
      const videos = await this._searchYouTubeAPI(normalizedQuery, maxResults, order, duration);

      // Fetch detailed video information
      const detailedVideos = await this._fetchVideoDetails(videos);

      // Summarize video content using AI
      const summarizedVideos = await this._summarizeVideos(detailedVideos, normalizedQuery);

      const result = {
        success: true,
        query: normalizedQuery,
        videos: summarizedVideos,
        totalResults: summarizedVideos.length,
        quotaUsed: this.quotaUsed,
        source: 'youtube_api',
        locale: locale,
        timestamp: new Date().toISOString()
      };

      // Validate response
      const validationResult = this.validator.validateYouTubeResponse(result);
      if (!validationResult.valid) {
        console.error(`[YouTube] Response validation failed: ${validationResult.error}`);
        result.validationWarning = validationResult.error;
      } else {
        console.log('[YouTube] Response validation passed');
      }

      // Cache the result
      this.cacheManager.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`❌ YouTube search failed: ${error.message}`);

      // Graceful fallback to AI search
      console.log('🎬 Falling back to AI-powered search');
      return await this._aiFallbackSearch(normalizedQuery, maxResults, locale);
    }
  }

  /**
     * Search YouTube API for videos
     * @private
     */
  async _searchYouTubeAPI(query, maxResults, order, duration) {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      q: query,
      maxResults: maxResults.toString(),
      order: order,
      type: 'video',
      videoDuration: duration,
      key: this.apiKey
    });

    const response = await fetch(`${this.baseUrl}/search?${searchParams.toString()}`, {
      method: 'GET',
      timeout: 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`YouTube API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Track quota usage (search costs 100 units)
    this.quotaUsed += 100;

    const videos = data.items || [];
    console.log(`🎬 Found ${videos.length} videos on YouTube`);

    return videos.map(video => ({
      videoId: video.id.videoId,
      title: video.snippet.title,
      description: video.snippet.description,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      thumbnail: video.snippet.thumbnails?.default?.url
    }));
  }

  /**
     * Fetch detailed video information
     * @private
     */
  async _fetchVideoDetails(videos) {
    if (videos.length === 0) {
      return [];
    }

    const videoIds = videos.map(v => v.videoId).join(',');
    const params = new URLSearchParams({
      part: 'contentDetails,statistics',
      id: videoIds,
      key: this.apiKey
    });

    const response = await fetch(`${this.baseUrl}/videos?${params.toString()}`, {
      method: 'GET',
      timeout: 10000
    });

    if (!response.ok) {
      console.warn('⚠️ Failed to fetch video details');
      return videos;
    }

    const data = await response.json();

    // Track quota usage (video details cost 1 unit per video)
    this.quotaUsed += videos.length;

    const detailsMap = new Map(
      (data.items || []).map(item => [item.id, {
        duration: item.contentDetails?.duration,
        viewCount: item.statistics?.viewCount,
        likeCount: item.statistics?.likeCount,
        commentCount: item.statistics?.commentCount
      }])
    );

    return videos.map(video => ({
      ...video,
      ...detailsMap.get(video.videoId)
    }));
  }

  /**
     * Summarize videos using AI for voice delivery
     * @private
     */
  async _summarizeVideos(videos, originalQuery) {
    const summarizedVideos = [];

    for (const video of videos) {
      try {
        const summary = await this._summarizeVideo(video, originalQuery);

        summarizedVideos.push({
          title: video.title,
          channel: video.channelTitle,
          summary: summary,
          videoId: video.videoId,
          url: `https://youtube.com/watch?v=${video.videoId}`,
          publishedAt: new Date(video.publishedAt).toLocaleDateString(),
          duration: this._formatDuration(video.duration),
          viewCount: this._formatViewCount(video.viewCount)
        });
      } catch (error) {
        console.warn(`⚠️ Failed to summarize video "${video.title.substring(0, 50)}...": ${error.message}`);

        // Fallback to truncated description
        const truncatedSummary = video.description.substring(0, 100).trim() + '...';
        summarizedVideos.push({
          title: video.title,
          channel: video.channelTitle,
          summary: truncatedSummary,
          videoId: video.videoId,
          url: `https://youtube.com/watch?v=${video.videoId}`,
          publishedAt: new Date(video.publishedAt).toLocaleDateString(),
          duration: this._formatDuration(video.duration),
          viewCount: this._formatViewCount(video.viewCount)
        });
      }
    }

    return summarizedVideos;
  }

  /**
     * Summarize a single video using AI (150 words limit for voice delivery)
     * @private
     */
  async _summarizeVideo(video, query) {
    const prompt = `Summarize this YouTube video in exactly 150 words or less for voice delivery.

Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description}
Views: ${video.viewCount}

Focus on the main topic and key points mentioned in the description. Make it conversational and easy to understand.`;

    const systemPrompt = 'You are a helpful video summarization assistant. Summarize YouTube videos clearly and concisely for voice delivery. Maximum 150 words.';

    try {
      // Try primary provider first
      const result = await this._callAI(prompt, systemPrompt);
      if (result) {
        // Ensure 150 word limit
        const words = result.split(/\s+/);
        if (words.length > 150) {
          return words.slice(0, 150).join(' ') + '...';
        }
        return result;
      }
    } catch (error) {
      console.warn(`⚠️ AI summarization failed: ${error.message}`);
    }

    // Fallback to first 150 words of description
    const fallbackWords = video.description.split(/\s+/).slice(0, 150).join(' ');
    return fallbackWords + '...';
  }

  /**
     * Call AI provider for summarization
     * @private
     */
  async _callAI(prompt, systemPrompt) {
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
            max_tokens: 300,
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
     * Fallback to AI search when YouTube API fails
     * @private
     */
  async _aiFallbackSearch(query, maxResults, locale) {
    console.log(`🤖 Using AI fallback for YouTube search: "${query}"`);

    const prompt = `Find and recommend ${maxResults} YouTube videos about: "${query}"

For each video, provide:
1. A plausible title
2. A 150-word summary of the content
3. The channel name

Keep it conversational and easy to understand. If you cannot find specific videos, provide general information about the topic and related content creators.`;

    const systemPrompt = 'You are a helpful video discovery assistant. Provide accurate, current information about YouTube content. Be concise and conversational.';

    try {
      const result = await this._callAI(prompt, systemPrompt);

      const response = {
        success: true,
        query: query,
        videos: [{
          title: `Videos about ${query}`,
          channel: 'Various Creators',
          summary: result || 'Video information not available at this time.',
          videoId: null,
          url: null,
          publishedAt: 'Recent',
          duration: 'Various',
          viewCount: 'N/A'
        }],
        totalResults: 1,
        fallbackUsed: true,
        source: 'ai_simulation',
        locale: locale,
        timestamp: new Date().toISOString()
      };

      // Validate AI fallback response
      const validationResult = this.validator.validateYouTubeResponse(response);
      if (!validationResult.valid) {
        console.warn(`[YouTube] AI fallback validation warning: ${validationResult.error}`);
        response.validationWarning = validationResult.error;
      }

      return response;
    } catch (error) {
      console.error(`❌ AI fallback also failed: ${error.message}`);

      return {
        success: false,
        query: query,
        videos: [],
        error: 'Unable to retrieve video information at this time. Please try again later.',
        fallbackUsed: true,
        source: 'fallback',
        locale: locale,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
     * Format video duration for display
     * @private
     */
  _formatDuration(duration) {
    if (!duration) return 'Unknown';

    try {
      // Parse ISO 8601 duration (e.g., PT10M30S)
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 'Unknown';

      const hours = match[1] ? parseInt(match[1]) : 0;
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const seconds = match[3] ? parseInt(match[3]) : 0;

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
     * Format view count for display
     * @private
     */
  _formatViewCount(viewCount) {
    if (!viewCount) return 'N/A';

    const count = parseInt(viewCount);
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M views`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K views`;
    } else {
      return `${count} views`;
    }
  }

  /**
     * Check API quota
     * @private
     */
  _checkQuota() {
    // Reset quota daily
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (!this.quotaResetTime || this.quotaResetTime < today) {
      this.quotaUsed = 0;
      this.quotaResetTime = today;
    }

    return this.quotaUsed < this.quotaLimit;
  }

  /**
     * Check if query is video-related
     * @param {string} query - Query string
     * @returns {boolean} - True if video-related
     */
  isVideoQuery(query) {
    const videoKeywords = [
      'video', 'youtube', 'watch', 'tutorial', 'how to',
      'demonstration', 'review', 'vlog', 'stream', 'content',
      'creator', 'channel', 'playlist', 'subscribe', 'like'
    ];

    const lowerQuery = query.toLowerCase();
    return videoKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  /**
     * Extract video ID from URL
     * @param {string} url - YouTube URL
     * @returns {string|null} - Video ID or null
     */
  extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
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
    console.log('🎬 YouTube cache cleared');
  }

  /**
     * Get quota usage
     * @returns {object} - Quota statistics
     */
  getQuotaStats() {
    return {
      used: this.quotaUsed,
      limit: this.quotaLimit,
      remaining: this.quotaLimit - this.quotaUsed,
      resetDate: this.quotaResetTime ? this.quotaResetTime.toISOString() : null
    };
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

module.exports = YouTubeClient;
