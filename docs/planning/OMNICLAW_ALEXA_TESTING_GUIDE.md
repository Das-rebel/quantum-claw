# 🧪 OmniClaw-Alexa Testing Execution Guide
## Complete Capability Testing Framework

---

## 🚀 **Quick Start Testing**

### **Option 1: Full Validation + Testing (Recommended)**
```bash
cd /Users/Subho/openclaw-alexa-bridge

# Step 1: Validate system readiness
node validate_omniclaw_capabilities.js

# Step 2: Run comprehensive tests
bash run_omniclaw_tests.sh

# Step 3: Review results
cat test_results/test_report_*.json | head -50
```

### **Option 2: Direct Testing**
```bash
# Run comprehensive tests directly
node test_omniclaw_alexa_comprehensive.js
```

---

## 📊 **Test Coverage Matrix**

### **🎯 Phase 1: Single Capabilities (36 tests)**

| Category | Capabilities | Tests | Validation |
|----------|--------------|-------|------------|
| **AI Providers** | Z.ai, MiniMax, Cerebras, Groq, Sarvam | 5 | Response quality, provider accuracy |
| **Languages** | English, Hindi, Bengali | 3 | Language detection, appropriate responses |
| **Information** | Tavily, Wikipedia, YouTube, Twitter, Reddit | 5 | Data retrieval, accuracy, relevance |
| **Voice** | Google TTS, Sarvam TTS, ElevenLabs | 3 | Audio generation, voice quality |

### **🔗 Phase 2: Combinations (48 tests)**

| Combination | Tests | Focus |
|-------------|-------|-------|
| **AI + Web Search** | 4 | Real-time info, fact retrieval, accuracy |
| **AI + YouTube** | 4 | Video processing, summarization |
| **AI + Social Media** | 4 | Social trend analysis, sentiment |
| **AI + TTS** | 4 | Voice responses, multi-language |
| **Multi-AI Providers** | 4 | Fallback, performance, quality comparison |
| **Advanced Combos** | 4 | Complex multi-step queries |

### **🔄 Phase 3: Permutations (108 tests)**

| Permutation Type | Variations | Tests |
|-----------------|------------|-------|
| **Provider × Language** | 5 providers × 3 languages × 3 query types | 45 |
| **Information Source × Query** | 5 sources × 4 query types | 20 |
| **TTS × Content** | 3 TTS × 5 content types | 15 |
| **Context Scenarios** | 4 scenarios × multiple capabilities | 28 |

### **⚡ Phase 4: Stress Tests (24 tests)**

| Test Type | Scenarios | Focus |
|-----------|-----------|-------|
| **Performance** | Concurrent, large input | Response time, stability |
| **Error Handling** | Provider failures, network issues | Graceful degradation |
| **Edge Cases** | Special characters, empty input | Robustness, proper handling |

---

## 🧪 **Test Execution Details**

### **Pre-Test Validation**

```bash
# Run capability validator
node validate_omniclaw_capabilities.js

# Expected output:
# ✅ Main health endpoint: HEALTHY
# ✅ OmniClaw backend: ACCESSIBLE
# ✅ Alexa endpoint: OPERATIONAL
# ✅ AI Provider: WORKING
# ✅ Language Detection: WORKING
# ✅ Web Search: WORKING
# ✅ TTS System: WORKING
```

### **Comprehensive Test Execution**

```bash
# Run full test suite
node test_omniclaw_alexa_comprehensive.js

# Output shows real-time progress:
# 🎯 PHASE 1: Single Capability Tests
# 🧪 Testing: Z.ai Provider - Basic Query
#    ✅ PASSED (2341ms)
# 🧪 Testing: Multi-Language - English
#    ✅ PASSED (1892ms)
# ...
# 📊 Generating Test Report...
# 📋 TEST SUMMARY
# ================
# Total Tests: 216
# ✅ Passed: 204
# ❌ Failed: 12
# 📈 Success Rate: 94.4%
```

---

## 📋 **Test Cases by Category**

### **🤖 AI Provider Tests**

```javascript
// Z.ai Provider Tests
- Basic query handling
- Complex reasoning
- Creative content generation
- Technical explanations
- Multi-turn conversations

// Provider Fallback Tests
- Primary provider failure
- Automatic fallback activation
- Quality comparison
- Response consistency
```

### **🌐 Multi-Language Tests**

```javascript
// Language Detection
- English: "Hello, how are you?"
- Hindi: "नमस्ते, आप कैसे हैं?"
- Bengali: "হ্যালো, আপ কেমন আছেন?"
- Mixed: "Hello और नमस्ते"

// Response Validation
- Appropriate language response
- Cultural context awareness
- Accent and dialect handling
```

