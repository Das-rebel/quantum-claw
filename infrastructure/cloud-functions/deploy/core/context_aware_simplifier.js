/**
 * Context-Aware Simplification
 *
 * Adjusts behavior based on:
 * - Time of day (morning/evening/night)
 * - Platform (Alexa/WhatsApp/Web)
 * - Recent user interactions
 * - User preferences
 *
 * Following Jony Ive's principle: "Context-aware simplicity"
 */

class ContextAwareSimplifier {
  constructor() {
    this.timePreferences = {
      morning: { hour: [6, 11], verbosity: 'brief', focus: ['news', 'updates'] },
      afternoon: { hour: [11, 17], verbosity: 'medium', focus: ['answers', 'information'] },
      evening: { hour: [17, 22], verbosity: 'relaxed', focus: ['music', 'entertainment'] },
      night: { hour: [22, 6], verbosity: 'minimal', focus: ['simple', 'quick'] }
    };

    this.platformPreferences = {
      alexa: {
        maxResponseLength: 500,
        preferBrief: true,
        allowFollowUp: false
      },
      whatsapp: {
        maxResponseLength: 2000,
        preferBrief: false,
        allowFollowUp: true
      },
      web: {
        maxResponseLength: 5000,
        preferBrief: false,
        allowFollowUp: true
      }
    };
  }

  /**
   * Get time-based context
   */
  getTimeContext(date = new Date()) {
    const hour = date.getHours();

    for (const [timeName, config] of Object.entries(this.timePreferences)) {
      if (hour >= config.hour[0] && hour < config.hour[1]) {
        return {
          timeOfDay: timeName,
          verbosity: config.verbosity,
          suggestedFocus: config.focus
        };
      }
    }

    return {
      timeOfDay: 'day',
      verbosity: 'medium',
      suggestedFocus: []
    };
  }

  /**
   * Get platform-based context
   */
  getPlatformContext(platform) {
    return this.platformPreferences[platform] || this.platformPreferences.web;
  }

  /**
   * Simplify response based on context
   *
   * @param {string} response - Original response
   * @param {Object} context - Time and platform context
   * @returns {string} Simplified response
   */
  simplifyResponse(response, context) {
    const { timeContext, platformContext } = context;
    let simplified = response;

    // Time-based verbosity adjustment
    if (timeContext.verbosity === 'brief' || timeContext.verbosity === 'minimal') {
      simplified = this._truncateResponse(simplified, timeContext.verbosity);
    }

    // Platform-based length limits
    if (platformContext.maxResponseLength) {
      if (simplified.length > platformContext.maxResponseLength) {
        simplified = simplified.substring(0, platformContext.maxResponseLength - 3) + '...';
      }
    }

    return simplified;
  }

  /**
   * Truncate response based on verbosity level
   */
  _truncateResponse(response, verbosity) {
    const limits = {
      brief: 300,
      minimal: 100
    };

    const limit = limits[verbosity] || 500;

    if (response.length <= limit) {
      return response;
    }

    // Truncate at sentence boundary
    const truncated = response.substring(0, limit);
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > limit * 0.7) {
      return truncated.substring(0, lastPeriod + 1);
    }

    return truncated + '...';
  }

  /**
   * Get context-aware greeting
   */
  getContextualGreeting(platform) {
    const timeContext = this.getTimeContext();
    const platformContext = this.getPlatformContext(platform);

    const greetings = {
      morning: {
        brief: 'Morning! Ready to start your day?',
        relaxed: 'Good morning! What can I help you with?'
      },
      afternoon: {
        brief: 'Afternoon! How can I help?',
        relaxed: 'Good afternoon! What do you need?'
      },
      evening: {
        brief: 'Evening! Ready to relax?',
        relaxed: 'Good evening! How can I help you wind down?'
      },
      night: {
        brief: 'Hi there. What do you need?',
        relaxed: 'Hi. How can I help?'
      },
      day: {
        brief: 'Hello! How can I help?',
        relaxed: 'Hello! What can I do for you?'
      }
    };

    const timeGreeting = greetings[timeContext.timeOfDay] || greetings.day;
    const greeting = timeContext.verbosity === 'minimal' ? timeGreeting.brief : timeGreeting.relaxed;

    return {
      greeting,
      suggestedFocus: timeContext.suggestedFocus,
      verbosity: timeContext.verbosity,
      maxResponseLength: platformContext.maxResponseLength
    };
  }

  /**
   * Should show suggestions for this context?
   */
  shouldShowSuggestions(context) {
    const { timeContext, platformContext, interactionCount } = context;

    // Minimal verbosity: No suggestions
    if (timeContext.verbosity === 'minimal') {
      return false;
    }

    // Platform doesn't allow follow-ups: No suggestions
    if (!platformContext.allowFollowUp) {
      return false;
    }

    // New user: Show suggestions
    if (interactionCount < 3) {
      return true;
    }

    // Experienced user: Show suggestions less frequently
    return Math.random() < 0.3;  // 30% chance
  }

  /**
   * Get context-aware suggestions
   */
  getContextualSuggestions(context) {
    const { timeContext, recentCapabilities } = context;

    // Time-based suggestions
    if (timeContext.suggestedFocus.includes('news')) {
      return ['Get the latest news', 'Check for updates'];
    }

    if (timeContext.suggestedFocus.includes('music') || timeContext.suggestedFocus.includes('entertainment')) {
      return ['Play music', 'Control TV', 'Watch something'];
    }

    // History-based suggestions
    if (recentCapabilities && recentCapabilities.length > 0) {
      const lastCap = recentCapabilities[recentCapabilities.length - 1];

      if (lastCap === 'music') {
        return ['Play more music', 'Pause music', 'Skip track'];
      }

      if (lastCap === 'tv') {
        return ['Continue watching', 'Pause TV', 'Show movies'];
      }
    }

    // Default suggestions
    return ['What can I help you with?'];
  }
}

module.exports = ContextAwareSimplifier;
