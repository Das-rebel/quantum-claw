/**
 * User Journey Tracker - Data Collection for Jony Ive UI/UX Validation
 *
 * Focus: Measuring simplification effectiveness
 *
 * Tracks:
 * - User journey through capabilities (step-by-step path)
 * - Feature discovery funnel (when/if users discover each of 19 capabilities)
 * - Simplification metrics (steps to complete, cognitive load indicators)
 * - Time-to-value (first successful action)
 * - Choice elimination effectiveness (how often defaults work)
 */

class UserJourneyTracker {
  constructor() {
    // Journey storage: sessionId -> journey array
    this.journeys = new Map();

    // Feature discovery tracking
    this.featureDiscovery = {
      totalCapabilities: 19,
      capabilityNames: [
        // Core 5
        'spotify', 'wikipedia', 'kodi', 'whatsapp', 'news',
        // Advanced 11
        'translation', 'stories', 'twitter', 'reddit', 'youtube',
        'arxiv', 'google_translate', 'elevenlabs_tts', 'sarvam_tts',
        'spotify_pause_skip', 'kodi_pause_play'
      ]
    };

    // Simplification metrics
    this.simplificationMetrics = {
      defaultsAccepted: 0,
      defaultsRejected: 0,
      correctionsNeeded: 0,
      clarificationsRequested: 0,
      directIntents: 0 // Users who knew exactly what they wanted
    };

    // Time-to-value tracking
    this.timeToValue = [];

    // Platform-specific journey patterns
    this.platformPatterns = {
      alexa: { avgSteps: 0, commonPaths: [] },
      whatsapp: { avgSteps: 0, commonPaths: [] },
      web: { avgSteps: 0, commonPaths: [] }
    };
  }

  /**
   * Start tracking a user journey
   *
   * @param {string} sessionId - Unique session ID
   * @param {Object} context - Initial context (platform, userId, etc.)
   */
  startJourney(sessionId, context = {}) {
    this.journeys.set(sessionId, {
      sessionId,
      userId: context.userId || null,
      platform: context.platform || 'unknown',
      startTime: Date.now(),
      steps: [],
      capabilitiesDiscovered: new Set(),
      stepsToFirstValue: null,
      totalSteps: 0,
      defaultsAccepted: 0,
      defaultsRejected: 0,
      corrections: 0,
      clarifications: 0
    });

    console.log(`[Journey] Started tracking session: ${sessionId}`);
  }

  /**
   * Record a journey step
   *
   * @param {string} sessionId - Session ID
   * @param {Object} step - Step data
   */
  recordStep(sessionId, step) {
    const journey = this.journeys.get(sessionId);
    if (!journey) {
      console.warn(`[Journey] Unknown session: ${sessionId}`);
      return;
    }

    const stepData = {
      timestamp: Date.now(),
      timeFromStart: Date.now() - journey.startTime,
      stepNumber: journey.steps.length + 1,
      query: step.query || '',
      intent: step.intent || null,
      capability: step.capability || null,
      source: step.source || 'direct', // 'direct', 'default', 'suggestion', 'discovery'
      success: step.success !== undefined ? step.success : true,
      responseTime: step.responseTime || 0,
      defaultsApplied: step.defaultsApplied || [],
      correction: step.correction || false,
      clarificationNeeded: step.clarificationNeeded || false,
      confidence: step.confidence || 0.5,
      previousCapability: journey.steps.length > 0
        ? journey.steps[journey.steps.length - 1].capability
        : null
    };

    journey.steps.push(stepData);
    journey.totalSteps++;

    // Track feature discovery
    if (stepData.capability) {
      journey.capabilitiesDiscovered.add(stepData.capability);
    }

    // Track simplification metrics
    if (stepData.defaultsApplied.length > 0) {
      if (stepData.success) {
        this.simplificationMetrics.defaultsAccepted++;
        journey.defaultsAccepted++;
      } else {
        this.simplificationMetrics.defaultsRejected++;
        journey.defaultsRejected++;
      }
    }

    if (stepData.correction) {
      this.simplificationMetrics.correctionsNeeded++;
      journey.corrections++;
    }

    if (stepData.clarificationNeeded) {
      this.simplificationMetrics.clarificationsRequested++;
      journey.clarifications++;
    }

    if (stepData.source === 'direct') {
      this.simplificationMetrics.directIntents++;
    }

    // Track time-to-first-value
    if (!journey.stepsToFirstValue && stepData.success) {
      journey.stepsToFirstValue = stepData.timeFromStart;
      this.timeToValue.push(stepData.timeFromStart);
    }

    console.log(`[Journey] Step ${stepData.stepNumber}: ${stepData.capability || 'unknown'} (${stepData.source})`);
  }

