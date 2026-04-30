#!/usr/bin/env node
/**
 * smoke_tests.js - Post-deployment smoke tests for OmniClaw 2.0
 * Author: OmniClaw Team
 * Version: 1.0
 *
 * These tests verify critical functionality after deployment.
 * All tests must pass before considering the deployment successful.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.FUNCTION_URL ||
    'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge';
const HEALTH_URL = `${BASE_URL}/health`;
const ALEXA_URL = `${BASE_URL}/alexa`;

// Test results
const results = {
    passed: [],
    failed: [],
    skipped: []
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test: Health Check
async function testHealthCheck() {
    log('\n📊 Test 1: Health Check', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        const response = await axios.get(HEALTH_URL, {
            timeout: 10000
        });

        const { status, version, rollout_mode, timestamp } = response.data;

        if (status !== 'healthy') {
            throw new Error(`Health status is "${status}", expected "healthy"`);
        }

        if (!version) {
            throw new Error('Version field missing from health check');
        }

        log(`✅ Status: ${status}`, 'green');
        log(`✅ Version: ${version}`, 'green');
        log(`✅ Rollout Mode: ${rollout_mode}`, 'green');
        log(`✅ Timestamp: ${timestamp}`, 'green');

        results.passed.push('Health Check');
        return true;
    } catch (error) {
        log(`❌ Health check failed: ${error.message}`, 'red');
        results.failed.push({
            test: 'Health Check',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Test: Natural Language Request
async function testNaturalLanguageRequest() {
    log('\n🗣️  Test 2: Natural Language Request', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        const requestData = {
            version: '1.0',
            request: {
                type: 'IntentRequest',
                requestId: 'smoke-test-' + Date.now(),
                intent: {
                    name: 'NaturalLanguageIntent',
                    confirmationStatus: 'NONE'
                },
                slots: {
                    Query: {
                        name: 'Query',
                        value: 'play some jazz music',
                        confirmationStatus: 'NONE'
                    }
                }
            },
            session: {
                new: true,
                sessionId: 'smoke-test-session-' + Date.now(),
                application: {
                    applicationId: 'amzn1.ask.skill.xxxxx'
                },
                user: {
                    userId: 'smoke-test-user'
                }
            },
            context: {
                System: {
                    application: {
                        applicationId: 'amzn1.ask.skill.xxxxx'
                    },
                    user: {
                        userId: 'smoke-test-user',
                        accessToken: null
                    },
                    device: {
                        deviceId: 'smoke-test-device'
                    }
                }
            }
        };

        const response = await axios.post(ALEXA_URL, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // Verify response structure
        if (!response.data) {
            throw new Error('No response data received');
        }

        if (!response.data.response) {
            throw new Error('Response object missing from response');
        }

        if (typeof response.data.response.shouldEndSession !== 'boolean') {
            throw new Error('shouldEndSession field missing or invalid');
        }

        log(`✅ Request processed successfully`, 'green');
        log(`✅ Response structure valid`, 'green');
        log(`✅ shouldEndSession: ${response.data.response.shouldEndSession}`, 'green');

        // Log response output (if present)
        if (response.data.response.outputSpeech) {
            const speech = response.data.response.outputSpeech.text ||
                          response.data.response.outputSpeech.ssml;
            log(`📢 Response: ${speech}`, 'cyan');
        }

        results.passed.push('Natural Language Request');
        return true;
    } catch (error) {
        log(`❌ Natural language request failed: ${error.message}`, 'red');
        if (error.response) {
            log(`   Response status: ${error.response.status}`, 'red');
            log(`   Response data:`, 'red');
            log(JSON.stringify(error.response.data, null, 2), 'red');
        }
        results.failed.push({
            test: 'Natural Language Request',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Test: Legacy Intent Fallback
async function testLegacyIntentFallback() {
    log('\n🔄 Test 3: Legacy Intent Fallback', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        const requestData = {
            version: '1.0',
            request: {
                type: 'IntentRequest',
                requestId: 'smoke-test-legacy-' + Date.now(),
                intent: {
                    name: 'PlayMusicIntent',
                    confirmationStatus: 'NONE'
                },
                slots: {
                    Genre: {
                        name: 'Genre',
                        value: 'jazz',
                        confirmationStatus: 'NONE'
                    }
                }
            },
            session: {
                new: true,
                sessionId: 'smoke-test-session-legacy-' + Date.now(),
                application: {
                    applicationId: 'amzn1.ask.skill.xxxxx'
                },
                user: {
                    userId: 'smoke-test-user-legacy'
                }
            },
            context: {
                System: {
                    application: {
                        applicationId: 'amzn1.ask.skill.xxxxx'
                    },
                    user: {
                        userId: 'smoke-test-user-legacy',
                        accessToken: null
                    },
                    device: {
                        deviceId: 'smoke-test-device-legacy'
                    }
                }
            }
        };

        const response = await axios.post(ALEXA_URL, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (!response.data || !response.data.response) {
            throw new Error('Invalid response structure');
        }

        log(`✅ Legacy intent processed successfully`, 'green');
        log(`✅ Fallback mechanism working`, 'green');

        results.passed.push('Legacy Intent Fallback');
        return true;
    } catch (error) {
        log(`❌ Legacy intent fallback failed: ${error.message}`, 'red');
        results.failed.push({
            test: 'Legacy Intent Fallback',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Test: Error Handling
async function testErrorHandling() {
    log('\n⚠️  Test 4: Error Handling', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        // Send invalid request
        const invalidData = {
            version: '1.0',
            request: {
                type: 'InvalidRequestType',
                requestId: 'smoke-test-error-' + Date.now()
            }
        };

        const response = await axios.post(ALEXA_URL, invalidData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: () => true // Don't throw on error status
        });

        // We expect either a 200 with error response or 4xx/5xx status
        if (response.status >= 400) {
            log(`✅ Error returned with status ${response.status}`, 'green');
            results.passed.push('Error Handling');
            return true;
        }

        if (response.data && response.data.response) {
            // Check if it's an error response
            if (response.data.response.outputSpeech &&
                (response.data.response.outputSpeech.text?.toLowerCase().includes('sorry') ||
                 response.data.response.outputSpeech.text?.toLowerCase().includes('error'))) {
                log(`✅ Error handled gracefully`, 'green');
                results.passed.push('Error Handling');
                return true;
            }
        }

        throw new Error('Expected error response not received');
    } catch (error) {
        log(`❌ Error handling test failed: ${error.message}`, 'red');
        results.failed.push({
            test: 'Error Handling',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Test: Response Time
async function testResponseTime() {
    log('\n⏱️  Test 5: Response Time', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        const requestData = {
            version: '1.0',
            request: {
                type: 'IntentRequest',
                requestId: 'smoke-test-perf-' + Date.now(),
                intent: {
                    name: 'NaturalLanguageIntent'
                },
                slots: {
                    Query: {
                        name: 'Query',
                        value: 'what time is it'
                    }
                }
            },
            session: {
                new: true,
                sessionId: 'smoke-test-perf-' + Date.now(),
                application: {
                    applicationId: 'amzn1.ask.skill.xxxxx'
                },
                user: {
                    userId: 'smoke-test-user-perf'
                }
            },
            context: {
                System: {
                    application: {
                        applicationId: 'amzn1.ask.skill.xxxxx'
                    },
                    user: {
                        userId: 'smoke-test-user-perf'
                    },
                    device: {
                        deviceId: 'smoke-test-device-perf'
                    }
                }
            }
        };

        const startTime = Date.now();
        const response = await axios.post(ALEXA_URL, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        const endTime = Date.now();

        const responseTime = endTime - startTime;

        if (responseTime > 5000) {
            throw new Error(`Response time ${responseTime}ms exceeds threshold of 5000ms`);
        }

        log(`✅ Response time: ${responseTime}ms`, 'green');
        log(`✅ Within acceptable limits (< 5000ms)`, 'green');

        results.passed.push('Response Time');
        return true;
    } catch (error) {
        log(`❌ Response time test failed: ${error.message}`, 'red');
        results.failed.push({
            test: 'Response Time',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Test: Feature Flag Configuration
async function testFeatureFlags() {
    log('\n🚩 Test 6: Feature Flag Configuration', 'blue');
    log('─────────────────────────────────────', 'blue');

    try {
        const response = await axios.get(`${BASE_URL}/feature-flags`, {
            timeout: 10000
        });

        const flags = response.data;

        if (!flags || typeof flags !== 'object') {
            throw new Error('Invalid feature flags response');
        }

        const requiredFlags = ['OMNICLAW_2_0_ENABLED', 'LEGACY_INTENTS_ENABLED'];
        const missingFlags = requiredFlags.filter(flag => !(flag in flags));

        if (missingFlags.length > 0) {
            throw new Error(`Missing required flags: ${missingFlags.join(', ')}`);
        }

        log(`✅ Feature flags loaded`, 'green');
        log(`✅ OMNICLAW_2_0_ENABLED: ${flags.OMNICLAW_2_0_ENABLED}`, 'green');
        log(`✅ LEGACY_INTENTS_ENABLED: ${flags.LEGACY_INTENTS_ENABLED}`, 'green');

        results.passed.push('Feature Flag Configuration');
        return true;
    } catch (error) {
        log(`❌ Feature flag test failed: ${error.message}`, 'red');
        results.failed.push({
            test: 'Feature Flag Configuration',
            error: error.message,
            details: error.response?.data || error.stack
        });
        return false;
    }
}

// Main test runner
async function runSmokeTests() {
    log('🧪 OmniClaw 2.0 Smoke Tests', 'cyan');
    log('═'.repeat(50), 'cyan');
    log(`Base URL: ${BASE_URL}`, 'cyan');
    log(`Started: ${new Date().toISOString()}`, 'cyan');
    log('═'.repeat(50), 'cyan');

    const tests = [
        { name: 'Health Check', fn: testHealthCheck },
        { name: 'Natural Language Request', fn: testNaturalLanguageRequest },
        { name: 'Legacy Intent Fallback', fn: testLegacyIntentFallback },
        { name: 'Error Handling', fn: testErrorHandling },
        { name: 'Response Time', fn: testResponseTime },
        { name: 'Feature Flags', fn: testFeatureFlags }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const result = await test.fn();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            log(`\n❌ Unexpected error in ${test.name}: ${error.message}`, 'red');
            results.failed.push({
                test: test.name,
                error: 'Unexpected error',
                details: error.stack
            });
            failed++;
        }

        // Brief pause between tests
        await sleep(1000);
    }

    // Print summary
    log('\n' + '═'.repeat(50), 'cyan');
    log('📊 Test Summary', 'cyan');
    log('═'.repeat(50), 'cyan');
    log(`Total Tests: ${tests.length}`, 'cyan');
    log(`Passed: ${passed}`, 'green');
    log(`Failed: ${failed}`, 'red');
    log(`Skipped: ${results.skipped.length}`, 'yellow');
    log('═'.repeat(50), 'cyan');

    // Print failed test details
    if (results.failed.length > 0) {
        log('\n❌ Failed Tests:', 'red');
        results.failed.forEach((failure, index) => {
            log(`\n${index + 1}. ${failure.test}`, 'red');
            log(`   Error: ${failure.error}`, 'red');
            if (process.env.DEBUG === 'true') {
                log(`   Details: ${JSON.stringify(failure.details, null, 2)}`, 'red');
            }
        });
    }

    // Save results to file
    const resultsPath = path.join(__dirname, `smoke-test-results-${Date.now()}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log(`\n📁 Results saved to: ${resultsPath}`, 'cyan');

    // Exit with appropriate code
    if (failed > 0) {
        log('\n❌ Smoke tests failed!', 'red');
        log('Please review the failures above and consider rolling back.', 'red');
        log('Rollback command: ./scripts/rollback_deployment.sh', 'red');
        process.exit(1);
    } else {
        log('\n✅ All smoke tests passed!', 'green');
        log('Deployment verified successfully!', 'green');
        process.exit(0);
    }
}

// Run tests if this is the main module
if (require.main === module) {
    runSmokeTests().catch(error => {
        log(`\n💥 Fatal error running smoke tests: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    });
}

module.exports = { runSmokeTests, results };
