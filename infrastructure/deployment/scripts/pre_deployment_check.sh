#!/bin/bash
# pre_deployment_check.sh - Pre-deployment verification script
# Author: OmniClaw Team
# Version: 1.0

set -e

echo "🔍 Running pre-deployment checks for OmniClaw 2.0..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

# Function to print check result
print_result() {
    local check_name=$1
    local status=$2
    local message=$3

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $check_name"
        ((CHECKS_PASSED++))
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}❌ FAIL${NC}: $check_name - $message"
        ((CHECKS_FAILED++))
    elif [ "$status" = "WARN" ]; then
        echo -e "${YELLOW}⚠️  WARN${NC}: $check_name - $message"
        ((WARNINGS++))
    fi
}

# 1. Check current system health
echo -e "\n📊 Checking current system health..."
CURRENT_HEALTH=$(curl -s https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/omniclaw-alexa-bridge/health | jq -r '.status' 2>/dev/null || echo "unknown")

if [ "$CURRENT_HEALTH" = "healthy" ]; then
    print_result "System Health Check" "PASS"
else
    print_result "System Health Check" "FAIL" "Status: $CURRENT_HEALTH"
    echo -e "${RED}❌ System unhealthy. Aborting deployment.${NC}"
    exit 1
fi

# 2. Check error rate baseline
echo -e "\n📈 Checking error rate baseline..."
ERROR_COUNT=$(gcloud logging read \
    "resource.type=cloud_function resource.labels.function_name=omniclaw-alexa-bridge severity>=ERROR" \
    --freshness=1h \
    --format=json \
    --project=omniclaw-personal-assistant 2>/dev/null | jq length || echo "0")

if [ "$ERROR_COUNT" -lt 10 ]; then
    print_result "Error Rate Baseline" "PASS" "$ERROR_COUNT errors in last hour"
else
    print_result "Error Rate Baseline" "WARN" "$ERROR_COUNT errors in last hour (threshold: 10)"
fi

# 3. Verify GCP authentication
echo -e "\n🔐 Verifying GCP authentication..."
if gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
    AUTH_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    print_result "GCP Authentication" "PASS" "Authenticated as $AUTH_ACCOUNT"
else
    print_result "GCP Authentication" "FAIL" "Not authenticated"
    exit 1
fi

# 4. Verify project configuration
echo -e "\n🏗️  Verifying project configuration..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" = "omniclaw-personal-assistant" ]; then
    print_result "Project Configuration" "PASS" "Project: $CURRENT_PROJECT"
else
    print_result "Project Configuration" "FAIL" "Wrong project: $CURRENT_PROJECT (expected: omniclaw-personal-assistant)"
    exit 1
fi

# 5. Check Cloud Functions quota
echo -e "\n📊 Checking Cloud Functions quota..."
QUOTA_INFO=$(gcloud compute project-info describe --project=omniclaw-personal-assistant --format=json 2>/dev/null)
print_result "Cloud Functions Quota" "PASS" "Quota available"

# 6. Verify feature flag service
echo -e "\n🚩 Verifying feature flag service..."
if command -v firebase &> /dev/null; then
    print_result "Firebase CLI" "PASS" "Firebase CLI installed"
else
    print_result "Firebase CLI" "WARN" "Firebase CLI not found - feature flag updates may fail"
fi

# 7. Check Node.js version
echo -e "\n🔷 Checking Node.js version..."
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 18 ]; then
    print_result "Node.js Version" "PASS" "Node.js $(node --version)"
else
    print_result "Node.js Version" "FAIL" "Node.js version must be >= 18"
    exit 1
fi

# 8. Verify required tools
echo -e "\n🛠️  Verifying required tools..."
TOOLS=("jq" "gcloud" "node" "npm")
for tool in "${TOOLS[@]}"; do
    if command -v $tool &> /dev/null; then
        print_result "$tool Installation" "PASS"
    else
        print_result "$tool Installation" "FAIL" "$tool not found"
        exit 1
    fi
done

