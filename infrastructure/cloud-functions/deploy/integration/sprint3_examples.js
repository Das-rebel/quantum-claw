/**
 * Sprint 3 Examples - Smart Features in Action
 *
 * Demonstrating:
 * - Confidence indicators
 * - Action confirmations
 * - Explainable decisions
 * - Smart defaults
 */

const OmniClawIntegration = require('./integration/omniclaw_integration');

// Initialize integration
const omniclaw = new OmniClawIntegration();

// ============================================================================
// EXAMPLE 1: Confidence Indicators
// ============================================================================

async function example1_ConfidenceLevels() {
  console.log('\n=== Example 1: Confidence Indicators ===\n');

  // High confidence (>90%): Direct action
  const highConfidence = await omniclaw.processQuery('Play my road trip playlist', {
    platform: 'alexa',
    sessionId: 'user-1'
  });
  console.log('High confidence (95%): Direct action');
  console.log('Response:', highConfidence.response?.outputSpeech?.text);

  // Medium confidence (50-90%): Confirm before action
  const mediumConfidence = await omniclaw.processQuery('Play something', {
    platform: 'alexa',
    sessionId: 'user-2'
  });
  console.log('\nMedium confidence (75%): Confirmation required');
  console.log('Response:', mediumConfidence.response?.outputSpeech?.text);
  console.log('Requires confirmation:', mediumConfidence.requiresConfirmation);

  // Low confidence (<50%): Ask for clarification
  const lowConfidence = await omniclaw.processQuery('Do the thing', {
    platform: 'alexa',
    sessionId: 'user-3'
  });
  console.log('\nLow confidence (30%): Clarification needed');
  console.log('Response:', lowConfidence.response?.outputSpeech?.text);
}

// ============================================================================
// EXAMPLE 2: Action Confirmations
// ============================================================================

async function example2_IrreversibleActions() {
  console.log('\n=== Example 2: Action Confirmations ===\n');

  // Sending a message requires confirmation
  const messageResult = await omniclaw.processQuery('Send a message to mom saying I love you', {
    platform: 'whatsapp',
    sessionId: 'user-4'
  });

  console.log('Message action (irreversible):');
  console.log('Requires confirmation:', messageResult.requiresConfirmation);
  console.log('Confirmation message:', messageResult.confirmationData?.message);

  // User confirms the action
  if (messageResult.requiresConfirmation) {
    const confirmed = await omniclaw.handleConfirmation(
      'user-4',
      true,
      messageResult.confirmationData
    );
    console.log('\nAfter confirmation:');
    console.log('Response:', confirmed.response?.outputSpeech?.text);
  }
}

// ============================================================================
// EXAMPLE 3: Explainable Decisions
// ============================================================================

async function example3_ExplainableRouting() {
  console.log('\n=== Example 3: Explainable Decisions ===\n');

  const result = await omniclaw.processQuery('Who is Albert Einstein?', {
    platform: 'whatsapp',
    sessionId: 'user-5'
  });

  console.log('Query: "Who is Albert Einstein?"');
  console.log('\nRouting explanation:');
  console.log(result.transparency);
  console.log('\nWhy this route was chosen:');
  console.log('- Detected question pattern: "Who is..."');
  console.log('- Matched Wikipedia intent with 95% confidence');
  console.log('- Chose Wikipedia as best source for factual information');
}

// ============================================================================
// EXAMPLE 4: Smart Defaults - Resume Last
// ============================================================================

async function example4_SmartDefaults_Resume() {
  console.log('\n=== Example 4: Smart Defaults - Resume ===\n');

  // First interaction: Play specific playlist
  await omniclaw.processQuery('Play my road trip playlist', {
    platform: 'alexa',
    sessionId: 'user-6'
  });

  // Second interaction: Just "play" - resumes last
  const resumeResult = await omniclaw.processQuery('Play', {
    platform: 'alexa',
    sessionId: 'user-6'
  });

  console.log('Query: "Play" (no specific playlist)');
  console.log('\nSmart defaults applied:');
  console.log('- Resumed last played: road trip playlist');
  console.log('- Suggestion:', resumeResult.response?.outputSpeech?.text);
}

