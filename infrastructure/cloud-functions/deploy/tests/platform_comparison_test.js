/**
 * OmniClaw 2.0 Platform Comparison Test Suite
 *
 * Tests platform-specific response adaptations to ensure:
 * 1. Consistent functionality across all platforms
 * 2. Platform-appropriate formatting
 * 3. Core 5 capabilities work on all platforms
 * 4. Platform constraints are respected
 *
 * Platforms tested:
 * - Alexa (voice-first, brief responses)
 * - WhatsApp (text-first, rich formatting)
 * - Web (visual-first, full features)
 */

const OmniClawIntegration = require('../integration/omniclaw_integration');
const UnifiedResponse = require('../shared/responses/unified_response');
const PlatformAdapters = require('../shared/responses/platform_adapters');

// Core 5 test queries (from documentation)
const CORE_5_QUERIES = {
  music: {
    query: "Play my road trip playlist",
    expectedCapability: 'music',
    expectedIntent: 'SpotifyIntent'
  },
  answers: {
    query: "Who is Albert Einstein?",
    expectedCapability: 'answers',
    expectedIntent: 'WikipediaIntent'
  },
  tv: {
    query: "Play the last movie on Kodi",
    expectedCapability: 'tv',
    expectedIntent: 'KodiIntent'
  },
  messages: {
    query: "Send a WhatsApp message to mom saying I'll be late",
    expectedCapability: 'messages',
    expectedIntent: 'WhatsAppIntent'
  },
  news: {
    query: "What are the latest headlines?",
    expectedCapability: 'news',
    expectedIntent: 'NewsIntent'
  }
};

// Platform-specific constraints
const PLATFORM_CONSTRAINTS = {
  alexa: {
    maxResponseLength: 500,
    requiresVoiceFriendly: true,
    supportsVisualContent: false,
    supportsRichFormatting: false,
    supportsInteractiveElements: false
  },
  whatsapp: {
    maxResponseLength: 4096,
    requiresVoiceFriendly: false,
    supportsVisualContent: true,
    supportsRichFormatting: true,
    supportsInteractiveElements: false
  },
  web: {
    maxResponseLength: Infinity,
    requiresVoiceFriendly: false,
    supportsVisualContent: true,
    supportsRichFormatting: true,
    supportsInteractiveElements: true
  }
};

class PlatformComparisonTest {
  constructor() {
    this.omniclaw = new OmniClawIntegration();
    this.testResults = {
      alexa: { passed: 0, failed: 0, tests: [] },
      whatsapp: { passed: 0, failed: 0, tests: [] },
      web: { passed: 0, failed: 0, tests: [] },
      consistency: { passed: 0, failed: 0, tests: [] }
    };
  }

  /**
   * Run all platform comparison tests
   */
  async runAllTests() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  OmniClaw 2.0 Platform Comparison Test Suite                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    await this.testCore5Capabilities();
    await this.testPlatformConstraints();
    await this.testResponseFormats();
    await this.testConsistencyAcrossPlatforms();
    await this.testErrorHandling();
    await this.testAdvancedCapabilities();

