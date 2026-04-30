/**
 * Analytics & A/B Testing - Usage Examples
 *
 * Demonstrates how to use the analytics and feature flags system
 * to validate OmniClaw 2.0 UI/UX improvements
 */

const MetricsCollector = require('./metrics_collector');

// Initialize collector (singleton)
const collector = MetricsCollector.getCollector();

// ============================================================================
// EXAMPLE 1: Session Lifecycle
// ============================================================================

function example1_SessionLifecycle() {
  console.log('\n=== Example 1: Session Lifecycle ===\n');

  // Simulate incoming request
  const request = {
    userId: 'user_12345',
    headers: {
      'user-agent': 'Alexa/3.0'
    },
    path: '/alexa'
  };

  // Initialize session (automatically assigns A/B test group)
  const session = collector.initializeSession(request);

  console.log('Session initialized:');
  console.log('- Session ID:', session.sessionId);
  console.log('- A/B Test Group:', session.abTestGroup);
  console.log('- Platform:', session.platform);
  console.log('- Enabled Features:', session.enabledFeatures);

  // Track query interaction
  collector.trackQuery(session, {
    query: 'Play my road trip playlist'
  }, {
    intent: 'SpotifyIntent',
    capability: 'music',
    confidence: 0.95,
    success: true,
    responseTime: 1200,
    defaultApplied: true,
    featuresUsed: ['smart_router', 'smart_defaults']
  });

  // Track satisfaction
  collector.trackSatisfaction(session, 5, 'Very easy to use!');

  // End session and get metrics
  const metrics = collector.endSession(session);

  console.log('\nSession metrics:');
  console.log('- Duration:', Math.round(metrics.duration / 1000), 'seconds');
  console.log('- Time to first action:', metrics.timeToFirstAction, 'ms');
  console.log('- Task completion rate:', Math.round(metrics.taskCompletionRate * 100), '%');
  console.log('- Features discovered:', metrics.featuresDiscovered);
}

// ============================================================================
// EXAMPLE 2: A/B Testing Comparison
// ============================================================================

function example2_ABTesting() {
  console.log('\n=== Example 2: A/B Testing Comparison ===\n');

  // Simulate control group users (legacy UI)
  for (let i = 1; i <= 10; i++) {
    const request = {
      userId: `control_user_${i}`,
      headers: { 'user-agent': 'Alexa/3.0' }
    };

    const session = collector.initializeSession(request);

    // Track typical legacy UI interaction
    collector.trackQuery(session, {
      query: 'SpotifyIntent play my road trip playlist'
    }, {
      intent: 'SpotifyIntent',
      capability: 'music',
      confidence: 1.0,
      success: true,
      responseTime: 800
    });

    collector.trackSatisfaction(session, 3);
    collector.endSession(session);
  }

  // Simulate treatment group users (simplified UI)
  for (let i = 1; i <= 10; i++) {
    const request = {
      userId: `treatment_user_${i}`,
      headers: { 'user-agent': 'Alexa/3.0' }
    };

    const session = collector.initializeSession(request);

    // Track simplified UI interaction
    collector.trackQuery(session, {
      query: 'Play my road trip playlist'
    }, {
      intent: 'SpotifyIntent',
      capability: 'music',
      confidence: 0.95,
      success: true,
      responseTime: 1100,
      featuresUsed: ['smart_router', 'smart_defaults']
    });

    collector.trackSatisfaction(session, 5);
    collector.endSession(session);
  }

  // Get A/B test results
  const results = collector.getABTestResults();

  console.log('A/B Test Results:');
  console.log('\nControl Group (Legacy UI):');
  console.log('- Sessions:', results.control.sessions);
  console.log('- Time to first action:', Math.round(results.control.metrics.timeToFirstAction), 'ms');
  console.log('- Completion rate:', Math.round(results.control.metrics.completionRate * 100), '%');
  console.log('- Satisfaction:', results.control.metrics.satisfaction.toFixed(1), '/ 5');

  console.log('\nTreatment Group (Simplified UI):');
  console.log('- Sessions:', results.treatment.sessions);
  console.log('- Time to first action:', Math.round(results.treatment.metrics.timeToFirstAction), 'ms');
  console.log('- Completion rate:', Math.round(results.treatment.metrics.completionRate * 100), '%');
  console.log('- Satisfaction:', results.treatment.metrics.satisfaction.toFixed(1), '/ 5');

  console.log('\nImprovement:');
  console.log('- Time to first action:', Math.round(results.comparison.timeToFirstAction.improvement), '%');
  console.log('- Completion rate:', Math.round(results.comparison.completionRate.improvement * 100), '%');
  console.log('- Satisfaction:', results.comparison.satisfaction.improvement.toFixed(1), '/ 5');
}

