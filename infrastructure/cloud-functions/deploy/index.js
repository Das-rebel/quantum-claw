/**
 * OmniClaw Alexa Bridge - Full OmniClaw 2.0 Integration
 * Includes: AgentOrchestrator, PersonaGenerator, ServiceMesh, StoryOrchestrator
 */

const { getClient, multiProviderQuery, getHealthStatus } = require('./resilient-clients');
const { StoryOrchestrator } = require('./clients/story-orchestrator-wrapper');
const AgentOrchestrator = require('./core/agent_orchestrator');
const ServiceMesh = require('./core/service_mesh');
const PersonaGenerator = require('./shared/persona/persona_generator');
const { ConversationMemory } = require('./shared/memory/conversation-memory');
const { AttentionWeightedMemory } = require('./shared/memory/attention-weighted-memory');
const { TaskGuidedCompressor } = require('./shared/memory/task-guided-compressor');
const OmniClawIntegration = require('./integration/omniclaw_integration');
const KodiClient = require('./clients/kodi_client');
const AutoBookmarkSync = require('./clients/auto_bookmark_sync');

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// GCS Configuration
const GCS_BUCKET = 'omniclaw-knowledge-graph';
const GCS_KG_PATH = 'unified_knowledge_graph.json';

/**
 * Get GCS access token from metadata service (Cloud Run)
 */
