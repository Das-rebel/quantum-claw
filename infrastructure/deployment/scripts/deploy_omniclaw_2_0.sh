#!/bin/bash
# deploy_omniclaw_2_0.sh - Deploy OmniClaw 2.0 to GCP Cloud Functions
# Author: OmniClaw Team
# Version: 1.0
# Usage: ./deploy_omniclaw_2_0.sh [phase] [rollout_percentage]

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
RUNTIME="nodejs20"
MEMORY="512MB"
TIMEOUT="60s"
MAX_INSTANCES=100
MIN_INSTANCES=0
CPU=1
CONCURRENCY=80

# Parse arguments
PHASE=${1:-"phase_1"}
ROLLOUT_PERCENTAGE=${2:-"10"}

echo -e "${BLUE}🚀 OmniClaw 2.0 Deployment Script${NC}"
echo "======================================"
echo "Phase: $PHASE"
echo "Rollout Percentage: ${ROLLOUT_PERCENTAGE}%"
echo ""

# Validate rollout percentage
if ! [[ "$ROLLOUT_PERCENTAGE" =~ ^[0-9]+$ ]] || [ "$ROLLOUT_PERCENTAGE" -lt 0 ] || [ "$ROLLOUT_PERCENTAGE" -gt 100 ]; then
    echo -e "${RED}❌ Invalid rollout percentage. Must be between 0 and 100.${NC}"
    exit 1
fi

# Pre-flight checks
echo -e "${BLUE}🔍 Running pre-flight checks...${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run from the deploy directory.${NC}"
    exit 1
fi

# Check gcloud authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    echo -e "${RED}❌ Error: Not authenticated with gcloud. Run: gcloud auth login${NC}"
    exit 1
fi

# Check project configuration
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  Warning: Current project is $CURRENT_PROJECT. Setting to $PROJECT_ID...${NC}"
    gcloud config set project "$PROJECT_ID"
fi

echo -e "${GREEN}✅ Pre-flight checks passed${NC}"
echo ""

# Step 1: Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm ci --production --loglevel=error
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 2: Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
if jq -e '.scripts.test' package.json > /dev/null 2>&1; then
    if npm test 2>&1; then
        echo -e "${GREEN}✅ Tests passed${NC}"
    else
        echo -e "${RED}❌ Tests failed. Aborting deployment.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  No test script found, skipping tests${NC}"
fi
echo ""

# Step 3: Build the project (if needed)
if jq -e '.scripts.build' package.json > /dev/null 2>&1; then
    echo -e "${BLUE}🔨 Building project...${NC}"
    npm run build
    echo -e "${GREEN}✅ Build completed${NC}"
    echo ""
fi

# Step 4: Deploy to Cloud Functions
echo -e "${BLUE}☁️  Deploying to GCP Cloud Functions...${NC}"
echo "This may take 5-10 minutes..."

# Create deployment timestamp
DEPLOYMENT_TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
DEPLOYMENT_TAG="omniclaw_2_0_${PHASE}_${DEPLOYMENT_TIMESTAMP}"

# Deploy command
gcloud functions deploy "$FUNCTION_NAME" \
    --runtime="$RUNTIME" \
    --region="$REGION" \
    --memory="$MEMORY" \
    --timeout="$TIMEOUT" \
    --max-instances="$MAX_INSTANCES" \
    --min-instances="$MIN_INSTANCES" \
    --cpu="$CPU" \
    --concurrency="$CONCURRENCY" \
    --ingress-settings=all \
    --allow-unauthenticated \
    --source=. \
    --entry-point=alexaHandler \
    --trigger-http \
    --set-env-vars="
        NODE_ENV=production,
        OMNICLAW_2_0_ENABLED=true,
        OMNICLAW_2_0_ROLLOUT_PHASE=$PHASE,
        OMNICLAW_2_0_ROLLOUT_PERCENTAGE=$ROLLOUT_PERCENTAGE,
        LEGACY_INTENTS_ENABLED=true,
        LEGACY_INTENTS_FALLBACK=true,
        FEATURE_FLAG_DEBUG=false,
        LOG_LEVEL=info,
        DEPLOYMENT_TAG=$DEPLOYMENT_TAG,
        DEPLOYMENT_TIMESTAMP=$DEPLOYMENT_TIMESTAMP
    " \
    --set-secrets="
        ANTHROPIC_API_KEY=anthropic-api-key:latest,
        SPOTIFY_CLIENT_ID=spotify-client-id:latest,
        SPOTIFY_CLIENT_SECRET=spotify-client-secret:latest
    " \
    --labels="deployment=omniclaw_2_0,phase=$PHASE,rollout=$ROLLOUT_PERCENTAGE" \
    --tag="$DEPLOYMENT_TAG"

