/**
 * Story Orchestrator Wrapper - OmniClaw 2.0
 */

class StoryOrchestrator {
  constructor(aiClient, options = {}) {
    this.aiClient = aiClient;
    this.language = options.language || 'hinglish';
    this.maxStoryLength = options.maxStoryLength || 2000;

    this.archetypes = {
      hero: 'brave protagonist on a journey',
      villain: 'antagonist with dark motives',
      mentor: 'wise guide who helps the hero',
      trickster: 'comic relief who challenges norms',
      loveInterest: 'emotional anchor for the hero'
    };

    this.genres = {
      adventure: 'exciting quest with challenges',
      fantasy: 'magical worlds and beings',
      scifi: 'futuristic technology and space',
      mystery: 'puzzles to solve and secrets',
      comedy: 'humorous situations and timing'
    };
  }

  async generateStory({ theme, genre = 'adventure', character = 'hero' }) {
    const archetype = this.archetypes[character] || this.archetypes.hero;
    const genreDesc = this.genres[genre] || this.genres.adventure;

    const prompt = `Tell a short story in ${this.language} about ${theme}. Genre: ${genreDesc}. Main Character: ${archetype}. Keep it under ${this.maxStoryLength} characters.`;

    try {
      if (this.aiClient) {
        const response = await this.aiClient.complete({ prompt, maxTokens: 500, temperature: 0.8 });
        return response.text || response;
      }
    } catch (error) {
      console.error('[StoryOrchestrator] Error:', error.message);
    }
    return this._generateFallbackStory(theme, genre, archetype);
  }

  _generateFallbackStory(theme, genre, archetype) {
    return `Once upon a time, a ${archetype} embarked on an adventure about "${theme}". Through courage and determination, they overcame obstacles. The end.`;
  }

  async autoGenerateStory({ theme, setting, genre = 'adventure', narratorPersona }) {
    const archetype = this.archetypes.hero;
    const genreDesc = this.genres[genre] || this.genres.adventure;
    const accentStyle = narratorPersona?.accent_style || 'neutral';

    const prompt = `Tell a short story about ${theme} in ${setting}. Genre: ${genreDesc}. Narrator style: ${accentStyle}. Keep it under ${this.maxStoryLength} characters with a clear beginning, middle, and end.`;

    try {
      if (this.aiClient) {
        const response = await this.aiClient.complete({ prompt, maxTokens: 500, temperature: 0.8 });
        const text = response.text || response;
        return {
          segments: [{ type: 'narration', text }],
          characters: [{ name: 'Hero' }],
          theme,
          setting
        };
      }
    } catch (error) {
      console.error('[StoryOrchestrator] autoGenerateStory error:', error.message);
    }

    return {
      segments: [{ type: 'narration', text: `Once upon a time, in ${setting}, a brave hero embarked on an adventure about ${theme}. Through challenges and discovery, they found their destiny. The end... or is it just the beginning?` }],
      characters: [{ name: 'Hero' }],
      theme,
      setting
    };
  }
}

module.exports = { StoryOrchestrator };
