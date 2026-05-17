/**
 * YouTube Client with AI Fallback
 */
const { createValidator } = require('./response_validator');

class YouTubeClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.YOUTUBE_API_KEY;
    this.useAI = !this.apiKey;
    this.validator = createValidator('YouTube');
    
    this.cerebrasKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
    this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    
    console.log('[YouTube] Client initialized, AI fallback:', this.useAI ? 'yes' : 'no');
  }

  async search(query, options = {}) {
    const { maxResults = 5 } = options;
    
    console.log(`[YouTube] Searching: "${query}" (max: ${maxResults})`);
    
    if (this.useAI) {
      return this._searchAI(query, maxResults);
    }
    
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?key=${this.apiKey}&q=${encodeURIComponent(query)}&part=snippet&type=video&maxResults=${maxResults}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      
      if (response.ok) {
        const data = await response.json();
        const videos = data.items || [];
        const result = {
          success: true,
          videos: videos.map(v => ({
            title: v.snippet.title,
            channel: v.snippet.channelTitle,
            videoId: v.id.videoId,
            description: v.snippet.description
          })),
          source: 'youtube_api'
        };
        this.validator.validate(result);
        return result;
      }
    } catch (e) {
      console.warn('[YouTube] API failed, using AI fallback:', e.message);
    }
    
    return this._searchAI(query, maxResults);
  }

  async _searchAI(query, maxResults) {
    const prompt = `You are a YouTube search assistant. Find ${maxResults} representative videos about "${query}".
        Format your response as a list, one video per line, like this:
        Video 1: "Video Title" by ChannelName - Brief description
        Video 2: "Another Video" by AnotherChannel - Another description
        Make the titles realistic and relevant to "${query}".`;

    const systemPrompt = `You are helping users find YouTube videos. Provide ${maxResults} video recommendations. Format each on its own line starting with "Video N:".`;

    try {
      const response = await this._callAI(prompt, systemPrompt);
      if (response) {
        // Parse AI response into structured format
        const videos = this._parseAIResponse(response, maxResults);
        return {
          success: true,
          simulated: true,
          videos: videos,
          source: 'ai_simulation'
        };
      }
    } catch (e) {
      console.error('[YouTube] AI search failed:', e.message);
    }

    return {
      success: false,
      error: 'Unable to search YouTube'
    };
  }

  _parseAIResponse(response, maxResults) {
    const videos = [];
    const lines = response.split('\n').filter(l => l.trim());
    
    for (let i = 0; i < Math.min(lines.length, maxResults); i++) {
      const line = lines[i];
      // Try to extract title and channel from format: Video N: "Title" by Channel - description
      const match = line.match(/[""]([^""]+)[""][^b]*by\s+([^"-]+)/);
      if (match) {
        videos.push({
          title: match[1],
          channel: match[2].trim(),
          description: line
        });
      } else {
        videos.push({
          title: line.replace(/^Video \d+:\s*/, '').substring(0, 100),
          channel: 'YouTube',
          description: line
        });
      }
    }
    
    // If no videos parsed, create from raw response
    if (videos.length === 0) {
      videos.push({
        title: response.substring(0, 100),
        channel: 'YouTube',
        description: response.substring(0, 200)
      });
    }
    
    return videos;
  }

  async _callAI(prompt, systemPrompt) {
    const providers = [
      { name: 'Groq', key: this.groqKey, baseUrl: this.groqBaseUrl, model: 'llama-3.3-70b-versatile' },
      { name: 'Cerebras', key: this.cerebrasKey, baseUrl: this.cerebrasBaseUrl, model: 'llama-3.3-70b' }
    ];

    for (const provider of providers) {
      if (!provider.key) continue;
      try {
        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            max_tokens: 800,
            temperature: 0.7
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim();
        }
      } catch (e) {
        console.warn(`[YouTube] ${provider.name} failed:`, e.message);
      }
    }
    return null;
  }

  async healthCheck() {
    return { status: this.useAI ? 'ai_fallback' : 'healthy', mode: this.useAI ? 'AI' : 'API' };
  }
}

module.exports = YouTubeClient;
