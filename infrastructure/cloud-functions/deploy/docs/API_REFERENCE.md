# OmniClaw 2.0 API Reference

Complete API documentation for all OmniClaw 2.0 classes and methods.

## Table of Contents

- [OmniClawIntegration](#omniclawintegration)
- [SmartRouter](#smartrouter)
- [TransparencyLayer](#transparencylayer)
- [SmartDefaults](#smartdefaults)
- [ProgressiveDisclosure](#progressivedisclosure)
- [AnalyticsTracker](#analyticstracker)
- [FeatureFlags](#featureflags)

---

## OmniClawIntegration

Main entry point for OmniClaw 2.0 simplified UI. Replaces complex intent routing with natural language understanding.

### Constructor

```javascript
const integration = new OmniClawIntegration();
```

Creates a new OmniClawIntegration instance with all core components initialized.

### Methods

#### processQuery(query, options)

Main entry point for all user queries.

**Parameters:**
- `query` (string): User's natural language query
- `options` (Object): Optional configuration
  - `platform` (string): Platform identifier (`'alexa'`, `'whatsapp'`, `'web'`). Default: `'alexa'`
  - `sessionId` (string): Unique session identifier. Default: `'default'`

**Returns:** Promise<Object> - Formatted response for the platform

**Example:**
```javascript
const result = await integration.processQuery('Play my road trip playlist', {
  platform: 'alexa',
  sessionId: 'user-123-session-456'
});

// Response structure:
{
  response: {
    outputSpeech: { type: 'PlainText', text: '...' },
    shouldEndSession: false
  },
  requiresConfirmation: false,
  transparency: { ... }
}
```

**Process Flow:**
1. Gets or creates user context
2. Simplifies query based on time and platform
3. Routes to appropriate capability
4. Applies transparency layer
5. Checks for corrections
6. Applies smart defaults
7. Executes intent
8. Builds unified response
9. Adds progressive disclosure hints
10. Updates user context
11. Learns from behavior

---

#### getContextualGreeting(platform)

Get contextual greeting for new session.

**Parameters:**
- `platform` (string): Platform identifier

**Returns:** Object with greeting response

**Example:**
```javascript
const greeting = integration.getContextualGreeting('alexa');
// Returns greeting based on time of day + capabilities overview
```

---

#### getDiscoveryResponse(platform, userContext)

Get "What can you do?" discovery response.

**Parameters:**
- `platform` (string): Platform identifier
- `userContext` (Object): User interaction context

**Returns:** Object with discovery information and examples

**Example:**
```javascript
const discovery = integration.getDiscoveryResponse('alexa', {
  interactionCount: 2,
  recentCapabilities: ['music']
});
```

---

#### handleConfirmation(sessionId, confirmed, confirmationData)

Handle user confirmation for actions requiring approval.

**Parameters:**
- `sessionId` (string): Session identifier
- `confirmed` (boolean): Whether user confirmed the action
- `confirmationData` (Object): Original confirmation request data

**Returns:** Promise<Object> - Response after confirmation handling

**Example:**
```javascript
const result = await integration.handleConfirmation(
  'user-123-session-456',
  true,
  { intent: 'SendWhatsAppIntent', slots: { ... } }
);
```

---

#### getSessionStats(sessionId)

Get session statistics for analytics.

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** Object with session metrics or null

**Example:**
```javascript
const stats = integration.getSessionStats('user-123-session-456');
// Returns: { sessionId, platform, interactionCount, sessionDuration, ... }
```

---

#### cleanupOldSessions(maxAge)

Clean up old sessions (maintenance operation).

**Parameters:**
- `maxAge` (number): Maximum session age in milliseconds. Default: 86400000 (24 hours)

**Returns:** number - Count of sessions cleaned up

**Example:**
```javascript
const cleaned = integration.cleanupOldSessions(3600000); // Clean 1 hour+ old sessions
console.log(`Cleaned ${cleaned} sessions`);
```

---

## SmartRouter

AI-powered intent routing that eliminates the need for users to know specific intent names.

### Constructor

```javascript
const router = new SmartRouter();
```

### Methods

#### route(query, context)

Route natural language query to appropriate capability.

**Parameters:**
- `query` (string): User's natural language query
- `context` (Object): User context
  - `platform` (string): Platform identifier
  - `sessionId` (string): Session identifier
  - `userContext` (Object): User interaction history

**Returns:** Promise<Object> - Routing result

**Example:**
```javascript
const result = await router.route('Play jazz music', {
  platform: 'alexa',
  sessionId: 'session-123',
  userContext: { interactionCount: 5 }
});

// Returns:
{
  intent: 'SpotifyIntent',
  confidence: 0.8,
  capability: 'music',
  slots: { Track: { value: 'jazz music' } },
  directAnswer: 'I'll help you play music on Spotify.',
  suggestions: ['Pause the music', 'Skip this song', 'Volume up']
}
```

**Routing Logic:**
1. Checks for translation patterns (high confidence: 0.95)
2. Searches for keyword matches in capabilities
3. Falls back to AI understanding for unclear queries

---

#### getCoreCapabilities()

Get "Core 5" capabilities for new users.

**Returns:** Array<Object> - Core capabilities with descriptions and examples

**Example:**
```javascript
const core = router.getCoreCapabilities();
// Returns:
[
  { name: 'music', description: 'play music on Spotify', example: 'Play my road trip playlist' },
  { name: 'answers', description: 'get answers from Wikipedia', example: 'Who is Albert Einstein?' },
  ...
]
```

---

#### getCapabilitiesForUser(userContext)

Get capabilities based on user experience level.

**Parameters:**
- `userContext` (Object): User interaction context
  - `interactionCount` (number): Number of interactions
  - `lastCapabilities` (Array): Recently used capabilities

**Returns:** Object with appropriate capabilities and message

**Example:**
```javascript
const capabilities = router.getCapabilitiesForUser({
  interactionCount: 10,
  lastCapabilities: ['music', 'tv']
});
// Returns all capabilities for experienced users
```

---

## TransparencyLayer

Makes AI behavior visible and explainable through confidence indicators and confirmations.

### Constructor

```javascript
const transparency = new TransparencyLayer();
```

### Methods

#### enhanceRoutingResult(routingResult, query)

Add transparency information to routing result.

**Parameters:**
- `routingResult` (Object): Result from SmartRouter
- `query` (string): Original user query

**Returns:** Object - Enhanced routing result with transparency info

**Example:**
```javascript
const enhanced = transparency.enhanceRoutingResult(routingResult, 'Play music');

// Returns:
{
  ...routingResult,
  confidenceLevel: 'high',  // 'high' | 'medium' | 'low'
  explanation: 'I chose music control because you mentioned "play"',
  requiresConfirmation: false,
  confidencePercent: 85
}
```

**Confidence Thresholds:**
- High: ≥0.9 (direct action, no confirmation needed)
- Medium: 0.5-0.9 (confirm before action)
- Low: <0.5 (ask for clarification)

---

#### buildConfirmation(routingResult, context)

Build confirmation message for actions requiring user approval.

**Parameters:**
- `routingResult` (Object): Enhanced routing result
- `context` (Object): User context
  - `platform` (string): Platform identifier

**Returns:** Object - Confirmation request formatted for platform

**Example:**
```javascript
const confirmation = transparency.buildConfirmation(routingResult, {
  platform: 'alexa'
});

// Returns:
{
  type: 'confirmation',
  message: "I'm 80% sure you want to send a message. Should I go ahead?",
  action: 'WhatsAppIntent',
  slots: { ... },
  confidence: 0.8,
  explanation: '...'
}
```

---

#### explainFailure(error, context)

Generate human-readable failure explanation.

**Parameters:**
- `error` (Error): Error that occurred
- `context` (Object): Execution context
  - `intent` (string): Intent being executed
  - `capability` (string): Capability being used

**Returns:** string - Human-readable explanation

**Example:**
```javascript
const explanation = transparency.explainFailure(
  new Error('SERVICE_UNAVAILABLE'),
  { intent: 'SpotifyIntent', capability: 'music' }
);
// Returns: "I couldn't reach music. It might be temporarily down. (while trying to SpotifyIntent)"
```

**Error Types:**
- `SERVICE_UNAVAILABLE`: Service temporarily down
- `NOT_FOUND`: Couldn't find requested content
- `PERMISSION_DENIED`: Insufficient permissions
- `RATE_LIMITED`: Too many requests
- `INVALID_INPUT`: Didn't understand part of request
- `TIMEOUT`: Request took too long
- `UNKNOWN`: Generic error

---

#### formatTransparencyForPlatform(routingResult, platform)

Format transparency information for specific platform.

**Parameters:**
- `routingResult` (Object): Enhanced routing result
- `platform` (string): Platform identifier

**Returns:** Object - Platform-specific transparency info

**Example:**
```javascript
const info = transparency.formatTransparencyForPlatform(routingResult, 'whatsapp');

// Returns:
{
  text: '📊 **Confidence:** 85%\n💡 I chose music control because you mentioned "play"'
}
```

---

## SmartDefaults

Reduces cognitive load through intelligent defaults and auto-detection.

### Constructor

```javascript
const defaults = new SmartDefaults();
```

### Methods

#### applyDefaults(routingResult, context)

Apply smart defaults to routing result.

**Parameters:**
- `routingResult` (Object): Result from SmartRouter
- `context` (Object): User context
  - `recentCapabilities` (Array): Recently used capabilities
  - `lastQuery` (string): Last query
  - `originalQuery` (string): Current query

**Returns:** Object - Enhanced routing result with defaults applied

**Example:**
```javascript
const enhanced = defaults.applyDefaults(routingResult, {
  recentCapabilities: ['music'],
  lastQuery: 'jazz playlist',
  originalQuery: 'play music'
});

// Returns routing result with smart defaults applied:
// - If no track specified, resumes last played
// - If no device specified, uses last device
// - Auto-detects service from keywords
```

**Default Preferences:**
- **Music**: Resume last played, road trip playlist, last device, 50% volume
- **TV**: Resume last watched, Seren addon, search library first
- **Answers**: Wikipedia source, web search fallback, brief detail
- **News**: Top headlines, general category, 5 headlines
- **Messages**: WhatsApp platform, send read receipts

---

#### detectCorrection(query, context)

Check if user is correcting previous action.

**Parameters:**
- `query` (string): Current query
- `context` (Object): User context
  - `lastAction` (string): Last executed action

**Returns:** Object|null - Correction info or null

**Example:**
```javascript
const correction = defaults.detectCorrection('No, I meant play jazz', {
  lastAction: 'SpotifyIntent'
});

// Returns:
{
  type: 'correction',
  originalAction: 'SpotifyIntent',
  intended: 'play jazz',
  clarification: 'User corrected previous action'
}
```

**Correction Patterns:**
- "No, I meant X"
- "That's not right"
- "Wrong"
- "Not what I meant"
- "Actually"
- "Wait"

---

#### handleCorrection(correction, context)

Handle "No, I meant" correction.

**Parameters:**
- `correction` (Object): Correction info from detectCorrection()
- `context` (Object): User context

**Returns:** Object - New routing result or clarification request

**Example:**
```javascript
const result = defaults.handleCorrection(correction, userContext);

// Returns:
{
  type: 'correction',
  newQuery: 'play jazz',
  clarification: 'User corrected previous action',
  shouldRetry: true
}
```

---

#### learnFromBehavior(capability, slots, context)

Learn from user behavior and update defaults.

**Parameters:**
- `capability` (string): Capability being used
- `slots` (Object): Slots user provided
- `context` (Object): User context with usage stats

**Returns:** Object - Updated defaults and usage stats

**Example:**
```javascript
const learning = defaults.learnFromBehavior('music', {
  Track: { value: 'jazz' },
  Device: { value: 'living-room' }
}, userContext);

// Returns:
{
  defaultsUpdated: {
    preferredContent: 'jazz',
    preferredDevice: 'living-room'
  },
  usageStats: {
    music: { Track: 5, Device: 3 }
  }
}
```

---

#### generateDefaultSuggestion(routingResult, platform)

Generate suggestion after applying defaults.

**Parameters:**
- `routingResult` (Object): Result with defaults applied
- `platform` (string): Platform identifier

**Returns:** string|null - Suggestion message

**Example:**
```javascript
const suggestion = defaults.generateDefaultSuggestion(routingResult, 'alexa');
// Returns: "I'll pick up where we left off."
```

---

#### eliminateChoice(options, capability, context)

Eliminate unnecessary choices by auto-selecting best option.

**Parameters:**
- `options` (Array): Available options
- `capability` (string): Current capability
- `context` (Object): User context with preferences

**Returns:*|null - Best option or null if can't decide

**Example:**
```javascript
const best = defaults.eliminateChoice(
  ['spotify', 'kodi', 'youtube'],
  'music',
  { userPreferences: { music: 'spotify' } }
);
// Returns: 'spotify'
```

---

## ProgressiveDisclosure

Natural feature discovery through conversation rather than overwhelming menus.

### Constructor

```javascript
const disclosure = new ProgressiveDisclosure();
```

### Methods

#### getHint(capability, context)

Get hint to show after successful action.

**Parameters:**
- `capability` (string): Capability that was just used
- `context` (Object): User context
  - `interactionCount` (number): Number of interactions
  - `lastHintTime` (number): Timestamp of last hint

**Returns:** Object|null - Hint with text and timing

**Example:**
```javascript
const hint = disclosure.getHint('music', {
  interactionCount: 2,
  lastHintTime: Date.now() - 120000
});

// Returns:
{
  text: 'I can also pause, skip, or adjust volume.',
  priority: 'normal',
  timing: 'after-success'
}
```

**Hint Frequency:**
- First 5 interactions: Show hints generously
- After 5 interactions: 20% chance to show hints
- Respects priority (high > normal > low)

---

#### getRelatedCapabilities(currentCapability)

Get related capability suggestions.

**Parameters:**
- `currentCapability` (string): Capability just used

**Returns:** Array<Object> - Related capabilities with suggestions

**Example:**
```javascript
const related = disclosure.getRelatedCapabilities('music');

// Returns:
[
  {
    capability: 'tv',
    suggestion: 'I can also control your TV.',
    callToAction: 'Want me to control your TV?'
  },
  {
    capability: 'news',
    suggestion: 'I can also get the latest news.',
    callToAction: 'Want me to get the latest news?'
  }
]
```

**Capability Relationships:**
- Music → TV, News
- TV → Music, News
- Answers → News, Arxiv
- Messages → Answers
- News → Answers, Twitter

---

#### getDiscoveryResponse(context)

Get "What can you do?" response.

**Parameters:**
- `context` (Object): User context
  - `interactionCount` (number): Number of interactions
  - `platform` (string): Platform identifier

**Returns:** Object - Discovery response with examples

**Example:**
```javascript
const discovery = disclosure.getDiscoveryResponse({
  interactionCount: 2,
  platform: 'alexa'
});

// Returns:
{
  brief: true,
  message: 'I can help you with 5 main things...',
  examples: [
    'Play my road trip playlist',
    'Who is Albert Einstein?',
    ...
  ],
  followUp: 'What would you like to do?'
}
```

---

#### getTimeBasedSuggestion(currentTime)

Generate contextual suggestion based on time.

**Parameters:**
- `currentTime` (Date): Current time

**Returns:** Object - Time-based suggestion

**Example:**
```javascript
const suggestion = disclosure.getTimeBasedSuggestion(new Date());

// Returns (if evening):
{
  text: 'Good evening! Want me to play something or put on a show?',
  capability: 'music',
  priority: 'high'
}
```

**Time-Based Suggestions:**
- Morning (6-11): News and updates
- Afternoon (11-17): Information or entertainment
- Evening (17-22): Entertainment focus
- Late night (22-6): Simple controls

---

#### formatHintForPlatform(hint, platform)

Format hint for specific platform.

**Parameters:**
- `hint` (Object): Hint object with text and metadata
- `platform` (string): Platform identifier

**Returns:** string|Object - Formatted hint

**Example:**
```javascript
const formatted = disclosure.formatHintForPlatform(hint, 'whatsapp');
// Returns: '💡 I can also pause, skip, or adjust volume.'
```

**Platform Formatting:**
- Alexa: Brief, truncate if >100 chars
- WhatsApp: Text with emoji prefix
- Web: Rich object with priority and action

---

#### shouldShowHint(hint, context)

Check if hint should be shown now.

**Parameters:**
- `hint` (Object): Hint object
- `context` (Object): User context

**Returns:** boolean - Whether to show hint

**Example:**
```javascript
const show = disclosure.shouldShowHint(hint, {
  interactionCount: 2,
  lastHintShown: Date.now() - 30000
});
// Returns: false (too soon since last hint for new user)
```

---

## AnalyticsTracker

Measure UI/UX improvement success through key metrics.

### Constructor

```javascript
const tracker = new AnalyticsTracker();
```

### Methods

#### startSession(sessionId, options)

Start tracking a new user session.

**Parameters:**
- `sessionId` (string): Unique session identifier
- `options` (Object): Session options
  - `abTestGroup` (string): A/B test group (auto-assigned if not provided)
  - `platform` (string): Platform identifier. Default: `'alexa'`
  - `userId` (string): User identifier

**Returns:** void

**Example:**
```javascript
tracker.startSession('session-123', {
  platform: 'alexa',
  userId: 'user-456'
});
```

---

#### trackInteraction(sessionId, interaction)

Track an interaction (query + response).

**Parameters:**
- `sessionId` (string): Session identifier
- `interaction` (Object): Interaction data
  - `query` (string): User query
  - `intent` (string): Routed intent
  - `capability` (string): Capability used
  - `confidence` (number): Routing confidence (0-1)
  - `success` (boolean): Whether interaction succeeded
  - `responseTime` (number): Response time in milliseconds
  - `requiredConfirmation` (boolean): Whether confirmation was required
  - `defaultApplied` (boolean): Whether defaults were applied
  - `clarificationNeeded` (boolean): Whether clarification was needed
  - `correction` (boolean): Whether user corrected

**Returns:** void

**Example:**
```javascript
tracker.trackInteraction('session-123', {
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
```

---

#### trackSatisfaction(sessionId, rating, comment)

Track user satisfaction rating.

**Parameters:**
- `sessionId` (string): Session identifier
- `rating` (number): Satisfaction rating (1-5)
- `comment` (string): Optional user comment

**Returns:** void

**Example:**
```javascript
tracker.trackSatisfaction('session-123', 5, 'Worked perfectly!');
```

---

#### trackError(sessionId, error, context)

Track error or failure.

**Parameters:**
- `sessionId` (string): Session identifier
- `error` (Error|string): Error object or message
- `context` (Object): Error context
  - `query` (string): Query that caused error
  - `intent` (string): Intent being executed
  - `confidence` (number): Routing confidence

**Returns:** void

**Example:**
```javascript
tracker.trackError('session-123', new Error('SERVICE_UNAVAILABLE'), {
  query: 'Play music',
  intent: 'SpotifyIntent',
  confidence: 0.9
});
```

---

#### endSession(sessionId)

End a session and calculate final metrics.

**Parameters:**
- `sessionId` (string): Session identifier

**Returns:** Object - Final session metrics

**Example:**
```javascript
const metrics = tracker.endSession('session-123');

// Returns:
{
  sessionId: 'session-123',
  duration: 345000,  // 5.75 minutes
  timeToFirstAction: 8500,  // 8.5 seconds
  interactionCount: 7,
  tasksCompleted: 6,
  tasksFailed: 1,
  taskCompletionRate: 0.857,  // 85.7%
  featuresDiscovered: ['music', 'tv', 'answers'],
  featureDiscoveryCount: 3,
  averageSatisfaction: 4.5,
  errorCount: 1
}
```

---

#### getABTestResults()

Get A/B test results comparing control vs treatment.

**Returns:** Object - A/B test comparison data

**Example:**
```javascript
const results = tracker.getABTestResults();

// Returns:
{
  control: {
    name: 'Legacy UI',
    sessions: 45,
    metrics: {
      timeToFirstAction: 28500,
      completionRate: 0.62,
      satisfaction: 3.4,
      featureDiscovery: 2.8
    }
  },
  treatment: {
    name: 'Simplified UI',
    sessions: 52,
    metrics: {
      timeToFirstAction: 9200,
      completionRate: 0.89,
      satisfaction: 4.6,
      featureDiscovery: 5.4
    }
  },
  comparison: {
    timeToFirstAction: {
      control: 28500,
      treatment: 9200,
      improvement: 67.7,  // 67.7% reduction
      target: 66.67
    },
    completionRate: {
      control: 0.62,
      treatment: 0.89,
      improvement: 0.27,
      target: 0.30
    },
    ...
  }
}
```

---

#### getDashboardData()

Get real-time metrics dashboard data.

**Returns:** Object - Current metrics snapshot

**Example:**
```javascript
const dashboard = tracker.getDashboardData();

// Returns:
{
  summary: {
    totalSessions: 97,
    totalInteractions: 642,
    successfulActions: 578,
    failedActions: 64,
    overallCompletionRate: 0.90
  },
  timeToFirstAction: {
    average: 9800,
    median: 8500,
    p95: 18500,
    target: 10000,
    targetMet: true
  },
  userSatisfaction: {
    average: 4.6,
    median: 5.0,
    target: 4.5,
    targetMet: true
  },
  topCapabilities: [
    { capability: 'music', count: 234 },
    { capability: 'answers', count: 156 },
    ...
  ]
}
```

---

#### exportMetrics(format)

Export metrics for analysis.

**Parameters:**
- `format` (string): Export format (`'json'` or `'csv'`). Default: `'json'`

**Returns:** string - Exported data

**Example:**
```javascript
const jsonData = tracker.exportMetrics('json');
const csvData = tracker.exportMetrics('csv');
```

---

## FeatureFlags

Gradual rollout and A/B testing for safe feature deployment.

### Constructor

```javascript
const flags = new FeatureFlags();
```

### Methods

#### isEnabled(featureName, context)

Check if a feature is enabled for a specific user/session.

**Parameters:**
- `featureName` (string): Feature flag name
- `context` (Object): User context
  - `userId` (string): User identifier
  - `platform` (string): Platform identifier
  - `sessionId` (string): Session identifier

**Returns:** boolean - Whether feature is enabled

**Example:**
```javascript
const enabled = flags.isEnabled('simplified_ui', {
  userId: 'user-123',
  platform: 'alexa',
  sessionId: 'session-456'
});
```

**Feature Flag Logic:**
1. Check if feature exists
2. Check if feature is enabled
3. Check whitelist (always enable)
4. Check blacklist (always disable)
5. Check platform support
6. Check dependencies
7. Check rollout percentage

**Available Features:**
- `simplified_ui`: New simplified UI with natural language routing
- `smart_router`: AI-powered smart routing eliminating intent names
- `progressive_disclosure`: Progressive feature discovery
- `transparency_layer`: Confidence indicators and explainable decisions
- `smart_defaults`: Intelligent defaults and auto-detection
- `context_aware`: Time-based and platform-based optimization

---

#### getABTestGroup(testName, userId)

Get A/B test group assignment for a user.

**Parameters:**
- `testName` (string): A/B test name
- `userId` (string): User identifier

**Returns:** string|null - Test group name

**Example:**
```javascript
const group = flags.getABTestGroup('ui_simplification', 'user-123');
// Returns: 'legacy_ui' or 'simplified_ui'
```

**A/B Tests:**
- `ui_simplification`: Compare legacy 19+ intent UI vs simplified natural language UI
  - Control: `legacy_ui`
  - Treatment: `simplified_ui`
  - Split: 50/50
  - Metrics: timeToFirstAction, completionRate, satisfaction, featureDiscovery

---

#### enableFeature(featureName, rolloutPercentage)

Enable a feature (instant rollout).

**Parameters:**
- `featureName` (string): Feature flag name
- `rolloutPercentage` (number): Rollout percentage (0-100). Default: 100

**Returns:** void

**Example:**
```javascript
flags.enableFeature('simplified_ui', 100);  // Full rollout
flags.enableFeature('smart_router', 25);    // 25% rollout
```

---

#### disableFeature(featureName)

Disable a feature (instant rollback).

**Parameters:**
- `featureName` (string): Feature flag name

**Returns:** void

**Example:**
```javascript
flags.disableFeature('simplified_ui');  // Instant rollback
```

---

#### updateRolloutPercentage(featureName, percentage)

Update rollout percentage for gradual rollout.

**Parameters:**
- `featureName` (string): Feature flag name
- `percentage` (number): New rollout percentage (0-100)

**Returns:** void

**Example:**
```javascript
// Gradual rollout: 10% → 25% → 50% → 100%
flags.updateRolloutPercentage('simplified_ui', 10);
// After monitoring...
flags.updateRolloutPercentage('simplified_ui', 25);
// After monitoring...
flags.updateRolloutPercentage('simplified_ui', 50);
// After monitoring...
flags.updateRolloutPercentage('simplified_ui', 100);
```

---

#### addToWhitelist(featureName, userId)

Add user to whitelist (always enable for this user).

**Parameters:**
- `featureName` (string): Feature flag name
- `userId` (string): User identifier

**Returns:** void

**Example:**
```javascript
flags.addToWhitelist('simplified_ui', 'admin-user');
flags.addToWhitelist('simplified_ui', 'beta-tester-123');
```

---

#### removeFromWhitelist(featureName, userId)

Remove user from whitelist.

**Parameters:**
- `featureName` (string): Feature flag name
- `userId` (string): User identifier

**Returns:** void

**Example:**
```javascript
flags.removeFromWhitelist('simplified_ui', 'beta-tester-123');
```

---

#### getAllFlags()

Get current status of all feature flags.

**Returns:** Object - Feature flag status

**Example:**
```javascript
const status = flags.getAllFlags();

// Returns:
{
  simplified_ui: {
    enabled: true,
    rolloutPercentage: 10,
    whitelistCount: 2,
    blacklistCount: 0,
    platforms: ['alexa', 'whatsapp', 'web'],
    description: 'New simplified UI with natural language routing'
  },
  smart_router: {
    enabled: true,
    rolloutPercentage: 10,
    whitelistCount: 0,
    blacklistCount: 0,
    platforms: ['alexa', 'whatsapp', 'web'],
    description: 'AI-powered smart routing eliminating intent names'
  },
  ...
}
```

---

#### getABTestStatus()

Get A/B test status.

**Returns:** Object - A/B test status

**Example:**
```javascript
const status = flags.getABTestStatus();

// Returns:
{
  ui_simplification: {
    enabled: true,
    controlGroup: 'legacy_ui',
    treatmentGroup: 'simplified_ui',
    controlAssignments: 48,
    treatmentAssignments: 52,
    totalAssignments: 100,
    targetSampleSize: 100,
    sufficientData: true,
    startDate: '2026-04-15T00:00:00.000Z',
    endDate: null,
    metrics: ['timeToFirstAction', 'completionRate', 'satisfaction', 'featureDiscovery']
  }
}
```

---

#### exportConfiguration()

Export feature flag configuration.

**Returns:** Object - Current configuration

**Example:**
```javascript
const config = flags.exportConfiguration();

// Returns:
{
  flags: { ... },
  abTests: { ... },
  userAssignments: [['user-123', { ... }], ...]
}
```

---

#### importConfiguration(config)

Import feature flag configuration.

**Parameters:**
- `config` (Object): Configuration to import

**Returns:** void

**Example:**
```javascript
flags.importConfiguration({
  flags: { ... },
  abTests: { ... },
  userAssignments: [...]
});
```

---

## Error Handling

All methods follow consistent error handling patterns:

### Synchronous Methods
- Throw exceptions for invalid inputs
- Return null or empty values for missing data

### Asynchronous Methods
- Return rejected promises for errors
- Include error details in rejection

### Common Errors

**InvalidInputError**
```javascript
throw new Error('Invalid input: sessionId must be a string');
```

**FeatureNotFoundError**
```javascript
throw new Error('Unknown feature: non_existent_feature');
```

**SessionNotFoundError**
```javascript
console.warn('[Analytics] Unknown session: invalid-session-id');
return null;
```

---

## TypeScript Definitions

For TypeScript users, here are the key interfaces:

```typescript
interface OmniClawIntegrationOptions {
  platform?: 'alexa' | 'whatsapp' | 'web';
  sessionId?: string;
}

interface RoutingResult {
  intent: string;
  confidence: number;
  capability: string;
  slots: Record<string, any>;
  directAnswer?: string;
  suggestions?: string[];
  requiresConfirmation?: boolean;
}

interface UserContext {
  sessionId: string;
  platform: string;
  interactionCount: number;
  createdAt: number;
  lastInteractionTime: number;
  lastQuery?: string;
  lastCapability?: string;
  recentCapabilities: string[];
  userPreferences?: Record<string, any>;
}

interface AnalyticsInteraction {
  query: string;
  intent: string;
  capability: string;
  confidence: number;
  success: boolean;
  responseTime: number;
  requiredConfirmation?: boolean;
  defaultApplied?: boolean;
  clarificationNeeded?: boolean;
  correction?: boolean;
}
```

---

## Support

For questions or issues:
- Check the [Integration Guide](INTEGRATION_GUIDE.md)
- Review the [Architecture Documentation](ARCHITECTURE.md)
- See the [Operations Runbook](OPERATIONS_RUNBOOK.md)
