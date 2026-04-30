/**
 * Progressive Disclosure - Natural Feature Discovery
 *
 * Following Jony Ive's principle: "Progressive disclosure"
 * Shows capabilities naturally through conversation rather than overwhelming menus
 *
 * This system reveals advanced features at the right moment:
 * - After successful actions
 * - Based on user context
 * - Through natural suggestions
 */

class ProgressiveDisclosure {
  constructor() {
    // Capability hints shown after successful actions
    this.hintMap = {
      music: [
        'I can also pause, skip, or adjust volume.',
        'Want me to create a playlist based on this song?',
        'I can control music on other devices too.'
      ],
      tv: [
        'I can also search for specific movies or shows.',
        'I can open streaming apps like Seren or Fen.',
        'I can show you what\'s currently playing.',
        'Want me to scan your movie library?'
      ],
      answers: [
        'I can also search the web, Reddit, or Twitter for information.',
        'I can find academic papers on Arxiv.',
        'I can translate this into other languages.',
        'Want me to save this to your knowledge graph?'
      ],
      messages: [
        'I can send messages to anyone in your contacts.',
        'I can also read your new messages.',
        'I can schedule messages to send later.'
      ],
      news: [
        'I can get news from specific topics.',
        'I can also search Twitter for breaking news.',
        'I can summarize multiple news sources.',
        'Want me to set up a daily news briefing?'
      ]
    };

    // Related capabilities to suggest
    this.relatedCapabilities = {
      music: ['tv', 'news'],  // Music listeners might want entertainment
      tv: ['music', 'news'],   // TV viewers might want music or news
      answers: ['news', 'arxiv'],  // Curious minds want more info
      messages: ['answers'],    // People who communicate might want info
      news: ['answers', 'twitter']  // News followers want more details
    };
  }

  /**
   * Get hint to show after successful action
   *
   * @param {string} capability - Capability that was just used
   * @param {Object} context - User context (interaction count, history, etc.)
   * @returns {Object} Hint with text and timing
   */
  getHint(capability, context = {}) {
    const hints = this.hintMap[capability] || [];

    // Don't show hints too frequently
    const { interactionCount, lastHintTime } = context;

    // First 5 interactions: Show hints generously
    if (interactionCount < 5 && hints.length > 0) {
      const hintIndex = Math.min(interactionCount, hints.length - 1);
      return {
        text: hints[hintIndex],
        priority: 'normal',
        timing: 'after-success'
      };
    }

    // After 5 interactions: Show hints less frequently
    if (interactionCount >= 5 && Math.random() < 0.2) {  // 20% chance
      const randomHint = hints[Math.floor(Math.random() * hints.length)];
      return {
        text: randomHint,
        priority: 'low',
        timing: 'after-success'
      };
    }

    return null;  // No hint this time
  }

  /**
   * Get related capability suggestions
   *
   * @param {string} currentCapability - Capability just used
   * @returns {Array<string>} Related capabilities to suggest
   */
  getRelatedCapabilities(currentCapability) {
    const related = this.relatedCapabilities[currentCapability] || [];

    return related.map(cap => {
      const descriptions = {
        music: 'play some music too',
        tv: 'control your TV',
        answers: 'get more information',
        news: 'get the latest news',
        arxiv: 'search academic papers',
        twitter: 'search Twitter',
        reddit: 'search Reddit'
      };

      return {
        capability: cap,
        suggestion: `I can also ${descriptions[cap] || cap}.`,
        callToAction: `Want me to ${descriptions[cap] || cap}?`
      };
    });
  }