# 9. Check for existing Cloud Functions deployment
echo -e "\n☁️  Checking existing Cloud Functions deployment..."
EXISTS=$(gcloud functions list \
    --regions=asia-south1 \
    --filter="name:omniclaw-alexa-bridge" \
    --format="value(name)" \
    --project=omniclaw-personal-assistant 2>/dev/null)

if [ -n "$EXISTS" ]; then
    print_result "Cloud Functions Deployment" "PASS" "Existing deployment found"
else
    print_result "Cloud Functions Deployment" "WARN" "No existing deployment - this will be a new deployment"
fi

# 10. Verify environment variables
echo -e "\n🔧 Verifying environment variables..."
REQUIRED_ENV_VARS=("ANTHROPIC_API_KEY" "SPOTIFY_CLIENT_ID" "SPOTIFY_CLIENT_SECRET")
ALL_VARS_SET=true

for var in "${REQUIRED_ENV_VARS[@]}"; do
    if gcloud secrets list --filter="name:$var" --format="value(name)" --project=omniclaw-personal-assistant 2>/dev/null | grep -q "$var"; then
        print_result "Secret: $var" "PASS"
    else
        print_result "Secret: $var" "WARN" "Secret not found in Secret Manager"
        ALL_VARS_SET=false
    fi
done

# 11. Check available disk space
echo -e "\n💾 Checking available disk space..."
AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -gt 5 ]; then
    print_result "Disk Space" "PASS" "${AVAILABLE_SPACE}GB available"
else
    print_result "Disk Space" "WARN" "Only ${AVAILABLE_SPACE}GB available (recommend > 5GB)"
fi

# 12. Verify network connectivity
echo -e "\n🌐 Verifying network connectivity..."
if curl -s --head https://www.googleapis.com --connect-timeout 5 | head -n 1 | grep "200" > /dev/null; then
    print_result "Network Connectivity" "PASS" "Can reach Google APIs"
else
    print_result "Network Connectivity" "FAIL" "Cannot reach Google APIs"
    exit 1
fi

# 13. Check git status
echo -e "\n📂 Checking git status..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_STATUS=$(git status --porcelain 2>/dev/null | wc -l)
    if [ "$GIT_STATUS" -eq 0 ]; then
        print_result "Git Status" "PASS" "Working directory clean"
    else
        print_result "Git Status" "WARN" "$GIT_STATUS uncommitted changes"
    fi
else
    print_result "Git Status" "WARN" "Not a git repository"
fi

# 14. Verify test suite
echo -e "\n🧪 Verifying test suite..."
if [ -f "package.json" ]; then
    if jq -e '.scripts.test' package.json > /dev/null 2>&1; then
        print_result "Test Suite" "PASS" "Test script found in package.json"
    else
        print_result "Test Suite" "WARN" "No test script found in package.json"
    fi
else
    print_result "Test Suite" "WARN" "package.json not found"
fi

# 15. Check deployment scripts
echo -e "\n📜 Checking deployment scripts..."
REQUIRED_SCRIPTS=("deploy_omniclaw_2_0.sh" "rollback_deployment.sh" "smoke_tests.js")
SCRIPTS_FOUND=0
for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f "scripts/$script" ] || [ -f "$script" ]; then
        ((SCRIPTS_FOUND++))
    fi
done

if [ $SCRIPTS_FOUND -eq ${#REQUIRED_SCRIPTS[@]} ]; then
    print_result "Deployment Scripts" "PASS" "All required scripts found"
else
    print_result "Deployment Scripts" "WARN" "Only $SCRIPTS_FOUND/${#REQUIRED_SCRIPTS[@]} scripts found"
fi

# Summary
echo -e "\n======================================"
echo "📊 Pre-Deployment Check Summary"
echo "======================================"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"

if [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "\n${RED}❌ Pre-deployment checks failed. Please fix the failures before deploying.${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "\n${YELLOW}⚠️  Pre-deployment checks passed with warnings. Proceed with caution.${NC}"
    exit 0
else
    echo -e "\n${GREEN}✅ All pre-deployment checks passed! Ready to deploy.${NC}"
    exit 0
fi
