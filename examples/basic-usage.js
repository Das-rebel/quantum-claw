#!/usr/bin/env node
/**
 * Basic Quantum Claw Usage Examples
 * These examples show how to use Quantum Claw for various AI tasks
 */

import { QuantumClaw } from '../src/core/QuantumClaw.js';

// Initialize Quantum Claw
const qc = new QuantumClaw({
    enableCache: true,
    enableMetrics: true,
    logLevel: 'info'
});

async function basicExample() {
    console.log('🚀 Basic Quantum Claw Usage Examples\n');

    // Example 1: Simple query
    console.log('📝 Example 1: Simple Query');
    const result1 = await qc.query("What is quantum computing?");
    console.log('Response:', result1.response?.substring(0, 200) + '...\n');

    // Example 2: Multi-turn conversation
    console.log('💬 Example 2: Multi-turn Conversation');
    const sessionId = 'user-session-123';
    
    await qc.query("Tell me about Python programming", { sessionId });
    const followUp = await qc.query("What are its main features?", { sessionId });
    console.log('Follow-up Response:', followUp.response?.substring(0, 200) + '...\n');

    // Example 3: Multi-language query
    console.log('🌍 Example 3: Multi-language Query');
    const hindiResult = await qc.query("भारत की राजधानी क्या है?");
    console.log('Hindi Response:', hindiResult.response?.substring(0, 100) + '...\n');

    // Example 4: Specific provider selection
    console.log('🎯 Example 4: Specific Provider Selection');
    const claudeResult = await qc.query("Explain machine learning", {
        provider: 'anthropic'
    });
    console.log('Claude Response:', claudeResult.response?.substring(0, 200) + '...\n');

    // Example 5: Get metrics
    console.log('📊 Example 5: System Metrics');
    const metrics = qc.getMetrics();
    console.log('Total Requests:', metrics.router.totalRequests);
    console.log('Average Response Time:', metrics.router.avgResponseTime.toFixed(2) + 'ms');
    console.log('Cache Hit Rate:', metrics.cacheStats.hitRate.toFixed(2) + '%\n');

    console.log('✅ Examples completed successfully!');
}

// Run examples
basicExample().catch(console.error);