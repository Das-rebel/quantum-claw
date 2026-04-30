# 🚀 OmniClaw-Alexa Bridge Integration Plan
## Replace QuantumClaw with OmniClaw + Configure Alexa Endpoint

---

## 📊 Architecture Analysis

### 🔍 **Current State (QuantumClaw)**

```
Alexa Device → Alexa Bridge (QuantumClaw) → Multiple AI Providers
- Main Entry: quantum_claw_zai_main.js
- Cloud Function: cloud_fn_handler_v2.js
- Providers: Z.ai, Cerebras, Groq, Sarvam, etc.
- Configuration: config/index.js (quantumClaw section)
```

### 🎯 **Target State (OmniClaw)**

```
Alexa Device → Alexa Bridge (OmniClaw) → OmniClaw Personal Assistant
- Main Entry: omniclaw_alexa_main.js
- Cloud Function: omniclaw_cloud_function.js
- Backend: OmniClaw Personal Assistant API
- Configuration: Unified Google Secret Manager
```

---

## 🏗️ **Integration Architecture**

### 📋 **OmniClaw Personal Assistant Endpoints**

Based on our earlier infrastructure setup, OmniClaw has these Cloud Functions:

1. **api-handler** - Main API request handler
2. **fallback-handler** - Fallback system
3. **resilience-test** - Health check endpoint

### 🔗 **Alexa Bridge Integration Points**

**Current Alexa Bridge Structure:**
- **Express Server**: Local development server
- **Cloud Function**: Google Cloud Functions deployment
- **19 API Clients**: Individual service integrations
- **Multi-Provider System**: Fallback architecture

**Integration Strategy:**
1. **Replace QuantumClaw** branding with **OmniClaw**
2. **Point to OmniClaw backend** instead of individual providers
3. **Keep Alexa-specific logic** (voice, TTS, intent recognition)
4. **Use OmniClaw for intelligence** (reasoning, knowledge, processing)

---

## 🔄 **Replacement Strategy**

### Phase 1: Branding Replacement (Quick Wins)

**Files to Update:** ~107 files containing "quantumclaw"

**Priority Files:**
1. `quantum_claw_zai_main.js` → `omniclaw_alexa_main.js`
2. `cloud_fn_handler_v2.js` → `omniclaw_cloud_function.js`
3. `config/index.js` → Update configuration
4. Deployment scripts and documentation

**Replacement Pattern:**
```javascript
// OLD: QuantumClaw
class ZaiQuantumClaw { ... }
const quantumClaw = config.quantumClaw;

// NEW: OmniClaw
class OmniClawBridge { ... }
const omniclaw = config.omniclaw;
```

### Phase 2: Backend Integration (Core Change)

**Current Architecture:**
```javascript
// Alexa Bridge directly calls providers
const response = await cerebrasClient.generateContent(prompt);
```

**Target Architecture:**
```javascript
// Alexa Bridge calls OmniClaw backend
const response = await omniclawAPI.processRequest({
  prompt: prompt,
  context: alexaContext,
  capabilities: ['web_search', 'tts', 'multi_language']
});
```

### Phase 3: Alexa Endpoint Configuration

**OmniClaw Cloud Function Endpoint:**
```
https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api-handler
```

**Alexa Integration:**
```javascript
const OMNICLAW_ENDPOINT = 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api-handler';

async function callOmniClaw(request) {
  const response = await fetch(OMNICLAW_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${await getSecret('omniclaw-api-key')}`
    },
    body: JSON.stringify({
      query: request.intent,
      context: request.session,
      alexa_request: request
    })
  });

  return response.json();
}
```

---

## 📝 **Implementation Steps**

### ✅ **Step 1: Create OmniClaw Alexa Main**

```bash
# New file: omniclaw_alexa_main.js
# Based on: quantum_claw_zai_main.js
# Changes: Replace QuantumClaw with OmniClaw integration
```

### ✅ **Step 2: Create OmniClaw Cloud Function**

```bash
# New file: omniclaw_cloud_function.js
# Based on: cloud_fn_handler_v2.js
# Changes: Point to OmniClaw backend instead of direct providers
```

### ✅ **Step 3: Update Configuration**

```bash
# Update: config/index.js
# Changes: Add omniclaw section, keep quantumClaw for backwards compatibility
```

### ✅ **Step 4: Deploy Integration**

```bash
# Deploy to Google Cloud Functions
gcloud functions deploy omniclaw-alexa-bridge \
  --runtime=nodejs18 \
  --entry-point=omniclawAlexaHandler \
  --project=omniclaw-personal-assistant
```

---

## 🔧 **Technical Implementation**

### 🎯 **OmniClaw API Integration**

```javascript
/**
 * OmniClaw Client for Alexa Bridge
 * Handles communication between Alexa and OmniClaw backend
 */

