/**
 * Data Collection Example - Jony Ive UI/UX Validation
 *
 * This script demonstrates how to use the data collection
 * system to validate OmniClaw 2.0 simplification improvements.
 *
 * Run: node data_collection_example.js
 */

// Import the metrics collector
const MetricsCollector = require('./metrics_collector');
const collector = new MetricsCollector();

console.log('='.repeat(60));
console.log('OmniClaw 2.0 - Data Collection Example');
console.log('Jony Ive UI/UX Simplification Validation');
console.log('='.repeat(60));

// Simulate sessions for different platforms
function simulateSession(platform, userId) {
  console.log(`\n--- Starting ${platform} session for user ${userId} ---`);

  // Initialize session
  const sessionContext = collector.initializeSession({
    userId,
    headers: { 'user-agent': platform === 'alexa' ? 'Alexa' : 'WhatsApp/2.0' },
    path: `/${platform}/invoke`
  });

  console.log(`Session: ${sessionContext.sessionId}`);
  console.log(`A/B Group: ${sessionContext.abTestGroup}`);
  console.log(`Enabled Features:`, sessionContext.enabledFeatures);

  // Simulate user interactions
  const interactions = [
    {
      queryData: { query: 'play some music' },
      responseData: {
        capability: 'spotify',
        intent: 'play_music',
        confidence: 0.95,
        success: true,
        responseTime: 850,
        defaultsApplied: ['resume_last', 'last_device']
      }
    },
    {
      queryData: { query: 'who is Albert Einstein' },
      responseData: {
        capability: 'wikipedia',
        intent: 'wiki_lookup',
        confidence: 0.92,
        success: true,
        responseTime: 320,
        defaultsApplied: ['default_source']
      }
    },
    {
      queryData: { query: 'latest tech news' },
      responseData: {
        capability: 'news',
        intent: 'get_news',
        confidence: 0.88,
        success: true,
        responseTime: 410
      }
    },
    {
      queryData: { query: 'play Stranger Things on Kodi' },
      responseData: {
        capability: 'kodi',
        intent: 'play_video',
        confidence: 0.90,
        success: true,
        responseTime: 1200,
        defaultsApplied: ['default_addon']
      }
    },
    {
      queryData: { query: 'send message to John' },
      responseData: {
        capability: 'whatsapp',
        intent: 'send_message',
        confidence: 0.85,
        success: true,
        responseTime: 280,
        defaultsApplied: ['default_platform']
      }
    }
  ];

  // Track each interaction
  interactions.forEach((interaction, index) => {
    console.log(`  Step ${index + 1}: ${interaction.responseData.capability}`);
    collector.trackQuery(sessionContext, interaction.queryData, interaction.responseData);
  });

  // Track satisfaction
  collector.trackSatisfaction(sessionContext, 4, 'Much simpler than before!');

  // End session
  const finalMetrics = collector.endSession(sessionContext);
  console.log(`  Session completed: ${finalMetrics.tasksCompleted}/${finalMetrics.interactionCount} tasks succeeded`);

  return finalMetrics;
}

// Run simulations
console.log('\n>>> Running simulation 1: Alexa user');
const alexaMetrics = simulateSession('alexa', 'user_alexa_001');

console.log('\n>>> Running simulation 2: WhatsApp user');
const whatsappMetrics = simulateSession('whatsapp', 'user_whatsapp_002');

console.log('\n>>> Running simulation 3: Web user');
const webMetrics = simulateSession('web', 'user_web_003');

// Additional session with corrections (testing simplification)
console.log('\n>>> Running simulation 4: User with corrections');
const correctionSession = collector.initializeSession({
  userId: 'user_correction_004',
  headers: { 'user-agent': 'Alexa' },
  path: '/alexa/invoke'
});

collector.trackQuery(correctionSession, { query: 'play music' }, {
  capability: 'spotify',
  confidence: 0.70,
  success: false,
  responseTime: 300,
  clarificationNeeded: true
});

collector.trackQuery(correctionSession, { query: 'play Bollywood songs on Spotify' }, {
  capability: 'spotify',
  confidence: 0.92,
  success: true,
  responseTime: 950,
  correction: true,
  defaultsApplied: ['default_playlist']
});

collector.endSession(correctionSession);

// Display reports
console.log('\n' + '='.repeat(60));
console.log('VALIDATION REPORTS');
console.log('='.repeat(60));