  /**
   * End journey and get final metrics
   *
   * @param {string} sessionId - Session ID
   * @returns {Object} Journey summary
   */
  endJourney(sessionId) {
    const journey = this.journeys.get(sessionId);
    if (!journey) {
      return null;
    }

    const duration = Date.now() - journey.startTime;
    const discoveredCapabilities = Array.from(journey.capabilitiesDiscovered);

    const summary = {
      sessionId: journey.sessionId,
      userId: journey.userId,
      platform: journey.platform,
      duration,
      totalSteps: journey.totalSteps,
      stepsToFirstValue: journey.stepsToFirstValue,
      capabilitiesDiscovered: discoveredCapabilities,
      discoveryRate: discoveredCapabilities.length / this.featureDiscovery.totalCapabilities,
      defaultsAccepted: journey.defaultsAccepted,
      defaultsRejected: journey.defaultsRejected,
      defaultAcceptanceRate: journey.defaultsAccepted + journey.defaultsRejected > 0
        ? journey.defaultsAccepted / (journey.defaultsAccepted + journey.defaultsRejected)
        : 0,
      corrections: journey.corrections,
      clarifications: journey.clarifications,
      simplificationScore: this._calculateSimplificationScore(journey),
      journey: journey.steps,
      path: discoveredCapabilities.join(' → ')
    };

    // Update platform patterns
    this._updatePlatformPatterns(journey.platform, summary);

    console.log(`[Journey] Ended: ${journey.totalSteps} steps, ${discoveredCapabilities.length}/19 capabilities, ` +
      `${Math.round(summary.simplificationScore * 100)}% simplification score`);

    return summary;
  }

