#!/bin/bash

# Deploy Cookie Refresh Cloud Function
set -e

echo "🚀 Deploying OmniClaw Cookie Refresh Cloud Function..."

# Navigate to script directory
cd "$(dirname "$0")"

# Pack the function
echo "📦 Packing function..."
rm -f function.zip
zip -r function.zip index.js package.json node_modules/ -x "*.test.js" "*.md"

# Deploy using gcloud
echo "☁️  Deploying to GCP..."
gcloud functions deploy cookieRefresh \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-south1 \
  --memory 256MB \
  --timeout 30s \
  --max-instances 10 \
  --set-env-vars COOKIE_REFRESH_API_KEY=omniclaw-cookie-refresh-2024 \
  --project omniclaw-personal-assistant \
  --source=function.zip \
  --entry-point=cookieRefreshHandler \
  --gen2

echo "✅ Deployment complete!"
echo ""
echo "🔗 Function URL:"
echo "   https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh"
echo ""
echo "🧪 Test health endpoint:"
echo "   curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/health"
echo ""
echo "📖 See README.md for usage instructions"

# Cleanup
rm -f function.zip