function getGCSToken() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'metadata.google.internal',
      path: '/computeMetadata/v1/instance/service-accounts/default/identity?audience=https://storage.googleapis.com/',
      method: 'GET',
      headers: { 'Metadata-Flavor': 'Google' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`Token request failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Upload knowledge graph to GCS using XML API with service account token
 */
async function uploadToGCS(localPath) {
  try {
    // Get access token from metadata service
    const token = await getGCSToken();
    const content = fs.readFileSync(localPath);
    const objectUri = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${GCS_KG_PATH}`;

    const response = await fetch(objectUri, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': content.length.toString()
      },
      body: content
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GCS upload failed: ${response.status} - ${errorText}`);
    }

    console.log('✅ Knowledge graph uploaded to GCS');
    return true;
  } catch (error) {
    console.error('❌ GCS upload failed:', error.message);
    return false;
  }
}

/**
 * Save knowledge graph locally and sync to GCS
 */
async function saveAndSyncKnowledgeGraph(nodes, relationships) {
  const kgPath = process.env.KG_PATH || path.join(__dirname, '../../data/unified_knowledge_graph.json');
  const kgData = {
    nodes: nodes || [],
    relationships: relationships || [],
    graph: { nodes: nodes || [], relationships: relationships || [] },
    updatedAt: new Date().toISOString()
  };

  // Ensure directory exists
  const dir = path.dirname(kgPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save locally
  fs.writeFileSync(kgPath, JSON.stringify(kgData, null, 2));
  console.log(`💾 Knowledge graph saved: ${kgData.nodes.length} nodes, ${kgData.relationships.length} relationships`);

  // Upload to GCS
  await uploadToGCS(kgPath);

  return kgData;
}

// Initialize OmniClaw 2.0 components
let agentOrchestrator = null;
let serviceMesh = null;
let personaGenerator = null;
let storyOrchestrator = null;
let conversationMemory = null;
let attentionWeightedMemory = null;
let taskGuidedCompressor = null;
let omniClawIntegration = null;
let startupComplete = false;
let startupStarted = false;

/**
 * Warmup endpoint for Cloud Run - triggers lazy initialization asynchronously.
 * Returns 200 immediately while initialization happens in background.
 */
exports.startupHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // If already started or starting, return immediately
  if (startupComplete || startupStarted) {
    res.json({
      status: startupComplete ? 'ready' : 'starting',
      timestamp: new Date().toISOString(),
      message: startupComplete ? 'Already initialized' : 'Initialization in progress'
    });
    return;
  }

  startupStarted = true;
  console.log('[startup] Beginning async initialization...');

  // Respond immediately, initialize in background
  res.json({
    status: 'starting',
    timestamp: new Date().toISOString(),
    message: 'Initialization started'
  });

  // Initialize asynchronously so Cloud Run doesn't timeout
  setImmediate(async () => {
    try {
      initializeOmniClaw2();
      startupComplete = true;
      console.log('[startup] OmniClaw 2.0 components initialized');
    } catch (e) {
      console.error('[startup] Initialization failed:', e.message);
    }
  });
};

function initializeOmniClaw2() {
  if (!agentOrchestrator) {
    console.log('Initializing OmniClaw 2.0 components...');
    
    // Wrap each initialization in try-catch to prevent one failure from breaking all
    try {
      agentOrchestrator = new AgentOrchestrator();
      console.log('AgentOrchestrator initialized:', agentOrchestrator.state);
    } catch (e) {
      console.error('AgentOrchestrator init failed:', e.message);
      // Create a minimal fallback orchestrator
      agentOrchestrator = {
        state: 'error',
        processRequest: async () => ({ success: false, error: e.message }),
        getPerformanceMetrics: () => ({ state: 'error', error: e.message })
      };
    }
    
    try {
      serviceMesh = new ServiceMesh();
      console.log('ServiceMesh initialized:', serviceMesh.state, 'with', serviceMesh.services?.size || 0, 'services');
    } catch (e) {
      console.error('ServiceMesh init failed:', e.message);
      serviceMesh = {
        state: 'error',
        getServiceMetrics: () => ({ state: 'error' })
      };
    }
    
    try {
      personaGenerator = new PersonaGenerator();
      console.log('PersonaGenerator initialized');
    } catch (e) {
      console.error('PersonaGenerator init failed:', e.message);
      personaGenerator = null;
    }
    
    try {
      conversationMemory = new ConversationMemory();
      console.log('ConversationMemory initialized');
    } catch (e) {
      console.error('ConversationMemory init failed:', e.message);
      conversationMemory = null;
    }
    
    try {
      attentionWeightedMemory = new AttentionWeightedMemory();
      console.log('AttentionWeightedMemory initialized');
    } catch (e) {
      console.error('AttentionWeightedMemory init failed:', e.message);
      attentionWeightedMemory = null;
    }
    
    try {
      taskGuidedCompressor = new TaskGuidedCompressor(attentionWeightedMemory);
      console.log('TaskGuidedCompressor initialized');
    } catch (e) {
      console.error('TaskGuidedCompressor init failed:', e.message);
      taskGuidedCompressor = null;
    }
    
    try {
      omniClawIntegration = new OmniClawIntegration();
      console.log('OmniClawIntegration initialized');
    } catch (e) {
      console.error('OmniClawIntegration init failed:', e.message);
      omniClawIntegration = null;
    }
    
    console.log('OmniClaw 2.0 components ready. AgentOrchestrator state:', agentOrchestrator.state);
  }
  return { agentOrchestrator, serviceMesh, personaGenerator, conversationMemory, attentionWeightedMemory, taskGuidedCompressor, omniClawIntegration };
}

function getStoryOrchestrator() {
  if (!storyOrchestrator) {
    // Use original (unprotected) client for full method access
    const { getOriginalClients } = require('./resilient-clients');
    const originalClients = getOriginalClients();
    const aiClient = originalClients.UnifiedAIClient;
    storyOrchestrator = new StoryOrchestrator(aiClient, { language: 'hinglish' });
  }
  return storyOrchestrator;
}

const RANDOM_EXAMPLES = [
  { query: 'play my road trip playlist on Spotify', desc: 'Spotify' },
  { query: 'search Twitter for AI news', desc: 'Twitter' },
  { query: 'tell me a story about a brave knight', desc: 'Story Mode' },
  { query: 'translate "how are you" to Hindi', desc: 'Translator' },
  { query: 'who is Albert Einstein', desc: 'Wikipedia' },
  { query: 'send a WhatsApp message to Rahul saying running late', desc: 'WhatsApp' },
  { query: 'control Kodi and play the last movie', desc: 'Kodi Control' },
  { query: 'search Reddit for programming jokes', desc: 'Reddit' },
  { query: 'narrate the news for me', desc: 'News Reader' }
];

function getRandomExample() {
  return RANDOM_EXAMPLES[Math.floor(Math.random() * RANDOM_EXAMPLES.length)];
}

function getTimeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Hey';
}

/**
 * Brief-first response helper - Ive-style: truncate to max words, offer to continue
 * @param {string} text - Full response text
 * @param {number} maxWords - Maximum words before truncation (default: 25)
 * @param {string} offerText - Text to append offering continuation
 * @returns {string} Brief response with continuation offer
 */
function briefResponse(text, maxWords = 25, offerText = 'Want more?') {
  if (!text) return text;
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  const brief = words.slice(0, maxWords).join(' ') + '...';
  return `${brief} ${offerText}`;
}

/**
 * Build continuity-aware session attributes for cross-platform context
 * @param {Object} attrs - Existing session attributes
 * @param {string} topic - Current conversation topic
 * @param {Object} options - Additional continuity options
 * @returns {Object} Enhanced session attributes
 */
function buildSessionAttributes(attrs = {}, topic = '', options = {}) {
  return {
    ...attrs,
    threadId: attrs.threadId || generateThreadId(),
    topic: topic || attrs.topic || '',
    channel: 'alexa',
    lastTopic: topic,
    handoffAvailable: true,
    ...options
  };
}

/**
 * Generate a simple thread ID for conversation continuity
 * @returns {string} Thread ID
 */
function generateThreadId() {
  return `thd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if topic is continuing from previous context
 * @param {Object} session - Session attributes
 * @param {string} newTopic - New topic from user
 * @returns {boolean} True if continuing same topic
 */
function isContinuingTopic(session, newTopic) {
  if (!session?.topic || !newTopic) return false;
  const prevTopic = session.topic.toLowerCase();
  const currTopic = newTopic.toLowerCase();
  // Check if topics share significant words
  const prevWords = new Set(prevTopic.split(/\s+/));
  const currWords = new Set(currTopic.split(/\s+/));
  const overlap = [...prevWords].filter(w => w.length > 3 && currWords.has(w));
  return overlap.length >= 1;
}

/**
 * Build a handoff card for cross-platform continuity
 * @param {string} topic - Current topic
 * @param {string} channel - Target channel
 * @returns {string} Handoff message
 */
function buildHandoffCard(topic, channel = 'WhatsApp') {
  return `Still on ${topic}. Continue on ${channel}? Say "continue on ${channel.toLowerCase()}" or I'll text you the details.`;
}

/**
 * Intent type classifications for adaptive endpointing
 * Determines how long to wait before considering speech complete
 */
const INTENT_ENDPOINTING = {
  command: { timeout: 1500, description: 'Short phrases, quick actions' },
  conversation: { timeout: 4000, description: 'Natural backchannels' },
  query: { timeout: 2500, description: 'Complete questions' },
  story: { timeout: 5000, description: 'Creative, longer responses' },
  default: { timeout: 3000, description: 'Standard timeout' }
};

/**
 * Classify intent type for adaptive endpointing
 * @param {string} intentName - Name of the intent
 * @returns {string} Intent type
 */
function classifyIntentType(intentName) {
  if (!intentName) return 'default';
  if (intentName.includes('Command') || intentName.includes('Control')) return 'command';
  if (intentName.includes('Story') || intentName.includes('Generate')) return 'story';
  if (intentName.includes('Query') || intentName.includes('Search') || intentName.includes('Lookup')) return 'query';
  if (intentName.includes('Chat') || intentName.includes('Conversation')) return 'conversation';
  return 'default';
}

/**
 * Get endpointing config for an intent
 * @param {string} intentName - Intent name
 * @returns {Object} Endpointing config with timeout
 */
function getEndpointingConfig(intentName) {
  const type = classifyIntentType(intentName);
  return INTENT_ENDPOINTING[type] || INTENT_ENDPOINTING.default;
}

/**
 * Check if user is continuing interrupted speech
 * @param {Object} session - Session attributes
 * @returns {boolean} True if resuming
 */
function isResumingInterrupted(session) {
  return session?.interrupted === true && session?.pendingResponse === true;
}

/**
 * Mark session as interrupted (for barge-in detection)
 * @param {Object} session - Session attributes
 * @returns {Object} Updated session with interruption flag
 */
function markInterrupted(session) {
  return {
    ...session,
    interrupted: true,
    pendingResponse: session?.pendingResponse || false
  };
}

/**
 * Clear interruption state
 * @param {Object} session - Session attributes
 * @returns {Object} Updated session without interruption
 */
function clearInterruption(session) {
  const { interrupted, pendingResponse, ...clean } = session || {};
  return clean;
}

/**
 * Auto-detect accent/language from user input text (story theme + setting)
 * Uses script detection + keyword patterns to determine language and regional accent
 * Priority: explicit session > auto-detected > default
 */
/**
 * Auto-detect accent/language from user input text (story theme + setting)
 * Uses script detection + keyword patterns to determine language and regional accent
 * Priority: explicit session > auto-detected > default
 */
/**
 * Auto-detect accent/language from story theme + setting text
 * Priority: script detection > regional keywords > Bengali-exclusionary rules > Hinglish > English accents
 * Uses IndicLID-researched patterns: Bengali-exclusionary for romanized overlap resolution
 */
function detectAccentFromInput(text) {
  if (!text || typeof text !== 'string') return null;

  const lower = text.toLowerCase();

  // === SCRIPT-BASED (instant, 100% reliable) ===
  // Bengali script: U+0980 to U+09FF
  if (/[ঀ-৿]/.test(text)) {
    return /sylhet|assam|bangladesh|dacca/i.test(text)
      ? { language: 'bengali', accent: 'sylheti', confidence: 'high' }
      : { language: 'bengali', accent: 'kolkata_bengali', confidence: 'high' };
  }
  // Gurmukhi script: U+0A00 to U+0A7F
  if (/[਀-੿]/.test(text)) {
    return { language: 'punjabi', accent: 'punjabi_hindi', confidence: 'high' };
  }
  // Devanagari script: U+0900 to U+097F (checked AFTER Bengali/Gurmukhi to avoid misclassification)
  if (/[ऀ-ॿ]/.test(text)) {
    return { language: 'hindi', accent: 'hindi_pure', confidence: 'high' };
  }

  // === REGIONAL KEYWORDS (check BEFORE vocabulary to ensure Hindi regional variants override) ===
  // Punjabi regions
  if (/punjab|punjabi|amritsar|ludhiana|chandigarh/i.test(lower)) {
    return { language: 'hindi', accent: 'punjabi_hindi', confidence: 'high' };
  }
  // Lucknow / Awadhi regions
  if (/lucknow|nawab|awadh|awadhi|lko/i.test(lower)) {
    return { language: 'hindi', accent: 'lucknow_hindi', confidence: 'high' };
  }
  // Delhi / North India
  if (/delhi|dilli|north india|new delhi/i.test(lower)) {
    return { language: 'hindi', accent: 'delhi_hindi', confidence: 'high' };
  }
  // Mumbai / Bollywood
  if (/mumbai|bombay|filmi|bollywood/i.test(lower)) {
    return { language: 'hinglish', accent: 'hinglish_mumbai', confidence: 'high' };
  }
  // Pune / Marathi
  if (/pune|punes|marathi|puneri|maharashtra/i.test(lower)) {
    return { language: 'hinglish', accent: 'hinglish_pune', confidence: 'high' };
  }
  // Sylhet / Bangladesh / Assam (Bengali regions - checked before generic Bengali)
  if (/sylhet|assam|bangladesh|dacca|chittagong|khulna/i.test(lower)) {
    return { language: 'bengali', accent: 'sylheti', confidence: 'high' };
  }

  // === LATIN SCRIPT: BENGALI-EXCLUSIONARY (research-backed approach) ===
  // Bengali-exclusive romanized words (verified not used in standard Hindi romanization)
  // These are the ONLY reliable signal for romanized Bengali vs Hindi separation
  const BEN_WORDS = [
    'ami ',        // I (Bengali, not Hindi)
    'tumi',        // you (Bengali, Hindi uses 'tum')
    'keno',        // why (Hindi uses 'kyun')
    'keu ',        // someone (Hindi uses 'koi')
    'kichu',      // something (Hindi uses 'kuch')
    'bhalo',       // good (Bengali, Hindi uses 'accha' or 'badiya')
    'bhalobasha',  // love (Bengali word, not Hindi)
    'bondhu',      // friend (distinct Bengali spelling)
    'shob ',       // all (Bengali 'shob', Hindi 'sab')
    'shobai',      // everyone (Bengali exclusive)
    'meye',        // girl (Hindi uses 'ladki')
    'chele',       // boy (Hindi uses 'ladka')
    'golpo',       // story (Bengali word)
    'jibon',       // life (Bengali spelling, Hindi 'jeevan')
    'hridoy',      // heart (Bengali spelling)
    'chokh',       // eye (Bengali, Hindi 'aankh')
    'shundor',     // beautiful (Bengali spelling)
    'kono',        // no one (Bengali, Hindi 'koi nahi')
    'alpo',        // few (Bengali)
    'kemon',       // how (Bengali, Hindi 'kaise')
    'onek',        // very (Bengali, Hindi 'bohot')
    'ekhon',       // now (Bengali word)
    'bolchi',      // I say (Bengali present tense)
    'jacch',       // going (Bengali, not Hindi 'jaa')
    'gele',        // went (Bengali 'gele', Hindi 'gaya')
    'hobe',        // will be (Bengali, Hindi 'hoga')
    'hoche',       // is happening (Bengali)
    'somoy',       // time (Bengali word)
    'bhasha',      // language (Bengali spelling)
    'amra',        // we (Bengali, Hindi 'hum')
    'ke ',         // than (Bengali postposition, Hindi 'se')
    'pore',        // after (Bengali, can overlap)
    'pete',        // by (Bengali)
    'theke',       // from (Bengali, Hindi 'se')
    'diye',        // with (Bengali, Hindi 'saath')
    'niye',        // taking (Bengali)
    'shob',        // all (without space, Bengali 'shob' vs Hindi 'sab')
    'na ',         // Bengali question particle at end
  ];

  let benCount = 0;
  for (const w of BEN_WORDS) {
    if (lower.includes(w)) benCount++;
  }

  // 2+ Bengali markers = Bengali
  if (benCount >= 2) {
    return { language: 'bengali', accent: 'kolkata_bengali', confidence: 'high' };
  }
  // Even 1 strong marker = Bengali (use LOW confidence)
  const BEN_STRONG = ['ami ', 'tumi', 'keno', 'bhalo', 'bondhu', 'bolchi', 'jacch', 'gele', 'hobe', 'ekhon', 'somoy', 'kemon', 'onek', 'shundor', 'amra', 'bhalobasha', 'meye', 'chele', 'golpo', 'jibon', 'hridoy', 'chokh', 'shobai', 'shob ', 'kichu', 'keu '];
  for (const w of BEN_STRONG) {
    if (lower.includes(w)) {
      return { language: 'bengali', accent: 'kolkata_bengali', confidence: 'low' };
    }
  }

  // === LATIN SCRIPT: ENGLISH ACCENT DETECTION (before generic Hindi to catch phrases) ===
  const englishAccents = [
    { re: /top of the morning|grand so it is|would ye not|aye that it is/i, accent: 'irish' },
    { re: /whit a tale|och aye|ken ye|braw story|scottish/i, accent: 'scottish' },
    { re: /g day|mate|heaps|she will be right|no worries|good on ya/i, accent: 'australian' },
    { re: /y all|bless your heart|fixin to|I declare|southern/i, accent: 'southern' },
    { re: /splendid|jolly good|quite so|rather remarkable/i, accent: 'british' },
    { re: /ya mon|irie|everyting|we be jammin/i, accent: 'caribbean' },
  ];
  for (const { re, accent } of englishAccents) {
    if (re.test(lower)) return { language: 'english', accent, confidence: 'high' };
  }

  // === LATIN SCRIPT: HINGLISH (English word density + Hindi presence) ===
  // Count English words and Hindi/Bengali common words
  const englishWords = ['movie', 'film', 'song', 'music', 'dance', 'drama', 'game', 'player', 'win', 'lose', 'feeling', 'heart', 'smile', 'dream', 'story', 'tale', 'life', 'love', 'friend', 'time', 'good', 'very', 'totally', 'one', 'two', 'three', 'four', 'five', 'feeling', 'best', 'great', 'awesome', 'nice', 'cool'];
  const hindiWords = ['hai', 'kya', 'kaun', 'kyun', 'kaise', 'kaha', 'ka', 'ki', 'ke', 'ko', 'se', 'pe', 'aur', 'ya', 'na', 'to', 'bhi', 'hi', 'mat', 'ek', 'do', 'teen', 'char', 'panch', 'hai', 'ho', 'hain', 'tha', 'the', 'hoga', 'hogi', 'ja', 'jao', 'aana', 'jaana', 'dekho', ' bolo', 'sun', 'sunna', 'sunni', 'chalo', 'chal', 'karna', 'karo', 'kehta', 'bolna', 'sab', 'kuch', 'koi', 'har', 'accha', 'theek', 'mast', 'zabardast', 'badiya', 'shandaar'];
  const hindiWordCount = hindiWords.filter(w => lower.includes(w)).length;
  const englishWordCount = englishWords.filter(w => lower.includes(w)).length;
  const totalWords = lower.split(/\s+/).length;
  const englishRatio = englishWordCount / Math.max(totalWords, 1);

  // Hinglish: English word density >= 30% AND some Hindi words present
  if (englishRatio >= 0.3 && hindiWordCount >= 2) {
    // Already checked regional markers above, so default to Hinglish
    return { language: 'hinglish', accent: 'hinglish_pune', confidence: 'medium' };
  }

  // === LATIN SCRIPT: GENERIC HINDI (only if strong Hindi signal) ===
  if (hindiWordCount >= 5) {
    return { language: 'hindi', accent: 'hindi_pure', confidence: 'medium' };
  }

  return null; // No match — default accent will be used
}



/**
 * Health check endpoint - lightweight status check.
 * For full component status, call /startup first, then check here.
 */
exports.healthHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const resilienceHealth = getHealthStatus();

  // Get actual state from components
  const orchestratorState = agentOrchestrator?.state || 'not_initialized';
  const meshState = serviceMesh?.state || 'not_initialized';
  
  // Lightweight check - don't re-initialize components on every health check
  let agentMetrics = {};
  let serviceMetrics = {};
  try {
    if (agentOrchestrator && agentOrchestrator.getPerformanceMetrics) {
      agentMetrics = agentOrchestrator.getPerformanceMetrics();
    }
  } catch (e) {
    agentMetrics = { error: e.message };
  }

  try {
    if (serviceMesh && serviceMesh.getServiceMetrics) {
      serviceMetrics = serviceMesh.getServiceMetrics();
    }
  } catch (e) {
    serviceMetrics = { error: e.message };
  }

  // Determine overall status based on component states
  const overallStatus = 
    orchestratorState === 'ready' && meshState === 'ready' ? 'healthy' :
    orchestratorState === 'error' || meshState === 'error' ? 'degraded' :
    'initializing';

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    message: overallStatus === 'healthy' 
      ? 'OmniClaw 2.0 Personal Assistant is operational'
      : overallStatus === 'initializing'
        ? 'OmniClaw 2.0 is initializing'
        : 'OmniClaw 2.0 is running in degraded mode',
    components: {
      initialized: startupComplete,
      initializing: !startupComplete && startupStarted,
      resilience: 'active',
      circuitBreakers: resilienceHealth.circuitBreakers || [],
      agentOrchestrator: orchestratorState,
      serviceMesh: meshState,
      personaGenerator: personaGenerator ? 'available' : 'unavailable',
      attentionWeightedMemory: attentionWeightedMemory ? 'active' : 'inactive',
      taskGuidedCompressor: taskGuidedCompressor ? 'active' : 'inactive',
      storyOrchestrator: storyOrchestrator ? 'available' : 'not_initialized',
      region: 'asia-south1'
    },
    performance: agentMetrics.system || {}
  });
};

