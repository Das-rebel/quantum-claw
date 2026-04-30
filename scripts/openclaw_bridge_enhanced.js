const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const { Services } = require('ask-sdk-core');
const fs = require('fs');
const path = require('path');

// Import new Phase 1 components
const { CacheManager } = require('./src/cache_manager');
const { SessionManager } = require('./src/session_manager');
const { ConversationContext } = require('./src/conversation_context');
const { IntentRecognizer } = require('./src/intent_recognizer');
const { ModelRouter } = require('./src/model_router');
const { ErrorHandler } = require('./src/error_handler');
const { Analytics } = require('./src/analytics');

const app = express();
const port = 3000;

// OpenClaw CLI path
const OPENCLAW_BIN = "/Users/Subho/.npm-global/bin/openclaw";

// Load voice configuration
let voiceConfig = { voice: null };
try {
    const configPath = path.join(__dirname, 'voice_config.json');
    if (fs.existsSync(configPath)) {
        voiceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`🎤 Voice config loaded: ${voiceConfig.voice ? voiceConfig.voice : 'default Alexa voice'}`);
    }
} catch (err) {
    console.log('⚠️ Could not load voice_config.json, using default voice');
}

// Initialize Phase 1 components
const cache = new CacheManager({ maxSize: 1000, ttl: 5 * 60 * 1000 });
const sessionManager = new SessionManager();
const intentRecognizer = new IntentRecognizer();
const modelRouter = new ModelRouter();
const errorHandler = new ErrorHandler();
const analytics = new Analytics();

console.log('✅ Phase 1 components initialized');
console.log('   - Cache Manager: Active');
console.log('   - Session Manager: Active');
console.log('   - Intent Recognizer: Active');
console.log('   - Model Router: Active');
console.log('   - Analytics: Active');

// Statistics
let stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    progressiveResponses: 0,
    avgResponseTime: 0
};

/**
 * Analyze query complexity to determine if progressive response is needed
 */
function analyzeQueryComplexity(query) {
    let score = 0;
    const lowerQuery = query.toLowerCase();

    // Length complexity
    const wordCount = query.split(/\s+/).length;
    if (wordCount > 15) score += 25;
    else if (wordCount > 10) score += 15;
    else if (wordCount > 5) score += 5;

    // Technical terms
    const technicalTerms = ['api', 'algorithm', 'debug', 'optimize', 'machine learning', 'quantum'];
    const technicalMatches = technicalTerms.filter(term => lowerQuery.includes(term));
    score += Math.min(technicalMatches.length * 10, 25);

    // Complexity keywords
    if (lowerQuery.includes('design a protocol') || lowerQuery.includes('create a system')) {
        score += 20;
    } else if (lowerQuery.includes('design') || lowerQuery.includes('implement')) {
        score += 15;
    }
    if (lowerQuery.includes('explain') || lowerQuery.includes('analyze')) {
        score += 10;
    }

    // Domain specificity
    const specificDomains = ['explain how', 'describe the', 'what is the', 'compare', 'step by step'];
    const domainMatches = specificDomains.filter(pattern => lowerQuery.includes(pattern));
    score += Math.min(domainMatches.length * 10, 30);

    console.log(`🔍 Query complexity score: ${score}/100`);
    console.log(`📊 Word count: ${wordCount}, Technical terms: ${technicalMatches.length}, Domain matches: ${domainMatches.length}`);

    return {
        score,
        needsProgressiveResponse: score >= 70,
        estimatedTime: score >= 85 ? 25 : score >= 70 ? 20 : score >= 30 ? 15 : 12
    };
}

/**
 * Send progressive response to keep Alexa engaged during long processing
 */
async function sendProgressiveResponse(apiEndpoint, apiAccessToken, requestId, message) {
    try {
        const https = require('https');
        const progressiveResponsePayload = {
            header: { requestId: requestId },
            directive: {
                type: "VoicePlayer.Speak",
                speech: message
            }
        };

        const url = new URL(apiEndpoint);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: '/v1/directives',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiAccessToken,
                'Content-Length': Buffer.byteLength(JSON.stringify(progressiveResponsePayload))
            }
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                if (res.statusCode === 202 || res.statusCode === 204) {
                    console.log('✅ Progressive response sent successfully');
                } else {
                    console.log(`⚠️ Progressive response failed with status ${res.statusCode}`);
                }
                resolve();
            });

            req.on('error', (error) => {
                console.error('⚠️ Progressive response error:', error.message);
                resolve();
            });

            req.write(JSON.stringify(progressiveResponsePayload));
            req.end();
        });
    } catch (error) {
        console.error('⚠️ Progressive response exception:', error.message);
    }
}

