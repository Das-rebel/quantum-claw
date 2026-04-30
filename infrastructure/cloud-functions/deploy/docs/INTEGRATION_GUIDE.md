# OmniClaw 2.0 Integration Guide

Complete guide for integrating OmniClaw 2.0 simplified UI into existing Cloud Functions.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Basic Integration](#basic-integration)
- [Migration from Legacy UI](#migration-from-legacy-ui)
- [Feature Flag Configuration](#feature-flag-configuration)
- [Analytics Setup](#analytics-setup)
- [Platform-Specific Integration](#platform-specific-integration)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Quick Start

Get OmniClaw 2.0 running in 5 minutes.

### 1. Basic Setup

```javascript
// Import OmniClawIntegration
const OmniClawIntegration = require('./integration/omniclaw_integration');

// Create integration instance
const omniclaw = new OmniClawIntegration();

// Process a query
async function handleRequest(req, res) {
  const { query, sessionId } = req.body;

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: sessionId
  });

  res.json(result);
}
```

### 2. With Feature Flags

```javascript
const OmniClawIntegration = require('./integration/omniclaw_integration');
const FeatureFlags = require('./analytics/feature_flags');

const flags = new FeatureFlags();
const omniclaw = new OmniClawIntegration();

async function handleRequest(req, res) {
  const { query, sessionId, userId } = req.body;

  // Check if simplified UI is enabled
  if (!flags.isEnabled('simplified_ui', { userId, sessionId })) {
    // Fall back to legacy UI
    return handleLegacyRequest(req, res);
  }

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId
  });

  res.json(result);
}
```

### 3. With Analytics

```javascript
const OmniClawIntegration = require('./integration/omniclaw_integration');
const AnalyticsTracker = require('./analytics/analytics_tracker');

const omniclaw = new OmniClawIntegration();
const tracker = new AnalyticsTracker();

async function handleRequest(req, res) {
  const { query, sessionId, userId } = req.body;

  // Start tracking
  tracker.startSession(sessionId, { userId, platform: 'alexa' });

  const startTime = Date.now();

  try {
    const result = await omniclaw.processQuery(query, {
      platform: 'alexa',
      sessionId
    });

    const responseTime = Date.now() - startTime;

    // Track successful interaction
    tracker.trackInteraction(sessionId, {
      query,
      intent: result.intent,
      capability: result.capability,
      confidence: result.confidence,
      success: true,
      responseTime
    });

    res.json(result);
  } catch (error) {
    // Track error
    tracker.trackError(sessionId, error, { query });
    res.status(500).json({ error: error.message });
  }
}
```

---

## Installation

### Prerequisites

- Node.js 14+ (recommended Node.js 18+)
- Google Cloud Functions deployment environment
- Existing OmniClaw 1.0 infrastructure (for migration)

### Install Dependencies

```bash
cd /path/to/cloud-functions/deploy
npm install
```

No additional dependencies required - OmniClaw 2.0 uses existing dependencies.

### File Structure

```
deploy/
├── integration/
│   ├── omniclaw_integration.js    # Main integration class
│   ├── usage_examples.js           # Usage examples
│   └── sprint3_examples.js         # Sprint 3 examples
├── core/
│   ├── smart_router.js             # AI-powered routing
│   ├── transparency_layer.js       # Confidence indicators
│   ├── smart_defaults.js           # Intelligent defaults
│   ├── progressive_disclosure.js   # Feature discovery
│   └── context_aware_simplifier.js # Platform optimization
├── analytics/
│   ├── analytics_tracker.js        # Metrics tracking
│   ├── feature_flags.js            # A/B testing
│   └── metrics_collector.js        # Metrics collection
└── shared/
    └── responses/
        ├── unified_response.js     # Response formatting
        └── platform_adapters.js    # Platform adapters
```

---

## Basic Integration

### Step 1: Import Required Modules

```javascript
const OmniClawIntegration = require('./integration/omniclaw_integration');
const FeatureFlags = require('./analytics/feature_flags');
const AnalyticsTracker = require('./analytics/analytics_tracker');
```

### Step 2: Initialize Components

```javascript
// Initialize feature flags
const featureFlags = new FeatureFlags();

// Initialize analytics tracker
const analyticsTracker = new AnalyticsTracker();

// Initialize OmniClaw integration
const omniclaw = new OmniClawIntegration();
```

### Step 3: Create Request Handler

```javascript
/**
 * Main request handler for Cloud Functions
 */
exports.omniclawHandler = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const { query, sessionId, userId, platform } = req.body;

    // Validate input
    if (!query || !sessionId) {
      res.status(400).json({ error: 'Missing required fields: query, sessionId' });
      return;
    }

    // Determine platform
    const detectedPlatform = platform || detectPlatform(req);

    // Check feature flags
    if (!featureFlags.isEnabled('simplified_ui', {
      userId,
      sessionId,
      platform: detectedPlatform
    })) {
      // Fall back to legacy UI
      return await handleLegacyRequest(req, res);
    }

    // Start analytics session
    analyticsTracker.startSession(sessionId, {
      userId,
      platform: detectedPlatform,
      abTestGroup: featureFlags.getABTestGroup('ui_simplification', userId)
    });

    // Process query
    const startTime = Date.now();
    const result = await omniclaw.processQuery(query, {
      platform: detectedPlatform,
      sessionId
    });
    const responseTime = Date.now() - startTime;

    // Track interaction
    analyticsTracker.trackInteraction(sessionId, {
      query,
      intent: result.intent || 'unknown',
      capability: result.capability || 'unknown',
      confidence: result.confidence || 0.5,
      success: !result.error,
      responseTime,
      requiredConfirmation: result.requiresConfirmation || false,
      defaultApplied: result.defaultsApplied ? result.defaultsApplied.length > 0 : false
    });

    // Send response
    res.json(result);

  } catch (error) {
    console.error('[OmniClaw] Error:', error);

    // Track error
    if (req.body && req.body.sessionId) {
      analyticsTracker.trackError(req.body.sessionId, error, {
        query: req.body.query
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * Detect platform from request
 */
function detectPlatform(req) {
  const userAgent = req.headers['user-agent'] || '';

  if (userAgent.includes('Alexa')) return 'alexa';
  if (userAgent.includes('WhatsApp')) return 'whatsapp';
  return 'web';
}

/**
 * Legacy request handler (fallback)
 */
async function handleLegacyRequest(req, res) {
  // Your existing legacy UI logic here
  // ...
  res.json({ message: 'Legacy UI not implemented in this example' });
}
```

### Step 4: Deploy

```bash
# Deploy to Google Cloud Functions
gcloud functions deploy omniclawHandler \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated
```

---

## Migration from Legacy UI

Migrate from 19+ explicit intents to natural language interaction.

### Legacy UI Example (Before)

```javascript
// Legacy: User must know specific intent names
exports.alexaHandler = async (req, res) => {
  const { intentName, slots } = req.body.request.intent;

  switch (intentName) {
    case 'SpotifyIntent':
      return await handleSpotify(slots);
    case 'WikipediaIntent':
      return await handleWikipedia(slots);
    case 'KodiIntent':
      return await handleKodi(slots);
    case 'WhatsAppIntent':
      return await handleWhatsApp(slots);
    case 'NewsIntent':
      return await handleNews(slots);
    // ... 14+ more intents
    default:
      return { error: 'Unknown intent' };
  }
};
```

### Simplified UI Example (After)

```javascript
// Simplified: Natural language routing
exports.alexaHandler = async (req, res) => {
  const { query } = extractQuery(req);  // Extract natural language query

  const result = await omniclaw.processQuery(query, {
    platform: 'alexa',
    sessionId: getSessionId(req)
  });

  res.json(result);
};
```

### Migration Checklist

- [ ] Install OmniClaw 2.0 components
- [ ] Initialize feature flags (start at 10% rollout)
- [ ] Set up analytics tracking
- [ ] Update request handlers to use OmniClawIntegration
- [ ] Implement fallback to legacy UI
- [ ] Test with A/B test groups
- [ ] Monitor metrics dashboard
- [ ] Gradually increase rollout percentage
- [ ] Remove legacy UI after 100% rollout

### Gradual Migration Strategy

#### Phase 1: 10% Rollout (Week 1-2)

```javascript
// feature_flags.js configuration
flags.updateRolloutPercentage('simplified_ui', 10);
```

**Goals:**
- Verify basic functionality
- Catch critical bugs
- Establish baseline metrics

#### Phase 2: 25% Rollout (Week 3-4)

```javascript
flags.updateRolloutPercentage('simplified_ui', 25);
```

**Goals:**
- Monitor performance at scale
- Validate A/B test results
- Fix remaining issues

#### Phase 3: 50% Rollout (Week 5-6)

```javascript
flags.updateRolloutPercentage('simplified_ui', 50);
```

**Goals:**
- Half of users on new UI
- Compare satisfaction metrics
- Optimize based on feedback

#### Phase 4: 100% Rollout (Week 7+)

```javascript
flags.updateRolloutPercentage('simplified_ui', 100);
```

**Goals:**
- All users on new UI
- Deprecate legacy UI
- Remove old code paths

---

## Feature Flag Configuration

### Basic Configuration

```javascript
const FeatureFlags = require('./analytics/feature_flags');
const flags = new FeatureFlags();

// Enable feature for 10% of users
flags.enableFeature('simplified_ui', 10);

// Add specific users to whitelist (always enabled)
flags.addToWhitelist('simplified_ui', 'admin-user-id');
flags.addToWhitelist('simplified_ui', 'beta-tester-id');

// Add problematic users to blacklist (always disabled)
flags.addToBlacklist('simplified_ui', 'problem-user-id');
```

### Whitelist Testing

```javascript
// Whitelist internal team for testing
const teamMembers = ['user-1', 'user-2', 'user-3'];
teamMembers.forEach(userId => {
  flags.addToWhitelist('simplified_ui', userId);
  flags.addToWhitelist('smart_router', userId);
  flags.addToWhitelist('progressive_disclosure', userId);
});
```

### Platform-Specific Rollout

```javascript
// Enable only on specific platforms first
const flags = new FeatureFlags();

// Modify feature flag platforms (requires direct access)
flags.flags.simplified_ui.platforms = ['web'];  // Web only initially
flags.flags.smart_router.platforms = ['web'];
```

### Dependency Management

```javascript
// Features with dependencies automatically check dependencies
flags.flags.transparency_layer.dependencies = ['simplified_ui', 'smart_router'];

// If simplified_ui or smart_router is disabled, transparency_layer is also disabled
```

### A/B Test Configuration

```javascript
// Configure A/B test
const flags = new FeatureFlags();

// Access A/B test configuration
flags.abTests.ui_simplification.splitPercentage = 50;  // 50/50 split
flags.abTests.ui_simplification.targetSampleSize = 100;  // Minimum sessions per group
```

---

## Analytics Setup

### Initialize Analytics Tracker

```javascript
const AnalyticsTracker = require('./analytics/analytics_tracker');
const tracker = new AnalyticsTracker();

// Start session
tracker.startSession(sessionId, {
  userId: 'user-123',
  platform: 'alexa',
  abTestGroup: 'simplified_ui'
});
```

### Track Interactions

```javascript
// Track successful interaction
tracker.trackInteraction(sessionId, {
  query: 'Play music',
  intent: 'SpotifyIntent',
  capability: 'music',
  confidence: 0.9,
  success: true,
  responseTime: 1250,
  requiredConfirmation: false,
  defaultApplied: true,
  clarificationNeeded: false,
  correction: false
});

// Track failed interaction
tracker.trackInteraction(sessionId, {
  query: 'Send message to mom',
  intent: 'WhatsAppIntent',
  capability: 'messages',
  confidence: 0.7,
  success: false,
  responseTime: 3400,
  requiredConfirmation: true,
  clarificationNeeded: false,
  correction: false
});
```

### Track Satisfaction

```javascript
// Track user satisfaction
tracker.trackSatisfaction(sessionId, 5, 'Worked perfectly!');
tracker.trackSatisfaction(sessionId, 3, 'A bit slow but okay');
tracker.trackSatisfaction(sessionId, 1, 'Did not understand me');
```

### Track Errors

```javascript
// Track errors
tracker.trackError(sessionId, new Error('SERVICE_UNAVAILABLE'), {
  query: 'Play music',
  intent: 'SpotifyIntent',
  confidence: 0.9
});
```

### End Session

```javascript
// End session and get metrics
const sessionMetrics = tracker.endSession(sessionId);

console.log('Session duration:', sessionMetrics.duration);
console.log('Task completion rate:', sessionMetrics.taskCompletionRate);
console.log('Features discovered:', sessionMetrics.featuresDiscovered);
```

### Get A/B Test Results

```javascript
// Get A/B test comparison
const results = tracker.getABTestResults();

console.log('Control group (Legacy UI):');
console.log('  Time to first action:', results.control.metrics.timeToFirstAction);
console.log('  Completion rate:', results.control.metrics.completionRate);
console.log('  Satisfaction:', results.control.metrics.satisfaction);

console.log('\nTreatment group (Simplified UI):');
console.log('  Time to first action:', results.treatment.metrics.timeToFirstAction);
console.log('  Completion rate:', results.treatment.metrics.completionRate);
console.log('  Satisfaction:', results.treatment.metrics.satisfaction);

console.log('\nImprovement:');
console.log('  Time to first action:', results.comparison.timeToFirstAction.improvement + '%');
console.log('  Completion rate:', results.comparison.completionRate.improvement);
console.log('  Satisfaction:', results.comparison.satisfaction.improvement);
```

### Dashboard Data

```javascript
// Get real-time dashboard data
const dashboard = tracker.getDashboardData();

console.log('Summary:', dashboard.summary);
console.log('Time to first action:', dashboard.timeToFirstAction);
console.log('User satisfaction:', dashboard.userSatisfaction);
console.log('Top capabilities:', dashboard.topCapabilities);
```

### Export Metrics

```javascript
// Export to JSON
const jsonMetrics = tracker.exportMetrics('json');
fs.writeFileSync('metrics.json', jsonMetrics);

// Export to CSV
const csvMetrics = tracker.exportMetrics('csv');
fs.writeFileSync('metrics.csv', csvMetrics);
```

---

## Platform-Specific Integration

### Alexa Integration

```javascript
/**
 * Alexa skill handler
 */
exports.alexaHandler = async (req, res) => {
  const { request } = req.body;
  const { intent, type } = request;

  // Handle launch request
  if (type === 'LaunchRequest') {
    const greeting = omniclaw.getContextualGreeting('alexa');
    return res.json(buildAlexaResponse(greeting.response.outputSpeech.text));
  }

  // Handle intent request
  if (type === 'IntentRequest') {
    const query = extractAlexaQuery(intent);
    const sessionId = req.body.session.sessionId;

    const result = await omniclaw.processQuery(query, {
      platform: 'alexa',
      sessionId
    });

    return res.json(buildAlexaResponse(result.response.outputSpeech.text));
  }

  // Handle session ended
  if (type === 'SessionEndedRequest') {
    analyticsTracker.endSession(req.body.session.sessionId);
    return res.json({});
  }
};

function extractAlexaQuery(intent) {
  // Extract natural language query from Alexa intent
  if (intent.name === 'AMAZON.FallbackIntent') {
    return intent.slots.Query?.value || 'Help';
  }

  // Extract query from custom intents
  return intent.slots.Query?.value || intent.name;
}

function buildAlexaResponse(text) {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: text
      },
      shouldEndSession: false
    }
  };
}
```

### WhatsApp Integration

```javascript
/**
 * WhatsApp webhook handler
 */
exports.whatsappHandler = async (req, res) => {
  const { From, Body } = req.body;

  // Generate session ID from phone number
  const sessionId = `whatsapp-${From}`;

  const result = await omniclaw.processQuery(Body, {
    platform: 'whatsapp',
    sessionId
  });

  // Extract response text
  const responseText = result.response.outputSpeech.text;

  // Send WhatsApp message
  await sendWhatsAppMessage(From, responseText);

  res.status(200).send('OK');
};

async function sendWhatsAppMessage(to, text) {
  // Your WhatsApp message sending logic
  // ...
}
```

### Web Integration

```javascript
/**
 * Web API handler
 */
exports.webHandler = async (req, res) => {
  const { query, sessionId } = req.body;

  const result = await omniclaw.processQuery(query, {
    platform: 'web',
    sessionId: sessionId || generateSessionId()
  });

  res.json({
    response: result.response.outputSpeech.text,
    transparency: result.transparency,
    suggestions: result.suggestions,
    requiresConfirmation: result.requiresConfirmation
  });
};

function generateSessionId() {
  return `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

---

## Testing

### Unit Tests

```javascript
const OmniClawIntegration = require('./integration/omniclaw_integration');

describe('OmniClawIntegration', () => {
  let integration;

  beforeEach(() => {
    integration = new OmniClawIntegration();
  });

  test('processQuery routes music correctly', async () => {
    const result = await integration.processQuery('Play jazz music', {
      platform: 'alexa',
      sessionId: 'test-session'
    });

    expect(result.intent).toBe('SpotifyIntent');
    expect(result.capability).toBe('music');
  });

  test('processQuery handles corrections', async () => {
    // First query
    await integration.processQuery('Play music', {
      platform: 'alexa',
      sessionId: 'test-session'
    });

    // Correction
    const result = await integration.processQuery('No, I meant play jazz', {
      platform: 'alexa',
      sessionId: 'test-session'
    });

    expect(result.capability).toBe('music');
    expect(result.slots.Track).toContain('jazz');
  });
});
```

### Integration Tests

```javascript
describe('OmniClawIntegration Integration', () => {
  test('end-to-end query flow', async () => {
    const integration = new OmniClawIntegration();

    const result = await integration.processQuery('Who is Albert Einstein?', {
      platform: 'alexa',
      sessionId: 'integration-test'
    });

    expect(result.response).toBeDefined();
    expect(result.response.outputSpeech).toBeDefined();
    expect(result.capability).toBe('answers');
  });
});
```

### A/B Test Validation

```javascript
describe('A/B Testing', () => {
  test('users assigned to correct groups', () => {
    const flags = new FeatureFlags();

    const group1 = flags.getABTestGroup('ui_simplification', 'user-1');
    const group2 = flags.getABTestGroup('ui_simplification', 'user-2');

    expect(['legacy_ui', 'simplified_ui']).toContain(group1);
    expect(['legacy_ui', 'simplified_ui']).toContain(group2);
  });

  test('consistent group assignment', () => {
    const flags = new FeatureFlags();

    const group1 = flags.getABTestGroup('ui_simplification', 'user-1');
    const group2 = flags.getABTestGroup('ui_simplification', 'user-1');

    expect(group1).toBe(group2);
  });
});
```

### Load Testing

```bash
# Install autocannon
npm install -g autocannon

# Run load test
autocannon -c 100 -d 30 https://your-cloud-function-url/omniclawHandler
```

---

## Deployment

### Google Cloud Functions Deployment

```bash
# Deploy individual function
gcloud functions deploy omniclawHandler \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --memory 512MB \
  --timeout 60s \
  --max-instances 100

# Deploy with environment variables
gcloud functions deploy omniclawHandler \
  --runtime nodejs18 \
  --trigger-http \
  --set-env-vars NODE_ENV=production,LOG_LEVEL=info
```

### Environment Variables

```javascript
// In your Cloud Function
process.env.GCP_PROJECT_ID = 'your-project-id';
process.env.FIREBASE_COLLECTION = 'analytics';
process.env.FEATURE_FLAGS_CONFIG = 'production';
```

### Monitoring Setup

```bash
# Enable Cloud Monitoring
gcloud services enable cloudmonitoring.googleapis.com

# Create log-based metric
gcloud logging metrics create omniclaw_errors \
  --log-filter='resource.type="cloud_function" AND severity>=ERROR'

# Create alert policy
gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml
```

### CI/CD Pipeline

```yaml
# cloudbuild.yaml
steps:
  - name: 'node:18'
    entrypoint: 'npm'
    args: ['install']

  - name: 'node:18'
    entrypoint: 'npm'
    args: ['test']

  - name: 'node:18'
    entrypoint: 'npm'
    args: ['run', 'deploy']

  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'functions'
      - 'deploy'
      - 'omniclawHandler'
      - '--region=us-central1'
```

---

## Best Practices

### 1. Always Use Feature Flags

```javascript
// Good: Check feature flag before using new UI
if (flags.isEnabled('simplified_ui', context)) {
  return await omniclaw.processQuery(query, options);
}

// Bad: Always use new UI
return await omniclaw.processQuery(query, options);
```

### 2. Track Everything

```javascript
// Good: Track all interactions
tracker.trackInteraction(sessionId, {
  query, intent, capability, confidence, success, responseTime,
  requiredConfirmation, defaultApplied, clarificationNeeded, correction
});

// Bad: Don't track interactions
```

### 3. Handle Errors Gracefully

```javascript
// Good: Try-catch with error tracking
try {
  const result = await omniclaw.processQuery(query, options);
  return result;
} catch (error) {
  tracker.trackError(sessionId, error, { query });
  return { error: 'Something went wrong' };
}

// Bad: Let errors propagate
return await omniclaw.processQuery(query, options);
```

### 4. Provide Fallback

```javascript
// Good: Fallback to legacy UI
if (!flags.isEnabled('simplified_ui', context)) {
  return await handleLegacyRequest(req, res);
}

// Bad: No fallback
```

### 5. Monitor Metrics

```javascript
// Good: Regular dashboard checks
setInterval(() => {
  const dashboard = tracker.getDashboardData();
  console.log('Completion rate:', dashboard.summary.overallCompletionRate);
  console.log('Satisfaction:', dashboard.userSatisfaction.average);

  // Alert if metrics drop
  if (dashboard.summary.overallCompletionRate < 0.8) {
    sendAlert('Completion rate below 80%');
  }
}, 60000);  // Every minute

// Bad: Don't monitor metrics
```

---

## Troubleshooting

### Feature Flags Not Working

**Problem:** Feature always disabled even when enabled.

**Solution:**
```javascript
// Check feature flag configuration
console.log(flags.getAllFlags());

// Verify user context
console.log('Context:', { userId, sessionId, platform });

// Check for blacklist/whitelist conflicts
flags.removeFromBlacklist('simplified_ui', userId);
```

### Analytics Not Tracking

**Problem:** No data appearing in analytics dashboard.

**Solution:**
```javascript
// Ensure session started
tracker.startSession(sessionId, { userId, platform });

// Check tracking calls
console.log('Tracking interaction:', { query, success, responseTime });

// Verify session ended
const metrics = tracker.endSession(sessionId);
console.log('Session metrics:', metrics);
```

### Poor Routing Accuracy

**Problem:** Smart router routing to wrong capabilities.

**Solution:**
```javascript
// Check routing confidence
const result = await omniclaw.processQuery(query, options);
console.log('Routing confidence:', result.confidence);
console.log('Capability:', result.capability);

// If confidence low, transparency layer will request confirmation
if (result.requiresConfirmation) {
  console.log('Confirmation required:', result.confirmation);
}
```

### High Response Times

**Problem:** Queries taking too long.

**Solution:**
```javascript
// Track response times
const startTime = Date.now();
const result = await omniclaw.processQuery(query, options);
const responseTime = Date.now() - startTime;

console.log('Response time:', responseTime);

// If > 5s, investigate
if (responseTime > 5000) {
  console.warn('Slow response:', { query, responseTime });
}
```

---

## Support

For additional help:
- API Reference: [API_REFERENCE.md](API_REFERENCE.md)
- Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Operations: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)
- User Guide: [USER_GUIDE.md](USER_GUIDE.md)