// ============================================================================
// EXAMPLE 3: Gradual Rollout
// ============================================================================

function example3_GradualRollout() {
  console.log('\n=== Example 3: Gradual Rollout ===\n');

  // Start with 10% rollout
  collector.updateFeatureFlag('enable', 'simplified_ui', { rolloutPercentage: 10 });

  console.log('Phase 1: 10% Rollout');
  console.log('- Monitoring for issues...');
  console.log('- Checking error rates, response times');

  // Simulate some users at 10% rollout
  let enabledCount = 0;
  for (let i = 1; i <= 100; i++) {
    const session = collector.initializeSession({ userId: `user_${i}` });
    if (session.enabledFeatures.simplified_ui) {
      enabledCount++;
    }
    collector.endSession(session);
  }

  console.log(`- ${enabledCount}/100 users have simplified UI enabled (expected ~10%)`);

  // Ramp up to 25%
  setTimeout(() => {
    collector.updateFeatureFlag('update_rollout', 'simplified_ui', { percentage: 25 });
    console.log('\nPhase 2: 25% Rollout');

    // Check feature flag status
    const flags = collector.getDashboardData().featureFlags;
    console.log('- simplified_ui rollout:', flags.simplified_ui.rolloutPercentage, '%');
  }, 2000);

  // Ramp up to 50%
  setTimeout(() => {
    collector.updateFeatureFlag('update_rollout', 'simplified_ui', { percentage: 50 });
    console.log('\nPhase 3: 50% Rollout');
  }, 4000);

  // Ramp up to 100%
  setTimeout(() => {
    collector.updateFeatureFlag('update_rollout', 'simplified_ui', { percentage: 100 });
    console.log('\nPhase 4: 100% Rollout - Complete!');
  }, 6000);
}

// ============================================================================
// EXAMPLE 4: Real-time Monitoring Dashboard
// ============================================================================

function example4_MonitoringDashboard() {
  console.log('\n=== Example 4: Real-time Monitoring Dashboard ===\n');

  // Generate some sample data
  for (let i = 1; i <= 20; i++) {
    const session = collector.initializeSession({
      userId: `user_${i}`,
      headers: { 'user-agent': 'Alexa/3.0' }
    });

    collector.trackQuery(session, {
      query: 'Play music'
    }, {
      intent: 'SpotifyIntent',
      capability: 'music',
      confidence: 0.9,
      success: Math.random() > 0.1, // 90% success rate
      responseTime: Math.floor(Math.random() * 3000) + 500
    });

    collector.trackSatisfaction(session, Math.floor(Math.random() * 3) + 3); // 3-5 rating
    collector.endSession(session);
  }

  // Get dashboard data
  const dashboard = collector.getDashboardData();

  console.log('📊 Dashboard Metrics:\n');

  console.log('Summary:');
  console.log('- Total Sessions:', dashboard.summary.totalSessions);
  console.log('- Total Interactions:', dashboard.summary.totalInteractions);
  console.log('- Success Rate:', Math.round(dashboard.summary.overallCompletionRate * 100), '%');
  console.log('- Failed Actions:', dashboard.summary.failedActions);

  console.log('\nTime to First Action:');
  console.log('- Average:', Math.round(dashboard.timeToFirstAction.average), 'ms');
  console.log('- Median:', Math.round(dashboard.timeToFirstAction.median), 'ms');
  console.log('- P95:', Math.round(dashboard.timeToFirstAction.p95), 'ms');
  console.log('- Target (10s):', dashboard.timeToFirstAction.targetMet ? '✅ MET' : '❌ NOT MET');

  console.log('\nUser Satisfaction:');
  console.log('- Average:', dashboard.userSatisfaction.average.toFixed(1), '/ 5');
  console.log('- Median:', dashboard.userSatisfaction.median.toFixed(1), '/ 5');
  console.log('- Target (4.5):', dashboard.userSatisfaction.targetMet ? '✅ MET' : '❌ NOT MET');

  console.log('\nError Rate:');
  console.log('- Current:', Math.round(dashboard.errorRate.rate * 100), '%');
  console.log('- Target (5%):', dashboard.errorRate.targetMet ? '✅ MET' : '❌ NOT MET');

  console.log('\nTop Capabilities:');
  dashboard.topCapabilities.slice(0, 5).forEach((cap, index) => {
    console.log(`${index + 1}. ${cap.capability}: ${cap.count} uses`);
  });
}

