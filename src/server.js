#!/usr/bin/env node
/**
 * Quantum Claw Server - Universal Multi-Provider AI API
 * Standalone REST API for Quantum Claw functionality
 */

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { QuantumClaw } from './core/QuantumClaw.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Quantum Claw
const quantumClaw = new QuantumClaw({
    enableCache: true,
    enableMetrics: true,
    logLevel: process.env.LOG_LEVEL || 'info'
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"]
        }
    }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// QUANTUM CLAW API ENDPOINTS
// ============================================================================

/**
 * Main query endpoint - Process any AI query
 * POST /api/query
 * Body: { query: string, options?: object }
 */
app.post('/api/query', async (req, res) => {
    try {
        const { query, options = {} } = req.body;
        
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Query is required and must be a string'
            });
        }

        console.log(`🤖 Processing query: ${query.substring(0, 100)}...`);
        
        const result = await quantumClaw.query(query, {
            sessionId: req.headers['x-session-id'] || options.sessionId,
            language: options.language,
            provider: options.provider,
            temperature: options.temperature || 0.7,
            maxTokens: options.maxTokens || 2000
        });

        if (result.success) {
            res.json({
                success: true,
                query: query,
                response: result.response,
                provider: result.provider,
                model: result.model,
                responseTime: result.responseTime,
                language: result.language || 'en',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                query: query
            });
        }

    } catch (error) {
        console.error('❌ Query processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Chat endpoint - Multi-turn conversation support
 * POST /api/chat
 * Body: { message: string, conversationId?: string }
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, conversationId } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a string'
            });
        }

        const result = await quantumClaw.query(message, {
            sessionId: conversationId || req.headers['x-session-id']
        });

        if (result.success) {
            res.json({
                success: true,
                message: message,
                response: result.response,
                conversationId: conversationId || req.headers['x-session-id'],
                provider: result.provider,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }

    } catch (error) {
        console.error('❌ Chat error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Multi-language endpoint - Language-aware queries
 * POST /api/multilingual
 * Body: { query: string, language?: string }
 */
app.post('/api/multilingual', async (req, res) => {
    try {
        const { query, language } = req.body;
        
        const result = await quantumClaw.query(query, {
            language: language,
            sessionId: req.headers['x-session-id']
        });

        res.json({
            success: result.success,
            query: query,
            response: result.response,
            detectedLanguage: result.language || 'en',
            requestedLanguage: language,
            provider: result.provider
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
    const metrics = quantumClaw.getMetrics();
    
    res.json({
        status: 'healthy',
        version: '2.2.0',
        uptime: process.uptime(),
        providers: Object.keys(metrics.providers).length,
        totalRequests: metrics.router.totalRequests,
        avgResponseTime: metrics.router.avgResponseTime,
        cacheHitRate: metrics.cacheStats.hitRate,
        timestamp: new Date().toISOString()
    });
});

/**
 * Metrics endpoint
 * GET /api/metrics
 */
app.get('/api/metrics', (req, res) => {
    const metrics = quantumClaw.getMetrics();
    
    res.json({
        version: '2.2.0',
        metrics: metrics,
        timestamp: new Date().toISOString()
    });
});

/**
 * Providers status endpoint
 * GET /api/providers
 */
app.get('/api/providers', (req, res) => {
    const metrics = quantumClaw.getMetrics();
    
    const providers = Object.entries(metrics.providers).map(([name, providerMetrics]) => ({
        name: name,
        available: providerMetrics.totalRequests > 0,
        totalRequests: providerMetrics.totalRequests,
        successRate: providerMetrics.successRate,
        avgResponseTime: providerMetrics.avgResponseTime
    }));

    res.json({
        providers: providers,
        totalProviders: providers.length,
        activeProviders: providers.filter(p => p.available).length
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Quantum Claw v2.2',
        description: 'Revolutionary Multi-Provider AI Orchestration System',
        version: '2.2.0',
        endpoints: {
            query: '/api/query',
            chat: '/api/chat',
            multilingual: '/api/multilingual',
            health: '/health',
            metrics: '/api/metrics',
            providers: '/api/providers'
        },
        documentation: 'https://github.com/your-username/quantum-claw#readme',
        status: 'operational'
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({
        success: false,
        error: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Start server
app.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║          QUANTUM CLAW v2.2 - UNIVERSAL AI API              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Metrics enabled: ${quantumClaw.config.enableMetrics}`);
    console.log(`💾 Cache enabled: ${quantumClaw.config.enableCache}`);
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  Available Endpoints:                                      ║');
    console.log('║  POST /api/query    - Universal AI query endpoint          ║');
    console.log('║  POST /api/chat    - Multi-turn conversation              ║');
    console.log('║  POST /api/multilingual - Language-aware queries          ║');
    console.log('║  GET  /health      - Health check & system status         ║');
    console.log('║  GET  /api/metrics - Performance metrics                  ║');
    console.log('║  GET  /api/providers - Provider status                    ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
});

export default app;