### **🔍 Information Retrieval Tests**

```javascript
// Web Search (Tavily)
- Current events: "Latest AI news"
- Factual queries: "Population of India"
- Technical: "Quantum computing applications"

// Wikipedia
- Encyclopedia: "History of computing"
- Biographical: "Who invented the World Wide Web"
- Scientific: "What is machine learning"

// Social Media
- Twitter trends: "Viral topics today"
- Reddit discussions: "Top posts in r/technology"
- YouTube: "Python tutorial videos"
```

### **🗣️ Voice & TTS Tests**

```javascript
// TTS System Tests
- Google TTS: Basic speech synthesis
- Sarvam TTS: Indian language voices
- ElevenLabs: Premium voice quality

// Voice Optimization
- Response length: Short (< 50 words)
- Response length: Medium (50-150 words)
- Response length: Long (> 150 words)
- Technical content handling
```

---

## ⚡ **Performance Testing**

### **Concurrent Load Testing**

```bash
# Test with 5 concurrent requests
# This tests the system's ability to handle multiple simultaneous users
```

### **Response Time Validation**

```bash
# Expected performance targets:
# Simple queries: < 2 seconds
# Complex queries: < 5 seconds
# Web search: < 7 seconds
# Video processing: < 10 seconds
```

### **Stress Testing**

```bash
# Edge cases:
- Very long queries (1000+ characters)
- Special characters and emoji
- Empty or invalid input
- Rapid consecutive requests
```

---

## 📊 **Success Criteria**

### **✅ Pass Requirements**

- **Overall Success Rate**: ≥ 95% (205/216 tests)
- **Core Capabilities**: 100% working
- **Critical Features**: 100% working (AI, TTS, Search)
- **Response Time**: 90% of tests < 5 seconds
- **Error Handling**: Graceful failures, no crashes

### **⚠️ Warning Indicators**

- **Success Rate**: 90-95% (some capabilities may need tuning)
- **Response Time**: 80-90% tests < 5 seconds (performance optimization needed)
- **Partial Failures**: Some specific capability combinations failing

### **❌ Fail Indicators**

- **Success Rate**: < 90% (major issues need addressing)
- **Core Capabilities**: Not working
- **System Instability**: Crashes, hangs, or timeouts

---

## 🔧 **Troubleshooting Test Failures**

### **Common Issues**

**Issue**: "Connection refused" or "Endpoint not found"
```bash
# Solution: Check deployment status
gcloud functions describe omniclaw-alexa-bridge --region=asia-south1 --project=omniclaw-personal-assistant

# Redeploy if needed
bash deploy-omniclaw-alexa.sh
```

**Issue**: "Timeout errors"
```bash
# Solution: Check function logs
gcloud functions logs read omniclaw-alexa-bridge --region=asia-south1 --project=omniclaw-personal-assistant --limit=50

# Check OmniClaw backend status
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api-handler/health
```

**Issue**: "Specific capability failing"
```bash
# Solution: Check specific provider configuration
# For example, if Tavily fails, check API key validity
# If TTS fails, check provider status
```

---

## 📈 **Test Report Analysis**

### **Report Components**

Each test generates detailed report including:

```json
{
  "name": "Z.ai Provider - Basic Query",
  "phase": "1",
  "category": "ai_provider",
  "passed": true,
  "responseTime": 2341,
  "validation": {
    "passed": true
  },
  "response": {
    "text": "Artificial intelligence is...",
    "provider": "zai",
    "confidence": 0.95
  }
}
```

### **Aggregated Metrics**

- **Success Rate**: % of tests passed
- **Average Response Time**: Mean performance
- **Capability Coverage**: % of capabilities tested
- **Provider Performance**: Individual provider stats
- **Language Support**: Multi-language success rates

---

## 🚀 **Ready to Test?**

```bash
# Navigate to test directory
cd /Users/Subho/openclaw-alexa-bridge

# Make script executable (if not already)
chmod +x run_omniclaw_tests.sh
chmod +x test_omniclaw_alexa_comprehensive.js
chmod +x validate_omniclaw_capabilities.js

# Run validation first
node validate_omniclaw_capabilities.js

# If validation passes, run full tests
bash run_omniclaw_tests.sh
```

---

**🎉 This comprehensive testing framework will validate every permutation and combination of OmniClaw-Alexa capabilities, ensuring your system is production-ready!**