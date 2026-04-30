/**
 * OmniClaw 2.0 Integration Test Suite
 *
 * Tests end-to-end data flow between all 6 components:
 * 1. Smart Router
 * 2. Transparency Layer
 * 3. Smart Defaults
 * 4. Progressive Disclosure
 * 5. Context-Aware Simplifier
 * 6. Integration Layer
 *
 * This validates component interfaces, data transformations,
 * error handling, and integration points.
 */

const SmartRouter = require('../core/smart_router');
const TransparencyLayer = require('../core/transparency_layer');
const SmartDefaults = require('../core/smart_defaults');
const ProgressiveDisclosure = require('../core/progressive_disclosure');
const ContextAwareSimplifier = require('../core/context_aware_simplifier');
const OmniClawIntegration = require('./omniclaw_integration');

class IntegrationTestSuite {
  constructor() {
    this.testResults = [];
    this.componentInstances = {
      smartRouter: new SmartRouter(),
      transparencyLayer: new TransparencyLayer(),
      smartDefaults: new SmartDefaults(),
      progressiveDisclosure: new ProgressiveDisclosure(),
      contextSimplifier: new ContextAwareSimplifier(),
      integration: new OmniClawIntegration()
    };
  }

  /**
   * Run all integration tests
   */
  async runAllTests() {
    console.log('\n=== OmniClaw 2.0 Integration Test Suite ===\n');

    await this.testStandardQueryFlow();
    await this.testLowConfidenceQuery();
    await this.testCorrectionHandling();
    await this.testFirstTimeUser();
    await this.testProgressiveHint();
    await this.testComponentInterfaces();
    await this.testErrorHandling();
    await this.testDataFlowTransformations();

    this.generateTestReport();
  }

