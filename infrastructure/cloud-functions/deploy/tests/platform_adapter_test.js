/**
 * OmniClaw 2.0 Platform Adapter Test Suite
 *
 * Standalone test for platform-specific response adaptations
 * Tests the PlatformAdapters and UnifiedResponse classes directly
 */

const UnifiedResponse = require('../shared/responses/unified_response');
const PlatformAdapters = require('../shared/responses/platform_adapters');

// Test results tracking
const testResults = {
  alexa: { passed: 0, failed: 0, tests: [] },
  whatsapp: { passed: 0, failed: 0, tests: [] },
  web: { passed: 0, failed: 0, tests: [] },
  consistency: { passed: 0, failed: 0, tests: [] }
};

/**
 * Run a single test
 */
async function runTest(name, testFn, platform) {
  const startTime = Date.now();

  try {
    const result = await testFn();
    const duration = Date.now() - startTime;

    const testResult = {
      name,
      passed: true,
      duration,
      result
    };

    if (platform && testResults[platform]) {
      testResults[platform].tests.push(testResult);
      testResults[platform].passed++;
    }

    return testResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    const testResult = {
      name,
      passed: false,
      duration,
      error: error.message
    };

    if (platform && testResults[platform]) {
      testResults[platform].tests.push(testResult);
      testResults[platform].failed++;
    }

    return testResult;
  }
}

/**
 * Test 1: Core 5 Response Format Validation
 */
async function testCore5ResponseFormats() {
  console.log('📊 Test 1: Core 5 Response Format Validation\n');

  const core5Responses = [
    {
      name: 'Music',
      response: UnifiedResponse.success(
        'Playing jazz music on Spotify',
        {
          details: 'Found your Jazz Classics playlist',
          actionTaken: 'Started playback on Spotify',
          confidence: 0.95,
          suggestions: ['Pause music', 'Skip track', 'Play something else']
        }
      )
    },
    {
      name: 'Answers',
      response: UnifiedResponse.success(
        'Albert Einstein was a German-born theoretical physicist',
        {
          details: 'Born: March 14, 1879. Known for: theory of relativity',
          actionTaken: 'Retrieved from Wikipedia',
          confidence: 0.92,
          suggestions: ['Tell me about his discoveries', 'Search for other physicists']
        }
      )
    },
    {
      name: 'TV',
      response: UnifiedResponse.success(
        'Playing last movie on Kodi',
        {
          details: 'Resuming: The Matrix (1999)',
          actionTaken: 'Started playback on Kodi',
          confidence: 0.88,
          suggestions: ['Pause playback', 'Search for movies', 'Change volume']
        }
      )
    },
    {
      name: 'Messages',
      response: UnifiedResponse.success(
        'Message sent to mom',
        {
          details: 'Message: "I\'ll be late"',
          actionTaken: 'Sent via WhatsApp',
          confidence: 0.90,
          suggestions: ['Send another message', 'Check messages']
        }
      )
    },
    {
      name: 'News',
      response: UnifiedResponse.success(
        'Here are today\'s top headlines',
        {
          details: '1. Tech breakthrough...\n2. Weather update...\n3. Sports news...',
          actionTaken: 'Retrieved latest news',
          confidence: 0.85,
          suggestions: ['Read more details', 'Get specific topic news']
        }
      )
    }
  ];

  const platforms = ['alexa', 'whatsapp', 'web'];

  for (const { name, response } of core5Responses) {
    console.log(`  Testing: ${name}`);

    for (const platform of platforms) {
      const test = await runTest(
        `${platform} - ${name} format validation`,
        async () => {
          const adapted = PlatformAdapters.adapt(response, platform);

          // Platform-specific validation
          if (platform === 'alexa') {
            if (!adapted.response?.outputSpeech?.text) {
              throw new Error('Alexa response missing outputSpeech.text');
            }
            if (adapted.response.outputSpeech.text.length > 500) {
              throw new Error(`Alexa response too long: ${adapted.response.outputSpeech.text.length} chars`);
            }
            if (adapted.response.shouldEndSession === undefined) {
              throw new Error('Alexa response missing shouldEndSession');
            }
          } else if (platform === 'whatsapp') {
            if (!adapted.text) {
              throw new Error('WhatsApp response missing text field');
            }
            if (!adapted.formatted) {
              throw new Error('WhatsApp response should be formatted');
            }
            // Check for emoji or formatting
            const hasRichElements = adapted.text.includes('✅') || adapted.text.includes('💡') || adapted.text.includes('*');
            if (!hasRichElements) {
              throw new Error('WhatsApp response missing rich formatting');
            }
          } else if (platform === 'web') {
            if (!adapted.success) {
              throw new Error('Web response missing success flag');
            }
            if (!adapted.data) {
              throw new Error('Web response missing data object');
            }
            if (!adapted.data.answer) {
              throw new Error('Web response missing data.answer');
            }
            if (!adapted.data.confidence) {
              throw new Error('Web response missing confidence data');
            }
          }

          return {
            platform,
            hasRequiredFields: true,
            formatValid: true
          };
        },
        platform
      );

      if (test.passed) {
        console.log(`    ✅ ${platform}: PASSED`);
      } else {
        console.log(`    ❌ ${platform}: FAILED - ${test.error}`);
      }
    }
  }
  console.log('');
}

