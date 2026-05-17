#!/bin/bash
#
# Vault Daily Sync Pipeline
# Runs full scrape + ingest + export to GCS
# Cron: 4 AM UTC daily
#
set -euo pipefail

PIPELINE_DIR="/Users/Subho/omniclaw/services/vault-pipeline"
PYTHON="/usr/local/bin/python3"
LOG="/tmp/vault_sync.log"

echo "===== Vault Daily Sync - $(date -u '+%Y-%m-%d %H:%M:%S UTC') =====" >> "$LOG" 2>&1

# --- Step 1: Run full sync pipeline (scrape twitter + instagram, ingest, export to GCS) ---
echo "[1/2] Running sync_pipeline.py (full sync + GCS export)..." >> "$LOG" 2>&1
cd "$PIPELINE_DIR"
"$PYTHON" sync_pipeline.py >> "$LOG" 2>&1
SYNC_EXIT=$?

if [ $SYNC_EXIT -ne 0 ]; then
    echo "[ERROR] sync_pipeline.py exited with code $SYNC_EXIT" >> "$LOG" 2>&1
    exit $SYNC_EXIT
fi
echo "[1/2] sync_pipeline.py completed successfully" >> "$LOG" 2>&1

# --- Step 2: Verify GCS upload and log stats ---
echo "[2/2] Verifying GCS upload..." >> "$LOG" 2>&1
/opt/homebrew/bin/gsutil ls gs://omniclaw-knowledge-graph/vault/unified_bookmarks.json >> "$LOG" 2>&1
echo "[2/2] GCS file verified" >> "$LOG" 2>&1

echo "===== Vault Daily Sync Complete - $(date -u '+%Y-%m-%d %H:%M:%S UTC') =====" >> "$LOG" 2>&1
echo "" >> "$LOG" 2>&1