app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        server: 'openclaw-alexa-bridge',
        backend: 'OpenClaw CLI',
        version: '2.0-phase1',
        components: {
            cache: cache.getStats(),
            sessions: sessionManager.getStats(),
            analytics: analytics.getStats()
        }
    });
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        ...stats,
        cache: cache.getStats(),
        sessions: sessionManager.getStats(),
        analytics: analytics.getStats()
    });
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// WebSocket for real-time updates
const WebSocket = require('ws');
const wss = new WebSocket.Server({ noServer: true });

app.server = app.listen(port, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🦞 ALEXA BRIDGE v2.0 - Enhanced with Phase 1           ║
║                                                           ║
║   ├─ Server: Running on port ${port}                     ║
║   ├─ Backend: OpenClaw CLI (direct)                    ║
║   ├─ Agent: main (TMLPD routing)                        ║
║   ├─ Features:                                          ║
║   │   ✅ Response Caching (LRU)                        ║
║   │   ✅ Session Management                           ║
║   │   ✅ Context Tracking                             ║
║   │   ✅ Intent Recognition                           ║
║   │   ✅ Smart Model Routing                          ║
║   │   ✅ Error Recovery                               ║
║   │   ✅ Analytics Dashboard                          ║
║   ├─ Health: http://localhost:${port}/health            ║
║   ├─ Dashboard: http://localhost:${port}/dashboard      ║
║   └─ Logs: tail -f openclaw_bridge.log                 ║
║                                                           ║
║   Complex queries (>70 score) trigger progressive       ║
║   responses, allowing up to 25s for TMLPD processing.   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

app.server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Main Alexa endpoint with Phase 1 enhancements
app.post('/alexa', async (req, res) => {
    console.log('\n' + '='.repeat(80));
    console.log('🔔 INCOMING ALEXA REQUEST');
    console.log('='.repeat(80));
    console.log('📅 Timestamp:', new Date().toISOString());
    
    const request = req.body.request;
    const session = req.body.session;
    let userInput = "Hello";

    const startTime = Date.now();
    stats.totalRequests++;
    analytics.trackQuery(req.body);

    try {
        if (request.type === 'LaunchRequest') {
            return res.json(buildResponse("Personal Assistant ready with enhanced intelligence! Ask me anything!"));
        } else if (request.type === 'IntentRequest') {
            if (request.intent.name === 'AMAZON.StopIntent' || request.intent.name === 'AMAZON.CancelIntent') {
                return res.json(buildResponse("Goodbye!", true));
            }

            if (request.intent.slots?.query?.value) {
                userInput = request.intent.slots.query.value;
            }
        } else if (request.type === 'SessionEndedRequest') {
            return res.json(buildResponse("Goodbye!", true));
        }

        console.log(`🎤 Alexa User Input: "${userInput}"`);

        // 🆕 Phase 1: Check cache first
        const cached = cache.get(userInput);
        if (cached) {
            console.log('💾 Cache HIT - returning cached response');
            const duration = Date.now() - startTime;
            stats.successfulRequests++;
            stats.avgResponseTime = ((stats.avgResponseTime * (stats.successfulRequests - 1)) + duration) / stats.successfulRequests;
            analytics.trackCacheHit(userInput);
            return res.json(buildResponse(cached));
        }
        console.log('💾 Cache MISS - processing query');

        // 🆕 Phase 1: Get or create session with context
        const userSession = sessionManager.getOrCreate(session.user.userId, session.sessionId);
        const conversationContext = userSession.getContext();
        console.log(`📝 Session: ${session.sessionId}, History: ${conversationContext.history.length} turns`);

        // 🆕 Phase 1: Recognize intent
        const intent = intentRecognizer.recognize(userInput, conversationContext);
        console.log(`🎯 Intent: ${intent.name} (confidence: ${intent.confidence})`);

        // Analyze query complexity
        const complexity = analyzeQueryComplexity(userInput);

        // Send progressive response for complex queries
        if (complexity.needsProgressiveResponse && request.apiEndpoint && request.apiAccessToken) {
            console.log(`⚡ Sending progressive response (complexity: ${complexity.score})...`);
            stats.progressiveResponses++;

            const progressMessage = complexity.score >= 85
                ? "I'm processing your complex query with multiple AI models. This may take up to 25 seconds."
                : "I'm researching that for you. This may take a moment.";

            sendProgressiveResponse(
                request.apiEndpoint,
                request.apiAccessToken,
                request.requestId,
                progressMessage
            ).catch(err => console.error('Progressive response failed:', err));
        }

        console.log(`📤 Forwarding to OpenClaw CLI (timeout: ${complexity.estimatedTime}s)...`);

        // 🆕 Phase 1: Use model router with error handling
        const responseText = await errorHandler.execute(
            () => callOpenClaw(userInput, session.user.userId || "alexa-user", complexity.estimatedTime),
            {
                query: userInput,
                intent: intent.name,
                maxRetries: 3
            }
        );

        // Sanitize response for Alexa
        const sanitizedResponse = responseText
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 8000);

        // 🆕 Phase 1: Cache the response
        cache.set(userInput, sanitizedResponse);
        console.log('💾 Response cached');

        // 🆕 Phase 1: Update conversation context
        conversationContext.update(userInput, sanitizedResponse, {
            intent: intent.name,
            complexity: complexity.score,
            model: 'gemini-2.5-flash'
        });
        console.log('📝 Context updated');

        const duration = Date.now() - startTime;
        stats.successfulRequests++;
        stats.avgResponseTime = ((stats.avgResponseTime * (stats.successfulRequests - 1)) + duration) / stats.successfulRequests;

        console.log(`✅ Response in ${duration}ms: "${sanitizedResponse.substring(0, 100)}..."`);

        // 🆕 Phase 1: Track analytics
        analytics.trackResponse({
            query: userInput,
            response: sanitizedResponse,
            intent: intent.name,
            duration,
            cached: false,
            model: 'gemini-2.5-flash'
        });

        res.json(buildResponse(sanitizedResponse));

    } catch (error) {
        console.error("❌ Bridge Error:", error.message);
        stats.failedRequests++;
        
        // 🆕 Phase 1: Track error in analytics
        analytics.trackError({
            query: userInput,
            error: error.message,
            timestamp: Date.now()
        });
        
        res.json(buildResponse("I'm having trouble connecting right now. Please try again."));
    }
});