const https = require('https');
const { getSecret } = require('./shared/security/secrets');

class OmniClawClient {
  constructor() {
    this.endpoint = 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api-handler';
    this.initialized = false;
    this.apiKey = null;
    this.initializePromise = this.initialize();
  }

  async initialize() {
    try {
      // Get OmniClaw API key from Secret Manager
      this.apiKey = await getSecret('omniclaw-api-key');
      this.initialized = true;
      console.log('✅ OmniClaw client initialized');
    } catch (error) {
      console.warn('⚠️  OmniClaw initialization failed, using fallback');
      // Fallback to direct provider access
      this.endpoint = null;
      this.initialized = true;
    }
  }

  async processAlexaRequest(request) {
    await this.ensureInitialized();

    if (!this.endpoint) {
      // Fallback to direct providers
      return this.fallbackToDirectProviders(request);
    }

    const requestData = {
      query: request.intent?.name || 'general',
      text: request.request?.intent?.slots?.?.text?.value || '',
      context: {
        session_id: request.session?.sessionId,
        user_id: request.session?.user?.userId,
        alexa_request: request
      },
      capabilities: ['voice_response', 'web_search', 'multi_language']
    };

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(requestData);
      const url = new URL(this.endpoint);

      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 30000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', async (error) => {
        console.warn('⚠️  OmniClaw API error, using fallback:', error.message);
        const fallback = await this.fallbackToDirectProviders(request);
        resolve(fallback);
      });

      req.write(data);
      req.end();
    });
  }

  async fallbackToDirectProviders(request) {
    // Use existing Cerebras/Groq clients as fallback
    const { CerebrasClient } = require('./src/cerebras_client');
    const client = new CerebrasClient();

    const prompt = request.request?.intent?.slots?.text?.value || 'Hello';
    const response = await client.generateContent(prompt);

    return {
      text: response.text,
      provider: 'cerebras-fallback',
      source: 'local'
    };
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initializePromise;
    }
  }
}

module.exports = OmniClawClient;
```

---

## 🚀 **Deployment Configuration**

### 📋 **Environment Variables**

```yaml
# omniclaw_env.yaml
OMNICLAW_ENDPOINT: "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/api-handler"
OMNICLAW_API_KEY: "omniclaw-api-key"
ALEXA_SKILL_ID: "amzn1.ask.skill.your-skill-id"
NODE_ENV: "production"
LOG_LEVEL: "info"
```

### 🔧 **Deployment Script**

```bash
#!/bin/bash
# deploy-omniclaw-alexa.sh

PROJECT_ID="omniclaw-personal-assistant"
REGION="asia-south1"
FUNCTION_NAME="omniclaw-alexa-bridge"

echo "🚀 Deploying OmniClaw Alexa Bridge..."

gcloud functions deploy $FUNCTION_NAME \
  --runtime=nodejs18 \
  --entry-point=omniclawAlexaHandler \
  --region=$REGION \
  --project=$PROJECT_ID \
  --memory=512MB \
  --timeout=30s \
  --max-instances=10 \
  --env-vars-file=omniclaw_env.yaml \
  --set-secrets=/etc/secrets/*=latest \
  --allow-unauthenticated

echo "✅ Deployment complete!"
echo "🔗 Endpoint: https://$REGION-$PROJECT_ID.cloudfunctions.net/$FUNCTION_NAME"
```

---

## 📊 **Migration Benefits**

### ✅ **Advantages of OmniClaw Integration**

1. **🏗️ Centralized Intelligence**: All AI processing in OmniClaw
2. **🔒 Enhanced Security**: Unified secret management
3. **📈 Better Scalability**: OmniClaw handles resource allocation
4. **🔄 Consistent Context**: Shared conversation history
5. **💰 Cost Optimization**: Efficient resource usage
6. **🧪 Easier Testing**: Single backend to test

### 🔧 **Maintained Alexa Features**

1. **🗣️ Voice Interaction**: Alexa-specific TTS handling
2. **🎯 Intent Recognition**: Alexa skill integration
3. **📱 Device Control**: Alexa ecosystem features
4. **🌐 Multi-language**: Language detection and routing

---

## 🎯 **Next Actions**

1. **Create OmniClaw client class** for Alexa Bridge
2. **Update main entry files** with OmniClaw branding
3. **Configure API endpoint** to OmniClaw backend
4. **Test integration** with sample Alexa requests
5. **Deploy to Google Cloud Functions**
6. **Update Alexa skill** to point to new endpoint

---

**This integration will create a unified AI assistant ecosystem where Alexa serves as the voice interface to the powerful OmniClaw Personal Assistant backend!**