// ============================================================================
// EXAMPLE 5: Alert System
// ============================================================================

function example5_AlertSystem() {
  console.log('\n=== Example 5: Alert System ===\n');

  // Register alert callback
  collector.onAlert((alerts, session) => {
    console.log('🚨 ALERT TRIGGERED:');
    alerts.forEach(alert => {
      console.log(`- Type: ${alert.type}`);
      console.log(`- Severity: ${alert.severity}`);
      console.log(`- Message: ${alert.message}`);
      console.log(`- Session: ${session.sessionId}`);
      console.log();
    });
  });

  // Simulate high error rate
  console.log('Simulating high error rate...\n');

  for (let i = 1; i <= 20; i++) {
    const session = collector.initializeSession({
      userId: `user_${i}`,
      headers: { 'user-agent': 'Alexa/3.0' }
    });

    collector.trackQuery(session, {
      query: 'Play music'
    }, {
      intent: 'SpotifyIntent',
      capability: 'music',
      confidence: 0.3,
      success: i > 15, // Last 5 fail
      responseTime: 6000 // Slow response
    });

    collector.endSession(session);
  }

  console.log('Alerts triggered based on thresholds.');
}

// ============================================================================
// EXAMPLE 6: Feature Flag Whitelist
// ============================================================================

function example6_Whitelist() {
  console.log('\n=== Example 6: Feature Flag Whitelist ===\n');

  // Add specific users to whitelist (beta testers)
  collector.updateFeatureFlag('whitelist_add', 'simplified_ui', {
    userId: 'beta_tester_1'
  });

  collector.updateFeatureFlag('whitelist_add', 'simplified_ui', {
    userId: 'beta_tester_2'
  });

  console.log('Added beta_tester_1 and beta_tester_2 to whitelist\n');

  // Check if features are enabled
  const betaUser1 = collector.initializeSession({
    userId: 'beta_tester_1',
    headers: { 'user-agent': 'Alexa/3.0' }
  });

  const regularUser = collector.initializeSession({
    userId: 'regular_user',
    headers: { 'user-agent': 'Alexa/3.0' }
  });

  console.log('Beta tester 1:');
  console.log('- simplified_ui:', betaUser1.enabledFeatures.simplified_ui);

  console.log('\nRegular user:');
  console.log('- simplified_ui:', regularUser.enabledFeatures.simplified_ui);

  console.log('\nBeta testers always get new features, regardless of rollout percentage!');
}

// ============================================================================
// EXAMPLE 7: Export Metrics
// ============================================================================

function example7_ExportMetrics() {
  console.log('\n=== Example 7: Export Metrics ===\n');

  // Generate sample data
  for (let i = 1; i <= 5; i++) {
    const session = collector.initializeSession({
      userId: `user_${i}`,
      headers: { 'user-agent': 'Alexa/3.0' }
    });

    collector.trackQuery(session, {
      query: 'Play music'
    }, {
      intent: 'SpotifyIntent',
      capability: 'music',
      confidence: 0.95,
      success: true,
      responseTime: 1200
    });

    collector.endSession(session);
  }

  // Export as JSON
  console.log('JSON Export (first 500 chars):');
  const jsonExport = collector.exportMetrics('json');
  console.log(jsonExport.substring(0, 500) + '...\n');

  // Export as CSV
  console.log('CSV Export:');
  const csvExport = collector.exportMetrics('csv');
  console.log(csvExport);
}

// ============================================================================
// COMPREHENSIVE DEMO
// ============================================================================

function comprehensiveDemo() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  OmniClaw 2.0 Analytics & A/B Testing - Demo                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  example1_SessionLifecycle();
  setTimeout(() => example2_ABTesting(), 1000);
  setTimeout(() => example4_MonitoringDashboard(), 2000);
  setTimeout(() => example5_AlertSystem(), 3000);
  setTimeout(() => example6_Whitelist(), 4000);
  setTimeout(() => example7_ExportMetrics(), 5000);
}

// Run if executed directly
if (require.main === module) {
  comprehensiveDemo();

  setTimeout(() => {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Demo Complete                                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }, 6000);
}

module.exports = {
  MetricsCollector,
  example1_SessionLifecycle,
  example2_ABTesting,
  example3_GradualRollout,
  example4_MonitoringDashboard,
  example5_AlertSystem,
  example6_Whitelist,
  example7_ExportMetrics,
  comprehensiveDemo
};
