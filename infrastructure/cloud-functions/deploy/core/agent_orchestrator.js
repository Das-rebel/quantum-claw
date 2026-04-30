/**
 * OmniClaw Agent Orchestrator
 * Routes requests to appropriate skills/services based on intent
 */

const ServiceMesh = require('./service_mesh');

class AgentOrchestrator {
  constructor() {
    this.serviceMesh = new ServiceMesh();
    this.skills = new Map();
    this.intentMap = new Map();
    this.persona = 'default';
    this.state = 'initializing';
    this.initializedAt = null;
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastRequestTime = null;
    this.serviceUsageStats = {};

    try {
      // Synchronous initialization
      this.registerDefaultIntents();
      this.registerDefaultSkills();
      
      // Mark as ready immediately after synchronous setup
      this.state = 'ready';
      this.initializedAt = new Date().toISOString();
      console.log('[AgentOrchestrator] Initialized successfully at', this.initializedAt);
    } catch (error) {
      console.error('[AgentOrchestrator] Initialization failed:', error.message);
      this.state = 'error';
      this.errorCount++;
    }
  }

  registerDefaultIntents() {
    // Map intents to skills
    this.intentMap.set('WhatsAppIntent', 'whatsapp');
    this.intentMap.set('SendWhatsAppMessage', 'whatsapp');
    this.intentMap.set('TwitterIntent', 'twitter');
    this.intentMap.set('SpotifyIntent', 'spotify');
    this.intentMap.set('StoryIntent', 'story');
    this.intentMap.set('PriceIntent', 'price');
    this.intentMap.set('WeatherIntent', 'weather');
    this.intentMap.set('SearchIntent', 'search');
    this.intentMap.set('VaultIntent', 'search');  // Vault searches knowledge graph
  }

  registerDefaultSkills() {
    // Skills are registered via service mesh
    // Additional skill handlers can be added here
  }

  registerSkill(name, handler) {
    this.skills.set(name, handler);
    console.log(`[AgentOrchestrator] Registered skill: ${name}`);
  }

  registerIntent(intentName, skillName) {
    this.intentMap.set(intentName, skillName);
  }

  getSkillForIntent(intentName) {
    return this.intentMap.get(intentName) || 'default';
  }

  async route(intentName, params, context = {}) {
    const skillName = this.getSkillForIntent(intentName);

    // Check if skill is healthy before routing
    if (this.serviceMesh.isHealthy(skillName)) {
      return this.executeSkill(skillName, intentName, params, context);
    }

    // Try fallback chain
    const fallbackChain = this.serviceMesh.getFallbackChain(skillName);
    for (const fallback of fallbackChain) {
      if (this.serviceMesh.isHealthy(fallback)) {
        return this.executeSkill(fallback, intentName, params, context);
      }
    }

    // No healthy service found
    return {
      success: false,
      error: `Service ${skillName} is currently unavailable`,
      availableServices: this.serviceMesh.getAllServices().filter(s => s.health.healthy).map(s => s.name)
    };
  }

  async executeSkill(skillName, intentName, params, context) {
    const skill = this.skills.get(skillName);
    if (skill) {
      return skill.execute(intentName, params, context);
    }

    // Fall back to service mesh direct call
    const service = this.serviceMesh.getService(skillName);
    if (service) {
      return this.executeViaServiceMesh(skillName, intentName, params);
    }

    return { success: false, error: `Skill ${skillName} not found` };
  }

  async executeViaServiceMesh(serviceName, intentName, params) {
    const service = this.serviceMesh.getService(serviceName);
    if (!service) return { success: false, error: 'Service not found' };

    // Route to appropriate endpoint based on intent
    const endpoints = {
      'whatsapp': {
        'WhatsAppIntent': '/whatsapp/send',
        'SendWhatsAppMessage': '/whatsapp/send'
      }
    };

    const serviceEndpoints = endpoints[serviceName];
    const endpoint = serviceEndpoints?.[intentName];

    if (!endpoint) {
      return { success: false, error: `No endpoint for ${intentName} in ${serviceName}` };
    }

    try {
      const response = await fetch(`${service.config.endpoint}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        timeout: service.config.timeout
      });

      return await response.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Process a user request - main entry point
   * @param {string} query - User query
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing result
   */
  async processRequest(query, options = {}) {
    this.requestCount++;
    this.lastRequestTime = new Date().toISOString();
    
    try {
      // Route based on query content (simple keyword routing)
      const queryLower = query.toLowerCase();
      
      // Determine the best service for this query
      let serviceName = this.routeQueryToService(queryLower);
      
      // Track service usage
      this.serviceUsageStats[serviceName] = (this.serviceUsageStats[serviceName] || 0) + 1;
      
      return {
        success: true,
        response: `Processed via ${serviceName}: ${query.substring(0, 50)}...`,
        serviceUsed: serviceName,
        query: query,
        options: options
      };
    } catch (error) {
      this.errorCount++;
      console.error('[AgentOrchestrator] processRequest error:', error.message);
      return {
        success: false,
        response: 'I encountered an error processing your request.',
        error: error.message
      };
    }
  }

  /**
   * Route a query to the appropriate service based on keywords
   * @param {string} queryLower - Lowercase query for matching
   * @returns {string} Service name
   */
  routeQueryToService(queryLower) {
    // Keyword-based routing
    const routeRules = [
      { keywords: ['whatsapp', 'message', 'send to'], service: 'whatsapp' },
      { keywords: ['twitter', 'tweet'], service: 'twitter' },
      { keywords: ['spotify', 'play', 'music'], service: 'spotify' },
      { keywords: ['story', 'tell me a'], service: 'story' },
      { keywords: ['vault', 'bookmark', 'search my'], service: 'vault' },
      { keywords: ['news'], service: 'news' },
      { keywords: ['translate', 'translation'], service: 'translate' },
      { keywords: ['kodi', 'tv', 'movie'], service: 'kodi' },
      { keywords: ['reddit'], service: 'reddit' },
      { keywords: ['wikipedia', 'who is', 'what is'], service: 'wikipedia' },
    ];
    
    for (const rule of routeRules) {
      if (rule.keywords.some(k => queryLower.includes(k))) {
        return rule.service;
      }
    }

    return 'agent';
  }

  setPersona(persona) {
    this.persona = persona;
  }

  getPersona() {
    return this.persona;
  }

  getServiceMesh() {
    return this.serviceMesh;
  }

  getAllSkills() {
    return Array.from(this.skills.keys());
  }

  getIntentMap() {
    return Array.from(this.intentMap.entries()).map(([intent, skill]) => ({ intent, skill }));
  }

  /**
   * Get performance metrics for health monitoring
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      state: this.state,
      initializedAt: this.initializedAt,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastRequestTime: this.lastRequestTime,
      serviceUsage: this.serviceUsageStats,
      registeredSkills: this.getAllSkills(),
      registeredIntents: this.intentMap.size,
      system: {
        healthy: this.state === 'ready',
        uptime: this.initializedAt ? Date.now() - new Date(this.initializedAt).getTime() : 0,
        state: this.state
      }
    };
  }
}

module.exports = AgentOrchestrator;
