#!/bin/bash
#
# Deploy combined Bookmark Vault Scheduler
#
set -e

PROJECT_ID="omniclaw-personal-assistant"
REGION="asia-south1"
FUNCTION_NAME="bookmark-vault-scheduler"
SCHEDULER_JOB="bookmark-vault-daily"

echo "=== Deploying Combined Bookmark Vault Scheduler ==="

cd /Users/Subho/omniclaw-personal-assistant/infrastructure/cloud-functions/bookmark-vault-scheduler

echo "[1/4] Deploying Cloud Function..."
gcloud functions deploy ${FUNCTION_NAME} \
  --gen2 \
  --runtime python311 \
  --region ${REGION} \
  --source ./ \
  --entry-point scheduler \
  --trigger-http \
  --allow-unauthenticated \
  --timeout 180s \
  --memory 512MB \
  --set-env-vars "VAULT_DIR=/workspace/data"

FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} \
  --region ${REGION} \
  --format 'value(httpsTrigger.url)')

echo "[2/4] Function URL: ${FUNCTION_URL}"

echo "[3/4] Updating scheduler job..."
gcloud scheduler jobs update http ${SCHEDULER_JOB} \
  --location ${REGION} \
  --uri "${FUNCTION_URL}" \
  --schedule "0 9,21 * * *" \
  --time-zone "UTC" \
  2>/dev/null || gcloud scheduler jobs create http ${SCHEDULER_JOB} \
  --location ${REGION} \
  --uri "${FUNCTION_URL}" \
  --schedule "0 9,21 * * *" \
  --time-zone "UTC"

echo "[4/4] Done!"
echo ""
echo "Scheduler runs at 9 AM and 9 PM UTC daily."
echo "Manual trigger: curl -X POST '${FUNCTION_URL}'"