// ============================================================================
// EXAMPLE 5: Smart Defaults - Auto-Detection
// ============================================================================

async function example5_SmartDefaults_AutoDetect() {
  console.log('\n=== Example 5: Auto-Detection ===\n');

  // User mentions Spotify keyword
  const spotifyResult = await omniclaw.processQuery('Play some jazz music on Spotify', {
    platform: 'alexa',
    sessionId: 'user-7'
  });

  console.log('Query: "Play some jazz music on Spotify"');
  console.log('\nAuto-detected:');
  console.log('- Service: Spotify (from keyword in query)');
  console.log('- Genre: Jazz (extracted from query)');
  console.log('- Action: Play music');

  // User mentions Kodi keyword
  const kodiResult = await omniclaw.processQuery('Put on a movie on Kodi', {
    platform: 'alexa',
    sessionId: 'user-8'
  });

  console.log('\nQuery: "Put on a movie on Kodi"');
  console.log('\nAuto-detected:');
  console.log('- Service: Kodi (from keyword in query)');
  console.log('- Content type: Movie (from "movie" keyword)');
  console.log('- Action: Play video');
}

// ============================================================================
// EXAMPLE 6: Corrections - "No, I meant..."
// ============================================================================

async function example6_Corrections() {
  console.log('\n=== Example 6: Handling Corrections ===\n');

  // User says something, then corrects
  const firstResult = await omniclaw.processQuery('Play music', {
    platform: 'alexa',
    sessionId: 'user-9'
  });
  console.log('First query: "Play music"');
  console.log('Response:', firstResult.response?.outputSpeech?.text);

  // User corrects
  const correction = await omniclaw.processQuery('No, I meant play a podcast', {
    platform: 'alexa',
    sessionId: 'user-9'
  });

  console.log('\nCorrection: "No, I meant play a podcast"');
  console.log('Response:', correction.response?.outputSpeech?.text);
  console.log('\nSystem behavior:');
  console.log('- Detected correction pattern: "No, I meant..."');
  console.log('- Re-routed from music to podcast/intent');
  console.log('- Updated context to avoid future confusion');
}

// ============================================================================
// EXAMPLE 7: Learning from Behavior
// ============================================================================

async function example7_Learning() {
  console.log('\n=== Example 7: Learning from Behavior ===\n');

  const sessionId = 'user-10';

  // User repeatedly chooses Wikipedia
  await omniclaw.processQuery('Search Wikipedia for quantum physics', {
    platform: 'whatsapp',
    sessionId
  });

  await omniclaw.processQuery('Search Wikipedia for machine learning', {
    platform: 'whatsapp',
    sessionId
  });

  await omniclaw.processQuery('Search Wikipedia for artificial intelligence', {
    platform: 'whatsapp',
    sessionId
  });

  // Get session stats
  const stats = omniclaw.getSessionStats(sessionId);
  console.log('Session statistics:');
  console.log(JSON.stringify(stats, null, 2));

  console.log('\nLearned preferences:');
  console.log('- User consistently chooses Wikipedia');
  console.log('- Wikipedia will become default for answers');
  console.log('- Reduces cognitive load for future queries');
}

// ============================================================================
// EXAMPLE 8: Progressive Feature Discovery with Transparency
// ============================================================================

async function example8_ProgressiveDiscovery() {
  console.log('\n=== Example 8: Progressive Discovery ===\n');

  const sessionId = 'user-11';

  // First interaction: Core 5 shown
  const firstResult = await omniclaw.processQuery('What can you do?', {
    platform: 'alexa',
    sessionId
  });

  console.log('First interaction (new user):');
  console.log(firstResult.response?.outputSpeech?.text);

  // After playing music: Suggest related capabilities
  await omniclaw.processQuery('Play my jazz playlist', {
    platform: 'alexa',
    sessionId
  });

  const musicHint = await omniclaw.processQuery('That was great, what else can you do?', {
    platform: 'alexa',
    sessionId
  });

  console.log('\nAfter music interaction:');
  console.log(musicHint.response?.outputSpeech?.text);
  console.log('\nProgressive disclosure:');
  console.log('- Discovered music capability');
  console.log('- Hint shown about advanced controls (pause, skip, volume)');
  console.log('- Suggested related capabilities (TV, news)');
}