function callOpenClaw(message, userId, timeoutSeconds = 7) {
    return new Promise((resolve, reject) => {
        const args = ['agent', '--local', '--agent', 'main', '--message', message, '--timeout', timeoutSeconds];
        
        console.log(`🔧 Running: ${OPENCLAW_BIN} ${args.join(' ')}`);
        
        const openclaw = spawn(OPENCLAW_BIN, args, {
            env: { ...process.env, GEMINI_API_KEY: process.env.GEMINI_API_KEY }
        });

        let stdout = '';
        let stderr = '';
        let responseStarted = false;

        const timeoutId = setTimeout(() => {
            openclaw.kill();
            reject(new Error(`OpenClaw timeout after ${timeoutSeconds + 2} seconds`));
        }, (timeoutSeconds + 2) * 1000);

        openclaw.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`📟 OpenClaw stdout: ${output.substring(0, 200)}`);
            stdout += output;
        });

        openclaw.stderr.on('data', (data) => {
            const error = data.toString();
            stderr += error;
        });

        openclaw.on('close', (code) => {
            console.log(`🔚 OpenClaw process exited with code ${code}`);
            clearTimeout(timeoutId);
            
            // Clean up stdout first
            let cleanedResponse = stdout
                .replace(/◇.*?╮.*?├.*?╯/gs, '')
                .replace(/[│├─╮╯]/g, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            
            // If stdout has content, return it
            if (cleanedResponse && cleanedResponse.length > 10) {
                console.log(`✅ Using stdout response: ${cleanedResponse.substring(0, 100)}...`);
                resolve(cleanedResponse);
                return;
            }
            
            // Check stderr for response (filter out diagnostics)
            const stderrWithoutDiagnostics = stderr
                .replace(/\[diagnostic\].*?error="[^"]*"/g, '')
                .replace(/\[diagnostic\].*?\n/g, '')
                .trim();
            
            if (stderrWithoutDiagnostics && stderrWithoutDiagnostics.length > 10) {
                console.log(`✅ Using stderr response: ${stderrWithoutDiagnostics.substring(0, 100)}...`);
                resolve(stderrWithoutDiagnostics);
                return;
            }
            
            reject(new Error('No valid response found in stdout or stderr'));
        });

        // Store timeout ID for clearing
        openclaw.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}

function buildResponse(text, shouldEndSession = false) {
    if (voiceConfig && voiceConfig.voice) {
        return {
            version: "1.0",
            response: {
                outputSpeech: { 
                    type: "SSML", 
                    ssml: `<speak><voice name="${voiceConfig.voice}">${escapeXml(text)}</voice></speak>` 
                },
                shouldEndSession: shouldEndSession
            }
        };
    }
    
    return {
        version: "1.0",
        response: {
            outputSpeech: { type: "PlainText", text: text },
            shouldEndSession: shouldEndSession
        }
    };
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log("\n👋 Shutting down gracefully...");
    cache.destroy();
    process.exit(0);
});