// 1. Dashboard data
console.log('\n1. DASHBOARD DATA');
console.log('-'.repeat(40));
const dashboard = collector.getDashboardData();
console.log(`Total Sessions: ${dashboard.summary.totalSessions}`);
console.log(`Total Interactions: ${dashboard.summary.totalInteractions}`);
console.log(`Completion Rate: ${(dashboard.summary.overallCompletionRate * 100).toFixed(1)}%`);
console.log(`Error Rate: ${(dashboard.errorRate.rate * 100).toFixed(1)}%`);
console.log(`Time to First Action (avg): ${(dashboard.timeToFirstAction.average / 1000).toFixed(2)}s`);
console.log(`User Satisfaction (avg): ${dashboard.userSatisfaction.average.toFixed(2)}/5`);

// 2. Simplification validation
console.log('\n2. JONY IVE SIMPLIFICATION VALIDATION');
console.log('-'.repeat(40));
const validation = collector.getSimplificationValidationReport();
console.log(`Validation Score: ${validation.validationPercentage}% (${validation.status})`);
console.log('\nPrinciple Compliance:');
console.log(`  - Less is More: ${validation.jonyIvePrinciples.lessIsMore.score}`);
console.log(`    Direct intent rate: ${(validation.jonyIvePrinciples.lessIsMore.directIntentRate * 100).toFixed(1)}%`);
console.log(`  - Eliminate Choice Paralysis: ${validation.jonyIvePrinciples.eliminateChoiceParalysis.score}`);
console.log(`    Default acceptance rate: ${(validation.jonyIvePrinciples.eliminateChoiceParalysis.acceptanceRate * 100).toFixed(1)}%`);
console.log(`  - Progressive Disclosure: ${validation.jonyIvePrinciples.progressiveDisclosure.score}`);
console.log(`    Avg capabilities discovered: ${validation.jonyIvePrinciples.progressiveDisclosure.avgDiscovered.toFixed(1)}/19`);

// 3. Feature discovery funnel
console.log('\n3. FEATURE DISCOVERY FUNNEL');
console.log('-'.repeat(40));
const funnel = collector.getFeatureDiscoveryFunnel();
console.log(`Sessions Analyzed: ${funnel.totalSessions}`);
console.log(`Avg Capabilities Discovered: ${funnel.avgCapabilitiesDiscovered.toFixed(1)}/19`);
console.log(`Fully Discovered Capabilities: ${funnel.fullyDiscovered}/19`);

// 4. Time to value
console.log('\n4. TIME-TO-VALUE METRICS');
console.log('-'.repeat(40));
const ttv = collector.getTimeToValueMetrics();
console.log(`Average: ${(ttv.average / 1000).toFixed(2)}s`);
console.log(`Median: ${(ttv.median / 1000).toFixed(2)}s`);
console.log(`P95: ${(ttv.p95 / 1000).toFixed(2)}s`);
console.log(`Target (10s): ${ttv.targetMet ? 'MET ✓' : 'NOT MET ✗'}`);

// 5. Platform comparison
console.log('\n5. PLATFORM COMPARISON');
console.log('-'.repeat(40));
const platformComp = collector.getPlatformJourneyComparison();
Object.entries(platformComp).forEach(([platform, data]) => {
  console.log(`\n${platform.toUpperCase()}:`);
  console.log(`  Sessions: ${data.sessions}`);
  console.log(`  Avg Steps: ${data.avgSteps.toFixed(1)}`);
  console.log(`  Avg Corrections: ${data.avgCorrections.toFixed(2)}`);
  console.log(`  Unique Capabilities: ${data.uniqueCapabilities}`);
  console.log(`  Avg Time to Value: ${data.avgTimeToValue ? (data.avgTimeToValue / 1000).toFixed(2) + 's' : 'N/A'}`);
});

// 6. Simplification metrics
console.log('\n6. SIMPLIFICATION METRICS');
console.log('-'.repeat(40));
const simpMetrics = collector.journeyTracker.getSimplificationMetrics();
console.log(`Default Acceptance Rate: ${(simpMetrics.defaultAcceptanceRate * 100).toFixed(1)}%`);
console.log(`Direct Intent Rate: ${(simpMetrics.directIntentRate * 100).toFixed(1)}%`);
console.log(`Corrections Needed: ${simpMetrics.correctionsNeeded}`);
console.log(`Clarifications Requested: ${simpMetrics.clarificationsRequested}`);

// 7. Export data
console.log('\n7. EXPORT DATA');
console.log('-'.repeat(40));
console.log('Journey Data (JSON excerpt):');
const journeyData = collector.exportJourneyData('json');
const parsed = JSON.parse(journeyData);
console.log(`  ${parsed.length} sessions exported`);
if (parsed.length > 0) {
  console.log(`  First session path: ${parsed[0].path || 'N/A'}`);
}

console.log('\n' + '='.repeat(60));
console.log('Data collection complete. Use this data to validate');
console.log('Jony Ive-inspired UI/UX simplification effectiveness.');
console.log('='.repeat(60));
