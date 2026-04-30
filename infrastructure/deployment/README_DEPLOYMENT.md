# OmniClaw 2.0 Deployment Guide

**Version:** 2.0
**Last Updated:** 2025-04-19
**Deployment Platform:** GCP Cloud Functions (asia-south1)

---

## Quick Start

### For First-Time Deployment

```bash
# 1. Navigate to deployment directory
cd infrastructure/cloud-functions/deploy

# 2. Run pre-deployment checks
./scripts/pre_deployment_check.sh

# 3. Deploy to production (Phase 1 - 10% rollout)
./scripts/deploy_omniclaw_2_0.sh phase_1 10

# 4. Run smoke tests
node scripts/smoke_tests.js
```

### For Rollback

```bash
# Feature flag rollback (30 seconds)
./scripts/rollback_deployment.sh feature_flags

# Full code rollback (5 minutes)
./scripts/rollback_deployment.sh full
```

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Scripts](#deployment-scripts)
3. [Rollout Phases](#rollout-phases)
4. [Monitoring](#monitoring)
5. [Troubleshooting](#troubleshooting)
6. [Emergency Procedures](#emergency-procedures)

---

## Prerequisites

### System Requirements

- **Node.js:** >= 18.0.0
- **npm:** >= 9.0.0
- **gcloud CLI:** >= 400.0.0
- **jq:** >= 1.6
- **bash:** >= 4.0

### GCP Setup

```bash
# Authenticate with GCP
gcloud auth login

# Set project
gcloud config set project omniclaw-personal-assistant

# Set region
gcloud config set functions/region asia-south1

# Verify configuration
gcloud config list
```

### Required Secrets

Ensure the following secrets are configured in GCP Secret Manager:

```bash
# List secrets
gcloud secrets list --project=omniclaw-personal-assistant

# Required secrets:
# - anthropic-api-key
# - spotify-client-id
# - spotify-client-secret
```

### Environment Variables

```bash
# Optional: Set Slack webhook for notifications
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Optional: Set PagerDuty webhook for critical alerts
export PAGERDUTY_WEBHOOK_URL="https://events.pagerduty.com/v2/enqueue"
```

---

## Deployment Scripts

### pre_deployment_check.sh

**Purpose:** Verify system readiness before deployment

**Usage:**
```bash
./scripts/pre_deployment_check.sh
```

**Checks Performed:**
- System health status
- Error rate baseline
- GCP authentication
- Project configuration
- Cloud Functions quota
- Feature flag service
- Node.js version
- Required tools installation
- Existing deployment
- Environment variables (secrets)
- Disk space
- Network connectivity
- Git status
- Test suite
- Deployment scripts

**Exit Codes:**
- `0`: All checks passed
- `1`: Critical checks failed (deployment blocked)
- `0`: Passed with warnings (deployment allowed with caution)

**Output Example:**
```
🔍 Running pre-deployment checks for OmniClaw 2.0...
======================================
✅ PASS: System Health Check
✅ PASS: Error Rate Baseline
✅ PASS: GCP Authentication
...
✅ All pre-deployment checks passed! Ready to deploy.
```

---

### deploy_omniclaw_2_0.sh

**Purpose:** Deploy OmniClaw 2.0 to GCP Cloud Functions

**Usage:**
```bash
./scripts/deploy_omniclaw_2_0.sh [phase] [rollout_percentage]
```

**Arguments:**
- `phase`: Rollout phase (phase_1, phase_2, phase_3, phase_4)
- `rollout_percentage`: Rollout percentage (0-100)

**Examples:**
```bash
# Phase 1: Beta rollout (10%)
./scripts/deploy_omniclaw_2_0.sh phase_1 10

# Phase 2: Early adopters (25%)
./scripts/deploy_omniclaw_2_0.sh phase_2 25

# Phase 3: Majority rollout (50%)
./scripts/deploy_omniclaw_2_0.sh phase_3 50

# Phase 4: Full rollout (100%)
./scripts/deploy_omniclaw_2_0.sh phase_4 100
```

**Deployment Steps:**
1. Pre-flight checks
2. Install dependencies
3. Run tests
4. Build project (if needed)
5. Deploy to Cloud Functions
6. Wait for propagation
7. Verify deployment
8. Send notifications
9. Create Git tag

**Environment Variables Set:**
```
NODE_ENV=production
OMNICLAW_2_0_ENABLED=true
OMNICLAW_2_0_ROLLOUT_PHASE=<phase>
OMNICLAW_2_0_ROLLOUT_PERCENTAGE=<percentage>
LEGACY_INTENTS_ENABLED=true
LEGACY_INTENTS_FALLBACK=true
FEATURE_FLAG_DEBUG=false
LOG_LEVEL=info
```

**Output Example:**
```
🚀 OmniClaw 2.0 Deployment Script
======================================
Phase: phase_1
Rollout Percentage: 10%

🔍 Running pre-flight checks...
✅ Pre-flight checks passed

📦 Installing dependencies...
✅ Dependencies installed

🧪 Running tests...
✅ Tests passed

☁️  Deploying to GCP Cloud Functions...
...
✅ Deployment successful!

🎉 Deployment Complete!
======================================
```

---

### rollback_deployment.sh

**Purpose:** Rollback OmniClaw 2.0 to legacy mode

**Usage:**
```bash
./scripts/rollback_deployment.sh [level] [reason]
```

**Arguments:**
- `level`: Rollback level (feature_flags, full)
- `reason`: Reason for rollback (optional)

**Examples:**
```bash
# Quick feature flag rollback
./scripts/rollback_deployment.sh feature_flags

# Full rollback with reason
./scripts/rollback_deployment.sh full "High error rate detected"

# Emergency rollback
./scripts/rollback_deployment.sh full "Critical bug - user revolt"
```

**Rollback Levels:**

**Level 1: Feature Flag Rollback (< 1 minute)**
- Disables OmniClaw 2.0 via feature flags
- Enables legacy intents
- No code deployment required
- Immediate effect

**Level 2: Full Code Rollback (< 5 minutes)**
- Deploys previous stable version
- Resets all feature flags
- Clears all caches
- Verifies rollback

**Rollback Process:**
1. Confirm rollback
2. Log rollback
3. Execute rollback steps
4. Wait for propagation
5. Verify rollback
6. Test legacy functionality
7. Send notifications
8. Create rollback log

**Output Example:**
```
🚨 OmniClaw 2.0 Rollback Script
======================================
Rollback Level: full
Reason: High error rate detected
Timestamp: 2025-04-22 15:30:00 UTC

⚠️  WARNING: This will rollback OmniClaw 2.0 to legacy mode.
Are you sure you want to proceed? (yes/no)
yes

🔄 Level 2: Full code rollback...
✅ Code rollback complete

🔍 Verifying rollback...
✅ Rollback verified!

🔄 Rollback Complete!
======================================
```

---

### smoke_tests.js

**Purpose:** Post-deployment smoke tests to verify critical functionality

**Usage:**
```bash
node scripts/smoke_tests.js
```

**Environment Variables:**
```bash
# Optional: Override function URL
export FUNCTION_URL="https://your-function-url"

# Optional: Enable debug output
export DEBUG=true
```

**Tests Performed:**

1. **Health Check**
   - Verifies system health endpoint
   - Checks version information
   - Validates rollout mode

2. **Natural Language Request**
   - Tests natural language processing
   - Validates response structure
   - Measures response time

3. **Legacy Intent Fallback**
   - Tests backward compatibility
   - Validates fallback mechanism

4. **Error Handling**
   - Tests error response handling
   - Validates graceful degradation

5. **Response Time**
   - Measures response latency
   - Validates performance thresholds

6. **Feature Flags**
   - Verifies feature flag configuration
   - Validates required flags

**Exit Codes:**
- `0`: All tests passed
- `1`: One or more tests failed

**Output Example:**
```
🧪 OmniClaw 2.0 Smoke Tests
════════════════════════════════════════
Base URL: https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge
Started: 2025-04-22T10:30:00.000Z
════════════════════════════════════════

📊 Test 1: Health Check
─────────────────────────────────────
✅ Status: healthy
✅ Version: 2.0.0
✅ Rollout Mode: natural_language

🗣️  Test 2: Natural Language Request
─────────────────────────────────────
✅ Request processed successfully
✅ Response structure valid
✅ shouldEndSession: false

...

════════════════════════════════════════
📊 Test Summary
════════════════════════════════════════
Total Tests: 6
Passed: 6
Failed: 0
Skipped: 0
════════════════════════════════════════

✅ All smoke tests passed!
Deployment verified successfully!
```

---

## Rollout Phases

### Phase 1: Beta Rollout (Week 1)

**Dates:** April 22-28, 2026
**Target:** 10% of users
**Audience:** Beta testers and internal team

**Deployment:**
```bash
./scripts/deploy_omniclaw_2_0.sh phase_1 10
```

**Success Criteria:**
- Error rate < 2%
- Response time p95 < 3 seconds
- Task completion > 95%
- Zero critical bugs

**Monitoring:**
- Daily error rate reviews
- Response time monitoring
- User feedback collection
- Bug triage meetings

---

### Phase 2: Early Adopter Expansion (Week 2)

**Dates:** April 29 - May 5, 2026
**Target:** 25% of users
**Audience:** Early access users

**Deployment:**
```bash
./scripts/deploy_omniclaw_2_0.sh phase_2 25
```

**Success Criteria:**
- Error rate < 1.5%
- Response time p95 < 2.5 seconds
- 90%+ positive user sentiment
- Support tickets < 110% of baseline

**Monitoring:**
- Load testing (2x traffic)
- Performance optimization
- Support team training
- Documentation updates

---

### Phase 3: Majority Rollout (Week 3)

**Dates:** May 6-12, 2026
**Target:** 50% of users
**Audience:** Random selection

**Deployment:**
```bash
./scripts/deploy_omniclaw_2_0.sh phase_3 50
```

**Success Criteria:**
- Error rate < 1%
- Response time p95 < 2 seconds
- Cost per request within budget
- System handles 5x baseline traffic

**Monitoring:**
- Infrastructure capacity
- Cost monitoring
- Chaos engineering tests
- Database optimization

---

### Phase 4: Full Rollout (Week 4)

**Dates:** May 13-19, 2026
**Target:** 100% of users
**Audience:** All users

**Deployment:**
```bash
./scripts/deploy_omniclaw_2_0.sh phase_4 100
```

**Success Criteria:**
- System stable at 50% for 7 days
- All P0/P1 bugs resolved
- Performance meets baseline
- User adoption > 80%

**Monitoring:**
- Hourly checks (first 48 hours)
- Daily summaries
- Legacy deprecation planning
- Post-launch review

---

## Monitoring

### Dashboard Access

**Grafana Dashboard:**
- URL: `https://grafana.omniclaw.ai/d/omniclaw-2-0-rollout`
- Refresh: 30 seconds
- Time range: Last 1 hour (default)

**Key Metrics:**

1. **System Health**
   - Status: healthy/critical
   - Uptime: 99.9% target

2. **Error Rate**
   - Target: < 2%
   - Warning: > 2%
   - Critical: > 5%

3. **Response Time**
   - p50: < 1 second
   - p95: < 2 seconds
   - p99: < 5 seconds

4. **Task Completion**
   - Target: > 95%
   - Warning: < 95%
   - Critical: < 90%

5. **Infrastructure**
   - CPU: < 70%
   - Memory: < 80%
   - Instances: Auto-scale

6. **Cost**
   - Per 1000 requests
   - Budget tracking
   - Cost optimization

### Log Monitoring

**View Real-Time Logs:**
```bash
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --tail \
  --limit=50
```

**Filter by Severity:**
```bash
# Errors only
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --filter="severity>=ERROR"

# Warnings and errors
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --filter="severity>=WARNING"
```

**Filter by Time:**
```bash
# Last hour
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --freshness=1h

# Last 24 hours
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --freshness=24h
```

### Alert Configuration

**Critical Alerts (PagerDuty):**
- Error rate > 10% for 2 minutes
- Response time p95 > 10 seconds for 5 minutes
- Health check fails 3 times in 5 minutes

**Warning Alerts (Slack):**
- Error rate > 2% for 10 minutes
- Response time p95 > 5 seconds for 15 minutes
- Task completion < 90% for 20 minutes

---

## Troubleshooting

### Common Issues

#### Issue 1: Deployment Fails with "Authentication Error"

**Solution:**
```bash
# Re-authenticate with gcloud
gcloud auth login

# Verify authentication
gcloud auth list

# Re-deploy
./scripts/deploy_omniclaw_2_0.sh phase_1 10
```

#### Issue 2: High Error Rate After Deployment

**Solution:**
```bash
# 1. Check logs
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --filter="severity>=ERROR" \
  --limit=50

# 2. If critical, rollback immediately
./scripts/rollback_deployment.sh full "High error rate"

# 3. Investigate logs
gcloud functions logs read omniclaw-alexa-bridge \
  --region=asia-south1 \
  --freshness=1h > error_logs.txt

# 4. Analyze and fix issue
# 5. Redeploy with fix
```

#### Issue 3: Slow Response Times

**Solution:**
```bash
# 1. Check Cloud Functions metrics
gcloud functions describe omniclaw-alexa-bridge \
  --region=asia-south1 \
  --format="json"

# 2. Increase memory allocation
# Edit deploy script and change:
# MEMORY="512MB" to MEMORY="1024MB"

# 3. Redeploy
./scripts/deploy_omniclaw_2_0.sh phase_1 10

# 4. Monitor improvement
```

#### Issue 4: Feature Flags Not Working

**Solution:**
```bash
# 1. Verify feature flag configuration
cat config/feature_flags.json | jq .

# 2. Check environment variables
gcloud functions describe omniclaw-alexa-bridge \
  --region=asia-south1 \
  --format="json" \
  | jq '.serviceConfig.environmentVariables'

# 3. Manually update feature flags
gcloud functions deploy omniclaw-alexa-bridge \
  --region=asia-south1 \
  --update-env-vars="OMNICLAW_2_0_ENABLED=true"
```

#### Issue 5: Smoke Tests Failing

**Solution:**
```bash
# 1. Run with debug output
DEBUG=true node scripts/smoke_tests.js

# 2. Check individual test
# Edit smoke_tests.js and run specific test

# 3. Verify function is accessible
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/health

# 4. If tests fail, rollback
./scripts/rollback_deployment.sh full "Smoke tests failed"
```

---

## Emergency Procedures

### Emergency Rollback (< 5 minutes)

```bash
# 1. Immediate feature flag rollback (30 seconds)
./scripts/rollback_deployment.sh feature_flags

# 2. If that fails, full rollback (5 minutes)
./scripts/rollback_deployment.sh full "Emergency rollback"

# 3. Verify rollback
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/health

# 4. Notify team
# Slack: #omniclaw-2-0-critical
# PagerDuty: On-call engineer
```

### Emergency Shutdown (< 2 minutes)

```bash
# 1. Disable Alexa skill
ask api disable-skill -s amzn1.ask.skill.xxxxx --stage production

# 2. Delete Cloud Function
gcloud functions delete omniclaw-alexa-bridge \
  --region=asia-south1 \
  --quiet

# 3. Deploy maintenance page
gcloud functions deploy omniclaw-maintenance-page \
  --runtime=nodejs20 \
  --region=asia-south1 \
  --source=./infrastructure/cloud-functions/maintenance \
  --trigger-http

# 4. Notify emergency team
curl -X POST $PAGERDUTY_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"payload": {"summary": "EMERGENCY shutdown"}}'
```

### Incident Response

1. **Detect**
   - Monitor alerts
   - Check dashboards
   - Review logs

2. **Assess**
   - Determine severity
   - Identify impact
   - Estimate recovery time

3. **Respond**
   - Execute rollback if needed
   - Notify stakeholders
   - Create incident channel

4. **Recover**
   - Fix root cause
   - Deploy hotfix
   - Verify resolution

5. **Learn**
   - Post-mortem meeting
   - Document lessons learned
   - Update runbooks

---

## Support

### On-Call Rotation

**Week 1 (April 22-28):** Lead Backend Engineer
**Week 2 (April 29 - May 5):** Senior Frontend Engineer
**Week 3 (May 6-12):** DevOps Engineer
**Week 4 (May 13-19):** Tech Lead

### Contact Information

**Emergency Contacts:**
- **On-Call Engineer (24/7):** PagerDuty
- **Engineering Manager:** +91-XXX-XXX-XXXX
- **CTO:** +91-XXX-XXX-XXXX

**Slack Channels:**
- `#omniclaw-2-0-critical` - Critical alerts only
- `#omniclaw-2-0-operations` - Daily operations
- `#omniclaw-2-0-rollout` - Rollout updates

### Documentation

- [Rollout Plan](./OMNICLAW_2_0_ROLLOUT_PLAN.md)
- [Runbooks](https://docs.omniclaw.ai/runbooks)
- [API Documentation](https://docs.omniclaw.ai/api)
- [Architecture](https://docs.omniclaw.ai/architecture)

---

## Best Practices

1. **Always run pre-deployment checks** before deploying
2. **Monitor closely** for at least 1 hour after deployment
3. **Test rollback procedures** regularly
4. **Keep runbooks updated** with lessons learned
5. **Communicate proactively** with stakeholders
6. **Document all changes** and incidents
7. **Review metrics daily** during rollout
8. **Celebrate successes** with the team!

---

**Document Version:** 1.0
**Last Updated:** 2025-04-19
**Maintained By:** OmniClaw Deployment Team
