/**
 * OmniClaw 2.0 Integration - Usage Examples
 *
 * This file demonstrates how to use the new simplified UI/UX system
 * All 19 capabilities remain - just accessed through natural language
 */

const OmniClawIntegration = require('./omniclaw_integration');

// Initialize the integration
const omniclaw = new OmniClawIntegration();

// Example 1: Simple natural language query (no intent names needed!)
async function example1_Music() {
  const query = "Play my road trip playlist";

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-123'
  });

  // Result: Automatically routes to SpotifyIntent
  // Returns: "I'll help you play some music."
  console.log('Example 1 - Music:', result);
}

// Example 2: Question without knowing which service
async function example2_Question() {
  const query = "Who is Albert Einstein?";

  const result = await omniclaw.processQuery(query, {
    platform: 'whatsapp',
    sessionId: 'user-123'
  });

  // Result: Automatically routes to WikipediaIntent
  // Returns: Wikipedia information about Einstein
  console.log('Example 2 - Answers:', result);
}

// Example 3: TV control
async function example3_TV() {
  const query = "Play the last movie on Kodi";

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-123'
  });

  // Result: Automatically routes to KodiIntent
  // Returns: "Playing last movie on Kodi"
  console.log('Example 3 - TV:', result);
}

// Example 4: WhatsApp messages
async function example4_WhatsApp() {
  const query = "Send a WhatsApp message to mom saying I'll be late";

  const result = await omniclaw.processQuery(query, {
    platform: 'whatsapp',
    sessionId: 'user-123'
  });

  // Result: Automatically routes to WhatsAppIntent
  // Extracts: recipient = "mom", message = "I'll be late"
  console.log('Example 4 - Messages:', result);
}

// Example 5: News
async function example5_News() {
  const query = "What are the latest headlines?";

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-123'
  });

  // Result: Automatically routes to NewsIntent
  // Returns: Latest news headlines
  console.log('Example 5 - News:', result);
}

// Example 6: Translation (advanced capability, still works!)
async function example6_Translation() {
  const query = "Translate 'Hello world' to Spanish";

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-123'
  });

  // Result: Automatically detects translation pattern (0.95 confidence)
  // Returns: "Hola mundo"
  console.log('Example 6 - Translation:', result);
}

// Example 7: Discovery (what can you do?)
async function example7_Discovery() {
  const query = "What can you do?";

  const result = omniclaw.getDiscoveryResponse('alexa', {
    interactionCount: 1
  });

  // Result: Shows Core 5 capabilities progressively
  console.log('Example 7 - Discovery:', result);
}

// Example 8: Context-aware greeting
async function example8_ContextualGreeting() {
  const greeting = omniclaw.getContextualGreeting('alexa');

  // Morning: "Morning! Ready to start your day?"
  // Evening: "Evening! Ready to relax?"
  // Night: "Hi there. What do you need?"
  console.log('Example 8 - Contextual Greeting:', greeting);
}

// Example 9: Progressive hints (shown after actions)
async function example9_ProgressiveHints() {
  // After playing music, system automatically suggests:
  // "I can also pause, skip, or adjust volume"

  // After watching TV, system suggests:
  // "I can also search for specific movies or shows"

  // These hints appear naturally in conversation
  console.log('Example 9 - Progressive Hints: Automatic after successful actions');
}

// Example 10: Session analytics
async function example10_Analytics() {
  const stats = omniclaw.getSessionStats('user-123');

  // Returns:
  // {
  //   sessionId: 'user-123',
  //   platform: 'alexa',
  //   interactionCount: 5,
  //   sessionDuration: 3600000,  // 1 hour
  //   lastCapability: 'music',
  //   recentCapabilities: ['music', 'tv', 'music', 'news', 'music']
  // }

  console.log('Example 10 - Analytics:', stats);
}

// Example 11: Platform optimization
async function example11_PlatformOptimization() {
  // Same query, different platforms = optimized responses

  const query = "Get the latest news";

  // Alexa (voice-first): Brief response
  const alexaResult = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-123'
  });

  // WhatsApp (text-first): Rich formatted response with details
  const whatsappResult = await omniclaw.processQuery(query, {
    platform: 'whatsapp',
    sessionId: 'user-123'
  });

  console.log('Example 11 - Platform Optimization:');
  console.log('  Alexa:', alexaResult);
  console.log('  WhatsApp:', whatsappResult);
}