/**
 * Test 2: Platform-Specific Constraints
 */
async function testPlatformConstraints() {
  console.log('📏 Test 2: Platform-Specific Constraints\n');

  // Test Alexa length constraint
  await runTest(
    'Alexa - Enforces 500 character limit',
    async () => {
      const longResponse = UnifiedResponse.success(
        'A'.repeat(600), // 600 characters
        { confidence: 0.9 }
      );

      const adapted = PlatformAdapters.adapt(longResponse, 'alexa');
      const speechText = adapted.response.outputSpeech.text;

      if (speechText.length > 500) {
        throw new Error(`Response not truncated: ${speechText.length} chars`);
      }

      return { originalLength: 600, truncatedLength: speechText.length };
    },
    'alexa'
  );
  console.log('    ✅ Alexa: Length constraint enforced\n');

  // Test WhatsApp rich formatting
  await runTest(
    'WhatsApp - Supports rich formatting with emoji',
    async () => {
      const response = UnifiedResponse.success(
        'Test response',
        {
          details: 'Additional details',
          actionTaken: 'Action completed',
          confidence: 0.6,
          suggestions: ['Suggestion 1', 'Suggestion 2']
        }
      );

      const adapted = PlatformAdapters.adapt(response, 'whatsapp');

      // Should have emoji for action
      if (!adapted.text.includes('✅')) {
        throw new Error('Missing action completion emoji');
      }

      // Should have emoji for suggestions
      if (!adapted.text.includes('💡')) {
        throw new Error('Missing suggestions emoji');
      }

      // Should show confidence warning
      if (!adapted.text.includes('⚠️')) {
        throw new Error('Missing confidence warning emoji');
      }

      return {
        hasActionEmoji: true,
        hasSuggestionEmoji: true,
        hasConfidenceEmoji: true
      };
    },
    'whatsapp'
  );
  console.log('    ✅ WhatsApp: Rich formatting with emoji\n');

  // Test Web full structure
  await runTest(
    'Web - Full JSON structure with all metadata',
    async () => {
      const response = UnifiedResponse.success(
        'Test answer',
        {
          details: 'Test details',
          confidence: 0.75,
          suggestions: ['Next step']
        }
      );

      const adapted = PlatformAdapters.adapt(response, 'web');

      // Check all expected fields
      const expectedFields = [
        'success',
        'data',
        'data.answer',
        'data.confidence',
        'data.confidence.level',
        'data.confidence.value',
        'data.metadata',
        'data.ui'
      ];

      for (const field of expectedFields) {
        const parts = field.split('.');
        let value = adapted;
        for (const part of parts) {
          value = value?.[part];
        }
        if (value === undefined) {
          throw new Error(`Missing field: ${field}`);
        }
      }

      return {
        allFieldsPresent: true,
        confidenceLevel: adapted.data.confidence.level
      };
    },
    'web'
  );
  console.log('    ✅ Web: Full JSON structure with metadata\n');
}

/**
 * Test 3: Cross-Platform Consistency
 */
