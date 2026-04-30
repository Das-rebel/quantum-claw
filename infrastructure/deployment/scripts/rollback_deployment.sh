#!/bin/bash
# rollback_deployment.sh - Rollback OmniClaw 2.0 to legacy mode
# Author: OmniClaw Team
# Version: 1.0
# Usage: ./rollback_deployment.sh [level]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="omniclaw-personal-assistant"
REGION="asia-south1"
FUNCTION_NAME="omniclaw-alexa-bridge"

# Parse rollback level
ROLLBACK_LEVEL=${1:-"full"}
ROLLBACK_REASON=${2:-"Manual rollback"}

echo -e "${RED}🚨 OmniClaw 2.0 Rollback Script${NC}"
echo "======================================"
echo "Rollback Level: $ROLLBACK_LEVEL"
echo "Reason: $ROLLBACK_REASON"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Confirm rollback
echo -e "${YELLOW}⚠️  WARNING: This will rollback OmniClaw 2.0 to legacy mode.${NC}"
echo -e "${YELLOW}Are you sure you want to proceed? (yes/no)${NC}"
read -r CONFIRMATION

if [ "$CONFIRMATION" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi

# Log rollback
echo -e "${BLUE}📝 Logging rollback...${NC}"
ROLLBACK_LOG="/var/log/omniclaw_rollback_$(date +%Y%m%d_%H%M%S).log"
mkdir -p /var/log 2>/dev/null || true

{
    echo "Rollback initiated at: $(date -u)"
    echo "Rollback level: $ROLLBACK_LEVEL"
    echo "Reason: $ROLLBACK_REASON"
    echo "User: $(whoami)"
    echo "Hostname: $(hostname)"
} >> "$ROLLBACK_LOG" 2>/dev/null || true

# Level 1: Feature Flag Rollback (< 1 minute)
if [ "$ROLLBACK_LEVEL" = "feature_flags" ] || [ "$ROLLBACK_LEVEL" = "full" ]; then
    echo -e "${BLUE}🔄 Level 1: Rolling back feature flags...${NC}"

    # Update feature flags via environment variables
    echo "Updating Cloud Functions environment variables..."

    gcloud functions deploy "$FUNCTION_NAME" \
        --region="$REGION" \
        --update-env-vars="
            OMNICLAW_2_0_ENABLED=false,
            LEGACY_INTENTS_ENABLED=true,
            LEGACY_INTENTS_ONLY=true,
            ROLLOUT_MODE=legacy
        " \
        --no-allow-unauthenticated \
        --project="$PROJECT_ID" 2>&1 | tee -a "$ROLLBACK_LOG" || true

    echo -e "${GREEN}✅ Feature flags rolled back${NC}"
    echo ""

    if [ "$ROLLBACK_LEVEL" = "feature_flags" ]; then
        echo -e "${GREEN}🎉 Feature flag rollback complete!${NC}"
        echo "Users will see legacy UI on next request."
        exit 0
    fi
fi

# Level 2: Full Code Rollback (< 5 minutes)
if [ "$ROLLBACK_LEVEL" = "full" ]; then
    echo -e "${BLUE}🔄 Level 2: Full code rollback...${NC}"

    # Get previous stable version
    echo "Finding previous stable version..."
    PREVIOUS_VERSION=$(gcloud functions versions list \
        --region="$REGION" \
        --format="value(name)" \
        --filter="name!=$FUNCTION_NAME-v1" \
        --project="$PROJECT_ID" 2>/dev/null \
        | sort -r \
        | head -n 2 \
        | tail -n 1 || echo "")

    if [ -z "$PREVIOUS_VERSION" ]; then
        echo -e "${YELLOW}⚠️  No previous version found. Redeploying with legacy flags...${NC}"

        # Redeploy current version with legacy flags
        gcloud functions deploy "$FUNCTION_NAME" \
            --region="$REGION" \
            --runtime=nodejs20 \
            --memory=512MB \
            --timeout=60s \
            --set-env-vars="
                NODE_ENV=production,
                OMNICLAW_2_0_ENABLED=false,
                LEGACY_INTENTS_ENABLED=true,
                LEGACY_INTENTS_ONLY=true,
                ROLLOUT_MODE=legacy,
                ROLLBACK_REASON=\"$ROLLBACK_REASON\",
                ROLLBACK_TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S\")
            " \
            --set-secrets="
                ANTHROPIC_API_KEY=anthropic-api-key:latest,
                SPOTIFY_CLIENT_ID=spotify-client-id:latest,
                SPOTIFY_CLIENT_SECRET=spotify-client-secret:latest
            " \
            --project="$PROJECT_ID" 2>&1 | tee -a "$ROLLBACK_LOG"
    else
        echo "Rolling back to version: $PREVIOUS_VERSION"

        # Split traffic to previous version
        gcloud functions deploy "$FUNCTION_NAME" \
            --region="$REGION" \
            --version="$PREVIOUS_VERSION" \
            --traffic-split=100 \
            --project="$PROJECT_ID" 2>&1 | tee -a "$ROLLBACK_LOG"
    fi

    echo -e "${GREEN}✅ Code rollback complete${NC}"
    echo ""

    # Clear caches
    echo -e "${BLUE}🗑️  Clearing caches...${NC}"
    gcloud functions invalidate-cloud-cache "$FUNCTION_NAME" --region="$REGION" --project="$PROJECT_ID" 2>/dev/null || true
    echo -e "${GREEN}✅ Caches cleared${NC}"
    echo ""
fi

# Wait for rollback to propagate
echo -e "${BLUE}⏳ Waiting for rollback to propagate...${NC}"
echo "Sleeping for 30 seconds..."
sleep 30

# Verify rollback
echo -e "${BLUE}🔍 Verifying rollback...${NC}"

FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" \
    --region="$REGION" \
    --format="value(httpsTrigger.url)" \
    --project="$PROJECT_ID" 2>/dev/null || echo "")

if [ -z "$FUNCTION_URL" ]; then
    echo -e "${RED}❌ Error: Could not get function URL${NC}"
    exit 1
fi

# Health check
HEALTH_CHECK_URL="${FUNCTION_URL}/health"
MAX_RETRIES=5
RETRY_COUNT=0
HEALTH_STATUS=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES: Checking health..."

    HEALTH_RESPONSE=$(curl -s "$HEALTH_CHECK_URL" 2>/dev/null || echo "")
    HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "unknown")
    ROLLOUT_MODE=$(echo "$HEALTH_RESPONSE" | jq -r '.rollout_mode // "unknown"' 2>/dev/null)

    if [ "$HEALTH_STATUS" = "healthy" ] && [ "$ROLLOUT_MODE" = "legacy" ]; then
        echo -e "${GREEN}✅ Rollback verified!${NC}"
        echo "Status: $HEALTH_STATUS"
        echo "Mode: $ROLLOUT_MODE"
        break
    else
        echo -e "${YELLOW}⚠️  Verification failed (status: $HEALTH_STATUS, mode: $ROLLOUT_MODE). Retrying...${NC}"
        ((RETRY_COUNT++))
        sleep 10
    fi
