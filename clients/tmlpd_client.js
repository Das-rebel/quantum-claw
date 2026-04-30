/**
 * TMLPD Client - Lightweight bridge to TMLPD MCP Server
 *
 * Connects to TMLPD server on port 18790 and delegates all heavy lifting:
 * - 3-tier memory (episodic, semantic, working)
 * - HALO orchestration
 * - Universal router
 * - Multi-provider execution
 * - 60s timeout enforcement
 */

const WebSocket = require('ws');

class TMLPDClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 18790;
    this.url = `ws://${this.host}:${this.port}`;
    this.ws = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.sessionMap = new Map(); // Alexa userId → TMLPD sessionId
    this.connected = false;
    this.connectPromise = null;
  }

  /**
     * Connect to TMLPD MCP server
     */
  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.connected = true;
      return Promise.resolve();
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('[TMLPD] Connected to TMLPD server');
          this.connected = true;
          this.connectPromise = null;
          resolve();
        });

        this.ws.on('error', (error) => {
          console.error('[TMLPD] WebSocket error:', error.message);
          this.connected = false;
          this.connectPromise = null;
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[TMLPD] Disconnected from TMLPD server');
          this.connected = false;
          this.connectPromise = null;
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });
      } catch (error) {
        this.connectPromise = null;
        reject(error);
      }
    });

    return this.connectPromise;
  }

  /**
     * Handle incoming WebSocket messages
     */
  handleMessage(data) {
    try {
      const response = JSON.parse(data.toString());
      const id = response.id;

      if (this.pendingRequests.has(id)) {
        const { resolve } = this.pendingRequests.get(id);
        resolve(response);
        this.pendingRequests.delete(id);
      }
    } catch (error) {
      console.error('[TMLPD] Failed to handle message:', error);
    }
  }

  /**
     * Send request to TMLPD server
     */
  async sendRequest(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = `${Date.now()}_${this.messageId++}`;

    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        id: id,
        method: method,
        params: params
      };

      this.pendingRequests.set(id, { resolve, reject });

      try {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error('WebSocket is not open');
        }
        this.ws.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
     * Execute agent query via TMLPD
     */
  async executeAgent(prompt, options = {}) {
    const { sessionId, context, timeout = 60000 } = options;

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'agent_execute',
        arguments: {
          prompt: prompt,
          timeout: timeout
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      return {
        success: result.success,
        content: result.content,
        model: result.model,
        metadata: {
          source: 'tmlpd',
          sessionId: sessionId,
          ...result
        }
      };
    } catch (error) {
      console.error('[TMLPD] Agent execution failed:', error);
      throw error;
    }
  }

  /**
     * Execute agent in parallel across multiple models
     */
  async executeAgentParallel(prompt, options = {}) {
    const { models, timeout = 60000 } = options;

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'agent_execute_parallel',
        arguments: {
          prompt: prompt,
          models: models || ['claude-3-5-haiku-20241022', 'gemini-2.0-flash', 'zai/glm-4.7'],
          timeout: timeout
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = JSON.parse(response.result.content[0].text);

      return {
        success: true,
        responses: result.responses,
        totalModels: result.total_models,
        successfulModels: result.successful_models,
        metadata: {
          source: 'tmlpd_parallel',
          ...result
        }
      };
    } catch (error) {
      console.error('[TMLPD] Parallel execution failed:', error);
      throw error;
    }
  }

  /**
     * Store conversation in TMLPD episodic memory
     */
  async storeMemory(sessionId, interaction) {
    try {
      await this.sendRequest('tools/call', {
        name: 'memory_store',
        arguments: {
          session_id: sessionId,
          interaction: interaction
        }
      });
    } catch (error) {
      console.error('[TMLPD] Memory store failed:', error);
    }
  }

  /**
     * Recall from TMLPD episodic memory
     */
  async recallMemory(sessionId, options = {}) {
    const { topK = 5 } = options;

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'memory_recall',
        arguments: {
          session_id: sessionId,
          top_k: topK
        }
      });

      if (response.error) {
        return [];
      }

      const result = JSON.parse(response.result.content[0].text);
      return result.episodes || [];
    } catch (error) {
      console.error('[TMLPD] Memory recall failed:', error);
      return [];
    }
  }

  /**
     * Semantic search in TMLPD memory
     */
  async semanticSearch(sessionId, query, options = {}) {
    const { topK = 3 } = options;

    try {
      const response = await this.sendRequest('tools/call', {
        name: 'semantic_search',
        arguments: {
          session_id: sessionId,
          query: query,
          top_k: topK
        }
      });

      if (response.error) {
        return [];
      }

      const result = JSON.parse(response.result.content[0].text);
      return result.results || [];
    } catch (error) {
      console.error('[TMLPD] Semantic search failed:', error);
      return [];
    }
  }

  /**
     * Map Alexa user ID to TMLPD session ID
     */
  getTMLPDSession(alexaUserId) {
    if (!this.sessionMap.has(alexaUserId)) {
      const tmlpdSessionId = `alexa_${alexaUserId}_${Date.now()}`;
      this.sessionMap.set(alexaUserId, tmlpdSessionId);
      console.log(`[TMLPD] Created session: ${tmlpdSessionId} for Alexa user: ${alexaUserId}`);
    }
    return this.sessionMap.get(alexaUserId);
  }

  /**
     * Get TMLPD server status
     */
  async getStatus() {
    try {
      const response = await this.sendRequest('tools/call', {
        name: 'tmlpd_status',
        arguments: {}
      });

      if (response.error) {
        return { status: 'error', message: response.error.message };
      }

      const result = JSON.parse(response.result.content[0].text);
      return result;
    } catch (error) {
      return { status: 'disconnected', error: error.message };
    }
  }

  /**
     * Close connection to TMLPD server
     */
  close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

module.exports = TMLPDClient;
