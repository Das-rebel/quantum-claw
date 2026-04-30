/**
 * Resilient Client Exports
 * All OpenClaw clients wrapped with production-grade resilience patterns
 *
 * This file provides drop-in replacements for all original clients
 * with zero breaking changes to the API
 */

const {
  wrapLLMClient,
  wrapScraperClient,
  wrapAPIClient,
  protectAllClients
} = require('../resilience_client_wrapper');

// ============================================================================
// ORIGINAL CLIENT IMPORTS
// ============================================================================

const CerebrasClient = require('./cerebras_client');
const UnifiedGLMClientV2 = require('./unified_glm_client_v2');
const GeminaClient = require('./gemini_client');
const GLMClient = require('./glm_client');
const GroqClient = require('./groq_client');
const PerplexityClient = require('./perplexity_client');
const SarvamClient = require('./sarvam_client_phase1');
const SarvamTTSSClient = require('./sarvam_tts_client');
const TMLPDClient = require('./tmlpd_client');
const TMLPDQueryClient = require('./tmlpd_query_client');
const TwitterClientClass = require('./twitter_client');
const RedditClient = require('./reddit_client');
const NewsClientClass = require('./news_client');
const ArxivClient = require('./arxiv_client');
const WikipediaClient = require('./wikipedia_client');
const GoogleTranslateClient = require('./google_translate_client');
const GoogleTTSClient = require('./google_tts_client');
const YouTubeClient = require('./youtube_client');
const TavilyClient = require('./tavily_client');

// ============================================================================
// RESILIENCE CONFIGURATION
// ============================================================================

const RESILIENCE_CONFIG = {
  // LLM Providers - Fast, critical operations
  llm: {
    timeout: 30000,      // 30 seconds for LLM queries
    threshold: 3,        // Open circuit after 3 failures
    maxRetries: 2        // Retry up to 2 times
  },

  // Web Scrapers - Slow, can fail frequently
  scraper: {
    timeout: 60000,      // 60 seconds for scraping
    threshold: 8,        // More tolerant (8 failures)
    maxRetries: 5        // More retries for scrapers
  },

  // API Clients - Standard operations
  api: {
    timeout: 15000,      // 15 seconds for API calls
    threshold: 5,        // Open circuit after 5 failures
    maxRetries: 3        // Retry up to 3 times
  }
};

// ============================================================================
// WRAP ALL CLIENTS
// ============================================================================

/**
 * Create a wrapper that maintains the original client's constructor pattern
 */
function wrapClientClass(ClientClass, wrapperFn, clientName) {
  // Return a class that extends the original client
  // This preserves the `new ClientClass()` pattern used throughout the codebase
  return class WrappedClient extends ClientClass {
    constructor(...args) {
      super(...args);
      this._resilienceWrapped = true;
      this._clientName = clientName;
    }

    // Override all methods with resilience-wrapped versions
    async query(...args) {
      if (typeof super.query === 'function') {
        return wrapperFn(super.query.bind(this), ...args);
      }
      return super.query(...args);
    }

    async generate(...args) {
      if (typeof super.generate === 'function') {
        return wrapperFn(super.generate.bind(this), ...args);
      }
      return super.generate(...args);
    }

    async search(...args) {
      if (typeof super.search === 'function') {
        return wrapperFn(super.search.bind(this), ...args);
      }
      return super.search(...args);
    }

    async scrape(...args) {
      if (typeof super.scrape === 'function') {
        return wrapperFn(super.scrape.bind(this), ...args);
      }
      return super.scrape(...args);
    }

    async get(...args) {
      if (typeof super.get === 'function') {
        return wrapperFn(super.get.bind(this), ...args);
      }
      return super.get(...args);
    }

    async post(...args) {
      if (typeof super.post === 'function') {
        return wrapperFn(super.post.bind(this), ...args);
      }
      return super.post(...args);
    }
  };
}

// ============================================================================
// RESILIENT CLIENT EXPORTS
// ============================================================================

// Use the wrapper from resilience_client_wrapper
const { createResilientFunction } = require('../resilience');

/**
 * Wrap a client method with resilience
 */
function wrapMethod(method, config) {
  return createResilientFunction(method, {
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    circuitBreaker: {
      threshold: config.threshold,
      timeout: 60000
    }
  });
}

// ============================================================================
// LLM PROVIDERS (wrapped with fast timeouts)
// ============================================================================

