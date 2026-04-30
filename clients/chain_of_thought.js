/**
 * Chain-of-Thought Reasoning Engine
 *
 * Provides:
 * - Multi-step reasoning for complex queries
 * - Systematic problem breakdown
 * - Explainable thought process
 * - Integration with AI providers (Cerebras, Anthropic)
 */

class ChainOfThought {
  constructor(options = {}) {
    this.maxSteps = options.maxSteps || 5;
    this.maxDepth = options.maxDepth || 3;
    this.enableExplanation = options.enableExplanation !== false; // Default to true
    this.provider = options.provider || 'cerebras'; // cerebras or anthropic
    this.config = options.config || {};

    // Reasoning patterns for different query types
    this.reasoningPatterns = {
      comparison: {
        pattern: 'compare',
        steps: ['identify subjects', 'extract criteria', 'analyze differences', 'synthesize conclusion'],
        prompts: {
          identify: 'What are the main subjects being compared?',
          criteria: 'What criteria should be used for comparison?',
          analyze: 'Analyze the differences based on the criteria.',
          conclude: 'What is the overall conclusion?'
        }
      },
      explanation: {
        pattern: 'explain',
        steps: ['understand concept', 'break down components', 'provide examples', 'synthesize explanation'],
        prompts: {
          understand: 'What is the core concept being asked about?',
          components: 'What are the key components or parts?',
          examples: 'What examples illustrate this concept?',
          explain: 'Explain how these components work together.'
        }
      },
      problem_solving: {
        pattern: 'solve',
        steps: ['understand problem', 'identify constraints', 'explore solutions', 'evaluate options', 'recommend solution'],
        prompts: {
          understand: 'What is the problem statement?',
          constraints: 'What are the constraints or requirements?',
          solutions: 'What are possible solutions?',
          evaluate: 'Evaluate each solution against the constraints.',
          recommend: 'What is the best recommendation?'
        }
      },
      analysis: {
        pattern: 'analyze',
        steps: ['identify topic', 'gather information', 'identify patterns', 'draw conclusions'],
        prompts: {
          topic: 'What is the main topic or subject?',
          information: 'What key information is relevant?',
          patterns: 'What patterns or trends emerge?',
          conclusions: 'What conclusions can be drawn?'
        }
      }
    };
  }

  /**
     * Perform chain-of-thought reasoning
     * @param {string} query - The query to reason about
     * @param {object} context - Additional context
     * @returns {Promise<object>} - Reasoning result with steps
     */
  async reason(query, context = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid query: must be a non-empty string');
    }

    const startTime = Date.now();

    // Determine reasoning pattern
    const pattern = this._determinePattern(query);

    // Generate reasoning steps
    const steps = await this._generateSteps(query, pattern, context);

    // Execute reasoning for each step
    const reasoningChain = [];
    for (let i = 0; i < steps.length && i < this.maxSteps; i++) {
      const step = steps[i];
      const result = await this._executeStep(step, reasoningChain, context);
      reasoningChain.push(result);

      // Check if we've reached a conclusion
      if (result.isConclusion) {
        break;
      }
    }

    // Synthesize final answer
    const finalAnswer = await this._synthesizeAnswer(query, reasoningChain, context);

    // Build explanation if enabled
    const explanation = this.enableExplanation
      ? this._buildExplanation(reasoningChain, pattern)
      : null;

    // Optimize for voice (150 words max)
    const voiceOptimized = this._optimizeForVoice(finalAnswer);