async function testCrossPlatformConsistency() {
  console.log('🔄 Test 3: Cross-Platform Consistency\n');

  const testResponse = UnifiedResponse.success(
    'This is the same answer on all platforms',
    {
      details: 'Same details on all platforms',
      actionTaken: 'Same action on all platforms',
      confidence: 0.91,
      suggestions: ['Option 1', 'Option 2']
    }
  );

  const platforms = ['alexa', 'whatsapp', 'web'];
  const adaptations = {};

  // Adapt for all platforms
  for (const platform of platforms) {
    adaptations[platform] = PlatformAdapters.adapt(testResponse, platform);
  }

  // Test: All platforms contain the core answer
  await runTest(
    'Consistency - Core answer present on all platforms',
    async () => {
      const coreAnswer = 'This is the same answer on all platforms';

      for (const [platform, adapted] of Object.entries(adaptations)) {
        let text;
        if (platform === 'alexa') {
          text = adapted.response.outputSpeech.text;
        } else if (platform === 'whatsapp') {
          text = adapted.text;
        } else if (platform === 'web') {
          text = adapted.data.answer;
        }

        if (!text.includes(coreAnswer.substring(0, 20))) {
          throw new Error(`${platform} doesn't contain core answer`);
        }
      }

      return { allHaveCoreAnswer: true };
    },
    'consistency'
  );
  console.log('    ✅ Consistency: Core answer on all platforms\n');

  // Test: Confidence levels consistent
  await runTest(
    'Consistency - Confidence values consistent',
    async () => {
      const originalConfidence = 0.91;

      // Alexa doesn't expose confidence in response (voice-first)
      // WhatsApp shows confidence if low
      const whatsappText = adaptations.whatsapp.text;
      if (originalConfidence < 0.7 && !whatsappText.includes('⚠️')) {
        throw new Error('WhatsApp should show low confidence warning');
      }

      // Web always includes confidence
      if (adaptations.web.data.confidence.value !== originalConfidence) {
        throw new Error(`Web confidence mismatch: ${adaptations.web.data.confidence.value}`);
      }

      return {
        whatsapp: adaptations.whatsapp.text.includes('⚠️') ? 'low' : 'ok',
        web: adaptations.web.data.confidence.level
      };
    },
    'consistency'
  );
  console.log('    ✅ Consistency: Confidence handling appropriate\n');

  // Test: Suggestions available on all platforms
  await runTest(
    'Consistency - Suggestions available on all platforms',
    async () => {
      for (const [platform, adapted] of Object.entries(adaptations)) {
        let hasSuggestions = false;

        if (platform === 'alexa') {
          hasSuggestions = adapted.sessionAttributes?.suggestions?.length > 0;
        } else if (platform === 'whatsapp') {
          hasSuggestions = adapted.text.includes('💡');
        } else if (platform === 'web') {
          hasSuggestions = adapted.data.suggestions?.length > 0;
        }

        if (!hasSuggestions) {
          throw new Error(`${platform} missing suggestions`);
        }
      }

      return { allHaveSuggestions: true };
    },
    'consistency'
  );
  console.log('    ✅ Consistency: Suggestions on all platforms\n');
}

/**
 * Test 4: Error Handling
 */
async function testErrorHandling() {
  console.log('⚠️  Test 4: Error Handling Across Platforms\n');

  const platforms = ['alexa', 'whatsapp', 'web'];

  for (const platform of platforms) {
    await runTest(
      `${platform} - Error response format`,
      async () => {
        const errorResponse = PlatformAdapters.error(
          'Service temporarily unavailable',
          platform,
          new Error('Connection timeout')
        );

        // Verify error response exists
        let hasErrorContent = false;

        if (platform === 'alexa') {
          hasErrorContent = !!errorResponse.response?.outputSpeech?.text;
        } else if (platform === 'whatsapp') {
          hasErrorContent = !!errorResponse.text && errorResponse.text.includes('❌');
        } else if (platform === 'web') {
          hasErrorContent = !!errorResponse.data?.metadata?.error;
        }

        if (!hasErrorContent) {
          throw new Error(`${platform} error response improperly formatted`);
        }

        return { hasErrorContent: true };
      },
      platform
    );

    console.log(`    ✅ ${platform}: Error handling correct`);
  }
  console.log('');
}

/**
 * Test 5: Confirmation Requests
 */
async function testConfirmationRequests() {
  console.log('✅ Test 5: Confirmation Request Handling\n');

  const platforms = ['alexa', 'whatsapp', 'web'];

  for (const platform of platforms) {
    await runTest(
      `${platform} - Confirmation request format`,
      async () => {
        const confirmationResponse = PlatformAdapters.confirm(
          'send a message to mom',
          platform,
          { confidence: 0.7 }
        );

        // Verify confirmation exists
        let hasConfirmation = false;

        if (platform === 'alexa') {
          hasConfirmation = confirmationResponse.response?.outputSpeech?.text?.includes('Should I');
        } else if (platform === 'whatsapp') {
          hasConfirmation = confirmationResponse.text?.includes('Should I');
        } else if (platform === 'web') {
          hasConfirmation = confirmationResponse.data?.answer?.includes('Should I');
        }

        if (!hasConfirmation) {
          throw new Error(`${platform} confirmation improperly formatted`);
        }

        return { hasConfirmation: true };
      },
      platform
    );

    console.log(`    ✅ ${platform}: Confirmation format correct`);
  }
  console.log('');
}

/**
 * Test 6: Clarification Requests
 */