class ResilientCerebrasClient extends CerebrasClient {
  constructor(...args) {
    super(...args);
    this._name = 'Cerebras';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientUnifiedGLMClientV2 extends UnifiedGLMClientV2 {
  constructor(...args) {
    super(...args);
    this._name = 'GLM';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }

  async generate(...args) {
    return wrapMethod(super.generate.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientGeminaClient extends GeminaClient {
  constructor(...args) {
    super(...args);
    this._name = 'Gemini';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientGLMClient extends GLMClient {
  constructor(...args) {
    super(...args);
    this._name = 'GLM';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientGroqClient extends GroqClient {
  constructor(...args) {
    super(...args);
    this._name = 'Groq';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientPerplexityClient extends PerplexityClient {
  constructor(...args) {
    super(...args);
    this._name = 'Perplexity';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientSarvamClient extends SarvamClient {
  constructor(...args) {
    super(...args);
    this._name = 'Sarvam';
  }

  async translate(...args) {
    return wrapMethod(super.translate.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientTMLPDClient extends TMLPDClient {
  constructor(...args) {
    super(...args);
    this._name = 'TMLPD';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

class ResilientTMLPDQueryClient extends TMLPDQueryClient {
  constructor(...args) {
    super(...args);
    this._name = 'TMLPDQuery';
  }

  async query(...args) {
    return wrapMethod(super.query.bind(this), RESILIENCE_CONFIG.llm)(...args);
  }
}

// ============================================================================
// WEB SCRAPERS (wrapped with slow timeouts and high tolerance)
// ============================================================================

class ResilientTwitterClientClass extends TwitterClientClass {
  constructor(...args) {
    super(...args);
    this._name = 'Twitter';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }

  async scrape(...args) {
    return wrapMethod(super.scrape.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }
}

class ResilientRedditClient extends RedditClient {
  constructor(...args) {
    super(...args);
    this._name = 'Reddit';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }

  async scrape(...args) {
    return wrapMethod(super.scrape.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }
}

class ResilientNewsClientClass extends NewsClientClass {
  constructor(...args) {
    super(...args);
    this._name = 'News';
  }

  async get(...args) {
    return wrapMethod(super.get.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.scraper)(...args);
  }
}

// ============================================================================
// API CLIENTS (wrapped with standard timeouts)
// ============================================================================

class ResilientArxivClient extends ArxivClient {
  constructor(...args) {
    super(...args);
    this._name = 'Arxiv';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.api)(...args);
  }

  async get(...args) {
    return wrapMethod(super.get.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientWikipediaClient extends WikipediaClient {
  constructor(...args) {
    super(...args);
    this._name = 'Wikipedia';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.api)(...args);
  }

  async get(...args) {
    return wrapMethod(super.get.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientGoogleTranslateClient extends GoogleTranslateClient {
  constructor(...args) {
    super(...args);
    this._name = 'GoogleTranslate';
  }

  async translate(...args) {
    return wrapMethod(super.translate.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientGoogleTTSClient extends GoogleTTSClient {
  constructor(...args) {
    super(...args);
    this._name = 'GoogleTTS';
  }

  async synthesize(...args) {
    return wrapMethod(super.synthesize.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientYouTubeClient extends YouTubeClient {
  constructor(...args) {
    super(...args);
    this._name = 'YouTube';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.api)(...args);
  }

  async getVideoInfo(...args) {
    return wrapMethod(super.getVideoInfo.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientTavilyClient extends TavilyClient {
  constructor(...args) {
    super(...args);
    this._name = 'Tavily';
  }

  async search(...args) {
    return wrapMethod(super.search.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

class ResilientSarvamTTSSClient extends SarvamTTSSClient {
  constructor(...args) {
    super(...args);
    this._name = 'SarvamTTS';
  }

  async synthesize(...args) {
    return wrapMethod(super.synthesize.bind(this), RESILIENCE_CONFIG.api)(...args);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // LLM Providers
  CerebrasClient: ResilientCerebrasClient,
  UnifiedGLMClientV2: ResilientUnifiedGLMClientV2,
  GeminaClient: ResilientGeminaClient,
  GLMClient: ResilientGLMClient,
  GroqClient: ResilientGroqClient,
  PerplexityClient: ResilientPerplexityClient,
  SarvamClient: ResilientSarvamClient,
  TMLPDClient: ResilientTMLPDClient,
  TMLPDQueryClient: ResilientTMLPDQueryClient,

  // Web Scrapers
  TwitterClientClass: ResilientTwitterClientClass,
  RedditClient: ResilientRedditClient,
  NewsClientClass: ResilientNewsClientClass,

  // API Clients
  ArxivClient: ResilientArxivClient,
  WikipediaClient: ResilientWikipediaClient,
  GoogleTranslateClient: ResilientGoogleTranslateClient,
  GoogleTTSClient: ResilientGoogleTTSClient,
  YouTubeClient: ResilientYouTubeClient,
  TavilyClient: ResilientTavilyClient,
  SarvamTTSSClient: ResilientSarvamTTSSClient,

  // Export the config for reference
  RESILIENCE_CONFIG
};