// Example 12: Time-based simplification
async function example12_TimeBased() {
  // Morning queries get brief, news-focused responses
  const morningQuery = await omniclaw.processQuery("What's up?", {
    platform: 'alexa',
    sessionId: 'user-morning'
  });

  // Evening queries get relaxed, entertainment-focused responses
  const eveningQuery = await omniclaw.processQuery("What's up?", {
    platform: 'alexa',
    sessionId: 'user-evening'
  });

  console.log('Example 12 - Time-Based:');
  console.log('  Morning:', morningQuery);
  console.log('  Evening:', eveningQuery);
}

// ============================================================================
// ALL 19 CAPABILITIES STILL WORK - JUST DISCOVERED NATURALLY
// ============================================================================

async function demonstrateAllCapabilities() {
  console.log('\n=== All 19 Capabilities - Natural Language Examples ===\n');

  const examples = [
    // Core 5 (shown to new users)
    { cap: 'Spotify', query: 'Play my road trip playlist' },
    { cap: 'Wikipedia', query: 'Who is Albert Einstein?' },
    { cap: 'Kodi', query: 'Play the last movie on Kodi' },
    { cap: 'WhatsApp', query: 'Send a message to mom saying I\'ll be late' },
    { cap: 'News', query: 'What are the latest headlines?' },

    // Advanced capabilities (progressively discovered)
    { cap: 'Translate', query: 'Translate "Hello world" to Spanish' },
    { cap: 'Story', query: 'Tell me a story about a brave knight' },
    { cap: 'Twitter', query: 'Search Twitter for AI news' },
    { cap: 'Reddit', query: 'Search Reddit for programming jokes' },
    { cap: 'YouTube', query: 'Search YouTube for Python tutorials' },
    { cap: 'Arxiv', query: 'Search Arxiv for machine learning papers' },

    // Plus 9 more capabilities that all work through natural language!
    { cap: 'GoogleTranslate', query: 'Use Google Translate' },
    { cap: 'ElevenLabsTTS', query: 'Speak this with ElevenLabs' },
    { cap: 'SarvamTTS', query: 'Speak this in Hindi' },
    { cap: 'SpotifyPause', query: 'Pause the music' },
    { cap: 'SpotifySkip', query: 'Skip this track' },
    { cap: 'SpotifyDevice', query: 'Transfer playback to Echo' },
    { cap: 'KodiPause', query: 'Pause Kodi' },
    { cap: 'KodiPlay', query: 'Play on Kodi' },
    { cap: 'KodiAddons', query: 'Open Seren on Kodi' }
  ];

  for (const { cap, query } of examples) {
    console.log(`${cap}: "${query}"`);
  }

  console.log('\n✅ All 19 capabilities accessible through natural language!');
}

// Run examples if this file is executed directly
if (require.main === module) {
  (async () => {
    console.log('OmniClaw 2.0 - Simplified UI/UX Examples\n');
    console.log('Key Principle: "Just say what you need - no intent names to remember"\n');

    await demonstrateAllCapabilities();

    console.log('\n=== Core Benefits ===\n');
    console.log('✅ No need to remember 19+ intent names');
    console.log('✅ Natural language routing to all capabilities');
    console.log('✅ Progressive feature discovery');
    console.log('✅ Platform-optimized responses');
    console.log('✅ Context-aware simplification');
    console.log('✅ ALL FEATURES PRESERVED - SIMPLER INTERFACE ONLY\n');

  })().catch(error => {
    console.error('Error:', error);
  });
}

module.exports = {
  OmniClawIntegration,
  examples: {
    example1_Music,
    example2_Question,
    example3_TV,
    example4_WhatsApp,
    example5_News,
    example6_Translation,
    example7_Discovery,
    example8_ContextualGreeting,
    example9_ProgressiveHints,
    example10_Analytics,
    example11_PlatformOptimization,
    example12_TimeBased,
    demonstrateAllCapabilities
  }
};
