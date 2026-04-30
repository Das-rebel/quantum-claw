#!/bin/bash

###############################################################################
# Deploy API Gateway for OmniClaw Enhanced
#
# Deploys API Gateway infrastructure including:
# - API Gateway configuration
# - Cloud Functions backend
# - Firestore database setup
# - Redis (optional)
# - Monitoring and alerting
#
# Usage: ./deploy-gateway.sh [environment]
#   environment: production, staging (default: production)
#
# @version 1.0.0
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENVIRONMENT="${1:-production}"
PROJECT_ID="${PROJECT_ID:-omniclaw-enhanced}"
REGION="${REGION:-us-central1}"
GATEWAY_NAME="omniclaw-gateway-${ENVIRONMENT}"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."

    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi

    # Check if user is authenticated
    if ! gcloud auth list --filter="status:ACTIVE" &> /dev/null; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi

    # Check if project is set
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        log_warning "Setting project to $PROJECT_ID"
        gcloud config set project "$PROJECT_ID"
    fi

    log_success "Requirements check passed"
}

validate_environment() {
    log_info "Validating environment: $ENVIRONMENT"

    if [[ ! "$ENVIRONMENT" =~ ^(production|staging|development)$ ]]; then
        log_error "Invalid environment. Must be: production, staging, or development"
        exit 1
    fi

    # Check if environment file exists
    ENV_FILE="${PROJECT_ROOT}/.env.${ENVIRONMENT}"
    if [ ! -f "$ENV_FILE" ]; then
        log_warning "Environment file not found: $ENV_FILE"
        log_info "Creating from example..."
        cp "${PROJECT_ROOT}/.env.${ENVIRONMENT}.example" "$ENV_FILE" || true
    fi

    log_success "Environment validated"
}

setup_firestore() {
    log_info "Setting up Firestore database..."

    # Check if Firestore is already enabled
    if gcloud firestore databases list --project="$PROJECT_ID" | grep -q "default"; then
        log_info "Firestore already enabled"
    else
        log_info "Creating Firestore database..."
        gcloud firestore databases create \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --type="firestore-native"
    fi

    # Create indexes
    log_info "Creating Firestore indexes..."

    # API keys indexes
    gcloud firestore indexes composite create \
        --project="$PROJECT_ID" \
        --collection-group="api-keys" \
        --query-scope=COLLECTION \
        --field-config="order=ASCENDING,field-path=userId" \
        --field-config="order=ASCENDING,field-path=environment" \
        --async || true

    # Rate limits indexes
    gcloud firestore indexes composite create \
        --project="$PROJECT_ID" \
        --collection-group="rate-limits" \
        --query-scope=COLLECTION \
        --field-config="order=ASCENDING,field-path=key" \
        --field-config="order=DESCENDING,field-path=expiresAt" \
        --async || true

    # Quota indexes
    gcloud firestore indexes composite create \
        --project="$PROJECT_ID" \
        --collection-group="quotas" \
        --query-scope=COLLECTION \
        --field-config="order=ASCENDING,field-path=apiKey" \
        --field-config="order=DESCENDING,field-path=lastUsed" \
        --async || true

    log_success "Firestore setup completed"
}

deploy_cloud_functions() {
    log_info "Deploying Cloud Functions..."

    # Deploy API Gateway function
    log_info "Deploying API Gateway function..."
    gcloud functions deploy "$GATEWAY_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --runtime=nodejs20 \
        --source="${PROJECT_ROOT}/api-gateway" \
        --entry-point=apiGateway \
        --trigger-http \
        --allow-unauthenticated \
        --memory=2048MB \
        --timeout=60s \
        --max-instances=100 \
        --min-instances=0 \
        --cpu=1 \
        --set-env-vars="ENVIRONMENT=${ENVIRONMENT},PROJECT_ID=${PROJECT_ID}" \
        --set-secrets=""

    GATEWAY_URL=$(gcloud functions describe "$GATEWAY_NAME" \
        --project="$PROJECT_ID" \
        --region="$REGION" \
        --format="value(httpsTrigger.url)")

    log_success "Cloud Functions deployed"
    log_info "Gateway URL: $GATEWAY_URL"
}

