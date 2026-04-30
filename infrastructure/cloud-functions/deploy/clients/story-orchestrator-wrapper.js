/**
 * Story Orchestrator Wrapper - OmniClaw 2.0
 *
 * Provides story generation capability for OmniClaw.
 * Wraps the story-narrator orchestrator for integration with OmniClaw 2.0.
 */

class StoryOrchestrator {
  constructor(aiClient, options = {}) {
    this.aiClient = aiClient;
    this.language = options.language || 'hinglish';
    this.maxStoryLength = options.maxStoryLength || 2000;

    // Story archetypes
    this.archetypes = {
      hero: 'brave protagonist on a journey',
      villain: 'antagonist with dark motives',
      mentor: 'wise guide who helps the hero',
      trickster: 'comic relief who challenges norms',
      loveInterest: 'emotional anchor for the hero'
    };

    // Story genres
    this.genres = {
      adventure: 'exciting quest with challenges',
      fantasy: 'magical worlds and beings',
      scifi: 'futuristic technology and space',
      mystery: 'puzzles to solve and secrets',
      comedy: 'humorous situations and timing'
    };
  }

  /**
   * Generate a story based on theme and preferences
   *
   * @param {Object} params - Story parameters
   * @param {string} params.theme - Main theme/topic
   * @param {string} params.genre - Story genre
   * @param {string} params.character - Main character type
   * @returns {Promise<string>} Generated story
   */
  async generateStory({ theme, genre = 'adventure', character = 'hero' }) {
    const archetype = this.archetypes[character] || this.archetypes.hero;
    const genreDesc = this.genres[genre] || this.genres.adventure;

    const prompt = `Tell a short story in ${this.language} about ${theme}.

Genre: ${genreDesc}
Main Character: ${archetype}

Keep it under ${this.maxStoryLength} characters. Make it engaging with a clear beginning, middle, and end.`;

    try {
      if (this.aiClient) {
        const response = await this.aiClient.complete({
          prompt,
          maxTokens: 500,
          temperature: 0.8
        });
        return response.text || response;
      }

      // Fallback: generate a simple story
      return this._generateFallbackStory(theme, genre, archetype);
    } catch (error) {
      console.error('[StoryOrchestrator] Error generating story:', error.message);
      return this._generateFallbackStory(theme, genre, archetype);
    }
  }

  /**
   * Generate a fallback story without AI
   */
  _generateFallbackStory(theme, genre, archetype) {
    const stories = {
      adventure: `Once upon a time, a ${archetype} embarked on an adventure related to "${theme}". Through courage and determination, they overcame obstacles and learned valuable lessons about themselves. The end.`,
      fantasy: `In a magical realm where ${theme} held ancient power, a ${archetype} discovered their destiny. Magical creatures guided their path as they fulfilled a prophecy older than time itself. The end.`,
      scifi: `In the year 2150, ${theme} became the greatest challenge humanity faced. A ${archetype} aboard the starship Horizon tackled this crisis using innovation and bravery. The end.`,
      mystery: `The case of "${theme}" had gone cold until a ${archetype} arrived. Clues scattered like breadcrumbs led to a shocking revelation that changed everything. The end.`,
      comedy: `Who knew ${theme} could be so hilarious? Our ${archetype} certainly didn't expect the chaos that ensued. Through a series of laugh-out-loud mishaps, they somehow saved the day. The end.`
    };

    return stories[genre] || stories.adventure;
  }

  /**
   * Get available story genres
   */
  getGenres() {
    return Object.keys(this.genres);
  }

  /**
   * Get available character archetypes
   */
  getArchetypes() {
    return Object.keys(this.archetypes);
  }
}

module.exports = { StoryOrchestrator };