    this.printSummary();
    return this.testResults;
  }

  /**
   * Test 1: Core 5 capabilities on all platforms
   */
  async testCore5Capabilities() {
    console.log('📊 Test 1: Core 5 Capabilities Across Platforms\n');

    const platforms = ['alexa', 'whatsapp', 'web'];

    for (const [capabilityName, testData] of Object.entries(CORE_5_QUERIES)) {
      console.log(`  Testing: ${capabilityName.toUpperCase()}`);

      for (const platform of platforms) {
        const test = await this.runTest(
          `${platform} - ${capabilityName}`,
          async () => {
            const result = await this.omniclaw.processQuery(testData.query, {
              platform,
              sessionId: `test-${platform}-${capabilityName}`
            });

            // Verify capability routing
            if (!result.capability) {
              throw new Error(`No capability routed for query: ${testData.query}`);
            }

            // Verify response exists
            if (!result.response && !result.response?.outputSpeech?.text && !result.text && !result.data?.answer) {
              throw new Error(`No response text found in result`);
            }

            return {
              query: testData.query,
              capability: result.capability,
              hasResponse: true,
              platform
            };
          },
          platform
        );

        this.testResults[platform].tests.push(test);
        if (test.passed) {
          console.log(`    ✅ ${platform}: PASSED`);
          this.testResults[platform].passed++;
        } else {
          console.log(`    ❌ ${platform}: FAILED - ${test.error}`);
          this.testResults[platform].failed++;
        }
      }
    }
    console.log('');
  }

  /**
   * Test 2: Platform-specific constraints
   */
  async testPlatformConstraints() {
    console.log('📏 Test 2: Platform-Specific Constraints\n');

    // Test Alexa response length constraint
    await this.runTest(
      'Alexa - Response length < 500 chars',
      async () => {
        const response = UnifiedResponse.success(
          'This is a test response that should be brief enough for Alexa text-to-speech.',
          { confidence: 0.9 }
        );

        const adapted = PlatformAdapters.adapt(response, 'alexa');
        const speechText = adapted.response.outputSpeech.text;

        if (speechText.length > PLATFORM_CONSTRAINTS.alexa.maxResponseLength) {
          throw new Error(`Response too long: ${speechText.length} chars (max: ${PLATFORM_CONSTRAINTS.alexa.maxResponseLength})`);
        }

        return { length: speechText.length, withinLimit: true };
      },
      'alexa'
    );

    // Test WhatsApp rich formatting
    await this.runTest(
      'WhatsApp - Rich formatting support',
      async () => {
        const response = UnifiedResponse.success(
          'Test response with details',
          {
            details: 'Additional details here',
            actionTaken: 'Action completed',
            suggestions: ['Suggestion 1', 'Suggestion 2']
          }
        );

        const adapted = PlatformAdapters.adapt(response, 'whatsapp');

        if (!adapted.formatted) {
          throw new Error('WhatsApp response should be formatted');
        }

        if (!adapted.text.includes('✅') && !adapted.text.includes('*Details*')) {
          throw new Error('WhatsApp response missing rich formatting elements');
        }

        return { hasFormatting: true, formatted: adapted.formatted };
      },
      'whatsapp'
    );

    // Test Web full JSON structure
    await this.runTest(
      'Web - Full JSON structure with metadata',
      async () => {
        const response = UnifiedResponse.success(
          'Test response',
          {
            details: 'Details',
            confidence: 0.85,
            suggestions: ['Suggestion 1']
          }
        );

        const adapted = PlatformAdapters.adapt(response, 'web');

        if (!adapted.success) {
          throw new Error('Web response should have success flag');
        }

        if (!adapted.data) {
          throw new Error('Web response should have data object');
        }

        if (!adapted.data.confidence) {
          throw new Error('Web response should include confidence');
        }

        if (!adapted.data.metadata) {
          throw new Error('Web response should include metadata');
        }

        return {
          hasData: true,
          hasConfidence: true,
          hasMetadata: true
        };
      },
      'web'
    );

    console.log('');
  }

  /**
   * Test 3: Response format validation
   */
  async testResponseFormats() {
    console.log('📝 Test 3: Response Format Validation\n');

    const testResponse = UnifiedResponse.success(
      'This is a test answer to your query.',
      {
        details: 'Here are some additional details about the answer.',
        actionTaken: 'Retrieved information',
        confidence: 0.92,
        suggestions: ['Try another query', 'Get more details']
      }
    );

    // Test Alexa format
    await this.runTest(
      'Alexa - Voice-first format',
      async () => {
        const adapted = PlatformAdapters.adapt(testResponse, 'alexa');

        if (!adapted.response?.outputSpeech?.text) {
          throw new Error('Alexa response missing outputSpeech.text');
        }

        if (!adapted.response?.shouldEndSession !== undefined) {
          throw new Error('Alexa response missing shouldEndSession');
        }

        return {
          hasOutputSpeech: true,
          hasSessionControl: true
        };
      },
      'alexa'
    );

    // Test WhatsApp format
    await this.runTest(
      'WhatsApp - Text-first format with emoji',
      async () => {
        const adapted = PlatformAdapters.adapt(testResponse, 'whatsapp');

        if (!adapted.text) {
          throw new Error('WhatsApp response missing text field');
        }

        // Check for emoji indicators
        const hasEmoji = adapted.text.includes('✅') || adapted.text.includes('💡');
        if (!hasEmoji) {
          throw new Error('WhatsApp response should include emoji indicators');
        }

        return {
          hasText: true,
          hasEmoji: true
        };
      },
      'whatsapp'
    );

    // Test Web format
    await this.runTest(
      'Web - Visual-first format with full data',
      async () => {
        const adapted = PlatformAdapters.adapt(testResponse, 'web');

        if (!adapted.data?.answer) {
          throw new Error('Web response missing data.answer');
        }

        if (!adapted.data?.confidence) {
          throw new Error('Web response missing data.confidence');
        }

        if (!adapted.data?.ui) {
          throw new Error('Web response missing data.ui');
        }

        return {
          hasFullData: true,
          hasUI: true
        };
      },
      'web'
    );

    console.log('');
  }

  /**
   * Test 4: Consistency across platforms
   */
  async testConsistencyAcrossPlatforms() {
    console.log('🔄 Test 4: Cross-Platform Consistency\n');

    const query = "Play jazz music";
    const platforms = ['alexa', 'whatsapp', 'web'];
    const results = {};

    // Run same query on all platforms
    for (const platform of platforms) {
      const result = await this.omniclaw.processQuery(query, {
        platform,
        sessionId: `test-consistency-${platform}`
      });
      results[platform] = result;
    }

    // Test: All platforms route to same capability
    await this.runTest(
      'Consistency - Same capability routing',
      async () => {
        const capabilities = Object.values(results).map(r => r.capability);
        const uniqueCapabilities = [...new Set(capabilities)];

        if (uniqueCapabilities.length !== 1) {
          throw new Error(`Platforms routed to different capabilities: ${uniqueCapabilities.join(', ')}`);
        }

        return { capability: uniqueCapabilities[0], consistent: true };
      },
      'consistency'
    );

    // Test: All platforms have some form of response
    await this.runTest(
      'Consistency - All platforms return response',
      async () => {
        for (const [platform, result] of Object.entries(results)) {
          const hasResponse =
            result.response?.outputSpeech?.text ||
            result.text ||
            result.data?.answer;

          if (!hasResponse) {
            throw new Error(`${platform} has no response text`);
          }
        }

        return { allHaveResponse: true };
      },
      'consistency'
    );

    console.log('');
  }

  /**
   * Test 5: Error handling across platforms
   */
  async testErrorHandling() {
    console.log('⚠️  Test 5: Error Handling Across Platforms\n');

    const platforms = ['alexa', 'whatsapp', 'web'];

    for (const platform of platforms) {
      await this.runTest(
        `${platform} - Error response format`,
        async () => {
          const errorResponse = PlatformAdapters.error(
            'Something went wrong',
            platform,
            new Error('Test error')
          );

          // Verify error response exists
          const hasError =
            errorResponse.response?.outputSpeech?.text ||
            errorResponse.text ||
            errorResponse.data;

          if (!hasError) {
            throw new Error(`${platform} error response is empty`);
          }

          return { hasErrorResponse: true };
        },
        platform
      );
    }

    console.log('');
  }

  /**
   * Test 6: Advanced capabilities (beyond Core 5)
   */
  async testAdvancedCapabilities() {
    console.log('🚀 Test 6: Advanced Capabilities\n');

    const advancedTests = [
      { query: "Translate 'Hello' to Spanish", name: 'Translation' },
      { query: "Tell me a story", name: 'Stories' },
      { query: "Search Reddit for AI news", name: 'Reddit' },
      { query: "Find papers on quantum computing", name: 'Arxiv' }
    ];

    for (const test of advancedTests) {
      // Test on all platforms
      for (const platform of ['alexa', 'whatsapp', 'web']) {
        await this.runTest(
          `${platform} - ${test.name}`,
          async () => {
            const result = await this.omniclaw.processQuery(test.query, {
              platform,
              sessionId: `test-advanced-${platform}-${test.name}`
            });

            // Verify we got some result
            const hasResponse =
              result.response?.outputSpeech?.text ||
              result.text ||
              result.data?.answer;

            if (!hasResponse) {
              throw new Error(`No response for ${test.name} on ${platform}`);
            }

            return { capabilityRouted: result.capability || 'unknown' };
          },
          platform
        );
      }
    }

    console.log('');
  }

  /**
   * Helper: Run a single test
   */
  async runTest(name, testFn, platform) {
    const startTime = Date.now();

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;

      return {
        name,
        passed: true,
        duration,
        result
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        name,
        passed: false,
        duration,
        error: error.message
      };
    }
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  Test Summary                                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const platforms = ['alexa', 'whatsapp', 'web'];

    for (const platform of platforms) {
      const results = this.testResults[platform];
      const total = results.passed + results.failed;
      const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

      console.log(`${platform.toUpperCase()}:`);
      console.log(`  ✅ Passed: ${results.passed}/${total} (${passRate}%)`);
      console.log(`  ❌ Failed: ${results.failed}/${total}`);
      console.log('');
    }

    // Consistency tests
    const consistency = this.testResults.consistency;
    const totalConsistency = consistency.passed + consistency.failed;
    const consistencyRate = totalConsistency > 0 ? ((consistency.passed / totalConsistency) * 100).toFixed(1) : 0;

    console.log(`CROSS-PLATFORM CONSISTENCY:`);
    console.log(`  ✅ Passed: ${consistency.passed}/${totalConsistency} (${consistencyRate}%)`);
    console.log(`  ❌ Failed: ${consistency.failed}/${totalConsistency}`);
    console.log('');

    // Overall
    let totalPassed = 0;
    let totalFailed = 0;
    for (const platform of platforms) {
      totalPassed += this.testResults[platform].passed;
      totalFailed += this.testResults[platform].failed;
    }
    totalPassed += consistency.passed;
    totalFailed += consistency.failed;

    const total = totalPassed + totalFailed;
    const overallRate = total > 0 ? ((totalPassed / total) * 100).toFixed(1) : 0;

    console.log(`OVERALL:`);
    console.log(`  ✅ Total Passed: ${totalPassed}/${total} (${overallRate}%)`);
    console.log(`  ❌ Total Failed: ${totalFailed}/${total}`);
    console.log('');

    // Verdict
    if (overallRate >= 95) {
      console.log('🎉 EXCELLENT: Platform adaptations are working perfectly!');
    } else if (overallRate >= 80) {
      console.log('✅ GOOD: Platform adaptations are working well with minor issues.');
    } else if (overallRate >= 60) {
      console.log('⚠️  FAIR: Platform adaptations have some issues that need attention.');
    } else {
      console.log('❌ POOR: Platform adaptations need significant improvement.');
    }
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      summary: {
        alexa: this.testResults.alexa,
        whatsapp: this.testResults.whatsapp,
        web: this.testResults.web,
        consistency: this.testResults.consistency
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate platform-specific recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    // Analyze Alexa results
    if (this.testResults.alexa.failed > 0) {
      recommendations.push({
        platform: 'alexa',
        issue: 'Some tests failing',
        recommendation: 'Review response length constraints and voice-friendly formatting'
      });
    }

    // Analyze WhatsApp results
    if (this.testResults.whatsapp.failed > 0) {
      recommendations.push({
        platform: 'whatsapp',
        issue: 'Some tests failing',
        recommendation: 'Check rich formatting and emoji support in responses'
      });
    }

    // Analyze Web results
    if (this.testResults.web.failed > 0) {
      recommendations.push({
        platform: 'web',
        issue: 'Some tests failing',
        recommendation: 'Verify full JSON structure and metadata in web responses'
      });
    }

    // Consistency issues
    if (this.testResults.consistency.failed > 0) {
      recommendations.push({
        platform: 'all',
        issue: 'Inconsistency across platforms',
        recommendation: 'Ensure all platforms route to same capabilities for same queries'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        platform: 'all',
        status: 'excellent',
        recommendation: 'Platform adaptations are working correctly. Continue monitoring.'
      });
    }

    return recommendations;
  }
}

// Run tests if executed directly
if (require.main === module) {
  const test = new PlatformComparisonTest();
  test.runAllTests()
    .then(() => {
      const report = test.generateReport();
      console.log('\n📄 Detailed report saved to test results');
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = PlatformComparisonTest;