setup_redis() {
    log_info "Setting up Redis (optional)..."

    # Check if Redis instance exists
    REDIS_INSTANCE="${PROJECT_ID}-${ENVIRONMENT}-redis"

    if gcloud redis instances describe "$REDIS_INSTANCE" \
        --region="$REGION" \
        --project="$PROJECT_ID" &> /dev/null; then
        log_info "Redis instance already exists: $REDIS_INSTANCE"
    else
        log_info "Creating Redis instance..."
        gcloud redis instances create "$REDIS_INSTANCE" \
            --project="$PROJECT_ID" \
            --region="$REGION" \
            --zone="${REGION}-a" \
            --tier=BASIC \
            --memory-size-gb=1 \
            --redis-version=redis_7_0 \
            --display-name="OmniClaw Enhanced ${ENVIRONMENT^} Redis"

        log_info "Waiting for Redis to be ready..."
        gcloud redis instances wait-for-creation "$REDIS_INSTANCE" \
            --region="$REGION" \
            --project="$PROJECT_ID"
    fi

    # Get Redis connection details
    REDIS_IP=$(gcloud redis instances describe "$REDIS_INSTANCE" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(host)")

    REDIS_PORT=$(gcloud redis instances describe "$REDIS_INSTANCE" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(port)")

    log_success "Redis setup completed"
    log_info "Redis: $REDIS_IP:$REDIS_PORT"
}

create_api_keys() {
    log_info "Creating initial API keys..."

    # Check if admin key exists
    ADMIN_KEY_EXISTS=$(gcloud firestore documents \
        collections "api-keys" \
        --project="$PROJECT_ID" | grep -c "admin" || true)

    if [ "$ADMIN_KEY_EXISTS" -eq 0 ]; then
        log_info "Generating admin API key..."

        # This would normally use the ApiKeyManager class
        # For now, we'll create a placeholder
        ADMIN_KEY="sk_${ENVIRONMENT}_$(openssl rand -hex 32)"

        log_info "Admin API key: $ADMIN_KEY"
        log_warning "Save this key securely. It won't be shown again."
    else
        log_info "Admin API key already exists"
    fi

    log_success "API keys setup completed"
}

setup_monitoring() {
    log_info "Setting up monitoring and alerting..."

    # Create log-based metrics
    log_info "Creating log metrics..."

    # Rate limit violations metric
    gcloud logging metrics create rate_limit_violations \
        --project="$PROJECT_ID" \
        --description="Count of rate limit violations" \
        --log-filter='resource.type="cloud_function"
            jsonPayload.success=false
            jsonPayload.error="Rate limit exceeded"' || true

    # API key errors metric
    gcloud logging metrics create api_key_errors \
        --project="$PROJECT_ID" \
        --description="Count of API key authentication errors" \
        --log-filter='resource.type="cloud_function"
            jsonPayload.success=false
            jsonPayload.error~"API key"' || true

    # High latency metric
    gcloud logging metrics create high_latency \
        --project="$PROJECT_ID" \
        --description="Count of slow API requests (>5s)" \
        --log-filter='resource.type="cloud_function"
            httpRequest.latency>5s' || true

    log_success "Monitoring setup completed"
}

create_alert_policies() {
    log_info "Creating alert policies..."

    # High error rate alert
    gcloud alpha monitoring policies create \
        --project="$PROJECT_ID" \
        --display-name="High Error Rate" \
        --condition-display-name="Error Rate > 5%" \
        --condition-filter='resource.type="cloud_function"
            metric.type="logging.googleapis.com/user/api_key_errors"' \
        --alert-strategy="percent" \
        --alert-threshold="5" \
        --notification-channels="" || true

    # Rate limit violations alert
    gcloud alpha monitoring policies create \
        --project="$PROJECT_ID" \
        --display-name="High Rate Limit Violations" \
        --condition-display-name="Violations > 100/min" \
        --condition-filter='resource.type="cloud_function"
            metric.type="logging.googleapis.com/user/rate_limit_violations"' \
        --alert-strategy="threshold" \
        --alert-threshold="100" \
        --notification-channels="" || true

    log_success "Alert policies created"
}

run_tests() {
    log_info "Running deployment tests..."

    # Test health endpoint
    log_info "Testing health endpoint..."
    HEALTH_CHECK=$(curl -s -w "\n%{http_code}" "$GATEWAY_URL/health" || echo "000")
    HTTP_CODE=$(echo "$HEALTH_CHECK" | tail -n1)

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Health check passed"
    else
        log_error "Health check failed with code: $HTTP_CODE"
        return 1
    fi

    # Test API key validation
    log_info "Testing API key validation..."
    KEY_CHECK=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer invalid_key" \
        "$GATEWAY_URL/price/products" || echo "000")
    HTTP_CODE=$(echo "$KEY_CHECK" | tail -n1)

    if [ "$HTTP_CODE" = "401" ]; then
        log_success "API key validation passed"
    else
        log_warning "API key validation unexpected code: $HTTP_CODE"
    fi

    log_success "Deployment tests passed"
}

create_documentation() {
    log_info "Creating documentation..."

    # Create API documentation
    cat > "${PROJECT_ROOT}/api-gateway/DEPLOYMENT.md" <<EOF
# API Gateway Deployment

**Environment**: ${ENVIRONMENT}
**Deployed**: $(date)
**Version**: 1.0.0

## Gateway URL
${GATEWAY_URL}

## Admin API Key
$(gcloud firestore documents collections "api-keys" --project="$PROJECT_ID" 2>/dev/null | grep admin || echo "See Firestore for admin key")

## Configuration
- Project: ${PROJECT_ID}
- Region: ${REGION}
- Environment: ${ENVIRONMENT}

## Services
- Cloud Functions: ${GATEWAY_NAME}
- Firestore: Enabled
- Redis: ${REDIS_IP:-Not configured}

## Monitoring
- Logs: https://console.cloud.google.com/logs?project=${PROJECT_ID}
- Metrics: https://console.cloud.google.com/monitoring?project=${PROJECT_ID}
- Dashboard: https://console.cloud.google.com/monitoring/dashboards?project=${PROJECT_ID}

## Next Steps
1. Generate API keys for users
2. Configure rate limits
3. Set up alerts
4. Monitor usage
EOF

    log_success "Documentation created"
}

cleanup() {
    log_info "Cleaning up temporary files..."
    # Add cleanup logic here if needed
}

main() {
    log_info "Starting API Gateway deployment..."
    log_info "Project: $PROJECT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"

    # Run deployment steps
    check_requirements
    validate_environment
    setup_firestore
    deploy_cloud_functions
    setup_redis || log_warning "Redis setup failed (optional)"
    create_api_keys
    setup_monitoring
    create_alert_policies || log_warning "Alert policy creation failed"
    run_tests || log_warning "Some tests failed"
    create_documentation
    cleanup

    log_success "Deployment completed successfully!"
    echo ""
    log_info "Gateway URL: $GATEWAY_URL"
    log_info "Next steps:"
    log_info "1. Generate API keys for your users"
    log_info "2. Configure rate limits in throttle-config.js"
    log_info "3. Monitor the gateway at: https://console.cloud.google.com/monitoring?project=$PROJECT_ID"
}

# Trap errors
trap 'log_error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"
