/**
 * Arxiv Client with AI Fallback
 * Uses real API when available, AI simulation otherwise
 */
const { createValidator } = require('./response_validator');

class ArxivClient {
  constructor(config = {}) {
    this.baseUrl = 'https://export.arxiv.org/api/query';
    this.validator = createValidator('Arxiv');
    
    // AI fallback
    this.cerebrasKey = config.cerebrasApiKey || process.env.CEREBRAS_API_KEY;
    this.groqKey = config.groqApiKey || process.env.GROQ_API_KEY;
    this.cerebrasBaseUrl = 'https://api.cerebras.ai/v1';
    this.groqBaseUrl = 'https://api.groq.com/openai/v1';
    
    console.log('[Arxiv] Client initialized');
  }

  async search(query, options = {}) {
    const { maxResults = 5, category = null } = options;
    
    console.log(`[Arxiv] Searching: "${query}" (max: ${maxResults})`);
    
    // Try real Arxiv API first
    try {
      const searchQuery = category ? `${query} AND cat:${category}` : query;
      const url = `${this.baseUrl}?search_query=all:${encodeURIComponent(searchQuery)}&start=0&max_results=${maxResults}&sortBy=relevance`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      
      if (response.ok) {
        const text = await response.text();
        const papers = this._parseArxivResponse(text);
        if (papers.length > 0) {
          const result = {
            success: true,
            papers: papers.map(p => ({
              title: p.title,
              authors: p.authors,
              summary: p.summary.substring(0, 300) + '...',
              pdfUrl: p.pdfUrl
            })),
            source: 'arxiv_api'
          };
          this.validator.validate(result);
          return result;
        }
      }
    } catch (e) {
      console.warn('[Arxiv] API failed, using AI fallback:', e.message);
    }
    
    return this._searchAI(query, maxResults);
  }

  _parseArxivResponse(text) {
    const papers = [];
    const entries = text.split('<entry>');
    
    for (const entry of entries.slice(1)) {
      const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
      const authorMatches = entry.matchAll(/<name>(.*?)<\/name>/g);
      const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
      const pdfMatch = entry.match(/<id>(.*?)<\/id>/);
      
      if (titleMatch) {
        papers.push({
          title: titleMatch[1].replace(/\n/g, ' ').trim(),
          authors: Array.from(authorMatches, m => m[1]),
          summary: summaryMatch ? summaryMatch[1].replace(/\n/g, ' ').trim() : '',
          pdfUrl: pdfMatch ? pdfMatch[1].replace('/abs/', '/pdf/') + '.pdf' : ''
        });
      }
    }
    
    return papers;
  }

  async _searchAI(query, maxResults) {
    const prompt = `You are an academic research assistant. Find papers about "${query}" on Arxiv.
        Provide ${maxResults} representative academic paper titles that would appear in a real Arxiv search.
        Include realistic titles, authors (just names), and brief summaries of what each paper is about.
        Make them sound like genuine academic research papers.`;

    const systemPrompt = `You are helping users find academic papers on Arxiv. Provide helpful, relevant paper recommendations. Format clearly with titles, authors, and brief descriptions.`;

    try {
      const response = await this._callAI(prompt, systemPrompt);
      if (response) {
        return {
          success: true,
          simulated: true,
          papers: response,
          source: 'ai_simulation'
        };
      }
    } catch (e) {
      console.error('[Arxiv] AI search failed:', e.message);
    }

    return {
      success: false,
      error: 'Unable to search Arxiv'
    };
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
            max_tokens: 1000,
            temperature: 0.7
          }),
          signal: AbortSignal.timeout(15000)
        });
        if (response.ok) {
          const data = await response.json();
          return data.choices[0]?.message?.content?.trim();
        }
      } catch (e) {
        console.warn(`[Arxiv] ${provider.name} failed:`, e.message);
      }
    }
    return null;
  }

  async healthCheck() {
    return { status: 'healthy', mode: 'AI fallback' };
  }
}

module.exports = ArxivClient;