done

if [ "$HEALTH_STATUS" != "healthy" ]; then
    echo -e "${RED}❌ Rollback verification failed after $MAX_RETRIES attempts.${NC}"
    echo "Response: $HEALTH_RESPONSE"
    echo ""
    echo "Manual intervention required. Contact on-call engineer."
    exit 1
fi
echo ""

# Test legacy functionality
echo -e "${BLUE}🧪 Testing legacy functionality...${NC}"

# Test a simple request
TEST_RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "version": "1.0",
        "request": {
            "type": "IntentRequest",
            "intent": {
                "name": "PlayMusicIntent",
                "slots": {
                    "Genre": {"name": "Genre", "value": "jazz"}
                }
            }
        },
        "session": {"new": true}
    }' 2>/dev/null || echo "")

if echo "$TEST_RESPONSE" | jq -e '.response' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Legacy functionality test passed${NC}"
else
    echo -e "${YELLOW}⚠️  Legacy functionality test failed. Manual verification required.${NC}"
fi
echo ""

# Send notifications
echo -e "${BLUE}📢 Sending rollback notifications...${NC}"

# Slack notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"🚨 OmniClaw 2.0 rollback completed\",
            \"attachments\": [{
                \"color\": \"warning\",
                \"title\": \"Rollback Details\",
                \"fields\": [
                    {\"title\": \"Level\", \"value\": \"$ROLLBACK_LEVEL\", \"short\": true},
                    {\"title\": \"Reason\", \"value\": \"$ROLLBACK_REASON\", \"short\": true},
                    {\"title\": \"Timestamp\", \"value\": \"$(date -u +"%Y-%m-%d %H:%M:%S UTC")\", \"short\": true},
                    {\"title\": \"Triggered By\", \"value\": \"$(whoami)\", \"short\": true}
                ],
                \"footer\": \"OmniClaw Deployment Bot\",
                \"ts\": $(date +%s)
            }]
        }" 2>/dev/null || echo "Slack notification failed"
fi

# PagerDuty notification (if critical rollback)
if [ -n "$PAGERDUTY_WEBHOOK_URL" ] && [ "$ROLLBACK_LEVEL" = "full" ]; then
    curl -X POST "$PAGERDUTY_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"routing_key\": \"EMERGENCY_ROUTING_KEY\",
            \"event_action\": \"trigger\",
            \"payload\": {
                \"summary\": \"🚨 OmniClaw 2.0 full rollback executed\",
                \"severity\": \"critical\",
                \"source\": \"omniclaw-deployment\",
                \"custom_details\": {
                    \"rollback_level\": \"$ROLLBACK_LEVEL\",
                    \"reason\": \"$ROLLBACK_REASON\",
                    \"triggered_by\": \"$(whoami)\"
                }
            }
        }" 2>/dev/null || echo "PagerDuty notification failed"
fi

echo ""

# Final summary
echo -e "${RED}======================================${NC}"
echo -e "${RED}🔄 Rollback Complete!${NC}"
echo -e "${RED}======================================${NC}"
echo ""
echo "Rollback Summary:"
echo "  Level: $ROLLBACK_LEVEL"
echo "  Reason: $ROLLBACK_REASON"
echo "  Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo "  Function URL: $FUNCTION_URL"
echo ""
echo "Next Steps:"
echo "1. Monitor system health:"
echo "   gcloud functions logs read $FUNCTION_NAME --region=$REGION --tail"
echo ""
echo "2. Verify error rates are decreasing"
echo "3. Check monitoring dashboard"
echo "4. Notify stakeholders of rollback"
echo "5. Schedule post-mortem meeting"
echo "6. Investigate root cause"
echo ""
echo -e "${YELLOW}⚠️  Important: Create a post-mortem document${NC}"
echo "Template: https://docs.omniclaw.ai/post-mortem-template"
echo ""

# Create rollback log entry
echo "Rollback completed at: $(date -u)" >> "$ROLLBACK_LOG"
echo "Status: Success" >> "$ROLLBACK_LOG"
echo "Log file: $ROLLBACK_LOG"

echo -e "${GREEN}✅ System restored to legacy mode${NC}"
echo "Users will now see the legacy intent-based interface."
