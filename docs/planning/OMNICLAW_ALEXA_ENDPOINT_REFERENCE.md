# 🎯 OmniClaw-Alexa Bridge - Quick Reference Card

## **📍 CORRECT ALEXA ENDPOINT**

```
https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/alexa
```

**⚠️ CRITICAL**: You MUST include `/alexa` at the end!

---

## **🔧 Available Endpoints**

| Purpose | Endpoint | Usage |
|---------|----------|-------|
| **Alexa Skill** | `/alexa` | **Use this in Alexa Developer Console** |
| **Health Check** | `/health` | Test if function is running |
| **Function Info** | `/` | Get function information |

---

## **📱 Alexa Developer Console Configuration**

**Step 1:** Go to https://developer.amazon.com/alexa/console/ask

**Step 2:** Select your skill → "Interaction Model" → "Endpoints"

**Step 3:** Enter this EXACT URL:
```
https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/alexa
```

**Step 4:** Choose:
- ✅ **HTTPS** as the endpoint type
- ✅ **"My development endpoint is a sub-domain of a domain that has a wildcard certificate"**

---

## **🧪 Quick Testing**

### **Test Health:**
```bash
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/health
```

### **Test Alexa Endpoint:**
```bash
curl -X POST https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/alexa \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "request": {
      "type": "LaunchRequest",
      "requestId": "test-123",
      "timestamp": "2026-01-01T12:00:00Z"
    },
    "session": {
      "sessionId": "test-session",
      "user": {"userId": "test-user"}
    }
  }'
```

---

## **🎯 Common Mistakes to Avoid**

❌ **WRONG**: `https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge`
❌ **WRONG**: `https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/`
❌ **WRONG**: `https://omniclaw-alexa-bridge.cloudfunctions.net/alexa`

✅ **CORRECT**: `https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/alexa`

---

## **🚀 Deployment Commands**

```bash
# Deploy the function
cd /Users/Subho/openclaw-alexa-bridge
bash deploy-omniclaw-alexa.sh

# Monitor logs
gcloud functions logs tail omniclaw-alexa-bridge --region=asia-south1 --project=omniclaw-personal-assistant

# Check deployment status
gcloud functions describe omniclaw-alexa-bridge --region=asia-south1 --project=omniclaw-personal-assistant
```

---

## **📋 Pre-Flight Checklist**

Before testing in Alexa:

- [ ] ✅ Cloud Function deployed successfully
- [ ] ✅ Health endpoint returns: `{"status":"healthy"}`
- [ ] ✅ Alexa Developer Console configured with `/alexa` endpoint
- [ ] ✅ Testing enabled in Alexa Developer Console
- [ ] ✅ OmniClaw backend functions deployed and accessible

---

## **🎤 Testing with Alexa**

After deployment:

1. **Enable Testing** in Alexa Developer Console
2. **Open your Alexa app** on your phone
3. **Say**: "Alexa, open OmniClaw"
4. **Expected response**: "Welcome to OmniClaw Personal Assistant!"

---

**🎉 Remember: The secret is `/alexa` at the end!**