/**
 * Bookmark sync endpoint for Cloud Scheduler
 * Triggers daily bookmark sync from Instagram and Twitter
 * Also updates the knowledge graph in GCS for vault-search service
 */
exports.syncHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  console.log('🔄 Bookmark sync triggered via Cloud Scheduler');

  try {
    const sync = new AutoBookmarkSync({
      syncInterval: 86400000, // 24 hours - run once
      analysisInterval: 86400000,
      backupInterval: 86400000
    });

    // Perform sync
    const syncResult = await sync.performSync();
    const analysisResult = await sync.performAnalysis();
    const backupResult = await sync.performBackup();

    console.log('🔄 Bookmark sync completed:', {
      sync: syncResult.status,
      analysis: analysisResult.status,
      backup: backupResult.status
    });

    // Convert bookmarks to knowledge graph nodes and upload to GCS
    let kgUpdateResult = null;
    try {
      const kgNodes = [];
      const kgRelationships = [];

      // Process Twitter bookmarks - read from vault (scraped by Python cron, synced via GCS)
      if (syncResult.platforms?.twitter?.count > 0) {
        // Twitter bookmarks already synced to GCS by vm_sync.sh - read from local vault
        const fs = require('fs');
        const vaultPath = require('path').join(__dirname, 'learning_base/twitter_bookmarks_automated.json');
        try {
          if (fs.existsSync(vaultPath)) {
            const twitterData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
            const bookmarks = twitterData.bookmarks || [];
            bookmarks.forEach((bm, i) => {
              const nodeId = `twitter_${bm.id || i}`;
              kgNodes.push({
                id: nodeId,
                name: bm.text?.substring(0, 100) || 'Twitter Bookmark',
                type: 'twitter_tweet',
                content: bm.text || '',
                url: bm.url || '',
                metadata: {
                  username: bm.username || '',
                  likes: bm.likes || 0,
                  retweets: bm.retweets || 0,
                  savedAt: bm.saved_at || bm.timestamp || new Date().toISOString(),
                  platform: 'twitter'
                }
              });
            });
            console.log(`📚 Added ${bookmarks.length} Twitter bookmarks to KG`);
          }
        } catch (e) {
          console.log('Twitter vault read skipped:', e.message);
        }
      }

      // Process Instagram bookmarks - read from vault (scraped by Python cron, synced via GCS)
      if (syncResult.platforms?.instagram?.count > 0) {
        // Instagram posts already synced to GCS by vm_sync.sh - read from local vault
        const fs = require('fs');
        const vaultPath = require('path').join(__dirname, 'learning_base/instagram_scrape.json');
        try {
          if (fs.existsSync(vaultPath)) {
            const instagramData = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
            const posts = Array.isArray(instagramData) ? instagramData : instagramData.posts || [];
            posts.slice(0, 50).forEach((item, i) => {
              const nodeId = `instagram_${item.id || i}`;
              kgNodes.push({
                id: nodeId,
                name: item.caption?.substring(0, 100) || 'Instagram Saved',
                type: 'instagram_post',
                content: item.caption || '',
                url: item.permalink || item.url || '',
                metadata: {
                  mediaType: item.mediaType || item.type || 'image',
                  likes: item.like_count || 0,
                  comments: item.comments_count || 0,
                  savedAt: item.timestamp || new Date().toISOString(),
                  platform: 'instagram'
                }
              });
            });
            console.log(`📚 Added ${posts.length} Instagram posts to KG`);
          }
        } catch (e) {
          console.log('Instagram vault read skipped:', e.message);
        }
      }

      // Add entity and topic nodes from existing knowledge graph
      const existingKg = sync.analyzer.knowledgeGraph;
      if (existingKg?.nodes) {
        existingKg.nodes.forEach(node => {
          if (node.type === 'entity' || node.type === 'topic' || node.type === 'category') {
            kgNodes.push(node);
          }
        });
      }
      if (existingKg?.relationships) {
        kgRelationships.push(...existingKg.relationships);
      }

      // Save and sync to GCS
      kgUpdateResult = await saveAndSyncKnowledgeGraph(kgNodes, kgRelationships);
      console.log(`📚 Knowledge graph updated with ${kgNodes.length} nodes`);

    } catch (kgError) {
      console.error('⚠️ Knowledge graph update failed:', kgError.message);
      // Continue - don't fail the whole sync
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        sync: syncResult,
        analysis: analysisResult,
        backup: backupResult,
        knowledgeGraph: kgUpdateResult ? {
          nodes: kgUpdateResult.nodes?.length || 0,
          relationships: kgUpdateResult.relationships?.length || 0,
          gcsUploaded: true
        } : { gcsUploaded: false }
      }
    });
  } catch (error) {
    console.error('❌ Bookmark sync failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Main Alexa handler with full OmniClaw 2.0 integration
 */
exports.alexaHandler = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Get body - Express parses JSON automatically
    const body = req.body || {};
    
    // Log body content
    console.log('[Alexa] body:', JSON.stringify(body));
    console.log('[Alexa] body.text:', body.text);
    console.log('[Alexa] body.request:', body.request?.type);

    // Handle plain text format (for WhatsApp compatibility) - HIGHEST PRIORITY
    if (body.text) {
      console.log('[Alexa] Handling text query directly:', body.text.substring(0, 50));
      
      // Check for vault keywords BEFORE AI query
      const queryLower = body.text.toLowerCase();
      const vaultKeywords = ['vault', 'search my vault', 'find in my vault', 'my saved', 'bookmarks', 'what do i have saved', 'remember', 'knowledge graph'];
      const isVaultQuery = vaultKeywords.some(k => queryLower.includes(k));
      
      if (isVaultQuery) {
        console.log('[Alexa] Detected vault query:', body.text);
        try {
          const VaultClient = require('./clients/vault_client');
          const vault = new VaultClient();
          
          // Extract search term
          let searchTerm = queryLower
            .replace(/^vault\s*/gi, '')
            .replace(/search\s*(my)?\s*(vault|bookmarks|saved)?\s*(for)?\s*/gi, '')
            .replace(/find\s*(in)?\s*(my)?\s*(vault)?\s*/gi, '')
            .replace(/what\s*(do)?\s*(i\s*)?(have)?\s*(saved)?\s*/gi, '')
            .replace(/remember\s*/gi, '')
            .replace(/knowledge\s*graph\s*/gi, '')
            .replace(/my\s*(bookmarks|saved)\s*/gi, '')
            .trim();
          
          if (!searchTerm) searchTerm = body.text;
          
          const result = vault.findKnowledge(searchTerm);
          const total = result.topics.length + result.skills.length + result.vaultPosts.length;
          
          let responseText;
          if (total > 0) {
            responseText = `🗄️ *VAULT SEARCH*
━━━━━━━━━━━━━━━━━━
`;
            responseText += `📊 Results for "${searchTerm}": ${total} items\n\n`;
            
            // Add vault posts with full details (up to 10)
            if (result.vaultPosts.length > 0) {
              const showPosts = result.vaultPosts.slice(0, 10);
              showPosts.forEach((p, i) => {
                const title = (p.vlSubject || p.caption || 'Untitled').substring(0, 70);
                const summary = (p.caption || p.vlSubject || '').substring(0, 120);
                const url = p.url || p.permalink || '';
                const channel = p.source || p.platform || 'Unknown';
                const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '';
                
                responseText += `${i+1}. *${title}*\n`;
                if (summary && summary !== title) responseText += `   📝 ${summary}...\n`;
                responseText += `   📱 ${channel}`;
                if (date) responseText += ` | 📅 ${date}`;
                responseText += '\n';
                if (url) responseText += `   🔗 ${url}\n`;
                responseText += '\n';
              });
              
              if (result.vaultPosts.length > 10) {
                responseText += `✨ +${result.vaultPosts.length - 10} more results`;
              }
            }
            
            // Add topics/skills count
            if (result.topics.length > 0) responseText += `\n📁 Topics: ${result.topics.length}`;
            if (result.skills.length > 0) responseText += `\n🎯 Skills: ${result.skills.length}`;
          } else {
            responseText = `❌ No results for "${searchTerm}" in your vault.`;
          }
          
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: responseText },
              shouldEndSession: false
            },
            sessionAttributes: { lastQuery: body.text, version: '2.0', handler: 'vault' }
          });
          return;
        } catch (e) {
          console.error('[Alexa] Vault error:', e.message);
        }
      }
      
      // ═════════════════════════════════════════════════════════
      //  WIKIPEDIA - Free REST API, no key needed
      // ═════════════════════════════════════════════════════════
      const wikiMatch = queryLower.match(/^(?:who\s+is|tell\s+me\s+about|wiki(?:pedia)?\s*(?:search|lookup|for)?|wikipedia)\s+(.{3,})/i);
      // "what is" excluded from wiki to avoid matching math/simple questions
      if (wikiMatch) {
        const topic = wikiMatch[1].replace(/[?.!]+$/, '');
        if (topic && topic.length > 1) {
          console.log('[Wiki] Looking up:', topic);
          try {
            const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
            const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(8000) });
            if (wikiResp.ok) {
              const data = await wikiResp.json();
              let wikiReply = `📚 *${data.title || topic}*\n\n`;
              if (data.extract) wikiReply += data.extract;
              if (data.thumbnail?.source) wikiReply += `\n\n🖼️ ${data.thumbnail.source}`;
              if (data.content_urls?.desktop?.page) wikiReply += `\n\n🔗 ${data.content_urls.desktop.page}`;
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: wikiReply } }, sessionAttributes: { lastQuery: body.text, handler: 'wikipedia' } });
              return;
            }
          } catch (e) { console.log('[Wiki] Error:', e.message); }
        }
      }

      // ═════════════════════════════════════════════════════════
      //  NEWS - Google News RSS (free, no key)
      // ═════════════════════════════════════════════════════════
      const newsMatch = queryLower.match(/(?:news(?:\s+about)?|latest\s+news|what.*happening|headlines|current\s+events)\s*(?:about|on|for)?\s*(.*)/i);
      if (newsMatch || /^(news|headlines|latest)\s*$/i.test(queryLower)) {
        const newsTopic = newsMatch ? (newsMatch[2] || newsMatch[1] || '').trim() : '';
        console.log('[News] Searching:', newsTopic || 'top');
        try {
          const rssUrl = newsTopic 
            ? `https://news.google.com/rss/search?q=${encodeURIComponent(newsTopic)}&hl=en-US&gl=US&ceid=US:en`
            : `https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en`;
          const rssResp = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
          if (rssResp.ok) {
            const rssText = await rssResp.text();
            const items = [];
            const itemRegex = /<item>[\s\S]*?<\/item>/g;
            let match;
            while ((match = itemRegex.exec(rssText)) !== null && items.length < 8) {
              const item = match[0];
              const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] || item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
              const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
              const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
              const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '';
              if (title) items.push({ title, pubDate, link, source });
            }
            let newsReply = `📰 *${newsTopic ? 'News about ' + newsTopic : 'Top Headlines'}*\n`;
            newsReply += `Found ${items.length} articles\n\n`;
            items.forEach((item, i) => {
              const time = item.pubDate ? new Date(item.pubDate).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' }) : '';
              newsReply += `${i+1}. ${item.title}`;
              if (item.source) newsReply += ` — ${item.source}`;
              if (time) newsReply += ` (${time})`;
              newsReply += '\n';
            });
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: newsReply } }, sessionAttributes: { lastQuery: body.text, handler: 'news' } });
            return;
          }
        } catch (e) { console.log('[News] Error:', e.message); }
      }

      // ═════════════════════════════════════════════════════════
      //  REDDIT - Public JSON API (free, no key)
      // ═════════════════════════════════════════════════════════
      const redditMatch = queryLower.match(/(?:reddit|subreddit|r\/)\s+(?:search\s+)?(?:for\s+)?(?:r\/)?([\w]+(?:\s+[\w]+)?)?/i);
      const redditSearch = queryLower.match(/(?:search\s+reddit|find\s+on\s+reddit|reddit\s+search)\s+(?:for\s+)?(.+)/i);
      if (redditMatch || redditSearch) {
        const subreddit = redditSearch ? 'all' : (redditMatch?.[1] || 'popular').replace(/\s+/g, '').toLowerCase();
        const searchQ = redditSearch ? redditSearch[1] : '';
        console.log('[Reddit]', searchQ ? `search: ${searchQ}` : `r/${subreddit}`);
        try {
          const redditUrl = searchQ 
            ? `https://www.reddit.com/search.json?q=${encodeURIComponent(searchQ)}&limit=5&sort=relevance`
            : `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`;
          const redditResp = await fetch(redditUrl, { headers: { 'User-Agent': 'OmniClaw/2.0' }, signal: AbortSignal.timeout(10000) });
          if (redditResp.ok) {
            const data = await redditResp.json();
            const posts = data.data?.children || [];
            let redditReply = `🔥 *Reddit${searchQ ? ': "' + searchQ + '"' : ' r/' + subreddit}*\n\n`;
            posts.forEach((p, i) => {
              const post = p.data;
              redditReply += `${i+1}. ${post.title}\n`;
              redditReply += `   ⬆️ ${post.score} | 💬 ${post.num_comments} | r/${post.subreddit}\n`;
              if (post.selftext) redditReply += `   ${post.selftext.substring(0, 120)}...\n`;
              redditReply += `   🔗 https://reddit.com${post.permalink}\n\n`;
            });
            if (posts.length === 0) redditReply += 'No posts found.';
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: redditReply } }, sessionAttributes: { lastQuery: body.text, handler: 'reddit' } });
            return;
          }
        } catch (e) { console.log('[Reddit] Error:', e.message); }
      }

      // ═════════════════════════════════════════════════════════
      //  WEB SEARCH/BROWSE - DuckDuckGo Instant Answer (free)
      // ═════════════════════════════════════════════════════════
      const browseMatch = queryLower.match(/(?:browse|search\s+(?:the\s+)?web|google\s+(?:search\s+)?|look\s+up|find\s+(?:info|information)\s+(?:about|on))\s+(?:for\s+)?(.+)/i);
      if (browseMatch) {
        const searchQuery = browseMatch[1].replace(/[?.!]+$/, '');
        console.log('[Browse] Searching:', searchQuery);
        try {
          const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1`;
          const ddgResp = await fetch(ddgUrl, { signal: AbortSignal.timeout(8000) });
          if (ddgResp.ok) {
            const data = await ddgResp.json();
            let browseReply = `🔍 *Web Search: ${searchQuery}*\n\n`;
            if (data.Abstract) {
              browseReply += `${data.Abstract}\n\n`;
              if (data.AbstractURL) browseReply += `🔗 ${data.AbstractURL}\n`;
            } else if (data.Answer) {
              browseReply += `${data.Answer}\n`;
            } else if (data.RelatedTopics?.length) {
              data.RelatedTopics.slice(0, 5).forEach(t => {
                if (t.Text) browseReply += `• ${t.Text}\n`;
              });
            } else {
              // Fallback to Wikipedia
              const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchQuery)}`;
              const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
              if (wikiResp.ok) {
                const wikiData = await wikiResp.json();
                if (wikiData.extract) browseReply += `📚 ${wikiData.title}: ${wikiData.extract}`;
              }
            }
            if (browseReply.length < 50) browseReply += '\nNo results found. Try rephrasing.';
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: browseReply } }, sessionAttributes: { lastQuery: body.text, handler: 'browse' } });
            return;
          }
        } catch (e) { console.log('[Browse] Error:', e.message); }
      }

      // ═════════════════════════════════════════════════════════
      //  TWITTER/X SEARCH - Nitter (free proxy)
      // ═════════════════════════════════════════════════════════
      const twitterSearchMatch = queryLower.match(/twitter\s+(?:search\s+)?(?:for\s+)?(.+)/i);
      if (twitterSearchMatch && !queryLower.includes('news')) {
        const tweetQuery = twitterSearchMatch[1].replace(/[?.!]+$/, '');
        console.log('[Twitter] Searching:', tweetQuery);
        try {
          const nitterUrl = `https://nitter.privacydev.net/search?f=tweets&q=${encodeURIComponent(tweetQuery)}`;
          const nitterResp = await fetch(nitterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
          if (nitterResp.ok) {
            const html = await nitterResp.text();
            const tweetRegex = /class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
            const tweets = [];
            let tMatch;
            while ((tMatch = tweetRegex.exec(html)) !== null && tweets.length < 5) {
              const text = tMatch[1].replace(/<[^>]+>/g, '').trim();
              if (text) tweets.push(text);
            }
            let twitterReply = `🐦 *Twitter Search: ${tweetQuery}*\n\n`;
            if (tweets.length > 0) {
              tweets.forEach((t, i) => { twitterReply += `${i+1}. ${t.substring(0, 200)}\n\n`; });
            } else {
              twitterReply += 'No tweets found via Nitter. Using AI synthesis...\n\n';
              const { multiProviderQuery } = require('./resilient-clients');
              const aiResp = await multiProviderQuery(`Summarize recent Twitter discussion about: ${tweetQuery}. Be brief.`);
              twitterReply += aiResp;
            }
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: twitterReply } }, sessionAttributes: { lastQuery: body.text, handler: 'twitter' } });
            return;
          }
        } catch (e) { console.log('[Twitter] Error:', e.message); }
      }

      try {
        // URL Pre-processor: Extract URLs, fetch content, enrich prompt
        let enrichedQuery = body.text;
        const urlRegex = /https?:\/\/(?:x\.com|twitter\.com|vxtwitter\.com|fxtwitter\.com)\/[^\s]+/gi;
        const generalUrlRegex = /https?:\/\/[^\s]+/gi;
        const tweetUrls = body.text.match(urlRegex) || [];
        const allUrls = body.text.match(generalUrlRegex) || [];
        const otherUrls = allUrls.filter(u => !tweetUrls.includes(u));
        const urlContextParts = [];

        // Fetch tweet content
        for (const tweetUrl of tweetUrls) {
          try {
            // Try vxtwitter/fxtwitter embed APIs
            const embedUrl = tweetUrl.replace(/https?:\/\/(?:x\.com|twitter\.com)/, 'https://api.vxtwitter.com');
            const resp = await fetch(embedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
            if (resp.ok) {
              const data = await resp.json();
              let tweetContent = '';
              if (data.text) tweetContent += `Tweet by @${data.user_name || 'unknown'} (@${data.user_screen_name || ''}): ${data.text}`;
              if (data.media_urls && data.media_urls.length) tweetContent += ` [${data.media_urls.length} media]`;
              if (data.likes !== undefined) tweetContent += ` | ❤️${data.likes} 🔁${data.retweet_count || 0}`;
              if (tweetContent) urlContextParts.push(tweetContent);
            }
          } catch (e) { console.log('[URL] Tweet fetch failed:', e.message); }
        }

        // Fetch general URL content
        for (const url of otherUrls) {
          try {
            const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' }, signal: AbortSignal.timeout(8000) });
            if (resp.ok) {
              const html = await resp.text();
              // Extract text content from HTML (simple approach)
              const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
              const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
              // Also try og tags
              const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
              const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
              const title = ogTitle?.[1] || titleMatch?.[1] || '';
              const desc = ogDesc?.[1] || descMatch?.[1] || '';
              // Strip remaining HTML and get text body (first 2000 chars)
              const bodyText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 2000);
              let urlContent = `URL: ${url}`;
              if (title) urlContent += `\nTitle: ${title}`;
              if (desc) urlContent += `\nDescription: ${desc}`;
              if (bodyText) urlContent += `\nContent: ${bodyText}`;
              urlContextParts.push(urlContent);
            }
          } catch (e) { console.log('[URL] Fetch failed for', url, ':', e.message); }
        }

        // Enrich query with fetched content
        if (urlContextParts.length > 0) {
          enrichedQuery = `[The user shared these links. Here is the fetched content:\n${urlContextParts.join('\n---\n')}\n]\n\nUser's question: ${body.text}`;
          console.log('[URL] Enriched query with', urlContextParts.length, 'URL(s)');
        }

        // Call AI for non-vault queries (with enriched context if URLs found)
        const { multiProviderQuery } = require('./resilient-clients');
        const aiResponse = await multiProviderQuery(enrichedQuery);
        
        res.json({
          version: '1.0',
          response: {
            outputSpeech: { type: 'PlainText', text: aiResponse },
            shouldEndSession: false
          },
          sessionAttributes: {
            lastQuery: body.text,
            conversationCount: 1,
            lastServiceHandler: 'multiProviderQuery',
            version: '2.0'
          }
        });
        return;
      } catch (e) {
        console.error('[Alexa] AI error:', e.message);
        res.json({
          version: '1.0',
          response: {
            outputSpeech: { type: 'PlainText', text: "I'm having trouble connecting to my AI. Please try again." },
            shouldEndSession: false
          }
        });
        return;
      }
    }

    // Handle LaunchRequest
    if (body.request?.type === 'LaunchRequest' || !body.request) {
      const { personaGenerator } = initializeOmniClaw2();
      const example = getRandomExample();
      const timeOfDay = getTimeOfDayGreeting();
      const incomingSessionAttributes = body.session?.attributes || {};

      // Get current persona from session or use default
      const currentPersona = incomingSessionAttributes.currentPersona || 'professional';

      // Get persona-adapted greeting
      let greeting = `${timeOfDay}! I'm OmniClaw 2.0, your personal assistant.`;

      try {
        const persona = await personaGenerator.generatePersona('default_user', {
          timeOfDay,
          context: 'greeting',
          personaType: currentPersona
        });
        if (persona) {
          greeting = await personaGenerator.applyPersonaToResponse(greeting, persona, { context: 'greeting' });
        }
      } catch (e) {
        // Use default greeting
      }

      greeting += ` Try saying "${example.query}" for ${example.desc}. What can I help you with?`;

      res.json({
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: greeting
          },
          shouldEndSession: false,
          card: {
            type: 'Simple',
            title: 'OmniClaw 2.0 Personal Assistant',
            content: `Powered by AgentOrchestrator + PersonaGenerator + ServiceMesh | Persona: ${currentPersona}`
          }
        },
        sessionAttributes: buildSessionAttributes(incomingSessionAttributes, 'greeting', {
          lastQuery: '',
          conversationCount: (incomingSessionAttributes.conversationCount || 0) + 1,
          currentPersona: currentPersona,
          version: '2.0'
        })
      });
      return;
    }

    // Handle IntentRequest
    if (body.request?.type === 'IntentRequest') {
      const intentName = body.request.intent?.name;
      const slots = body.request.intent?.slots || {};
      const { agentOrchestrator, personaGenerator, attentionWeightedMemory, taskGuidedCompressor } = initializeOmniClaw2();

      // QueryIntent - Use AgentOrchestrator for intelligent routing
      if (intentName === 'QueryIntent' || intentName === 'AMAZON.HelpIntent') {
        const query = slots.Query?.value || 'general help';
        const sessionId = body.session?.sessionId || 'alexa_session';
        const incomingSessionAttributes = body.session?.attributes || {};

        // Check if this is a translation query - translation detection patterns
        const translatePatterns = [
          /^translate\s+(.+?)\s+to\s+(\w+)$/i,
          /^translate\s+(.+?)\s+in\s+(\w+)$/i,
          /^say\s+(.+?)\s+in\s+(\w+)$/i,
          /^convert\s+(.+?)\s+to\s+(\w+)$/i,
          /^translate\s+to\s+(\w+)\s+(.+)$/i,
          /^say\s+in\s+(\w+)\s+(.+)$/i
        ];

        for (const pattern of translatePatterns) {
          const match = query.match(pattern);
          if (match) {
            const text = match[1] || match[2];
            const targetLang = match[2] || match[1];
            console.log(`[TranslateIntent fallback] Detected translation: "${text}" to "${targetLang}"`);

            try {
              const client = getClient('GoogleTranslateClient', false);
              const translation = await client.translate(text.trim(), targetLang.trim());
              const { personaGenerator } = initializeOmniClaw2();
              const persona = personaGenerator.getCapabilityPersona('TranslateIntent');

              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: `${persona.name} (${persona.age}) here. The translation to ${targetLang} is: ${translation}` },
                  shouldEndSession: false
                }
              });
              return;
            } catch (e) {
              console.error('[TranslateIntent fallback] Error:', e.message);
              // Continue to agentOrchestrator if translation fails
            }
          }
        }

        // Get or initialize session attributes
        const conversationCount = (incomingSessionAttributes.conversationCount || 0) + 1;
        const lastTopic = incomingSessionAttributes.lastTopic || query;
        const currentPersona = incomingSessionAttributes.currentPersona || 'professional';

        // Store user message in attention-weighted memory
        attentionWeightedMemory.storeMessage(sessionId, 'user', query, { intent: 'query' });

        // Determine which service handled the request (for logging)
        let serviceHandler = 'agentOrchestrator';
        let compressionStats = null;

        // Detect vault-related queries and handle directly
        const queryLower = query.toLowerCase();
        const vaultKeywords = ['vault', 'search my vault', 'find in my vault', 'my saved', 'bookmarks', 'what do i have saved', 'remember', 'knowledge graph'];
        const isVaultQuery = vaultKeywords.some(k => queryLower.includes(k)) ||
                          (queryLower.includes('search') && queryLower.includes('for'));
        if (isVaultQuery) {
          const VaultClient = require('./clients/vault_client');
          const vault = new VaultClient();
          const { personaGenerator } = initializeOmniClaw2();
          const persona = personaGenerator.getCapabilityPersona('VaultIntent');
          const vaultName = persona.name || 'Vault Assistant';

          // Special case: vault stats - return statistics
          if (queryLower.includes('stats') || queryLower === 'vault') {
            const stats = vault.getStats();
            res.json({
              version: '1.0',
              response: { outputSpeech: { type: 'PlainText', text: `${vaultName} here. Your vault contains ${stats.vault.totalPosts} posts with ${stats.knowledgeGraph.totalNodes} knowledge nodes including ${stats.knowledgeGraph.topics} topics and ${stats.knowledgeGraph.skills} skills. What would you like to explore?` }, shouldEndSession: false },
              sessionAttributes: buildSessionAttributes(incomingSessionAttributes, 'vault_stats', { lastQuery: query, version: '2.0' })
            });
            return;
          }

          // Extract search term (remove vault keywords)
          let searchTerm = queryLower
            .replace(/^[\^]?vault\s*/gi, '')  // Strip leading ^vault or vault
            .replace(/search\s*(my)?\s*(vault|bookmarks|saved)?\s*(for)?\s*/gi, '')
            .replace(/find\s*(in)?\s*(my)?\s*(vault)?\s*/gi, '')
            .replace(/what\s*(do)?\s*(i\s*)?(have)?\s*(saved)?\s*/gi, '')
            .replace(/remember\s*/gi, '')
            .replace(/knowledge\s*graph\s*/gi, '')
            .trim();

          if (!searchTerm) searchTerm = query;

          const result = vault.findKnowledge(searchTerm);
          const total = result.topics.length + result.skills.length + result.vaultPosts.length;
          let responseText = '';
          
          // Enhanced response with detailed results for WhatsApp
          let detailedResults = {
            query: searchTerm,
            total: total,
            posts: [],
            topics: result.topics,
            skills: result.skills
          };
          
          if (total > 0) {
            responseText = `${vaultName} here. Found ${total} items for "${searchTerm}": `;
            if (result.vaultPosts.length > 0) {
              responseText += `${result.vaultPosts.length} posts, `;
              // Add detailed post info for WhatsApp
              detailedResults.posts = result.vaultPosts.map((p, idx) => ({
                index: idx + 1,
                subject: p.vlSubject || 'No subject',
                caption: (p.caption || '').substring(0, 150),
                url: p.url || p.permalink || '',
                tags: p.vlTags || [],
                source: p.source || 'instagram',
                syncedAt: p.synced_at || p.vlProcessedAt || ''
              }));
            }
            if (result.topics.length > 0) {
              responseText += `${result.topics.length} topics, `;
            }
            if (result.skills.length > 0) {
              responseText += `${result.skills.length} skills`;
            }
            responseText = responseText.replace(/, $/, '.');
            if (result.vaultPosts.length > 0) {
              const topPost = result.vaultPosts[0];
              responseText += ` Top match: "${topPost.vlSubject || topPost.caption?.substring(0, 80) || 'saved item'}"`;
            }
          } else {
            responseText = `${vaultName} here. No items found for "${searchTerm}" in your vault.`;
          }

          res.json({
            version: '1.0',
            response: { 
              outputSpeech: { type: 'PlainText', text: responseText }, 
              shouldEndSession: false 
            },
            vaultResults: detailedResults,  // Detailed results for WhatsApp parsing
            sessionAttributes: buildSessionAttributes(incomingSessionAttributes, 'vault_search', { lastQuery: query, version: '2.0' })
          });
          return;
        }

        try {
          // Directly call multiProviderQuery for AI responses
          const result = await multiProviderQuery(query);
          let responseText = result || "I'm OmniClaw 2.0, ready to help!";
          serviceHandler = 'multiProviderQuery';

          // Apply persona to response
          try {
            const persona = await personaGenerator.generatePersona('alexa_user', { query, personaType: currentPersona });
            responseText = await personaGenerator.applyPersonaToResponse(responseText, persona, { query });
          } catch (e2) {
            // Use raw response
          }

          // Store in attention-weighted memory
          attentionWeightedMemory.storeMessage(sessionId, 'assistant', responseText, { serviceUsed: 'ai' });

          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: responseText },
              shouldEndSession: false
            },
            sessionAttributes: {
              lastQuery: query,
              conversationCount: conversationCount,
              lastTopic: lastTopic,
              currentPersona: currentPersona,
              lastServiceHandler: serviceHandler,
              compressionStats: compressionStats,
              version: '2.0'
            }
          });
          return;
        } catch (e) {
          console.error('Agent orchestrator error:', e.message);
          // Fallback to multi-provider query
          try {
            serviceHandler = 'multiProviderQuery';
            const result = await multiProviderQuery(query);
            let responseText = result || "I'm OmniClaw 2.0, ready to help!";

            // Apply persona to fallback response
            try {
              const persona = await personaGenerator.generatePersona('alexa_user', { query, personaType: currentPersona });
              responseText = await personaGenerator.applyPersonaToResponse(responseText, persona, { query });
            } catch (e2) {
              // Use raw response
            }

            // Store fallback response in attention-weighted memory
            attentionWeightedMemory.storeMessage(sessionId, 'assistant', responseText, { fallback: true });

            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: responseText },
                shouldEndSession: false
              },
              sessionAttributes: {
                lastQuery: query,
                conversationCount: conversationCount,
                lastTopic: lastTopic,
                currentPersona: currentPersona,
                lastServiceHandler: serviceHandler,
                version: '2.0'
              }
            });
            return;
          } catch (e2) {
            // Final fallback
          }
        }

        res.json({
          version: '1.0',
          response: {
            outputSpeech: {
              type: 'PlainText',
              text: "I'm OmniClaw 2.0, your personal assistant with 19 integrated services. I can help with news, Twitter, Reddit, Wikipedia, translations, stories, and more!"
            },
            shouldEndSession: false
          },
          sessionAttributes: {
            lastQuery: query,
            conversationCount: conversationCount,
            lastTopic: lastTopic,
            currentPersona: currentPersona,
            lastServiceHandler: serviceHandler,
            version: '2.0'
          }
        });
        return;
      }

      // SearchIntent - search news, reddit, twitter
      if (intentName === 'SearchIntent') {
        const searchQuery = slots.SearchQuery?.value || slots.Query?.value;
        const searchSource = slots.Source?.value || 'news';

        if (searchQuery) {
          try {
            let result = '';
            if (searchSource.toLowerCase().includes('twitter')) {
              // Use original (unprotected) client to avoid resilience wrapper issues
              const client = getClient('TwitterClient', false);
              const tweets = await client.searchTweets(searchQuery);
              // Handle both real API response (array) and AI fallback (object with tweets string or array)
              if (tweets.simulated) {
                // AI fallback returns {simulated: true, tweets: "string or array"}
                const tweetText = typeof tweets.tweets === 'string' ? tweets.tweets : (tweets.tweets?.[0] || 'No results');
                result = `Simulated Twitter search for ${searchQuery}: ${tweetText}`;
              } else {
                // Real API response
                const tweetCount = Array.isArray(tweets) ? tweets.length : (tweets?.data?.length || 0);
                result = `Found ${tweetCount} tweets about ${searchQuery}. First one: ${tweets[0]?.text || tweets?.data?.[0]?.text || 'No results'}`;
              }
            } else if (searchSource.toLowerCase().includes('reddit')) {
              // Use original (unprotected) client to avoid resilience wrapper issues
              const client = getClient('RedditClient', false);
              const posts = await client.searchReddit(searchQuery);
              // Handle Reddit response - could be array (real API) or object with simulated string
              if (posts.simulated) {
                // AI fallback returns {simulated: true, posts: "string"}
                result = `Simulated Reddit search for ${searchQuery}: ${posts.posts}`;
              } else {
                // Real API response
                const postArray = posts.posts || posts.data || posts;
                const postCount = Array.isArray(postArray) ? postArray.length : 0;
                result = `Found ${postCount} Reddit posts about ${searchQuery}. First one: ${postArray[0]?.title || 'No results'}`;
              }
            } else {
              // Use original (unprotected) client for News to avoid resilience wrapper issues
              const client = getClient('NewsClient', false);
              const articles = await client.searchNews(searchQuery);
              result = `Found news about ${searchQuery}. ${articles?.news || 'Check the first result for details.'}`;
            }
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result },
                shouldEndSession: false
              }
            });
            return;
          } catch (e) {
            console.error('Search error:', e.message);
          }
        }
      }

      // TranslateIntent / TranslationIntent (both names)
      if (intentName === 'TranslateIntent' || intentName === 'TranslationIntent') {
        const text = slots.Text?.value || slots.Query?.value;
        const targetLang = slots.Language?.value || 'english';
        const { personaGenerator } = initializeOmniClaw2();
        const persona = personaGenerator.getCapabilityPersona('TranslateIntent');

        if (!text) {
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${persona.name} here. Please provide text to translate.` },
              shouldEndSession: false
            }
          });
          return;
        }

        try {
          // Use original (unprotected) client to avoid resilience wrapper transforming errors into objects
          const client = getClient('GoogleTranslateClient', false);
          const translation = await client.translate(text, targetLang);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${persona.name} (${persona.age}) here. The translation to ${targetLang} is: ${translation}` },
              shouldEndSession: false
            }
          });
          return;
        } catch (e) {
          console.error('Translation error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${persona.name} here. Translation failed: ${e.message}. Please try again.` },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // PersonaIntent - Switch to a different persona/style
      if (intentName === 'PersonaIntent') {
        const personaType = (slots.PersonaType?.value || 'professional').toLowerCase();
        const { personaGenerator } = initializeOmniClaw2();

        // Map common variations to valid template names
        const personaMap = {
          'friendly': 'friendly',
          'warm': 'friendly',
          'casual': 'friendly',
          'professional': 'professional',
          'formal': 'professional',
          'technical': 'technical',
          'expert': 'technical',
          'creative': 'creative',
          'artistic': 'creative',
          'empathetic': 'empathetic',
          'supportive': 'empathetic',
          'fun': 'playful',
          'playful': 'playful',
          'humorous': 'playful'
        };

        const mappedPersona = personaMap[personaType] || 'professional';

        try {
          const persona = await personaGenerator.generatePersona('alexa_user', {
            personaType: mappedPersona
          });

          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `Switched to ${mappedPersona} persona. I'll be more ${mappedPersona} in my responses from now on.` },
              shouldEndSession: false
            },
            sessionAttributes: {
              currentPersona: mappedPersona
            }
          });
          return;
        } catch (e) {
          console.error('Persona switch error:', e.message);
        }
      }

      // KnowledgeGraphIntent - Search my personal knowledge graph
      if (intentName === 'KnowledgeGraphIntent' || intentName === 'SearchKnowledgeIntent') {
        const query = slots.Query?.value || slots.Topic?.value || slots.SearchQuery?.value;

        if (query) {
          try {
            // Call Vault Cloud Run service via HTTP
            const vaultUrl = process.env.VAULT_SERVICE_URL || 'https://omniclaw-vault-search-338789220059.asia-south1.run.app';

            const response = await fetch(`${vaultUrl}/api/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, options: { maxResults: 5 } })
            });

            const result = await response.json();

            let responseText;
            if (!result.success) {
              responseText = `I had trouble searching your knowledge graph. Please try again.`;
            } else if (result.resultCount === 0) {
              responseText = `I searched your knowledge graph for "${query}" but found no matching results. Try a different search term.`;
            } else {
              const top = result.sources?.[0];
              responseText = `Found ${result.resultCount} results for "${query}" in ${result.responseTime}ms. Top match: ${top?.name || 'result'}.`;
            }

            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: responseText },
                shouldEndSession: false
              },
              sessionAttributes: {
                lastVaultQuery: query,
                vaultResultCount: result.resultCount || 0
              }
            });
            return;
          } catch (e) {
            console.error('Knowledge graph search error:', e.message);
          }
        }
      }

      // WikipediaIntent - Get Wikipedia facts
      if (intentName === 'WikipediaIntent' || intentName === 'WikipediaSearchIntent') {
        const topic = slots.Topic?.value || slots.Query?.value;
        const { personaGenerator } = initializeOmniClaw2();
        const persona = personaGenerator.getCapabilityPersona('WikipediaIntent');
        if (!topic) {
          res.json({
            version: '1.0',
            response: { outputSpeech: { type: 'PlainText', text: `${persona.name} here. What topic would you like me to look up?` }, shouldEndSession: false }
          });
          return;
        }
        try {
          const client = getClient('WikipediaClient', false);
          // Search and get summary directly
          const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
          const response = await fetch(url, {
            headers: { 'User-Agent': 'OmniClaw/1.0' },
            signal: AbortSignal.timeout(8000)
          });
          if (response.ok) {
            const data = await response.json();
            const brief = briefResponse(`${topic}: ${data.extract || 'No information found.'}`, 20);
            res.json({
              version: '1.0',
              response: { outputSpeech: { type: 'PlainText', text: `${persona.name} (${persona.age}) here. ${brief}` }, shouldEndSession: false }
            });
          } else {
            res.json({
              version: '1.0',
              response: { outputSpeech: { type: 'PlainText', text: `${persona.name} here. I couldn't find information about ${topic}.` }, shouldEndSession: false }
            });
          }
          return;
        } catch (e) {
          console.error('Wikipedia error:', e.message);
          res.json({
            version: '1.0',
            response: { outputSpeech: { type: 'PlainText', text: `${persona.name} here. I couldn't find information about ${topic}.` }, shouldEndSession: false }
          });
          return;
        }
      }

      // NewsIntent
      if (intentName === 'NewsIntent') {
        const { personaGenerator } = initializeOmniClaw2();
        const persona = personaGenerator.getCapabilityPersona('NewsIntent');
        try {
          const client = getClient('NewsClient');
          const newsResult = await client.getHeadlines();
          const brief = briefResponse(`${newsResult.headlines || newsResult.news || 'Unable to fetch news at this time.'}`, 15, 'Want headlines?');
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${persona.name} here. ${brief}` },
              shouldEndSession: false
            }
          });
          return;
        } catch (e) {
          console.error('News error:', e.message);
        }
      }

      // StoryIntent - Generate a story with characters
      if (intentName === 'StoryIntent' || intentName === 'TellMeAStoryIntent' || intentName === 'GenerateStoryIntent') {
        const storyTheme = slots.Theme?.value || slots.Topic?.value || 'an adventure in a magical kingdom';
        const storySetting = slots.Setting?.value || 'a mystical land';
        const { personaGenerator } = initializeOmniClaw2();
        const persona = personaGenerator.getCapabilityPersona('GenerateStoryIntent');

        // Override accent from session if user specified a preference (takes priority)
        const incomingSession = body.session?.attributes || {};
        const sessionAccent = incomingSession.preferred_language || incomingSession.accent_style;
        if (sessionAccent) {
          persona.accent_style = incomingSession.accent_style || persona.accent_style;
          persona.preferred_language = incomingSession.preferred_language || persona.preferred_language;
        } else {
          // Auto-detect accent from story theme + setting input text
          const combinedInput = `${storyTheme} ${storySetting}`;
          const detected = detectAccentFromInput(combinedInput);
          if (detected) {
            persona.accent_style = detected.accent;
            persona.preferred_language = detected.language;
            console.log(`[StoryIntent] Auto-detected accent: ${detected.accent} (confidence: ${detected.confidence}) from input: "${combinedInput.substring(0, 60)}..."`);
          }
        }

        try {
          const orchestrator = getStoryOrchestrator();
          // Pass persona as the narrator character for the story (include language/accent fields)
          const story = await orchestrator.autoGenerateStory({
            theme: storyTheme,
            setting: storySetting,
            genre: 'adventure',
            narratorPersona: {
              name: persona.name.split(' ')[0], // e.g., "Willy"
              role: 'storyteller',
              voice: 'willy',
              // Language & accent support
              preferred_language: persona.preferred_language || 'english',
              accent_style: persona.accent_style || 'neutral',
              language_variants: persona.language_variants || null,
              accent_styles: persona.accent_styles || null
            }
          });

          // Build story text from segments
          const storyText = story.segments
            .map(s => s.type === 'narration' ? s.text : `${s.character} says: ${s.text}`)
            .join('. ');

          res.json({
            version: '1.0',
            response: {
              outputSpeech: {
                type: 'PlainText',
                text: `${persona.name} here. Here's your story about ${storyTheme}: ${storyText}. Would you like me to continue the story?`
              },
              shouldEndSession: false,
              card: {
                type: 'Simple',
                title: `Story: ${storyTheme}`,
                content: `Characters: ${story.characters.map(c => c.name).join(', ')}`
              }
            }
          });
          return;
        } catch (e) {
          console.error('Story error:', e.message);
          // Fallback response
          res.json({
            version: '1.0',
            response: {
              outputSpeech: {
                type: 'PlainText',
                text: `Once upon a time, in a magical kingdom, there lived a brave hero. Together with loyal friends, they embarked on an adventure filled with wonder and discovery. The end... or is it just the beginning?`
              },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // SpotifyIntent - Control Spotify playback
      if (intentName === 'SpotifyIntent' || intentName === 'SpotifyPlayIntent' || intentName === 'SpotifySearchIntent' || intentName === 'SpotifyPauseIntent' || intentName === 'SpotifyNextIntent') {
        let action = (slots.Action?.value || slots.Command?.value || '').toLowerCase();
        let query = slots.Query?.value || slots.Track?.value;

        // Handle intent-based actions
        if (intentName === 'SpotifyPauseIntent') action = 'pause';
        if (intentName === 'SpotifyNextIntent') action = 'next';

        // Handle "play <song>" format in query slot
        if (!action && query) {
          const playMatch = query.match(/^(play|search|find)\s+(.+)$/i);
          if (playMatch) {
            action = 'play';
            query = playMatch[2];
          } else if (intentName === 'SpotifyIntent' || intentName === 'SpotifyPlayIntent') {
            // If query exists but no action, default to play
            action = 'play';
          }
        }

        try {
          const client = getClient('SpotifyClient', false);

          // Check if credentials are configured
          if (!client.clientId || !client.clientSecret) {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'Spotify is not configured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to enable this feature.' },
                shouldEndSession: false
              }
            });
            return;
          }

          if (action === 'play' || action === 'resume') {
            if (query) {
              const tracks = await client.searchTracks(query, 1);
              if (tracks.length > 0) {
                // Get available devices and transfer playback to Echo if needed
                const devicesResult = await client.getAvailableDevices();
                if (!devicesResult.unavailable && devicesResult.devices.length > 0) {
                  const echoDevice = devicesResult.devices.find(d => d.name && d.name.includes('Echo'));
                  if (echoDevice && !echoDevice.is_active) {
                    await client.transferPlayback(echoDevice.id, false);
                    await new Promise(r => setTimeout(r, 500));
                  }
                }
                await client.playTrack(tracks[0].uri);
                res.json({
                  version: '1.0',
                  response: {
                    outputSpeech: { type: 'PlainText', text: `Playing "${tracks[0].name}" by ${tracks[0].artists} on Spotify.` },
                    shouldEndSession: false
                  }
                });
              } else {
                res.json({
                  version: '1.0',
                  response: {
                    outputSpeech: { type: 'PlainText', text: `Could not find "${query}" on Spotify.` },
                    shouldEndSession: false
                  }
                });
              }
            } else {
              await client.resumePlayback();
              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: 'Resuming Spotify playback.' },
                  shouldEndSession: false
                }
              });
            }
            return;
          } else if (action === 'pause' || action === 'stop') {
            await client.pausePlayback();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'Pausing Spotify playback.' },
                shouldEndSession: false
              }
            });
            return;
          } else if (action === 'next' || action === 'skip') {
            await client.nextTrack();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'Skipping to next track.' },
                shouldEndSession: false
              }
            });
            return;
          }

          // Default - get playback state
          const state = await client.getPlaybackState();
          if (state.track) {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `Currently playing "${state.track.name}" by ${state.track.artists}" on Spotify.` },
                shouldEndSession: false
              }
            });
          } else {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'Nothing is currently playing on Spotify.' },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('Spotify error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to control Spotify. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // YouTubeIntent - Search and get video information
      if (intentName === 'YouTubeIntent') {
        const query = slots.Query?.value;
        const action = (slots.Action?.value || 'search').toLowerCase();

        if (!query) {
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'What would you like me to search on YouTube?' },
              shouldEndSession: false
            }
          });
          return;
        }

        try {
          const client = getClient('YouTubeClient', false);
          const result = await client.searchVideos(query, 5);

          if (result.success && result.videos.length > 0) {
            const firstVideo = result.videos[0];
            const responseText = `Found "${firstVideo.title}" by ${firstVideo.channel}. ${firstVideo.summary}`;

            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: responseText },
                shouldEndSession: false
              }
            });
          } else {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `No YouTube videos found for "${query}".` },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('YouTube error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to search YouTube. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // ArxivIntent - Search academic papers
      if (intentName === 'ArxivIntent' || intentName === 'AcademicIntent') {
        const topic = slots.Topic?.value;
        const { personaGenerator } = initializeOmniClaw2();
        const persona = personaGenerator.getCapabilityPersona('ArxivIntent');

        if (!topic) {
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${persona.name} here. What topic would you like me to search for in academic papers?` },
              shouldEndSession: false
            }
          });
          return;
        }

        try {
          const client = getClient('ArxivClient', false);
          const result = await client.searchArxiv(topic, 5);

          if (result.success && result.papers.length > 0) {
            const firstPaper = result.papers[0];
            const responseText = `${persona.name} (${persona.age}) here. Found paper: "${firstPaper.title}" by ${firstPaper.authors}. ${firstPaper.summary}`;

            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: responseText },
                shouldEndSession: false
              }
            });
          } else {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `No academic papers found for "${topic}".` },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('Arxiv error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to search academic papers. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // VaultIntent - Search personal knowledge vault
      if (intentName === 'VaultIntent') {
        const query = slots.Query?.value || slots.Topic?.value || '';
        const action = slots.Action?.value || '';

        try {
          const VaultClient = require('./clients/vault_client');
          const vault = new VaultClient();
          const { personaGenerator } = initializeOmniClaw2();
          const persona = personaGenerator.getCapabilityPersona('VaultIntent');
          const vaultName = persona.name || 'Your Vault Assistant';

          if (!query) {
            // Return vault stats when no query
            const stats = vault.getStats();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `${vaultName} here. Your vault contains ${stats.knowledgeGraph.totalNodes} items including ${stats.knowledgeGraph.topics} topics and ${stats.knowledgeGraph.skills} skills. What would you like to explore?` },
                shouldEndSession: false
              }
            });
            return;
          }

          // Route to appropriate vault function based on query
          const queryLower = query.toLowerCase();

          // Vault stats - before other routing
          if (queryLower.includes('vault stats') || queryLower === 'stats') {
            const stats = vault.getStats();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `${vaultName} here. Your vault contains ${stats.knowledgeGraph.totalNodes} items including ${stats.knowledgeGraph.topics} topics and ${stats.knowledgeGraph.skills} skills. What would you like to explore?` },
                shouldEndSession: false
              }
            });
            return;
          }

          if (queryLower.includes('connect the dots') || queryLower.includes('relate')) {
            // Extract two topics from query - handle "between X and Y" pattern
            let topics = [];
            const betweenMatch = queryLower.match(/between\s+(\w+(?:\s+\w+)?)\s+and\s+(\w+(?:\s+\w+)?)/i);
            if (betweenMatch) {
              topics = [betweenMatch[1].trim(), betweenMatch[2].trim()];
            } else {
              const cleaned = queryLower.replace(/connect the dots|relate|cross connect|cross-pollination|how are|related|to/gi, ' ');
              topics = cleaned.split(/\s+and\s+|\s+/).filter(t => t.length > 1).slice(0, 2);
            }
            if (topics.length >= 2) {
              const result = vault.connectTheDots(topics[0], topics[1]);
              const text = result.connected
                ? `${vaultName} here. ${result.explanation || `${topics[0]} connects to ${topics[1]}`}`
                : `${vaultName} here. I couldn't find a connection between ${topics[0]} and ${topics[1]} in your vault.`;
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
              return;
            }
          }

          if (queryLower.includes('food') || queryLower.includes('restaurant') || queryLower.includes('cuisine')) {
            // Extract cuisine from middle of phrase
            const words = queryLower.split(/\s+/);
            const stopWords = ['food', 'restaurant', 'cuisine', 'recommend', 'recommendations', 'me', 'show', 'some', 'any', 'a', 'an', 'the', 'i', 'want', 'need', 'looking', 'for', 'of', 'in', 'with'];
            const filtered = words.filter(w => !stopWords.includes(w));
            let cuisine = filtered.length > 0 ? filtered.join(' ').trim() : 'indian';
            // If cuisine is too generic or empty, use default
            if (!cuisine || cuisine.length < 2) cuisine = 'indian';
            const result = vault.getFoodRecommendations(cuisine);
            const text = result.restaurants.length > 0
              ? `${vaultName} here. Found ${result.restaurants.length} places serving ${cuisine} cuisine.`
              : `${vaultName} here. No food recommendations found for "${cuisine}" in your vault.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          if (queryLower.includes('skill') || queryLower.includes('learn')) {
            const words = queryLower.split(/\s+/);
            const stopWords = ['skill', 'skills', 'learn', 'learning', 'path', 'how', 'do', 'i', 'what', 'for', 'a', 'my', 'the', 'show', 'me', 'recommendations', 'some', 'any'];
            const filtered = words.filter(w => !stopWords.includes(w));
            let skill = filtered.length > 0 ? filtered.join(' ').trim() : 'python';
            if (!skill || skill.length < 2) skill = 'python';
            const result = vault.getSkillLearningPath(skill);
            const text = result
              ? `${vaultName} here. Your ${result.skill?.name || skill} learning path includes ${result.relatedTopics?.length || 0} topics. Estimated time: ${result.estimatedLearnTime}.`
              : `${vaultName} here. No learning path found for "${skill}" in your vault.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          if (queryLower.includes('random') || queryLower.includes('insight')) {
            const result = vault.getRandomInsight();
            const text = result
              ? `${vaultName} here. ${result.fact}`
              : `${vaultName} here. No insights available from your vault yet.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Mood-based vault exploration
          if (queryLower.includes('mood') || queryLower.includes('feeling') || queryLower.includes('something')) {
            const moods = queryLower.replace(/mood|feeling|show me something|I'm |im |i am /gi, '').trim();
            const result = vault.getVaultByMood(moods);
            const text = result.count > 0
              ? `${vaultName} here. Found ${result.count} posts with ${moods} vibe. Top match: ${result.posts[0]?.vlSubject || 'see results'}.`
              : `${vaultName} here. No posts found matching "${moods}" mood.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Vault trends - what is user into?
          if (queryLower.includes('trending') || queryLower.includes('what am i into') || queryLower.includes('vault trends')) {
            const result = vault.getVaultTrends();
            const top3 = result.topTags.slice(0, 3).map(t => `${t.tag}(${t.count})`).join(', ');
            const text = `${vaultName} here. Your top interests: ${top3}. ${result.discovery}`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Cross-pollination - unexpected connections
          if (queryLower.includes('cross connect') || queryLower.includes('cross-pollination') || queryLower.includes('unexpected connection')) {
            const match = query.match(/connect\s+(.+?)\s+and\s+(.+?)(?:\s+|\?|$)/i) || query.match(/how do (.+?) and (.+?) connect/i);
            if (match) {
              const result = vault.findCrossConnections(match[1], match[2]);
              const text = result.insight || `${vaultName} here. ${result.domain1.name} and ${result.domain2.name} share ${result.sharedTags.length} tags.`;
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
              return;
            }
          }

          // Serendipity - surprise me with hidden gems
          if (queryLower.includes('serendipity') || queryLower.includes('surprise me') || queryLower.includes('hidden gem') || queryLower.includes('rare find')) {
            const result = vault.getSerendipity(3);
            const text = result.discovery
              ? `${vaultName} here. ${result.whyInteresting} Check this out: ${result.discovery.vlSubject}.`
              : `${vaultName} here. Not enough hidden gems right now.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Deep dive - learning path from bookmark
          if (queryLower.includes('deep dive') || queryLower.includes('teach me') || queryLower.includes('learning path') || queryLower.includes('related posts')) {
            // Extract topic from query
            const topic = queryLower.replace(/deep dive|teach me|learning path|related posts|about/gi, '').trim();
            if (topic) {
              const result = vault.findKnowledge(topic);
              if (result.topics.length > 0 || result.skills.length > 0) {
                const text = `${vaultName} here. Found ${result.topics.length + result.skills.length} items about "${topic}". Say "more about ${topic}" to get a deep dive learning path.`;
                res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
                return;
              }
            }
          }

          // Interest archaeology - how long have you been into X?
          if (queryLower.includes('interest archaeology') || queryLower.includes('how long') || queryLower.includes('oldest interest') || queryLower.includes('been thinking about')) {
            const result = vault.getInterestArchaeology();
            const text = result.insight || `${vaultName} here. ${result.totalTracked} interests tracked over time.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Resonance - quietly powerful posts
          if (queryLower.includes('resonance') || queryLower.includes('quietly powerful') || queryLower.includes('hit different')) {
            const result = vault.getResonanceScore();
            const top = result.topResonators?.[0];
            const text = top
              ? `${vaultName} here. Your top post: "${top.subject}" hit ${top.resonanceRatio} harder than expected!`
              : `${vaultName} here. ${result.insight}`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Blind spot - missing connections
          if (queryLower.includes('blind spot') || queryLower.includes('missing connection') || queryLower.includes('undiscovered')) {
            const result = vault.getBlindSpot();
            const top = result.missingConnections?.[0];
            const text = top
              ? `${vaultName} here. ${result.insight} Check: ${top.connection} via ${top.via}.`
              : `${vaultName} here. ${result.insight}`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Ghost topics - on your mind but not saved
          if (queryLower.includes('ghost topics') || queryLower.includes('on my mind') || queryLower.includes('keep thinking')) {
            const result = vault.getGhostTopics();
            const top = result.ghostConcepts?.[0];
            const text = top
              ? `${vaultName} here. ${result.insight} You mention "${top.concept}" ${top.mentions} times but never saved it!`
              : `${vaultName} here. ${result.insight}`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Aesthetic evolution - your visual taste
          if (queryLower.includes('aesthetic') || queryLower.includes('visual evolution') || queryLower.includes('my taste') || queryLower.includes('photo preference')) {
            const result = vault.getAestheticEvolution();
            const text = `${vaultName} here. ${result.currentPreference}. ${result.insight}`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // Default: search knowledge - strip query words before searching
          const searchWords = queryLower.split(/\s+/);
          const searchStopWords = ['search', 'searching', 'vault', 'my', 'for', 'in', 'looking', 'find', 'get', 'show', 'me', 'some', 'any', 'all', 'the', 'a', 'an'];
          const searchQuery = searchWords.filter(w => !searchStopWords.includes(w)).join(' ').trim();
          const result = vault.findKnowledge(searchQuery);
          const total = result.topics.length + result.skills.length + result.places.length + result.food.length;

          if (total > 0) {
            const text = `${vaultName} here. Found ${total} items in your vault matching "${searchQuery}". ${result.topics.length > 0 ? `${result.topics.length} topics, ` : ''}${result.skills.length > 0 ? `${result.skills.length} skills, ` : ''}${result.places.length > 0 ? `${result.places.length} places, ` : ''}${result.food.length > 0 ? `${result.food.length} food items` : ''}.`;
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text }, shouldEndSession: false } });
            return;
          }

          // No results
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: `${vaultName} here. I couldn't find anything matching "${searchQuery}" in your vault. Try searching for topics like AI, Python, or ask about food recommendations.` },
              shouldEndSession: false
            }
          });
          return;
        } catch (e) {
          console.error('VaultIntent error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'I had trouble searching your vault. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // KodiIntent - Control Kodi/XBMC media center
      if (intentName === 'KodiIntent' || intentName === 'KodiPlayIntent' || intentName === 'KodiControlIntent' || intentName === 'KodiNavigateIntent') {
        let action = (slots.Action?.value || slots.Command?.value || '').toLowerCase();
        const kodiHost = process.env.KODI_HOST;
        const kodiRelayUrl = process.env.KODI_RELAY_URL;

        // Use relay if configured (for local network access)
        if (kodiRelayUrl) {
          try {
            const relayEndpoint = kodiRelayUrl.replace(/\/$/, '');

            // Check for "play X on seren/fen" pattern - use Trakt for direct playback
            const playMatch = action.match(/^play\s+(.+?)\s+on\s+(seren|fen)/i);
            if (playMatch) {
              const query = playMatch[1];
              const addon = playMatch[2];

              // First do Trakt search to get the trakt ID (Seren needs trakt ID, not TMDB)
              let traktId = null;
              try {
                const traktResponse = await fetch(`https://api.trakt.tv/search/movie?query=${encodeURIComponent(query)}&fields=title,ids`, {
                  headers: {
                    'Content-Type': 'application/json',
                    'trakt-api-key': '0362f0bc45385818ae33a18df9c9902923a6dcbecca34693c5c84dd44927846f',
                    'trakt-api-version': '2'
                  },
                  signal: AbortSignal.timeout(10000)
                });
                if (traktResponse.ok) {
                  const traktData = await traktResponse.json();
                  if (traktData && traktData.length > 0) {
                    traktId = traktData[0].ids.trakt;
                  }
                }
              } catch (e) {
                console.error('Trakt lookup failed:', e.message);
              }

              // Use play-movie endpoint with trakt ID for proper Seren playback
              const relayRes = await fetch(`${relayEndpoint}/kodi/play-movie`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query, addon: `plugin.video.${addon}`, traktId: traktId }),
                signal: AbortSignal.timeout(15000)
              });
              const relayData = await relayRes.json();
              if (relayData.success) {
                res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: `Opening ${relayData.movie} in ${addon}. Press play on your TV to start streaming.` }, shouldEndSession: false } });
              } else {
                res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: `Failed: ${relayData.error}` }, shouldEndSession: false } });
              }
              return;
            } else if (action === 'play' || action.startsWith('play ')) {
              // Simple play or "play X" without addon
              const query = action === 'play' ? null : action.replace(/^play\s+/i, '').trim();
              const relayRes = await fetch(`${relayEndpoint}/kodi/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query }),
                signal: AbortSignal.timeout(10000)
              });
              const relayData = await relayRes.json();
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: relayData.success ? 'Playing on Kodi.' : `Kodi: ${relayData.error}` }, shouldEndSession: false } });
              return;
            } else if (action === 'pause') {
              const relayRes = await fetch(`${relayEndpoint}/kodi/pause`, { method: 'POST', signal: AbortSignal.timeout(10000) });
              const relayData = await relayRes.json();
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: relayData.success ? 'Pausing Kodi.' : `Kodi: ${relayData.error}` }, shouldEndSession: false } });
              return;
            } else if (action.includes('seren')) {
              const relayRes = await fetch(`${relayEndpoint}/kodi/open-addon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addonid: 'plugin.video.seren' }), signal: AbortSignal.timeout(10000) });
              const relayData = await relayRes.json();
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: relayData.success ? 'Opening Seren on Kodi.' : `Seren: ${relayData.error}` }, shouldEndSession: false } });
              return;
            } else if (action.includes('fen')) {
              const relayRes = await fetch(`${relayEndpoint}/kodi/open-addon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addonid: 'plugin.video.fen' }), signal: AbortSignal.timeout(10000) });
              const relayData = await relayRes.json();
              res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: relayData.success ? 'Opening Fen on Kodi.' : `Fen: ${relayData.error}` }, shouldEndSession: false } });
              return;
            } else {
              // Default - get status via relay
              const relayRes = await fetch(`${relayEndpoint}/kodi/status`, { signal: AbortSignal.timeout(10000) });
              const relayData = await relayRes.json();
              if (relayData.isPlaying) {
                res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: `Kodi is playing: ${relayData.item?.title || 'unknown'}` }, shouldEndSession: false } });
              } else {
                res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'Kodi is not playing anything.' }, shouldEndSession: false } });
              }
              return;
            }
          } catch (e) {
            console.error('Kodi relay error:', e.message);
            res.json({ version: '1.0', response: { outputSpeech: { type: 'PlainText', text: 'Failed to control Kodi.' }, shouldEndSession: false } });
            return;
          }
        }

        if (!kodiHost) {
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Kodi is not configured. Please set KODI_HOST or KODI_RELAY_URL environment variable.' },
              shouldEndSession: false
            }
          });
          return;
        }

        try {
          const kodiClient = new KodiClient({ host: kodiHost });

          if (action === 'play') {
            const result = await kodiClient.play();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result.success ? 'Playing on Kodi.' : `Kodi error: ${result.error}` },
                shouldEndSession: false
              }
            });
            return;
          } else if (action === 'pause') {
            const result = await kodiClient.pause();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result.success ? 'Pausing Kodi.' : `Kodi error: ${result.error}` },
                shouldEndSession: false
              }
            });
            return;
          } else if (action === 'stop') {
            const result = await kodiClient.stop();
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result.success ? 'Stopping Kodi.' : `Kodi error: ${result.error}` },
                shouldEndSession: false
              }
            });
            return;
          } else if (action.includes('movie')) {
            const result = await kodiClient.showMovies(5);
            if (result.success && result.movies.length > 0) {
              const movieList = result.movies.map(m => `${m.title} (${m.year})`).join(', ');
              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: `Movies on Kodi: ${movieList}` },
                  shouldEndSession: false
                }
              });
            } else {
              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: 'No movies found on Kodi.' },
                  shouldEndSession: false
                }
              });
            }
            return;
          } else if (action.includes('seren')) {
            const result = await kodiClient.openAddon('plugin.video.seren');
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result.success ? 'Opening Seren on Kodi.' : `Seren error: ${result.error}` },
                shouldEndSession: false
              }
            });
            return;
          } else if (action.includes('fen')) {
            const result = await kodiClient.openAddon('plugin.video.fen');
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: result.success ? 'Opening Fen on Kodi.' : `Fen error: ${result.error}` },
                shouldEndSession: false
              }
            });
            return;
          }

          // Default - get playback state
          const state = await kodiClient.getPlaybackState();
          if (state.success && state.item) {
            const itemName = state.item.title || state.item.name || 'Unknown';
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `Kodi is ${state.playing ? 'playing' : 'paused'}: ${itemName}` },
                shouldEndSession: false
              }
            });
          } else {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'Kodi is not playing anything.' },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('Kodi error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to control Kodi. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // WhatsAppIntent - Send a WhatsApp message
      // Slots: Recipient (phone number or name), Message (text to send)
      if (intentName === 'WhatsAppIntent') {
        const recipient = slots.Recipient?.value || slots.To?.value || slots.Phone?.value;
        const message = slots.Message?.value || slots.Text?.value || slots.Content?.value;

        if (!recipient || !message) {
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'To send a WhatsApp message, please specify both the recipient and the message. For example: send a WhatsApp message to Subho saying hello.' },
              shouldEndSession: false
            }
          });
          return;
        }

        // Resolve recipient name to phone number if needed
        let resolvedPhone = recipient;
        try {
          const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:9377';
          const statusRes = await fetch(`${whatsappServiceUrl}/whatsapp/status`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            // Try to find contact by name
            if (statusData.connected) {
              const contactsRes = await fetch(`${whatsappServiceUrl}/whatsapp/contacts`);
              if (contactsRes.ok) {
                const contactsData = await contactsRes.json();
                const matchedContact = contactsData.contacts?.find(
                  c => c.name?.toLowerCase().includes(recipient.toLowerCase())
                );
                if (matchedContact) {
                  resolvedPhone = matchedContact.id.split('@')[0];
                }
              }
            }
          }
        } catch (e) {
          // Service not reachable — continue with raw recipient
        }

        try {
          const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || 'http://localhost:9377';
          const sendRes = await fetch(`${whatsappServiceUrl}/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: resolvedPhone, message })
          });

          if (sendRes.ok) {
            const result = await sendRes.json();
            if (result.success) {
              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: `WhatsApp message sent to ${recipient}` },
                  shouldEndSession: false
                }
              });
            } else {
              res.json({
                version: '1.0',
                response: {
                  outputSpeech: { type: 'PlainText', text: `Failed to send WhatsApp message: ${result.error}` },
                  shouldEndSession: false
                }
              });
            }
          } else {
            const errorText = await sendRes.text();
            console.error('WhatsApp send error:', errorText);
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: 'WhatsApp is not connected. Please scan the QR code first at the WhatsApp dashboard.' },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('WhatsApp error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'WhatsApp service is unavailable. Please ensure the WhatsApp QR service is running.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // RedditIntent - Search Reddit for posts
      if (intentName === 'RedditIntent') {
        const query = slots.Query?.value || 'all';
        try {
          const RedditClient = require('./clients/reddit_client');
          const reddit = new RedditClient({});
          const result = await reddit.searchReddit(query, 'all', 5, { locale: 'en-US' });
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: result.success ? `Found Reddit posts: ${result.posts}` : `Reddit search failed: ${result.error || 'Please try again.'}` },
              shouldEndSession: false
            }
          });
          return;
        } catch (e) {
          console.error('Reddit error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to search Reddit. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }

      // TwitterIntent - Search Twitter for tweets
      if (intentName === 'TwitterIntent') {
        const query = slots.Query?.value || '';
        try {
          const TwitterClient = require('./clients/twitter_client');
          const twitter = new TwitterClient(process.env.TWITTER_BEARER_TOKEN || '', {});
          const result = await twitter.searchTweets(query, { maxResults: 5 });
          if (result.simulated) {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `Found tweets about ${query}: ${result.tweets}` },
                shouldEndSession: false
              }
            });
          } else if (result.length > 0) {
            const tweets = result.map(t => t.text || t.full_text || '').join('. ');
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `Found ${result.length} tweets about ${query}: ${tweets}` },
                shouldEndSession: false
              }
            });
          } else {
            res.json({
              version: '1.0',
              response: {
                outputSpeech: { type: 'PlainText', text: `No tweets found about ${query}.` },
                shouldEndSession: false
              }
            });
          }
          return;
        } catch (e) {
          console.error('Twitter error:', e.message);
          res.json({
            version: '1.0',
            response: {
              outputSpeech: { type: 'PlainText', text: 'Failed to search Twitter. Please try again.' },
              shouldEndSession: false
            }
          });
          return;
        }
      }
    }

    // Handle SessionEndedRequest
    if (body.request?.type === 'SessionEndedRequest') {
      res.json({ version: '1.0' });
      return;
    }

    // Default response
    res.json({
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: "I didn't understand that request. I can help you with questions, news, searches, translations, stories, and more. Just ask!"
        },
        shouldEndSession: false
      }
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: 'I encountered an error. Please try again.'
        },
        shouldEndSession: true
      }
    });
  }
};