    return {
      answer: voiceOptimized,
      reasoningChain: reasoningChain,
      explanation: explanation,
      pattern: pattern,
      metadata: {
        reasoningTime: Date.now() - startTime,
        stepCount: reasoningChain.length,
        confidence: this._calculateConfidence(reasoningChain),
        hasExplanation: !!explanation
      }
    };
  }

  /**
     * Determine reasoning pattern from query
     * @private
     */
  _determinePattern(query) {
    const lowerQuery = query.toLowerCase();

    // Check for comparison patterns
    if (this._matchesKeywords(lowerQuery, ['compare', 'difference', 'versus', 'vs', 'better', 'which is', 'contrast'])) {
      return 'comparison';
    }

    // Check for explanation patterns
    if (this._matchesKeywords(lowerQuery, ['explain', 'how does', 'what is', 'how to', 'why does', 'meaning of'])) {
      return 'explanation';
    }

    // Check for problem-solving patterns
    if (this._matchesKeywords(lowerQuery, ['solve', 'fix', 'problem', 'issue', 'help', 'troubleshoot', 'resolve'])) {
      return 'problem_solving';
    }

    // Check for analysis patterns
    if (this._matchesKeywords(lowerQuery, ['analyze', 'evaluate', 'assess', 'review', 'examine', 'study'])) {
      return 'analysis';
    }

    // Default to analysis
    return 'analysis';
  }

  /**
     * Check if query matches keywords
     * @private
     */
  _matchesKeywords(query, keywords) {
    return keywords.some(keyword => query.includes(keyword));
  }

  /**
     * Generate reasoning steps
     * @private
     */
  async _generateSteps(query, pattern, context) {
    const patternConfig = this.reasoningPatterns[pattern] || this.reasoningPatterns.analysis;
    const steps = [];

    for (let i = 0; i < patternConfig.steps.length && i < this.maxSteps; i++) {
      const stepName = patternConfig.steps[i];
      const promptKey = this._getPromptKey(stepName);
      const prompt = patternConfig.prompts[promptKey] || `Execute step: ${stepName}`;

      steps.push({
        stepNumber: i + 1,
        name: stepName,
        prompt: prompt,
        query: query,
        context: context
      });
    }

    return steps;
  }

  /**
     * Get prompt key for step name
     * @private
     */
  _getPromptKey(stepName) {
    const mappings = {
      'identify subjects': 'identify',
      'extract criteria': 'criteria',
      'analyze differences': 'analyze',
      'synthesize conclusion': 'conclude',
      'understand concept': 'understand',
      'break down components': 'components',
      'provide examples': 'examples',
      'synthesize explanation': 'explain',
      'understand problem': 'understand',
      'identify constraints': 'constraints',
      'explore solutions': 'solutions',
      'evaluate options': 'evaluate',
      'recommend solution': 'recommend',
      'identify topic': 'topic',
      'gather information': 'information',
      'identify patterns': 'patterns',
      'draw conclusions': 'conclusions'
    };

    return mappings[stepName] || stepName.toLowerCase().replace(/\s+/g, '_');
  }

  /**
     * Execute a reasoning step
     * @private
     */
  async _executeStep(step, previousSteps, context) {
    // Build context from previous steps
    const stepContext = {
      ...context,
      previousSteps: previousSteps.map(s => ({
        step: s.name,
        result: s.result
      }))
    };

    // Generate prompt for this step
    const prompt = this._buildStepPrompt(step, stepContext);

    // Call AI provider
    const result = await this._callAI(prompt);

    // Determine if this is a conclusion step
    const isConclusion = step.name.toLowerCase().includes('conclude') ||
                           step.name.toLowerCase().includes('recommend') ||
                           step.name.toLowerCase().includes('synthesize');

    return {
      stepNumber: step.stepNumber,
      name: step.name,
      prompt: step.prompt,
      result: result,
      isConclusion: isConclusion,
      timestamp: Date.now()
    };
  }

  /**
     * Build prompt for a step
     * @private
     */
  _buildStepPrompt(step, context) {
    let prompt = step.prompt;

    // Add query context
    prompt += `\n\nQuery: ${step.query}`;

    // Add previous steps context
    if (context.previousSteps && context.previousSteps.length > 0) {
      prompt += '\n\nPrevious reasoning:';
      for (const prev of context.previousSteps) {
        prompt += `\n- ${prev.step}: ${prev.result.substring(0, 100)}...`;
      }
    }

    // Add additional context
    if (context.conversationHistory) {
      prompt += `\n\nConversation: ${context.conversationHistory.substring(0, 200)}...`;
    }

    // Add voice optimization instruction
    prompt += '\n\nProvide a concise, conversational response (under 100 words).';

    return prompt;
  }

  /**
     * Call AI provider
     * @private
     */
  async _callAI(prompt) {
    // In a real implementation, this would call the configured AI provider
    // For now, return a placeholder response
    return `[AI Response for: ${prompt.substring(0, 50)}...]`;
  }

  /**
     * Synthesize final answer from reasoning chain
     * @private
     */
  async _synthesizeAnswer(query, reasoningChain, context) {
    if (reasoningChain.length === 0) {
      return "I couldn't process that request. Could you please rephrase?";
    }

    // Get the final conclusion step
    const conclusionStep = reasoningChain.find(s => s.isConclusion) ||
                             reasoningChain[reasoningChain.length - 1];

    let answer = conclusionStep.result;

    // Build context from key steps
    const keySteps = reasoningChain.slice(0, -1);
    if (keySteps.length > 0) {
      const contextIntro = this._buildContextIntro(keySteps);
      answer = `${contextIntro} ${answer}`;
    }

    return answer.trim();
  }

  /**
     * Build context introduction from reasoning steps
     * @private
     */
  _buildContextIntro(steps) {
    if (steps.length === 0) {
      return '';
    }

    const summaries = steps
      .slice(0, 3) // Take up to 3 key steps
      .map(s => s.result.substring(0, 50))
      .filter(s => s.length > 0);

    if (summaries.length === 0) {
      return '';
    }

    return 'Based on my analysis:';
  }

  /**
     * Build explanation of reasoning process
     * @private
     */
  _buildExplanation(reasoningChain, pattern) {
    if (!reasoningChain || reasoningChain.length === 0) {
      return null;
    }

    let explanation = 'Here\'s how I approached this:\n';

    for (const step of reasoningChain) {
      explanation += `\n${step.stepNumber}. ${step.name}: ${step.result.substring(0, 100)}...`;
    }

    return explanation;
  }

  /**
     * Calculate confidence in reasoning
     * @private
     */
  _calculateConfidence(reasoningChain) {
    if (reasoningChain.length === 0) {
      return 0;
    }

    // Base confidence on number of steps completed
    let confidence = Math.min(1, reasoningChain.length / 3);

    // Boost if we reached a conclusion
    const hasConclusion = reasoningChain.some(s => s.isConclusion);
    if (hasConclusion) {
      confidence = Math.min(1, confidence + 0.2);
    }

    return confidence;
  }

  /**
     * Optimize answer for voice delivery
     * @private
     */
  _optimizeForVoice(text) {
    if (!text) {
      return text;
    }

    let optimized = text;

    // Remove technical jargon
    optimized = optimized.replace(/therefore|consequently|hence/gi, 'so');
    optimized = optimized.replace(/however|nevertheless|nonetheless/gi, 'but');
    optimized = optimized.replace(/furthermore|additionally|moreover/gi, 'also');
    optimized = optimized.replace(/utilize|employ/gi, 'use');
    optimized = optimized.replace(/demonstrate|exhibit/gi, 'show');

    // Simplify sentence structure
    optimized = optimized.replace(/which is/gi, 'it\'s');
    optimized = optimized.replace(/that is/gi, 'it\'s');

    // Ensure word limit
    const words = optimized.split(/\s+/);
    if (words.length > 150) {
      optimized = words.slice(0, 150).join(' ');

      // Try to end at a sentence boundary
      const lastPeriod = optimized.lastIndexOf('.');
      if (lastPeriod > 100) {
        optimized = optimized.substring(0, lastPeriod + 1);
      } else {
        optimized += '...';
      }
    }

    return optimized.trim();
  }

  /**
     * Batch reasoning for multiple queries
     * @param {Array<string>} queries - Array of queries
     * @param {object} context - Shared context
     * @returns {Promise<Array<object>>} - Array of reasoning results
     */
  async batchReason(queries, context = {}) {
    const results = [];
    for (const query of queries) {
      const result = await this.reason(query, context);
      results.push(result);
    }
    return results;
  }

  /**
     * Get reasoning summary without full chain
     * @param {string} query - Query to summarize
     * @returns {Promise<object>} - Summary result
     */
  async summarizeReasoning(query) {
    const pattern = this._determinePattern(query);
    const patternConfig = this.reasoningPatterns[pattern];

    return {
      pattern: pattern,
      steps: patternConfig.steps.slice(0, this.maxSteps),
      estimatedTime: patternConfig.steps.length * 2000, // 2 seconds per step
      complexity: 'medium'
    };
  }

  /**
     * Export chain-of-thought configuration
     */
  exportConfig() {
    return {
      maxSteps: this.maxSteps,
      maxDepth: this.maxDepth,
      enableExplanation: this.enableExplanation,
      provider: this.provider,
      patterns: Object.keys(this.reasoningPatterns)
    };
  }
}

module.exports = { ChainOfThought };
