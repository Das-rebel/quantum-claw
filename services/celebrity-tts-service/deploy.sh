#!/bin/bash

# Celebrity Voice Cloning TTS Service - Deployment Script
# Deploys to Google Cloud Run

set -e

PROJECT_ID="omniclaw-enhanced"
SERVICE_NAME="celebrity-tts"
REGION="us-central1"

echo "=================================================="
echo "Celebrity TTS Service - Deployment"
echo "=================================================="

# Check if gcloud is authenticated
echo "Checking authentication..."
gcloud auth print-identity > /dev/null 2>&1 || {
  echo "❌ Not authenticated. Run: gcloud auth login"
  exit 1
}

echo "✅ Authenticated as: $(gcloud auth print-identity)"

# Ask about deployment type
echo ""
echo "Choose deployment type:"
echo "1) CPU (Development) - Lower cost, slower synthesis"
echo "2) GPU (Production) - Higher cost, faster synthesis"
echo ""
read -p "Enter choice [1-2]: " deployment_type

if [ "$deployment_type" = "2" ]; then
  # GPU deployment
  echo ""
  echo "Deploying with GPU acceleration (Tesla T4)..."
  echo "Estimated cost: \$200-400/month"

  gcloud run deploy $SERVICE_NAME \
    --source=. \
    --platform=managed \
    --region=$REGION \
    --memory=8Gi \
    --cpu=4 \
    --accelerator=nvidia-tesla-t4 \
    --allow-unauthenticated \
    --max-instances=10 \
    --min-instances=0 \
    --timeout=300s \
    --project=$PROJECT_ID

else
  # CPU deployment (default)
  echo ""
  echo "Deploying with CPU (development mode)..."
  echo "Estimated cost: \$50-100/month"
  echo "Note: Synthesis will be slower (5-10s vs 0.5-2s on GPU)"

  gcloud run deploy $SERVICE_NAME \
    --source=. \
    --platform=managed \
    --region=$REGION \
    --memory=4Gi \
    --cpu=2 \
    --allow-unauthenticated \
    --max-instances=10 \
    --min-instances=0 \
    --timeout=300s \
    --project=$PROJECT_ID
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format='value(status.url)')

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "Test commands:"
echo "  # Health check"
echo "  curl $SERVICE_URL/health"
echo ""
echo "  # List celebrities"
echo "  curl $SERVICE_URL/celebrities"
echo ""
echo "  # Synthesize with celebrity voice"
echo '  curl -X POST '"$SERVICE_URL"'/synthesize \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"text":"Once upon a time...","celebrity":"amitabh_bachan","language":"en"}'"'"''
echo ""
echo "Next steps:"
echo "  1. Update story narrator function with service URL"
echo "  2. Run integration tests"
echo "  3. Test celebrity voice synthesis"
echo ""