  /**
   * Get "What can you do?" response
   *
   * @param {Object} context - User context
   * @returns {Object} Discovery response
   */
  getDiscoveryResponse(context = {}) {
    const { interactionCount = 0, platform = 'alexa' } = context;

    // New user: Brief introduction
    if (interactionCount < 3) {
      return {
        brief: true,
        message: `I can help you with 5 main things: play music, get answers, control your TV, send messages, and get news. Just say what you need, and I'll figure it out.`,
        examples: [
          'Play my road trip playlist',
          'Who is Albert Einstein?',
          'Play the last movie on Kodi',
          'Send a WhatsApp message to mom',
          'What are the latest headlines?'
        ],
        followUp: 'What would you like to do?'
      };
    }

    // Experienced user: More comprehensive overview
    return {
      brief: false,
      message: `I can help you with many things. I can play music, get answers from Wikipedia or the web, control your TV with Kodi, send WhatsApp messages, get news, translate languages, search Twitter and Reddit, tell stories, search YouTube, and find academic papers.`,
      categories: [
        { name: 'Entertainment', items: ['Spotify', 'Kodi', 'YouTube'] },
        { name: 'Information', items: ['Wikipedia', 'Web', 'Arxiv'] },
        { name: 'Communication', items: ['WhatsApp', 'Twitter', 'Reddit'] },
        { name: 'Other', items: ['Translation', 'Stories', 'News'] }
      ],
      followUp: 'Just say what you need help with, or pick a category to explore.'
    };
  }

  /**
   * Generate contextual suggestion based on time
   *
   * @param {Date} currentTime - Current time
   * @returns {Object} Time-based suggestion
   */
  getTimeBasedSuggestion(currentTime = new Date()) {
    const hour = currentTime.getHours();

    // Morning (6-11): News and brief updates
    if (hour >= 6 && hour < 11) {
      return {
        text: 'Good morning! Want me to catch you up on the latest news?',
        capability: 'news',
        priority: 'high'
      };
    }

    // Afternoon (11-17): Information or entertainment
    if (hour >= 11 && hour < 17) {
      return {
        text: 'Afternoon! Need to look something up or want some music?',
        capability: null,  // Let user choose
        priority: 'medium'
      };
    }

    // Evening (17-22): Entertainment focus
    if (hour >= 17 && hour < 22) {
      return {
        text: 'Good evening! Want me to play something or put on a show?',
        capability: 'music',  // Suggest music, can offer TV too
        priority: 'high'
      };
    }

    // Late night (22-6): Simple controls
    return {
      text: 'Hi there! What can I help you with?',
      capability: null,
      priority: 'low'
    };
  }

  /**
   * Generate suggestion based on recent interactions
   *
   * @param {Array} recentCapabilities - Recently used capabilities
   * @returns {Object} History-based suggestion
   */
  getHistoryBasedSuggestion(recentCapabilities) {
    if (!recentCapabilities || recentCapabilities.length === 0) {
      return null;
    }

    const lastCapability = recentCapabilities[recentCapabilities.length - 1];

    // If last action was music, suggest more music
    if (lastCapability === 'music') {
      return {
        text: 'Like last time, I can play your recent songs or find something new.',
        capability: 'music',
        priority: 'medium'
      };
    }

    // If last action was TV, suggest more TV
    if (lastCapability === 'tv') {
      return {
        text: 'Want me to continue where we left off with Kodi?',
        capability: 'tv',
        priority: 'medium'
      };
    }

    return null;
  }

  /**
   * Format hint for specific platform
   *
   * @param {Object} hint - Hint object with text and metadata
   * @param {string} platform - Platform identifier
   * @returns {string} Formatted hint
   */
  formatHintForPlatform(hint, platform) {
    if (!hint) return '';

    switch (platform) {
      case 'alexa':
        // Voice-first: Keep it brief
        return hint.text.length > 100 ? hint.text.substring(0, 97) + '...' : hint.text;

      case 'whatsapp':
        // Text-first: Can be longer, use formatting
        return `💡 ${hint.text}`;

      case 'web':
        // Visual-first: Rich formatting
        return {
          text: hint.text,
          priority: hint.priority,
          action: hint.callToAction
        };

      default:
        return hint.text;
    }
  }

  /**
   * Check if hint should be shown now
   *
   * @param {Object} hint - Hint object
   * @param {Object} context - User context
   * @returns {boolean} Whether to show hint
   */
  shouldShowHint(hint, context) {
    if (!hint) return false;

    // Respect priority
    if (hint.priority === 'low' && Math.random() > 0.3) {
      return false;  // Show low-priority hints 30% of the time
    }

    // Don't overwhelm new users
    if (context.interactionCount < 3 && context.lastHintShown) {
      const timeSinceLastHint = Date.now() - context.lastHintShown;
      if (timeSinceLastHint < 60000) {  // 1 minute
        return false;
      }
    }

    return true;
  }
}

module.exports = ProgressiveDisclosure;