/**
 * Instagram sync handler - fetches bookmarks from vault (synced by Python cron)
 */
exports.instagramSyncHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Read from local vault (synced from GCS by vm_sync.sh cron)
    const fs = require('fs');
    const path = require('path');
    const vaultPath = path.join(__dirname, 'learning_base/instagram_scrape.json');

    let bookmarks = [];
    if (fs.existsSync(vaultPath)) {
      const data = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      bookmarks = Array.isArray(data) ? data : data.posts || [];
    }

    console.log(`📸 Syncing Instagram bookmarks... ${bookmarks.length} found`);
    res.json({
      success: true,
      count: bookmarks.length,
      bookmarks: bookmarks.slice(0, 50)
    });
  } catch (error) {
    console.error('Instagram sync error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Instagram bookmarks handler - retrieves cached bookmarks from vault
 */
exports.instagramBookmarksHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Read from local vault (synced from GCS by vm_sync.sh cron)
    const fs = require('fs');
    const path = require('path');
    const vaultPath = path.join(__dirname, 'learning_base/instagram_scrape.json');

    let bookmarks = [];
    if (fs.existsSync(vaultPath)) {
      const data = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
      bookmarks = Array.isArray(data) ? data : data.posts || [];
    }

    res.json({
      success: true,
      count: bookmarks.length,
      bookmarks: bookmarks.slice(0, 50)
    });
  } catch (error) {
    console.error('Instagram bookmarks error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * OmniClaw 2.0 Simplified Handler
 *
 * Uses OmniClawIntegration for Jony Ive-inspired simplified interactions:
 * - Smart Router for intent routing
 * - Transparency Layer for AI visibility
 * - Smart Defaults for intelligent defaults
 * - Progressive Disclosure for feature discovery
 * - Context-Aware Simplification for platform optimization
 *
 * This endpoint provides a simplified natural language interface
 * that preserves all 19 capabilities while reducing cognitive load.
 */
exports.omniclaw2Handler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { omniClawIntegration } = initializeOmniClaw2();

    const body = req.body || {};
    const { query, platform = 'alexa', sessionId = 'omniclaw2_session' } = body;

    if (!query) {
      res.json({
        success: false,
        error: 'Missing query parameter'
      });
      return;
    }

    console.log(`[OmniClaw2 Handler] Query: "${query}" (platform: ${platform})`);

    // Process through OmniClawIntegration
    const result = await omniClawIntegration.processQuery(query, { platform, sessionId });

    // Return the response
    res.json({
      success: true,
      response: result
    });

  } catch (error) {
    console.error('[OmniClaw2 Handler] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * OmniClaw 2.0 Contextual Greeting Handler
 *
 * Returns contextual greetings based on time of day and platform.
 * Uses OmniClawIntegration for personalized experience.
 */
exports.omniclaw2GreetingHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { omniClawIntegration } = initializeOmniClaw2();

    const platform = req.query.platform || 'alexa';

    const greeting = omniClawIntegration.getContextualGreeting(platform);

    res.json({
      success: true,
      response: greeting.response
    });

  } catch (error) {
    console.error('[OmniClaw2 Greeting] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * OmniClaw 2.0 Discovery Handler
 *
 * Returns capability discovery information for new users.
 */
exports.omniclaw2DiscoveryHandler = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { omniClawIntegration } = initializeOmniClaw2();

    const platform = req.query.platform || 'alexa';
    const sessionId = req.query.sessionId || 'discovery_session';

    const discovery = omniClawIntegration.getDiscoveryResponse(platform, {
      interactionCount: 0
    });

    res.json({
      success: true,
      response: discovery.response
    });

  } catch (error) {
    console.error('[OmniClaw2 Discovery] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
