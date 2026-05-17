#!/bin/bash
# Fix serve-vault-search deployment
# Run this script to restore the service

set -e
cd ~/omniclaw/infrastructure/cloud-functions/deploy

echo "=== Step 1: Re-authenticate with gcloud ==="
echo "Opening browser for login..."
gcloud auth login --force

echo -e "\n=== Step 2: Verify auth ==="
gcloud auth list

echo -e "\n=== Step 3: Deploy serve-vault-search with learning_base ==="
# Create Dockerfile that bundles learning_base
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask==3.1.0 gunicorn==24.0.0

COPY serve_vault_search.py service.py requirements.txt semantic_dashboard.html ./
COPY learning_base/ ./learning_base/

ENV PORT=8080
EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "service:application"]
EOF

# Deploy
gcloud run deploy serve-vault-search \
  --source . \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1G \
  --timeout=60s

echo -e "\n=== Step 4: Test ==="
SERVICE_URL=$(gcloud run services describe serve-vault-search --region=asia-south1 --format="value(status.url)")
echo "Service URL: $SERVICE_URL"
curl -s "$SERVICE_URL/health" | python3 -m json.tool
curl -s "$SERVICE_URL/stats" | python3 -m json.tool