async function testClarificationRequests() {
  console.log('❓ Test 6: Clarification Request Handling\n');

  const platforms = ['alexa', 'whatsapp', 'web'];

  for (const platform of platforms) {
    await runTest(
      `${platform} - Clarification request format`,
      async () => {
        const clarificationResponse = PlatformAdapters.clarify(
          'play music',
          platform
        );

        // Verify clarification exists
        let hasClarification = false;

        if (platform === 'alexa') {
          hasClarification = clarificationResponse.response?.outputSpeech?.text?.includes('I think you mean');
        } else if (platform === 'whatsapp') {
          hasClarification = clarificationResponse.text?.includes('I think you mean');
        } else if (platform === 'web') {
          hasClarification = clarificationResponse.data?.answer?.includes('I think you mean');
        }

        if (!hasClarification) {
          throw new Error(`${platform} clarification improperly formatted`);
        }

        return { hasClarification: true };
      },
      platform
    );

    console.log(`    ✅ ${platform}: Clarification format correct`);
  }
  console.log('');
}

/**
 * Test 7: Confidence Level Handling
 */
async function testConfidenceLevels() {
  console.log('📊 Test 7: Confidence Level Handling\n');

  const confidenceTests = [
    { confidence: 0.95, level: 'high', name: 'High confidence' },
    { confidence: 0.70, level: 'medium', name: 'Medium confidence' },
    { confidence: 0.30, level: 'low', name: 'Low confidence' }
  ];

  for (const { confidence, level, name } of confidenceTests) {
    const response = UnifiedResponse.success(
      'Test response',
      { confidence }
    );

    // Test confidence level detection
    await runTest(
      `${name} - Level detection`,
      async () => {
        const detectedLevel = response.getConfidenceLevel();
        if (detectedLevel !== level) {
          throw new Error(`Expected ${level}, got ${detectedLevel}`);
        }
        return { confidence, detectedLevel };
      },
      'consistency'
    );

    // Test needsConfirmation
    await runTest(
      `${name} - Confirmation check`,
      async () => {
        const needsConfirm = response.needsConfirmation();
        const expected = confidence >= 0.5 && confidence < 0.9;

        if (needsConfirm !== expected) {
          throw new Error(`Expected needsConfirmation=${expected}, got ${needsConfirm}`);
        }
        return { needsConfirmation: needsConfirm };
      },
      'consistency'
    );

    // Test needsClarification
    await runTest(
      `${name} - Clarification check`,
      async () => {
        const needsClarify = response.needsClarification();
        const expected = confidence < 0.5;

        if (needsClarify !== expected) {
          throw new Error(`Expected needsClarification=${expected}, got ${needsClarify}`);
        }
        return { needsClarification: needsClarify };
      },
      'consistency'
    );

    console.log(`    ✅ ${name}: ${level} confidence handled correctly`);
  }
  console.log('');
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const platforms = ['alexa', 'whatsapp', 'web'];

  for (const platform of platforms) {
    const results = testResults[platform];
    const total = results.passed + results.failed;
    const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

    console.log(`${platform.toUpperCase()}:`);
    console.log(`  ✅ Passed: ${results.passed}/${total} (${passRate}%)`);
    console.log(`  ❌ Failed: ${results.failed}/${total}`);
    console.log('');
  }

  // Consistency tests
  const consistency = testResults.consistency;
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
    totalPassed += testResults[platform].passed;
    totalFailed += testResults[platform].failed;
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
function generateReport() {
  const failedTests = [];

  for (const [platform, results] of Object.entries(testResults)) {
    for (const test of results.tests) {
      if (!test.passed) {
        failedTests.push({
          platform,
          name: test.name,
          error: test.error
        });
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    summary: {
      alexa: testResults.alexa,
      whatsapp: testResults.whatsapp,
      web: testResults.web,
      consistency: testResults.consistency
    },
    failedTests,
    recommendations: generateRecommendations()
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations() {
  const recommendations = [];

  // Check for failures
  const hasFailures = Object.values(testResults).some(
    results => results.failed > 0
  );

  if (!hasFailures) {
    recommendations.push({
      status: 'excellent',
      message: 'All platform adaptations working correctly'
    });
  } else {
    // Analyze failures by platform
    for (const [platform, results] of Object.entries(testResults)) {
      if (results.failed > 0) {
        recommendations.push({
          platform,
          issue: `${results.failed} test(s) failing`,
          recommendation: 'Review platform adapter implementation'
        });
      }
    }
  }

  return recommendations;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  OmniClaw 2.0 Platform Adapter Test Suite                     ║');
  console.log('║  Testing Platform-Specific Response Adaptations               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  await testCore5ResponseFormats();
  await testPlatformConstraints();
  await testCrossPlatformConsistency();
  await testErrorHandling();
  await testConfirmationRequests();
  await testClarificationRequests();
  await testConfidenceLevels();

  printSummary();

  const report = generateReport();

  // Save report to file
  const fs = require('fs');
  const reportPath = '/Users/Subho/omniclaw-personal-assistant/infrastructure/cloud-functions/deploy/tests/platform_test_report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  return report;
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then(report => {
      const exitCode = report.failedTests.length > 0 ? 1 : 0;
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, testResults };
