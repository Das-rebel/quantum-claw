/**
 * OmniClaw Service Mesh
 * Central registry for all services with health monitoring and failover support
 */

const EventEmitter = require('events');

class ServiceMesh extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.serviceHealth = new Map();
    this.preferredProviders = new Map();
    this.fallbackChain = new Map();
    this.state = 'initializing';
    this.initializedAt = null;
    this.totalServices = 0;
    this.healthyServices = 0;

    try {
      // Synchronous initialization
      this.registerDefaultServices();
      
      // Mark as ready immediately after synchronous setup
      this.state = 'ready';
      this.initializedAt = new Date().toISOString();
      this.totalServices = this.services.size;
      console.log('[ServiceMesh] Initialized successfully with', this.totalServices, 'services at', this.initializedAt);
    } catch (error) {
      console.error('[ServiceMesh] Initialization failed:', error.message);
      this.state = 'error';
    }
  }

  registerDefaultServices() {
    // WhatsApp service - connects to local QR cloud service
    this.registerService('whatsapp', {
      type: 'messaging',
      endpoint: process.env.WHATSAPP_SERVICE_URL || 'http://localhost:9377',
      capabilities: ['send', 'receive', 'contacts', 'groups'],
      healthEndpoint: '/health',
      timeout: 10000,
      retryAttempts: 3
    });

    // Twitter service
    this.registerService('twitter', {
      type: 'social',
      endpoint: process.env.TWITTER_SERVICE_URL,
      capabilities: ['tweets', 'search', 'trending'],
      auth: 'oauth2'
    });

    // Spotify service
    this.registerService('spotify', {
      type: 'media',
      endpoint: process.env.SPOTIFY_SERVICE_URL,
      capabilities: ['play', 'pause', 'search', 'playlists'],
      auth: 'oauth2'
    });

    // Alexa service (built-in)
    this.registerService('alexa', {
      type: 'voice',
      capabilities: ['tts', 'stt', 'intent'],
      local: true
    });
  }

  registerService(name, config) {
    this.services.set(name, {
      name,
      config,
      status: 'unknown',
      lastHealthCheck: null,
      consecutiveFailures: 0
    });
    this.serviceHealth.set(name, {
      healthy: true, // Default to healthy for local services
      latency: null,
      lastCheck: Date.now()
    });
    console.log(`[ServiceMesh] Registered service: ${name}`);
  }

  unregisterService(name) {
    this.services.delete(name);
    this.serviceHealth.delete(name);
    console.log(`[ServiceMesh] Unregistered service: ${name}`);
  }

  async checkHealth(serviceName) {
    const service = this.services.get(serviceName);
    if (!service) return false;

    const start = Date.now();
    try {
      if (service.config.local) {
        // Local service - assume healthy if initialized
        this.serviceHealth.set(serviceName, { healthy: true, latency: 0, lastCheck: Date.now() });
        return true;
      }

      const response = await fetch(`${service.config.endpoint}${service.config.healthEndpoint}`, {
        method: 'GET',
        timeout: service.config.timeout || 5000
      });

      const latency = Date.now() - start;
      if (response.ok) {
        service.consecutiveFailures = 0;
        this.serviceHealth.set(serviceName, { healthy: true, latency, lastCheck: Date.now() });
        return true;
      }
    } catch (e) {
      service.consecutiveFailures++;
    }

    this.serviceHealth.set(serviceName, { healthy: false, latency: null, lastCheck: Date.now() });
    return false;
  }

  async checkAllHealth() {
    const checks = [];
    for (const name of this.services.keys()) {
      checks.push(this.checkHealth(name));
    }
    return Promise.all(checks);
  }

  getService(name) {
    return this.services.get(name);
  }

  getServiceHealth(name) {
    return this.serviceHealth.get(name) || { healthy: false, latency: null, lastCheck: null };
  }

  isHealthy(name) {
    // Default to true if no health data (for services we can't check externally)
    const health = this.serviceHealth.get(name);
    return health?.healthy ?? true;
  }

  getAllServices() {
    const result = [];
    for (const [name, service] of this.services.entries()) {
      result.push({
        name,
        ...service.config,
        health: this.getServiceHealth(name)
      });
    }
    return result;
  }

  setPreferredProvider(serviceName, providerName) {
    this.preferredProviders.set(serviceName, providerName);
  }

  getPreferredProvider(serviceName) {
    return this.preferredProviders.get(serviceName);
  }

  setFallbackChain(serviceName, chain) {
    this.fallbackChain.set(serviceName, chain);
  }

  getFallbackChain(serviceName) {
    return this.fallbackChain.get(serviceName) || [];
  }

  /**
   * Get service metrics for health monitoring
   * @returns {Object} Service metrics
   */
  getServiceMetrics() {
    const services = [];
    let healthyCount = 0;
    
    for (const [name, service] of this.services.entries()) {
      const health = this.getServiceHealth(name);
      if (health.healthy) healthyCount++;
      
      services.push({
        name,
        type: service.config?.type || 'unknown',
        status: health.healthy ? 'healthy' : 'unhealthy',
        latency: health.latency,
        lastCheck: health.lastCheck,
        consecutiveFailures: service.consecutiveFailures
      });
    }

    return {
      state: this.state,
      initializedAt: this.initializedAt,
      totalServices: this.services.size,
      healthyServices: healthyCount,
      services: services,
      serviceRegistry: this.services,
      circuitBreaker: {} // Placeholder for circuit breaker states
    };
  }

  // Emit event for service status changes
  emitServiceEvent(serviceName, event, data) {
    this.emit(event, { service: serviceName, ...data });
  }
}

module.exports = ServiceMesh;