  /**
   * Calculate simplification score (0-1)
   *
   * @param {Object} journey - Journey object
   * @returns {number} Simplification score
   */
  _calculateSimplificationScore(journey) {
    let score = 1.0;

    // Penalize for corrections needed
    const correctionPenalty = Math.min(0.3, journey.corrections * 0.1);
    score -= correctionPenalty;

    // Penalize for clarifications needed
    const clarificationPenalty = Math.min(0.2, journey.clarifications * 0.05);
    score -= clarificationPenalty;

    // Penalize for defaults rejected
    if (journey.defaultsRejected > 0) {
      const defaultPenalty = Math.min(0.2, journey.defaultsRejected * 0.05);
      score -= defaultPenalty;
    }

    // Bonus for direct intents (user knew exactly what they wanted)
    const directIntents = journey.steps.filter(s => s.source === 'direct').length;
    const directBonus = Math.min(0.1, directIntents * 0.02);
    score += directBonus;

    // Bonus for quick first value
    if (journey.stepsToFirstValue && journey.stepsToFirstValue < 10000) {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Update platform-specific patterns
   *
   * @param {string} platform - Platform name
   * @param {Object} summary - Journey summary
   */
  _updatePlatformPatterns(platform, summary) {
    if (!this.platformPatterns[platform]) {
      this.platformPatterns[platform] = { avgSteps: 0, commonPaths: [] };
    }

    const pattern = this.platformPatterns[platform];

    // Update average steps
    const currentAvg = pattern.avgSteps;
    const sessions = (pattern.sessions || 0) + 1;
    pattern.avgSteps = ((currentAvg * (sessions - 1)) + summary.totalSteps) / sessions;
    pattern.sessions = sessions;

    // Track common paths (simplified)
    if (summary.capabilitiesDiscovered.length > 0) {
      const pathKey = summary.capabilitiesDiscovered.slice(0, 3).join('|');
      const existing = pattern.commonPaths.find(p => p.path === pathKey);
      if (existing) {
        existing.count++;
      } else {
        pattern.commonPaths.push({ path: pathKey, count: 1 });
      }
      // Keep top 5 paths
      pattern.commonPaths.sort((a, b) => b.count - a.count);
      pattern.commonPaths = pattern.commonPaths.slice(0, 5);
    }
  }

  /**
   * Get feature discovery funnel
   *
   * @returns {Object} Discovery funnel data
   */
  getFeatureDiscoveryFunnel() {
    const discoveryCounts = {};
    const capabilityNames = this.featureDiscovery.capabilityNames;

    capabilityNames.forEach(cap => {
      discoveryCounts[cap] = 0;
    });

    // Count sessions that discovered each capability
    for (const [sessionId, journey] of this.journeys.entries()) {
      journey.capabilitiesDiscovered.forEach(cap => {
        if (discoveryCounts[cap] !== undefined) {
          discoveryCounts[cap]++;
        }
      });
    }

    const totalSessions = this.journeys.size;

    return {
      totalSessions,
      discoveryCounts,
      funnel: capabilityNames.map(cap => ({
        capability: cap,
        discoveredBy: discoveryCounts[cap],
        discoveryRate: totalSessions > 0 ? discoveryCounts[cap] / totalSessions : 0
      })),
      avgCapabilitiesDiscovered: totalSessions > 0
        ? Array.from(this.journeys.values())
            .reduce((sum, j) => sum + j.capabilitiesDiscovered.size, 0) / totalSessions
        : 0,
      fullyDiscovered: Object.values(discoveryCounts).filter(c => c === totalSessions && totalSessions > 0).length
    };
  }

  /**
   * Get simplification effectiveness metrics
   *
   * @returns {Object} Simplification metrics
   */
  getSimplificationMetrics() {
    const total = this.simplificationMetrics;

    return {
      defaultsAccepted: total.defaultsAccepted,
      defaultsRejected: total.defaultsRejected,
      defaultAcceptanceRate: total.defaultsAccepted + total.defaultsRejected > 0
        ? total.defaultsAccepted / (total.defaultsAccepted + total.defaultsRejected)
        : 0,
      correctionsNeeded: total.correctionsNeeded,
      clarificationsRequested: total.clarificationsRequested,
      directIntents: total.directIntents,
      directIntentRate: this._totalSteps() > 0
        ? total.directIntents / this._totalSteps()
        : 0,
      targetDefaultsAccepted: 0.85, // 85% acceptance = good defaults
      targetDirectIntents: 0.60 // 60% direct = good simplification
    };
  }

  /**
   * Get time-to-value metrics
   *
   * @returns {Object} Time-to-value data
   */
  getTimeToValueMetrics() {
    const values = this.timeToValue.filter(v => v !== null);

    return {
      average: this._average(values),
      median: this._median(values),
      p95: this._percentile(values, 95),
      target: 10000, // 10 seconds
      targetMet: this._average(values) <= 10000,
      sampleSize: values.length
    };
  }

  /**
   * Get platform comparison
   *
   * @returns {Object} Platform comparison data
   */
  getPlatformComparison() {
    const platforms = {};

    for (const [sessionId, journey] of this.journeys.entries()) {
      if (!platforms[journey.platform]) {
        platforms[journey.platform] = {
          sessions: 0,
          totalSteps: 0,
          totalCorrections: 0,
          totalClarifications: 0,
          capabilitiesDiscovered: new Set(),
          timeToValue: []
        };
      }

      const p = platforms[journey.platform];
      p.sessions++;
      p.totalSteps += journey.totalSteps;
      p.totalCorrections += journey.corrections;
      p.totalClarifications += journey.clarifications;
      journey.capabilitiesDiscovered.forEach(c => p.capabilitiesDiscovered.add(c));
      if (journey.stepsToFirstValue) {
        p.timeToValue.push(journey.stepsToFirstValue);
      }
    }

    // Calculate final metrics
    const result = {};
    for (const [platform, data] of Object.entries(platforms)) {
      result[platform] = {
        sessions: data.sessions,
        avgSteps: data.sessions > 0 ? data.totalSteps / data.sessions : 0,
        avgCorrections: data.sessions > 0 ? data.totalCorrections / data.sessions : 0,
        avgClarifications: data.sessions > 0 ? data.totalClarifications / data.sessions : 0,
        uniqueCapabilities: data.capabilitiesDiscovered.size,
        avgTimeToValue: this._average(data.timeToValue)
      };
    }

    return result;
  }

  /**
   * Get Jony Ive simplification validation report
   *
   * @returns {Object} Validation report
   */
  getSimplificationValidationReport() {
    const discoveryFunnel = this.getFeatureDiscoveryFunnel();
    const simplification = this.getSimplificationMetrics();
    const timeToValue = this.getTimeToValueMetrics();
    const platformComparison = this.getPlatformComparison();

    // Calculate overall validation score
    let validationScore = 0;
    let validationCount = 0;

    // Time-to-value target met?
    if (timeToValue.targetMet) {
      validationScore += 25;
    }
    validationCount += 25;

    // Default acceptance rate >= 85%?
    if (simplification.defaultAcceptanceRate >= 0.85) {
      validationScore += 25;
    }
    validationCount += 25;

    // Direct intent rate >= 60%?
    if (simplification.directIntentRate >= 0.60) {
      validationScore += 25;
    }
    validationCount += 25;

    // Average capabilities discovered >= 10?
    if (discoveryFunnel.avgCapabilitiesDiscovered >= 10) {
      validationScore += 25;
    }
    validationCount += 25;

    return {
      validationScore: validationScore,
      validationPercentage: (validationScore / validationCount * 100).toFixed(1),
      status: validationScore >= 75 ? 'PASSING' : validationScore >= 50 ? 'NEEDS_IMPROVEMENT' : 'FAILED',
      metrics: {
        timeToValue,
        simplification,
        discoveryFunnel,
        platformComparison
      },
      jonyIvePrinciples: {
        lessIsMore: {
          score: simplification.directIntentRate >= 0.6 ? 'EXCELLENT' : simplification.directIntentRate >= 0.4 ? 'GOOD' : 'NEEDS_WORK',
          directIntentRate: simplification.directIntentRate
        },
        eliminateChoiceParalysis: {
          score: simplification.defaultAcceptanceRate >= 0.85 ? 'EXCELLENT' : simplification.defaultAcceptanceRate >= 0.7 ? 'GOOD' : 'NEEDS_WORK',
          acceptanceRate: simplification.defaultAcceptanceRate
        },
        progressiveDisclosure: {
          score: discoveryFunnel.avgCapabilitiesDiscovered >= 10 ? 'EXCELLENT' : discoveryFunnel.avgCapabilitiesDiscovered >= 6 ? 'GOOD' : 'NEEDS_WORK',
          avgDiscovered: discoveryFunnel.avgCapabilitiesDiscovered
        }
      }
    };
  }

  /**
   * Export journey data for analysis
   *
   * @param {string} format - Export format ('json' or 'csv')
   * @returns {string} Exported data
   */
  exportJourneyData(format = 'json') {
    const summaries = [];

    for (const [sessionId, journey] of this.journeys.entries()) {
      summaries.push({
        sessionId: journey.sessionId,
        platform: journey.platform,
        duration: Date.now() - journey.startTime,
        totalSteps: journey.totalSteps,
        capabilitiesDiscovered: Array.from(journey.capabilitiesDiscovered),
        stepsToFirstValue: journey.stepsToFirstValue,
        defaultAcceptanceRate: journey.defaultsAccepted + journey.defaultsRejected > 0
          ? journey.defaultsAccepted / (journey.defaultsAccepted + journey.defaultsRejected)
          : 0,
        simplificationScore: this._calculateSimplificationScore(journey)
      });
    }

    if (format === 'csv') {
      const headers = Object.keys(summaries[0] || {}).join(',');
      const rows = summaries.map(s =>
        Object.values(s).map(v =>
          typeof v === 'string' ? `"${v}"` : v
        ).join(',')
      );
      return [headers, ...rows].join('\n');
    }

    return JSON.stringify(summaries, null, 2);
  }

  // Utility methods
  _totalSteps() {
    let total = 0;
    for (const [sessionId, journey] of this.journeys.entries()) {
      total += journey.totalSteps;
    }
    return total;
  }

  _average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  _median(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  _percentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

module.exports = UserJourneyTracker;