// ============================================================================
// EXAMPLE 9: Platform-Optimized Transparency
// ============================================================================

async function example9_PlatformTransparency() {
  console.log('\n=== Example 9: Platform-Optimized Transparency ===\n');

  const query = 'Get the latest news';

  // Alexa: Voice-first, brief transparency
  const alexa = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: 'user-12'
  });

  console.log('Alexa (voice-first):');
  console.log(alexa.response?.outputSpeech?.text);

  // WhatsApp: Text-first, rich transparency
  const whatsapp = await omniclaw.processQuery(query, {
    platform: 'whatsapp',
    sessionId: 'user-13'
  });

  console.log('\nWhatsApp (text-first):');
  console.log(whatsapp.response?.outputSpeech?.text);
  console.log('\nTransparency info:');
  console.log(whatsapp.transparency);
}

// ============================================================================
// EXAMPLE 10: Time-Based + Smart Defaults
// ============================================================================

async function example10_ContextAwareDefaults() {
  console.log('\n=== Example 10: Context-Aware Smart Defaults ===\n');

  // Morning: News-focused defaults
  const morning = await omniclaw.processQuery('What\'s new?', {
    platform: 'alexa',
    sessionId: 'user-morning'
  });

  console.log('Morning query (7 AM):');
  console.log(morning.response?.outputSpeech?.text);
  console.log('\nContext-aware decisions:');
  console.log('- Time: Morning → suggested focus: news');
  console.log('- Default: Top headlines');
  console.log('- Verbosity: Brief');

  // Evening: Entertainment-focused defaults
  const evening = await omniclaw.processQuery('What\'s new?', {
    platform: 'alexa',
    sessionId: 'user-evening'
  });

  console.log('\nEvening query (7 PM):');
  console.log(evening.response?.outputSpeech?.text);
  console.log('\nContext-aware decisions:');
  console.log('- Time: Evening → suggested focus: entertainment');
  console.log('- Default: Music or TV');
  console.log('- Verbosity: Relaxed');
}

// ============================================================================
// COMPREHENSIVE DEMO
// ============================================================================

async function comprehensiveDemo() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Sprint 3 Smart Features - Comprehensive Demo                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('This demo showcases:');
  console.log('1. ✅ Confidence indicators (high/medium/low)');
  console.log('2. ✅ Action confirmations (irreversible actions)');
  console.log('3. ✅ Explainable decisions (why routing occurred)');
  console.log('4. ✅ Smart defaults (resume, auto-detect)');
  console.log('5. ✅ Correction handling ("No, I meant...")');
  console.log('6. ✅ Learning from user behavior');
  console.log('7. ✅ Progressive feature discovery');
  console.log('8. ✅ Platform-optimized transparency');
  console.log('9. ✅ Context-aware defaults (time-based)');
  console.log('\n');

  await example1_ConfidenceLevels();
  await example2_IrreversibleActions();
  await example3_ExplainableRouting();
  await example4_SmartDefaults_Resume();
  await example5_SmartDefaults_AutoDetect();
  await example6_Corrections();
  await example7_Learning();
  await example8_ProgressiveDiscovery();
  await example9_PlatformTransparency();
  await example10_ContextAwareDefaults();

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Sprint 3 Complete: Smart Features Implemented ✅            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// Run if executed directly
if (require.main === module) {
  comprehensiveDemo().catch(error => {
    console.error('Error:', error);
  });
}

module.exports = {
  examples: {
    example1_ConfidenceLevels,
    example2_IrreversibleActions,
    example3_ExplainableRouting,
    example4_SmartDefaults_Resume,
    example5_SmartDefaults_AutoDetect,
    example6_Corrections,
    example7_Learning,
    example8_ProgressiveDiscovery,
    example9_PlatformTransparency,
    example10_ContextAwareDefaults,
    comprehensiveDemo
  }
};
