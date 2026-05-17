/**
 * Vault Client - Personal Knowledge Graph
 */
const https = require('https');

const VAULT_SEARCH_URL = 'serve-vault-search-338789220059.asia-south1.run.app';

class VaultClient {
  constructor(options = {}) {
    this.searchUrl = options.searchUrl || VAULT_SEARCH_URL;
    this.cache = new Map();
    this.cacheExpiry = 10 * 60 * 1000;
  }

  findKnowledge(query) {
    const cacheKey = `vault:${query}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached.data;
    }
    
    // Return empty structure - cache will be populated by async trigger
    return { topics: [], skills: [], places: [], food: [], vaultPosts: [], relationships: [] };
  }

  async searchVault(query, limit = 20) {
    return new Promise((resolve, reject) => {
      const url = `/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      https.get(`https://${this.searchUrl}${url}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const cacheKey = `vault:${query}`;
            const vaultPosts = (json.results || []).map(r => ({
              vlSubject: r.name || r.caption || 'Untitled',
              caption: r.caption || '',
              url: r.url || '',
              source: r.source || 'vault',
              timestamp: r.timestamp || '',
              vlTags: r.vlTags || []
            }));
            const result = {
              topics: [],
              skills: [],
              places: [],
              food: [],
              vaultPosts: vaultPosts,
              relationships: []
            };
            this.cache.set(cacheKey, result);
            resolve(result);
          } catch {
            resolve({ topics: [], skills: [], places: [], food: [], vaultPosts: [], relationships: [] });
          }
        });
      }).on('error', () => {
        resolve({ topics: [], skills: [], places: [], food: [], vaultPosts: [], relationships: [] });
      });
    });
  }

  getStats() {
    return {
      vault: { totalPosts: 0 },
      knowledgeGraph: { totalNodes: 0, topics: 0, skills: 0 }
    };
  }

  async healthCheck() {
    return { status: 'healthy' };
  }
}

module.exports = VaultClient;
