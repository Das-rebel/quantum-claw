/**
 * Task-Guided Memory Compressor
 *
 * Compresses conversation memory based on task context:
 * - Preserves task-relevant messages
 * - Summarizes less relevant portions
 * - Maintains task continuity across compression
 */

const { AttentionWeightedMemory } = require('./attention-weighted-memory');

class TaskGuidedCompressor {
  constructor(memory, options = {}) {
    this.memory = memory || new AttentionWeightedMemory();
    this.summaryThreshold = options.summaryThreshold || 50; // Messages before summarizing
    this.compressionRatio = options.compressionRatio || 0.3; // Keep 30% of messages
    this.taskKeywords = options.taskKeywords || [
      'play', 'pause', 'stop', 'music', 'song',
      'search', 'find', 'look', 'what', 'who', 'when', 'where',
      'send', 'message', 'whatsapp', 'call',
      'tell', 'story', 'news', 'headlines',
      'translate', 'convert', 'language'
    ];
  }

  /**
   * Check if a message is task-relevant
   *
   * @param {string} content - Message content
   * @returns {boolean} Is relevant
   */
  isTaskRelevant(content) {
    const lower = content.toLowerCase();
    return this.taskKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * Compress session memory while preserving task context
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object} Compression result
   */
  compressSession(sessionId) {
    const messages = this.memory.getWeightedContext(sessionId, 100);

    if (messages.length < this.summaryThreshold) {
      return {
        compressed: false,
        reason: 'Below threshold',
        originalCount: messages.length
      };
    }

    // Categorize messages
    const taskRelevant = [];
    const contextOnly = [];

    messages.forEach(msg => {
      if (this.isTaskRelevant(msg.content)) {
        taskRelevant.push(msg);
      } else {
        contextOnly.push(msg);
      }
    });

    // Keep top weighted messages based on compression ratio
    const keepCount = Math.floor(messages.length * this.compressionRatio);
    const taskRelevantKept = taskRelevant.slice(0, Math.ceil(keepCount * 0.7));
    const contextKept = contextOnly.slice(0, Math.floor(keepCount * 0.3));

    // Summary of dropped messages
    const dropped = messages.length - (taskRelevantKept.length + contextKept.length);
    const summary = this._generateSummary(contextOnly.slice(0, 10));

    // Clear and rebuild (simplified - in production, would update in place)
    this.memory.clearSession(sessionId);

    // Re-add kept messages with preserved weights
    [...taskRelevantKept, ...contextKept]
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach(msg => {
        this.memory.storeMessage(sessionId, msg.role, msg.content, {
          metadata: { compressed: true, originalWeight: msg.weight }
        });
      });

    return {
      compressed: true,
      originalCount: messages.length,
      keptCount: taskRelevantKept.length + contextKept.length,
      droppedCount: dropped,
      summary,
      taskRelevantPreserved: taskRelevantKept.length
    };
  }

  /**
   * Generate a summary of dropped messages
   *
   * @param {Array} droppedMessages - Messages that were dropped
   * @returns {string} Summary text
   */
  _generateSummary(droppedMessages) {
    if (droppedMessages.length === 0) {
      return 'No messages summarized.';
    }

    const topics = droppedMessages
      .map(m => m.content.substring(0, 50))
      .join('; ');

    return `[Summary of ${droppedMessages.length} messages]: ${topics}...`;
  }

  /**
   * Get compression recommendation for a session
   *
   * @param {string} sessionId - Session identifier
   * @returns {Object} Recommendation
   */
  getCompressionRecommendation(sessionId) {
    const messages = this.memory.getWeightedContext(sessionId, 100);

    const shouldCompress = messages.length >= this.summaryThreshold;
    const taskRelevance = messages.filter(m => this.isTaskRelevant(m.content)).length / messages.length;

    return {
      shouldCompress,
      messageCount: messages.length,
      threshold: this.summaryThreshold,
      taskRelevanceRatio: taskRelevance,
      estimatedCompression: shouldCompress
        ? `${messages.length} → ${Math.floor(messages.length * this.compressionRatio)} messages`
        : 'Not needed'
    };
  }

  /**
   * Get current memory instance
   *
   * @returns {AttentionWeightedMemory} Memory instance
   */
  getMemory() {
    return this.memory;
  }
}

module.exports = { TaskGuidedCompressor };