DEPLOYMENT_STATUS=$?

if [ $DEPLOYMENT_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo "Please check the logs for more information:"
    echo "  gcloud functions logs read $FUNCTION_NAME --region=$REGION --limit=50"
    exit 1
fi
echo ""

# Step 5: Wait for deployment to propagate
echo -e "${BLUE}⏳ Waiting for deployment to propagate...${NC}"
echo "Sleeping for 30 seconds..."
sleep 30

# Step 6: Verify deployment
echo -e "${BLUE}🔍 Verifying deployment...${NC}"

# Get the function URL
FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" \
    --region="$REGION" \
    --format="value(httpsTrigger.url)")

echo "Function URL: $FUNCTION_URL"

# Health check
HEALTH_CHECK_URL="${FUNCTION_URL}/health"
echo "Health check URL: $HEALTH_CHECK_URL"

MAX_RETRIES=5
RETRY_COUNT=0
HEALTH_STATUS=""

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES: Checking health..."

    HEALTH_RESPONSE=$(curl -s "$HEALTH_CHECK_URL" 2>/dev/null || echo "")
    HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "unknown")

    if [ "$HEALTH_STATUS" = "healthy" ]; then
        echo -e "${GREEN}✅ Health check passed!${NC}"
        break
    else
        echo -e "${YELLOW}⚠️  Health check failed (status: $HEALTH_STATUS). Retrying...${NC}"
        ((RETRY_COUNT++))
        sleep 10
    fi
done

if [ "$HEALTH_STATUS" != "healthy" ]; then
    echo -e "${RED}❌ Health check failed after $MAX_RETRIES attempts.${NC}"
    echo "Response: $HEALTH_RESPONSE"
    echo ""
    echo "Initiating rollback..."
    ./scripts/rollback_deployment.sh
    exit 1
fi
echo ""

# Step 7: Get deployment info
echo -e "${BLUE}📊 Deployment Information:${NC}"
echo "--------------------------------------"
echo "Function Name: $FUNCTION_NAME"
echo "Region: $REGION"
echo "Runtime: $RUNTIME"
echo "Memory: $MEMORY"
echo "Timeout: $TIMEOUT"
echo "Deployment Tag: $DEPLOYMENT_TAG"
echo "Rollout Phase: $PHASE"
echo "Rollout Percentage: ${ROLLOUT_PERCENTAGE}%"
echo "Function URL: $FUNCTION_URL"
echo "Health Check: $HEALTH_CHECK_URL"
echo "--------------------------------------"
echo ""

# Step 8: Send notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    echo -e "${BLUE}📢 Sending notification to Slack...${NC}"
    curl -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"✅ OmniClaw 2.0 deployment successful\",
            \"attachments\": [{
                \"color\": \"good\",
                \"title\": \"Deployment Details\",
                \"fields\": [
                    {\"title\": \"Phase\", \"value\": \"$PHASE\", \"short\": true},
                    {\"title\": \"Rollout\", \"value\": \"${ROLLOUT_PERCENTAGE}%\", \"short\": true},
                    {\"title\": \"Tag\", \"value\": \"$DEPLOYMENT_TAG\", \"short\": true},
                    {\"title\": \"URL\", \"value\": \"$FUNCTION_URL\", \"short\": false}
                ],
                \"footer\": \"OmniClaw Deployment Bot\",
                \"ts\": $(date +%s)
            }]
        }" 2>/dev/null || echo "Slack notification failed"
    echo ""
fi

# Step 9: Create Git tag
echo -e "${BLUE}🏷️  Creating Git tag...${NC}"
if git rev-parse --git-dir > /dev/null 2>&1; then
    git tag -a "$DEPLOYMENT_TAG" -m "OmniClaw 2.0 deployment - $PHASE at ${ROLLOUT_PERCENTAGE}% rollout"
    echo "Created tag: $DEPLOYMENT_TAG"
    echo "To push: git push origin $DEPLOYMENT_TAG"
else
    echo "Not a git repository, skipping tag creation"
fi
echo ""

# Final summary
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor the deployment:"
echo "   gcloud functions logs read $FUNCTION_NAME --region=$REGION --tail"
echo ""
echo "2. Run smoke tests:"
echo "   node scripts/smoke_tests.js"
echo ""
echo "3. Monitor metrics:"
echo "   Open your monitoring dashboard"
echo ""
echo "4. If issues occur, rollback:"
echo "   ./scripts/rollback_deployment.sh"
echo ""
echo -e "${GREEN}✅ Ready for production traffic at ${ROLLOUT_PERCENTAGE}% rollout${NC}"
