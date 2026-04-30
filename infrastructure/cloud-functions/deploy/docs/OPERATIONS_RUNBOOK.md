# OmniClaw 2.0 Operations Runbook

Complete operational guide for managing OmniClaw 2.0 in production.

## Table of Contents

- [Operations Overview](#operations-overview)
- [Feature Flag Management](#feature-flag-management)
- [Monitoring & Alerting](#monitoring--alerting)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Maintenance Tasks](#maintenance-tasks)
- [Incident Response](#incident-response)
- [Performance Tuning](#performance-tuning)

---

## Operations Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Environment                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Google Cloud Functions (us-central1)           │   │
│  │  - omniclawHandler (max 100 instances)               │   │
│  │  - 512MB memory per instance                         │   │
│  │  - 60s timeout                                        │   │
│  └────────────┬─────────────────────────────────────────┘   │
│               │                                               │
│               ▼                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Firestore Database                            │   │
│  │  - Analytics data                                     │   │
│  │  - Feature flag configuration                         │   │
│  │  - User preferences                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Cloud Monitoring & Logging                    │   │
│  │  - Real-time metrics                                  │   │
│  │  - Error tracking                                     │   │
│  │  - Performance monitoring                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Service Level Objectives (SLOs)

| Metric | SLO | Current | Status |
|--------|-----|---------|--------|
| Availability | 99.9% | 99.95% | ✅ Healthy |
| Response Time (P95) | <5s | 3.2s | ✅ Healthy |
| Error Rate | <1% | 0.8% | ✅ Healthy |
| Task Completion Rate | >85% | 89% | ✅ Healthy |

### On-Call Responsibilities

- **Primary:** Respond to alerts within 15 minutes
- **Secondary:** Escalate to team lead if unresolved in 1 hour
- **Documentation:** Update runbook after incidents

---

## Feature Flag Management

### Daily Operations

#### Check Feature Flag Status

```bash
# Get current feature flag status
curl -X GET https://your-cloud-function-url/feature-flags \
  -H "Authorization: Bearer $API_KEY"

# Response:
{
  "simplified_ui": {
    "enabled": true,
    "rolloutPercentage": 50,
    "whitelistCount": 5,
    "blacklistCount": 0
  },
  "smart_router": {
    "enabled": true,
    "rolloutPercentage": 50,
    "whitelistCount": 0,
    "blacklistCount": 0
  }
}
```

#### Monitor Rollout Progress

```bash
# Check A/B test group assignments
curl -X GET https://your-cloud-function-url/ab-test-status \
  -H "Authorization: Bearer $API_KEY"

# Response:
{
  "ui_simplification": {
    "controlAssignments": 245,
    "treatmentAssignments": 255,
    "totalAssignments": 500,
    "targetSampleSize": 100,
    "sufficientData": true
  }
}
```

### Rollout Procedures

#### Gradual Rollout Process

**Phase 1: Internal Testing (1-2 days)**
```javascript
// Enable for internal team only
flags.addToWhitelist('simplified_ui', 'admin-user-1');
flags.addToWhitelist('simplified_ui', 'admin-user-2');
flags.addToWhitelist('simplified_ui', 'admin-user-3');
```

**Phase 2: 10% Rollout (3-5 days)**
```bash
curl -X POST https://your-cloud-function-url/update-rollout \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui",
    "percentage": 10
  }'
```

**Monitoring Checklist:**
- [ ] Error rate < 1%
- [ ] Response time P95 < 5s
- [ ] Task completion rate > 80%
- [ ] User satisfaction > 4.0/5

**Phase 3: 25% Rollout (5-7 days)**
```bash
curl -X POST https://your-cloud-function-url/update-rollout \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui",
    "percentage": 25
  }'
```

**Phase 4: 50% Rollout (7-10 days)**
```bash
curl -X POST https://your-cloud-function-url/update-rollout \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui",
    "percentage": 50
  }'
```

**Phase 5: 100% Rollout**
```bash
curl -X POST https://your-cloud-function-url/update-rollout \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui",
    "percentage": 100
  }'
```

### Emergency Rollback

#### Instant Rollback Procedure

```bash
# Immediately disable feature
curl -X POST https://your-cloud-function-url/disable-feature \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui"
  }'

# Response:
{
  "status": "disabled",
  "feature": "simplified_ui",
  "timestamp": "2026-04-19T15:30:00.000Z"
}
```

#### Rollback Decision Matrix

| Error Rate | Response Time | User Impact | Action |
|------------|---------------|-------------|--------|
| <1% | <5s | None | Monitor |
| 1-5% | 5-10s | Minor | Reduce rollout 25% |
| 5-10% | 10-30s | Moderate | Reduce rollout 50% |
| >10% | >30s | Major | Instant rollback |

### Feature Flag Auditing

#### View Audit Trail

```bash
# Get feature flag changes
curl -X GET https://your-cloud-function-url/feature-flag-audit \
  -H "Authorization: Bearer $API_KEY" \
  -G --data-urlencode "startDate=2026-04-01" \
  --data-urlencode "endDate=2026-04-19"

# Response:
{
  "changes": [
    {
      "timestamp": "2026-04-19T10:00:00.000Z",
      "feature": "simplified_ui",
      "action": "update_rollout",
      "details": {
        "oldPercentage": 10,
        "newPercentage": 25
      },
      "operator": "admin@omniclaw.ai"
    }
  ]
}
```

---

## Monitoring & Alerting

### Dashboard Setup

#### Key Metrics to Monitor

```javascript
// Real-time dashboard data
const dashboard = await tracker.getDashboardData();

// Critical metrics
console.log('Summary:', {
  totalSessions: dashboard.summary.totalSessions,
  totalInteractions: dashboard.summary.totalInteractions,
  overallCompletionRate: dashboard.summary.overallCompletionRate,
  errorRate: dashboard.errorRate.rate
});

// Performance metrics
console.log('Performance:', {
  timeToFirstAction: dashboard.timeToFirstAction.average,
  responseTimeP95: dashboard.timeToFirstAction.p95,
  userSatisfaction: dashboard.userSatisfaction.average
});

// A/B test comparison
console.log('A/B Test:', dashboard.abTestComparison);
```

### Alert Configuration

#### Cloud Monitoring Alerts

```yaml
# alert-policy.yaml
type: com.google.cloud.monitoring.alerting.policy
displayName: OmniClaw Error Rate Alert
conditions:
  - displayName: Error rate > 1%
    conditionThreshold:
      filter: resource.type="cloud_function" AND metric.type="logging.googleapis.com/user/omniclaw_error_rate"
      comparison: COMPARISON_GT
      thresholdValue: 0.01
      duration: 300s
      aggregations:
        - alignmentPeriod: 60s
          perSeriesAligner: ALIGN_RATE
alertStrategy:
  notificationPrompts:
    - prompt: "Notify immediately"
      promptInterval: 300s
notificationChannels:
  - projects/omniclaw/notificationChannels/1
```

#### Alert Escalation Matrix

| Severity | Response Time | Escalation | Notifications |
|----------|---------------|------------|---------------|
| P0 - Critical | 5 min | Engineering lead | PagerDuty, Slack, Email |
| P1 - High | 15 min | On-call engineer | Slack, Email |
| P2 - Medium | 1 hour | Team lead | Email |
| P3 - Low | Next business day | Team | Email |

### Log Analysis

#### Query Error Logs

```bash
# View recent errors
gcloud logging read "resource.type=cloud_function AND severity>=ERROR" \
  --limit=50 \
  --format=json

# Filter by error type
gcloud logging read \
  'resource.type=cloud_function AND jsonPayload.code="SERVICE_UNAVAILABLE"' \
  --limit=100 \
  --format=json

# Analyze error patterns
gcloud logging read \
  'resource.type=cloud_function AND severity>=ERROR' \
  --freshness=1h \
  | jq -r '.[] | .jsonPayload.code' | sort | uniq -c | sort -rn
```

#### Performance Analysis

```bash
# View slow requests
gcloud logging read \
  'resource.type=cloud_function AND jsonPayload.responseTime>5000' \
  --limit=50 \
  --format=json

# Calculate response time percentiles
gcloud logging read \
  'resource.type=cloud_function AND jsonPayload.responseTime' \
  --freshness=1h \
  | jq -r '.[] | .jsonPayload.responseTime' | \
  awk '{print $1}' | sort -n | \
  awk 'BEGIN{c=0} {a[c++]=$1} END{print "P50:", a[int(c*0.5)]; print "P95:", a[int(c*0.95)]; print "P99:", a[int(c*0.99)]}'
```

---

## Rollback Procedures

### Decision Framework

#### When to Rollback

**Immediate Rollback (P0):**
- Error rate > 10%
- Data loss or corruption
- Security vulnerability
- Complete service outage

**Consider Rollback (P1):**
- Error rate 5-10%
- Response time > 30s
- Task completion rate < 70%
- User satisfaction < 3.0/5

**Monitor Only (P2):**
- Error rate 1-5%
- Response time 10-30s
- Task completion rate 70-80%
- User satisfaction 3.0-4.0

### Rollback Steps

#### 1. Immediate Rollback

```bash
# Step 1: Disable feature
curl -X POST https://your-cloud-function-url/disable-feature \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"feature": "simplified_ui"}'

# Step 2: Verify rollback
curl -X GET https://your-cloud-function-url/feature-flags \
  -H "Authorization: Bearer $API_KEY"

# Step 3: Notify team
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 ROLLBACK: simplified_ui disabled due to [reason]",
    "username": "OmniClaw Ops",
    "icon_emoji": ":rotating_light:"
  }'
```

#### 2. Gradual Rollback

```bash
# Reduce rollout by 25%
curl -X POST https://your-cloud-function-url/update-rollout \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "feature": "simplified_ui",
    "percentage": 25
  }'

# Monitor for 1 hour
# If still issues, reduce to 0%
```

#### 3. Post-Rollback Analysis

```javascript
// Analyze what went wrong
const analytics = await tracker.getDashboardData();

console.log('Pre-Rollout Metrics:', {
  errorRate: analytics.errorRate.rate,
  responseTime: analytics.timeToFirstAction.average,
  completionRate: analytics.summary.overallCompletionRate
});

// Get error breakdown
const errors = await tracker.exportMetrics('json');
const errorData = JSON.parse(errors);

// Identify root cause
const errorByType = {};
errorData.forEach(session => {
  session.errors.forEach(error => {
    errorByType[error.code] = (errorByType[error.code] || 0) + 1;
  });
});

console.log('Error breakdown:', errorByType);
```

---

## Troubleshooting Guide

### Common Issues

#### Issue: High Error Rate

**Symptoms:**
- Error rate > 5%
- Many 500 errors
- Service timeouts

**Diagnosis:**
```bash
# Check error logs
gcloud logging read \
  'resource.type=cloud_function AND severity>=ERROR' \
  --freshness=15m \
  --format=json

# Check external service status
curl -X GET https://api.spotify.com/v1/
curl -X GET https://en.wikipedia.org/api/rest_v1/
```

**Solutions:**
1. Check external service availability
2. Increase timeout settings
3. Enable retry logic
4. Reduce rollout percentage

---

#### Issue: Slow Response Times

**Symptoms:**
- P95 response time > 10s
- Users experiencing delays
- Timeout errors

**Diagnosis:**
```bash
# Check cold start times
gcloud logging read \
  'resource.type=cloud_function AND jsonPayload.coldStart=true' \
  --freshness=1h \
  --format=json

# Check function instance count
gcloud functions describe omniclawHandler \
  --region=us-central1 \
  --format=json | jq '.status.instanceCount'
```

**Solutions:**
1. Increase memory allocation
2. Enable min instances
3. Optimize code paths
4. Use session caching

---

#### Issue: Low Task Completion Rate

**Symptoms:**
- Completion rate < 80%
- Users abandoning tasks
- Negative feedback

**Diagnosis:**
```javascript
// Get completion metrics
const dashboard = await tracker.getDashboardData();

console.log('Completion rate:', dashboard.summary.overallCompletionRate);

// Analyze failed tasks
const failedTasks = [];
for (const [sessionId, session] of tracker.metrics.entries()) {
  session.interactions.forEach(interaction => {
    if (!interaction.success) {
      failedTasks.push({
        query: interaction.query,
        intent: interaction.intent,
        confidence: interaction.confidence,
        capability: interaction.capability
      });
    }
  });
}

// Group by capability
const failuresByCapability = {};
failedTasks.forEach(task => {
  failuresByCapability[task.capability] = (failuresByCapability[task.capability] || 0) + 1;
});

console.log('Failures by capability:', failuresByCapability);
```

**Solutions:**
1. Improve routing accuracy for problematic capabilities
2. Add more training examples
3. Implement fallback strategies
4. Improve error messages

---

#### Issue: Feature Flags Not Working

**Symptoms:**
- Feature always disabled
- Users not assigned to correct groups
- Rollout percentage not respected

**Diagnosis:**
```bash
# Check feature flag configuration
curl -X GET https://your-cloud-function-url/feature-flags \
  -H "Authorization: Bearer $API_KEY"

# Check user assignment
curl -X GET https://your-cloud-function-url/ab-test-group \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "testName": "ui_simplification",
    "userId": "test-user-123"
  }'
```

**Solutions:**
1. Clear feature flag cache
2. Verify user ID hash consistency
3. Check for blacklist/whitelist conflicts
4. Restart function instances

---

### Diagnostic Commands

#### Health Check

```bash
# Complete system health check
curl -X GET https://your-cloud-function-url/health \
  -H "Authorization: Bearer $API_KEY"

# Response:
{
  "status": "healthy",
  "timestamp": "2026-04-19T15:30:00.000Z",
  "checks": {
    "featureFlags": "ok",
    "analytics": "ok",
    "externalServices": "ok",
    "database": "ok"
  }
}
```

#### Feature Status

```bash
# Check all features
curl -X GET https://your-cloud-function-url/feature-status \
  -H "Authorization: Bearer $API_KEY"

# Response:
{
  "simplified_ui": {
    "enabled": true,
    "rolloutPercentage": 50,
    "activeUsers": 1234
  },
  "smart_router": {
    "enabled": true,
    "rolloutPercentage": 50,
    "activeUsers": 1234
  }
}
```

---

## Maintenance Tasks

### Daily Tasks

**Morning (9:00 AM)**
- [ ] Check error rate (target: <1%)
- [ ] Review alert dashboard
- [ ] Verify feature flag status
- [ ] Check A/B test progress

**Afternoon (2:00 PM)**
- [ ] Review user feedback
- [ ] Monitor performance metrics
- [ ] Check response times
- [ ] Update team on status

**Evening (6:00 PM)**
- [ ] Review daily metrics
- [ ] Check for anomalies
- [ ] Plan next day's rollout changes

### Weekly Tasks

**Monday**
- [ ] Review weekly metrics report
- [ ] Analyze A/B test results
- [ ] Plan rollout changes for the week
- [ ] Team sync meeting

**Wednesday**
- [ ] Mid-week performance review
- [ ] Adjust rollout if needed
- [ ] Review user feedback
- [ ] Update documentation

**Friday**
- [ ] End-of-week summary
- [ ] Backup analytics data
- [ ] Review incident reports
- [ ] Plan weekend maintenance

### Monthly Tasks

**Monthly Review**
- [ ] Comprehensive metrics analysis
- [ ] Feature flag audit
- [ ] Performance optimization review
- [ ] Security audit
- [ ] Cost analysis
- [ ] Capacity planning

**Maintenance Activities**
- [ ] Clear old session data
- [ ] Archive analytics data
- [ ] Update dependencies
- [ ] Review and update runbook
- [ ] Training and documentation

---

## Incident Response

### Severity Levels

#### P0 - Critical

**Definition:** Complete service outage or data loss

**Examples:**
- All users unable to access service
- Database corruption
- Security breach

**Response:**
1. **0-5 min:** Acknowledge alert, notify team
2. **5-15 min:** Begin investigation, start rollback if needed
3. **15-30 min:** Implement fix or rollback
4. **30-60 min:** Verify fix, monitor recovery
5. **60+ min:** Post-incident review

#### P1 - High

**Definition:** Significant service degradation

**Examples:**
- Error rate > 10%
- Response time > 30s
- Major feature broken

**Response:**
1. **0-15 min:** Acknowledge alert
2. **15-30 min:** Begin investigation
3. **30-60 min:** Implement fix
4. **60-120 min:** Verify fix
5. **24 hours:** Post-incident review

#### P2 - Medium

**Definition:** Minor service issues

**Examples:**
- Error rate 5-10%
- Response time 10-30s
- Some features degraded

**Response:**
1. **0-1 hour:** Acknowledge alert
2. **1-2 hours:** Investigation
3. **2-4 hours:** Implement fix
4. **Next business day:** Post-incident review

#### P3 - Low

**Definition:** Minor issues with no user impact

**Examples:**
- Error rate 1-5%
- Non-critical features broken
- Documentation issues

**Response:**
1. **Next business day:** Acknowledge
2. **1-2 business days:** Investigate
3. **1 week:** Implement fix

### Incident Communication

#### Internal Communication

```bash
# Slack notification
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 INCIDENT: [Title]",
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "🚨 P0 Incident: Service Outage"
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "title": "Severity",
            "value": "P0 - Critical"
          },
          {
            "type": "mrkdwn",
            "title": "Assigned",
            "value": "@oncall"
          },
          {
            "type": "mrkdwn",
            "title": "Status",
            "value": "Investigating"
          }
        ]
      }
    ]
  }'
```

#### External Communication

```bash
# Status page update
curl -X POST https://api.statuspage.io/v1/pages/PAGE_ID/incidents \
  -H "Authorization: OAuth YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "incident": {
      "name": "Service Outage",
      "status": "investigating",
      "impact_override": "critical",
      "body": "We are currently investigating a service outage affecting all users."
    }
  }'
```

### Post-Incident Review

#### Template

```markdown
# Post-Incident Review: [Incident Title]

## Summary
- **Date:** [Date]
- **Duration:** [X hours]
- **Severity:** [P0/P1/P2/P3]
- **Impact:** [Number of users affected]

## Timeline
- **00:00** - Incident detected
- **00:15** - Investigation started
- **00:30** - Root cause identified
- **01:00** - Fix implemented
- **01:30** - Service restored

## Root Cause
[What went wrong and why]

## Resolution
[How it was fixed]

## Follow-up Actions
- [ ] [Action item 1]
- [ ] [Action item 2]
- [ ] [Action item 3]

## Lessons Learned
[What we learned and how to prevent recurrence]
```

---

## Performance Tuning

### Optimization Strategies

#### 1. Reduce Cold Starts

```javascript
// Enable min instances
gcloud functions deploy omniclawHandler \
  --min-instances=5 \
  --max-instances=100
```

#### 2. Optimize Memory

```bash
# Test different memory configurations
gcloud functions deploy omniclawHandler \
  --memory=256MB   # Test 256MB
gcloud functions deploy omniclawHandler \
  --memory=512MB   # Test 512MB
gcloud functions deploy omniclawHandler \
  --memory=1024MB  # Test 1GB
```

#### 3. Implement Caching

```javascript
// Cache routing results
const routingCache = new Map();
const CACHE_TTL = 300000;  // 5 minutes

function getCachedRouting(query) {
  const cacheKey = query.toLowerCase().trim();
  const cached = routingCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  return null;
}

function setCachedRouting(query, result) {
  const cacheKey = query.toLowerCase().trim();
  routingCache.set(cacheKey, {
    result,
    timestamp: Date.now()
  });
}
```

#### 4. Parallel Processing

```javascript
// Execute independent operations in parallel
const [routingResult, timeContext, userContext] = await Promise.all([
  smartRouter.route(query),
  contextSimplifier.getTimeContext(),
  getUserContext(sessionId)
]);
```

### Performance Benchmarks

| Configuration | Cold Start | Warm Request | Cost/Request |
|---------------|------------|--------------|--------------|
| 256MB, 0 min | 3.5s | 800ms | $0.0000002 |
| 256MB, 5 min | 0ms | 800ms | $0.0000004 |
| 512MB, 0 min | 2.8s | 600ms | $0.0000004 |
| 512MB, 5 min | 0ms | 600ms | $0.0000008 |
| 1024MB, 0 min | 2.2s | 500ms | $0.0000008 |
| 1024MB, 5 min | 0ms | 500ms | $0.0000016 |

---

## Capacity Planning

### Scaling Projections

**Current Baseline:**
- 1,000 daily active users
- 10,000 daily requests
- 50 requests/minute peak

**Projected Growth:**
- Month 1: 2,000 users (2x)
- Month 3: 5,000 users (5x)
- Month 6: 10,000 users (10x)

**Required Capacity:**
- Month 1: 100 req/min → 10 instances
- Month 3: 250 req/min → 25 instances
- Month 6: 500 req/min → 50 instances

### Cost Optimization

**Monthly Cost Estimate:**
- 100 instances × 512MB × 100K requests = $50/month
- 1TB Firestore storage = $0.18/month
- Cloud Monitoring = $0.10/month

**Optimization Strategies:**
1. Use min instances to reduce cold starts
2. Implement caching to reduce request count
3. Optimize memory allocation
4. Archive old analytics data

---

## Support Contacts

### Team Structure

- **Engineering Lead:** lead@omniclaw.ai
- **On-Call Engineer:** oncall@omniclaw.ai
- **Product Manager:** pm@omniclaw.ai
- **DevOps Engineer:** devops@omniclaw.ai

### Escalation Contacts

- **Google Cloud Support:** Enterprise Support
- **External Services:** Individual service contacts
- **Security Team:** security@omniclaw.ai

### Documentation

- **Internal Wiki:** wiki.omniclaw.ai
- **API Docs:** docs.omniclaw.ai/api
- **Runbook:** docs.omniclaw.ai/ops

---

**Last Updated:** 2026-04-19
**Version:** 2.0
**Maintained By:** OmniClaw Operations Team