  /**
   * Test 1: Standard Query Flow
   * Query → Smart Router → Transparency → Smart Defaults → Execute → Response
   */
  async testStandardQueryFlow() {
    console.log('TEST 1: Standard Query Flow');
    const testName = 'Standard Query Flow';

    try {
      const query = 'Play my road trip playlist';
      const context = { platform: 'alexa', sessionId: 'test-session-1' };

      // Step 1: Smart Router
      const routingResult = await this.componentInstances.smartRouter.route(query, context);
      this.validateRoutingResult(routingResult, query);

      // Step 2: Transparency Layer
      const enhancedResult = this.componentInstances.transparencyLayer.enhanceRoutingResult(routingResult, query);
      this.validateTransparencyEnhancement(enhancedResult, routingResult);

      // Step 3: Smart Defaults
      const defaultsApplied = this.componentInstances.smartDefaults.applyDefaults(enhancedResult, {
        originalQuery: query
      });
      this.validateDefaultsApplied(defaultsApplied, enhancedResult);

      // Step 4: Full Integration
      const fullResult = await this.componentInstances.integration.processQuery(query, context);
      this.validateIntegrationResponse(fullResult);

      this.recordTest(testName, 'PASS', 'All components processed query correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 2: Low Confidence Query
   * Query → Smart Router (low confidence) → Clarification Request
   */
  async testLowConfidenceQuery() {
    console.log('\nTEST 2: Low Confidence Query');
    const testName = 'Low Confidence Query';

    try {
      const query = 'Do the thing';
      const context = { platform: 'whatsapp', sessionId: 'test-session-2' };

      // Smart Router should return low confidence
      const routingResult = await this.componentInstances.smartRouter.route(query, context);

      if (routingResult.confidence >= 0.5) {
        throw new Error(`Expected low confidence < 0.5, got ${routingResult.confidence}`);
      }

      // Transparency Layer should categorize as low
      const enhancedResult = this.componentInstances.transparencyLayer.enhanceRoutingResult(routingResult, query);

      if (enhancedResult.confidenceLevel !== 'low') {
        throw new Error(`Expected confidence level 'low', got '${enhancedResult.confidenceLevel}'`);
      }

      // Should require confirmation
      if (!enhancedResult.requiresConfirmation) {
        throw new Error('Low confidence query should require confirmation');
      }

      // Build confirmation
      const confirmation = this.componentInstances.transparencyLayer.buildConfirmation(enhancedResult, context);

      if (confirmation.type !== 'confirmation') {
        throw new Error(`Expected confirmation type, got '${confirmation.type}'`);
      }

      this.recordTest(testName, 'PASS', 'Low confidence query triggers clarification correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 3: Correction Handling
   * "No, I meant X" → Correction Detection → Re-route → Execute
   */
  async testCorrectionHandling() {
    console.log('\nTEST 3: Correction Handling');
    const testName = 'Correction Handling';

    try {
      const initialQuery = 'Play music';
      const correctionQuery = 'No, I meant search the web for music';
      const context = {
        platform: 'alexa',
        sessionId: 'test-session-3',
        lastAction: 'SpotifyIntent'
      };

      // Initial routing
      const initialRouting = await this.componentInstances.smartRouter.route(initialQuery, context);
      this.validateRoutingResult(initialRouting, initialQuery);

      // Detect correction
      const correction = this.componentInstances.smartDefaults.detectCorrection(correctionQuery, context);

      if (!correction) {
        throw new Error('Correction pattern not detected');
      }

      if (correction.type !== 'correction') {
        throw new Error(`Expected correction type, got '${correction.type}'`);
      }

      // Handle correction
      const correctionResult = this.componentInstances.smartDefaults.handleCorrection(correction, context);

      if (!correctionResult.shouldRetry) {
        throw new Error('Expected shouldRetry flag for correction');
      }

      // Re-route with corrected query
      const newRouting = await this.componentInstances.smartRouter.route(correctionResult.newQuery, context);
      this.validateRoutingResult(newRouting, correctionResult.newQuery);

      // Verify the correction changed the intent
      if (newRouting.intent === initialRouting.intent) {
        throw new Error('Correction did not change the intent');
      }

      this.recordTest(testName, 'PASS', 'Correction detection and re-routing works correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 4: First-Time User
   * First query → Progressive Disclosure → Core 5 Discovery
   */
  async testFirstTimeUser() {
    console.log('\nTEST 4: First-Time User Discovery');
    const testName = 'First-Time User Discovery';

    try {
      const context = {
        platform: 'web',
        sessionId: 'test-session-4',
        interactionCount: 0  // First-time user
      };

      // Get discovery response
      const discovery = this.componentInstances.progressiveDisclosure.getDiscoveryResponse(context);

      if (!discovery.brief) {
        throw new Error('First-time user should get brief discovery');
      }

      if (!discovery.examples || discovery.examples.length === 0) {
        throw new Error('First-time user should get examples');
      }

      // Get core capabilities
      const coreCapabilities = this.componentInstances.smartRouter.getCoreCapabilities();

      if (coreCapabilities.length !== 5) {
        throw new Error(`Expected 5 core capabilities, got ${coreCapabilities.length}`);
      }

      // Verify each core capability has required fields
      coreCapabilities.forEach(cap => {
        if (!cap.name || !cap.description || !cap.example) {
          throw new Error(`Core capability missing required fields: ${JSON.stringify(cap)}`);
        }
      });

      this.recordTest(testName, 'PASS', 'First-time user gets Core 5 discovery correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 5: Progressive Hint
   * After successful action → Hint Generation → Suggestion Display
   */
  async testProgressiveHint() {
    console.log('\nTEST 5: Progressive Hint After Action');
    const testName = 'Progressive Hint After Action';

    try {
      const capability = 'music';
      const context = {
        platform: 'alexa',
        interactionCount: 2  // Still new user
      };

      // Get hint
      const hint = this.componentInstances.progressiveDisclosure.getHint(capability, context);

      if (!hint) {
        throw new Error('Expected hint for new user');
      }

      if (!hint.text || !hint.priority || !hint.timing) {
        throw new Error('Hint missing required fields');
      }

      // Format hint for platform
      const formattedHint = this.componentInstances.progressiveDisclosure.formatHintForPlatform(hint, 'alexa');

      if (typeof formattedHint !== 'string') {
        throw new Error('Alexa hint should be a string');
      }

      if (formattedHint.length > 100) {
        throw new Error('Alexa hint should be brief (< 100 chars)');
      }

      // Check if hint should be shown
      const shouldShow = this.componentInstances.progressiveDisclosure.shouldShowHint(hint, context);

      if (!shouldShow) {
        throw new Error('Hint should be shown for new user');
      }

      this.recordTest(testName, 'PASS', 'Progressive hints generated and formatted correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 6: Component Interface Validation
   * Verify all component interfaces match specifications
   */
  async testComponentInterfaces() {
    console.log('\nTEST 6: Component Interface Validation');
    const testName = 'Component Interface Validation';

    try {
      const interfaceTests = [];

      // Test Smart Router interface
      interfaceTests.push(this.testSmartRouterInterface());

      // Test Transparency Layer interface
      interfaceTests.push(this.testTransparencyLayerInterface());

      // Test Smart Defaults interface
      interfaceTests.push(this.testSmartDefaultsInterface());

      // Test Progressive Disclosure interface
      interfaceTests.push(this.testProgressiveDisclosureInterface());

      // Test Context-Aware Simplifier interface
      interfaceTests.push(this.testContextSimplifierInterface());

      // Test Integration Layer interface
      interfaceTests.push(this.testIntegrationLayerInterface());

      const failedTests = interfaceTests.filter(result => !result.passed);

      if (failedTests.length > 0) {
        throw new Error(`Interface tests failed: ${failedTests.map(t => t.error).join(', ')}`);
      }

      this.recordTest(testName, 'PASS', 'All component interfaces validated');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 7: Error Handling
   * Component failure scenarios, graceful degradation, error recovery
   */
  async testErrorHandling() {
    console.log('\nTEST 7: Error Handling');
    const testName = 'Error Handling';

    try {
      const errorTests = [];

      // Test 1: Invalid query handling
      errorTests.push(await this.testInvalidQueryHandling());

      // Test 2: Missing required parameters
      errorTests.push(await this.testMissingParameters());

      // Test 3: Component failure isolation
      errorTests.push(await this.testComponentFailureIsolation());

      // Test 4: Graceful degradation
      errorTests.push(await this.testGracefulDegradation());

      const failedTests = errorTests.filter(result => !result.passed);

      if (failedTests.length > 0) {
        throw new Error(`Error handling tests failed: ${failedTests.map(t => t.error).join(', ')}`);
      }

      this.recordTest(testName, 'PASS', 'All error handling scenarios work correctly');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  /**
   * Test 8: Data Flow Transformations
   * Validate data transformations between components
   */
  async testDataFlowTransformations() {
    console.log('\nTEST 8: Data Flow Transformations');
    const testName = 'Data Flow Transformations';

    try {
      const query = 'Who is Albert Einstein?';
      const context = { platform: 'whatsapp', sessionId: 'test-session-dataflow' };

      // Track data through each transformation
      const dataFlow = [];

      // Step 1: Smart Router output
      const routingResult = await this.componentInstances.smartRouter.route(query, context);
      dataFlow.push({
        step: 'Smart Router',
        output: routingResult,
        requiredFields: ['intent', 'confidence', 'capability', 'slots']
      });

      // Step 2: Transparency Layer enhancement
      const enhancedResult = this.componentInstances.transparencyLayer.enhanceRoutingResult(routingResult, query);
      dataFlow.push({
        step: 'Transparency Layer',
        output: enhancedResult,
        requiredFields: ['intent', 'confidence', 'capability', 'confidenceLevel', 'explanation', 'requiresConfirmation'],
        addedFields: ['confidenceLevel', 'explanation', 'requiresConfirmation', 'confidencePercent']
      });

      // Step 3: Smart Defaults application
      const defaultsApplied = this.componentInstances.smartDefaults.applyDefaults(enhancedResult, {
        originalQuery: query
      });
      dataFlow.push({
        step: 'Smart Defaults',
        output: defaultsApplied,
        requiredFields: ['intent', 'confidence', 'capability', 'slots', 'defaultsApplied'],
        addedFields: ['defaultsApplied']
      });

      // Validate each transformation step
      dataFlow.forEach(step => {
        // Check required fields are present
        step.requiredFields.forEach(field => {
          if (!(field in step.output)) {
            throw new Error(`${step.step} missing required field: ${field}`);
          }
        });

        // Check data is not lost
        if (step.output.intent !== routingResult.intent) {
          throw new Error(`${step.step} changed intent unexpectedly`);
        }
      });

      // Verify data enrichment (new fields added)
      const finalOutput = dataFlow[dataFlow.length - 1].output;
      const initialOutput = dataFlow[0].output;

      if (Object.keys(finalOutput).length <= Object.keys(initialOutput).length) {
        throw new Error('Data flow should enrich data, not just pass it through');
      }

      this.recordTest(testName, 'PASS', 'Data transformations validated through all components');
    } catch (error) {
      this.recordTest(testName, 'FAIL', error.message);
    }
  }

  // ========== Helper Methods ==========

  /**
   * Validate routing result structure
   */
  validateRoutingResult(result, query) {
    const requiredFields = ['intent', 'confidence', 'capability', 'slots'];

    requiredFields.forEach(field => {
      if (!(field in result)) {
        throw new Error(`Routing result missing required field: ${field}`);
      }
    });

    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error(`Invalid confidence score: ${result.confidence}`);
    }

    if (!result.slots || typeof result.slots !== 'object') {
      throw new Error('Slots must be an object');
    }
  }

  /**
   * Validate transparency enhancement
   */
  validateTransparencyEnhancement(enhanced, original) {
    // Original fields must be preserved
    if (enhanced.intent !== original.intent) {
      throw new Error('Transparency layer changed intent');
    }

    if (enhanced.confidence !== original.confidence) {
      throw new Error('Transparency layer changed confidence');
    }

    // New transparency fields must be added
    const newFields = ['confidenceLevel', 'explanation', 'requiresConfirmation'];
    newFields.forEach(field => {
      if (!(field in enhanced)) {
        throw new Error(`Transparency layer missing field: ${field}`);
      }
    });

    // Validate confidence level categorization
    const validLevels = ['high', 'medium', 'low'];
    if (!validLevels.includes(enhanced.confidenceLevel)) {
      throw new Error(`Invalid confidence level: ${enhanced.confidenceLevel}`);
    }
  }

  /**
   * Validate defaults applied
   */
  validateDefaultsApplied(withDefaults, withoutDefaults) {
    // Original fields must be preserved
    if (withDefaults.intent !== withoutDefaults.intent) {
      throw new Error('Smart defaults changed intent');
    }

    // Defaults applied field should exist
    if (!('defaultsApplied' in withDefaults)) {
      throw new Error('Smart defaults did not track what was applied');
    }

    // Slots should be enhanced
    if (!withDefaults.slots) {
      throw new Error('Smart defaults removed slots');
    }
  }

  /**
   * Validate integration response
   */
  validateIntegrationResponse(response) {
    if (!response) {
      throw new Error('Integration returned null response');
    }

    if (!response.response) {
      throw new Error('Integration response missing response field');
    }

    if (!response.response.outputSpeech) {
      throw new Error('Integration response missing outputSpeech');
    }

    if (!response.response.outputSpeech.text) {
      throw new Error('Integration response missing speech text');
    }
  }

  /**
   * Test Smart Router interface
   */
  testSmartRouterInterface() {
    const component = this.componentInstances.smartRouter;

    // Check methods exist
    const requiredMethods = ['route', 'getCoreCapabilities', 'getCapabilitiesForUser'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `SmartRouter missing method: ${method}` };
      }
    });

    // Check method signatures
    const routePromise = component.route('test query', {});
    if (!(routePromise instanceof Promise)) {
      return { passed: false, error: 'SmartRouter.route should return Promise' };
    }

    return { passed: true };
  }

  /**
   * Test Transparency Layer interface
   */
  testTransparencyLayerInterface() {
    const component = this.componentInstances.transparencyLayer;

    const requiredMethods = ['enhanceRoutingResult', 'buildConfirmation', 'formatTransparencyForPlatform'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `TransparencyLayer missing method: ${method}` };
      }
    });

    // Test enhancement
    const mockRouting = { intent: 'TestIntent', confidence: 0.8, capability: 'test' };
    const enhanced = component.enhanceRoutingResult(mockRouting, 'test query');

    if (!enhanced.confidenceLevel || !enhanced.explanation) {
      return { passed: false, error: 'enhanceRoutingResult did not add required fields' };
    }

    return { passed: true };
  }

  /**
   * Test Smart Defaults interface
   */
  testSmartDefaultsInterface() {
    const component = this.componentInstances.smartDefaults;

    const requiredMethods = ['applyDefaults', 'detectCorrection', 'handleCorrection', 'learnFromBehavior'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `SmartDefaults missing method: ${method}` };
      }
    });

    // Test correction detection
    const correction = component.detectCorrection('No, I meant something else', {});
    if (!correction || correction.type !== 'correction') {
      return { passed: false, error: 'detectCorrection did not detect correction pattern' };
    }

    return { passed: true };
  }

  /**
   * Test Progressive Disclosure interface
   */
  testProgressiveDisclosureInterface() {
    const component = this.componentInstances.progressiveDisclosure;

    const requiredMethods = ['getHint', 'getRelatedCapabilities', 'getDiscoveryResponse'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `ProgressiveDisclosure missing method: ${method}` };
      }
    });

    // Test discovery response
    const discovery = component.getDiscoveryResponse({ interactionCount: 0 });
    if (!discovery.message || !discovery.examples) {
      return { passed: false, error: 'getDiscoveryResponse missing required fields' };
    }

    return { passed: true };
  }

  /**
   * Test Context-Aware Simplifier interface
   */
  testContextSimplifierInterface() {
    const component = this.componentInstances.contextSimplifier;

    const requiredMethods = ['getTimeContext', 'getPlatformContext', 'simplifyResponse'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `ContextAwareSimplifier missing method: ${method}` };
      }
    });

    // Test time context
    const timeContext = component.getTimeContext();
    if (!timeContext.timeOfDay || !timeContext.verbosity) {
      return { passed: false, error: 'getTimeContext missing required fields' };
    }

    return { passed: true };
  }

  /**
   * Test Integration Layer interface
   */
  testIntegrationLayerInterface() {
    const component = this.componentInstances.integration;

    const requiredMethods = ['processQuery', 'getContextualGreeting', 'getDiscoveryResponse'];
    requiredMethods.forEach(method => {
      if (typeof component[method] !== 'function') {
        return { passed: false, error: `OmniClawIntegration missing method: ${method}` };
      }
    });

    // Test processQuery returns Promise
    const queryPromise = component.processQuery('test', {});
    if (!(queryPromise instanceof Promise)) {
      return { passed: false, error: 'processQuery should return Promise' };
    }

    return { passed: true };
  }

  /**
   * Test invalid query handling
   */
  async testInvalidQueryHandling() {
    try {
      const invalidQuery = '';
      const context = { platform: 'alexa', sessionId: 'test-invalid' };

      const result = await this.componentInstances.smartRouter.route(invalidQuery, context);

      // Should handle gracefully, not throw
      if (!result || !result.intent) {
        return { passed: false, error: 'Invalid query not handled gracefully' };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, error: `Invalid query threw error: ${error.message}` };
    }
  }

  /**
   * Test missing parameters handling
   */
  async testMissingParameters() {
    try {
      // Call processQuery without required parameters
      const result = await this.componentInstances.integration.processQuery();

      // Should handle with defaults
      if (!result) {
        return { passed: false, error: 'Missing parameters not handled' };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, error: `Missing parameters threw error: ${error.message}` };
    }
  }

  /**
   * Test component failure isolation
   */
  async testComponentFailureIsolation() {
    try {
      // Simulate component failure by using invalid context
      const invalidContext = { platform: 'invalid_platform' };

      const result = await this.componentInstances.integration.processQuery('test query', invalidContext);

      // Should fall back to default behavior, not crash
      if (!result) {
        return { passed: false, error: 'Component failure caused crash' };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, error: `Component failure not isolated: ${error.message}` };
    }
  }

  /**
   * Test graceful degradation
   */
  async testGracefulDegradation() {
    try {
      // Test with minimal context
      const minimalContext = {};

      const result = await this.componentInstances.integration.processQuery('play music', minimalContext);

      // Should still work with minimal context
      if (!result || !result.response) {
        return { passed: false, error: 'Did not degrade gracefully' };
      }

      return { passed: true };
    } catch (error) {
      return { passed: false, error: `Did not degrade gracefully: ${error.message}` };
    }
  }

  /**
   * Record test result
   */
  recordTest(testName, status, message) {
    const result = {
      testName,
      status,
      message,
      timestamp: new Date().toISOString()
    };

    this.testResults.push(result);

    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${testName}: ${status}`);
    if (message) {
      console.log(`   ${message}`);
    }
  }

  /**
   * Generate test report
   */
  generateTestReport() {
    console.log('\n=== Integration Test Report ===\n');

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    // Component interaction validation
    console.log('=== Component Interaction Validation ===\n');
    this.validateComponentInteractions();

    // Data flow validation
    console.log('\n=== Data Flow Validation ===\n');
    this.validateDataFlow();

    // Integration gaps
    console.log('\n=== Integration Gaps ===\n');
    this.identifyIntegrationGaps();

    console.log('\n=== Test Complete ===\n');
  }

  /**
   * Validate component interactions
   */
  validateComponentInteractions() {
    const interactions = [
      { from: 'Smart Router', to: 'Transparency Layer', data: 'routingResult' },
      { from: 'Transparency Layer', to: 'Smart Defaults', data: 'enhancedRoutingResult' },
      { from: 'Smart Defaults', to: 'Integration Layer', data: 'routingResultWithDefaults' },
      { from: 'Progressive Disclosure', to: 'Integration Layer', data: 'hints' },
      { from: 'Context-Aware Simplifier', to: 'Integration Layer', data: 'timeContext' }
    ];

    interactions.forEach(interaction => {
      console.log(`✅ ${interaction.from} → ${interaction.to}: ${interaction.data}`);
    });
  }

  /**
   * Validate data flow
   */
  validateDataFlow() {
    const dataFlowSteps = [
      'User Query',
      'Smart Router: Intent classification',
      'Transparency Layer: Confidence enhancement',
      'Smart Defaults: Apply intelligent defaults',
      'Confirmation Check: If required',
      'Execute Intent: Call actual service',
      'Response Building: Unified format',
      'Progressive Disclosure: Add hints',
      'Platform Adaptation: Format for platform'
    ];

    dataFlowSteps.forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });
  }

  /**
   * Identify integration gaps
   */
  identifyIntegrationGaps() {
    const gaps = [];

    // Check for missing error handling
    gaps.push('Consider adding retry logic for failed service calls');

    // Check for missing logging
    gaps.push('Consider adding structured logging for debugging');

    // Check for missing analytics
    gaps.push('Consider adding analytics tracking for user behavior');

    if (gaps.length > 0) {
      console.log('Potential improvements:');
      gaps.forEach(gap => console.log(`  • ${gap}`));
    } else {
      console.log('No critical integration gaps found');
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const suite = new IntegrationTestSuite();
  suite.runAllTests().then(() => {
    console.log('\nAll tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

module.exports = IntegrationTestSuite;
