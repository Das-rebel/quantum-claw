#!/bin/bash
# Vault Sync Script - Run scrapers and upload to GCS
# Run via cron: 0 */6 * * * /home/ubuntu/vault_scraper/sync.sh

set -e

SCRIPT_DIR="/home/ubuntu/vault_scraper"
DATA_DIR="/home/ubuntu/vault_data"
GCS_BUCKET="omniclaw-knowledge-graph"
LOG_FILE="/home/ubuntu/vault_scraper/sync.log"
SA_KEY="/tmp/vm-sa-key.json"
REGION="asia-south1"
PROJECT="omniclaw-personal-assistant"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Vault Sync Started ==="

# Use service account key for GCS authentication
export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY"

# Ensure data directory exists
mkdir -p "$DATA_DIR"

# Export environment variables
# Instagram
export INSTAGRAM_USERNAME="sdas22"
export INSTAGRAM_PASSWORD="Abfl@4321"
export INSTAGRAM_COOKIES=""  # Will be fetched from GCS by *_gcs.py scrapers
export VAULT_DIR="$DATA_DIR"

# Twitter
export TWITTER_USERNAME="sdas22"
export TWITTER_PASSWORD="Abfl@4321"
export TWITTER_EMAIL="sdas22@gmail.com"

cd "$SCRIPT_DIR"

# Pre-sync: Check if cookies exist in GCS
log "Checking cookies in GCS..."
if command -v gsutil &> /dev/null; then
    TWITTER_COOKIES_GCS=$(gsutil ls gs://$GCS_BUCKET/vault/cookies/twitter_cookies.json 2>/dev/null && echo "exists" || echo "missing")
    INSTAGRAM_COOKIES_GCS=$(gsutil ls gs://$GCS_BUCKET/vault/cookies/instagram_cookies.json 2>/dev/null && echo "exists" || echo "missing")
    log "Twitter cookies: $TWITTER_COOKIES_GCS"
    log "Instagram cookies: $INSTAGRAM_COOKIES_GCS"
else
    log "gsutil not available, skipping GCS cookie check"
fi

# Run Instagram scraper (GCS-enabled version fetches cookies from GCS)
log "Running Instagram scraper (GCS mode)..."
python3 instagram_scraper_gcs.py >> "$LOG_FILE" 2>&1 || log "Instagram scraper error"

# Run Twitter scraper (GCS-enabled version fetches cookies from GCS)
log "Running Twitter scraper (GCS mode)..."
python3 twitter_scraper_gcs.py >> "$LOG_FILE" 2>&1 || log "Twitter scraper error"

# Upload to GCS using gcloud storage (with SA key auth)
log "Uploading to GCS..."
if [ -f "$DATA_DIR/instagram_scrape.json" ]; then
    gcloud storage cp "$DATA_DIR/instagram_scrape.json" "gs://$GCS_BUCKET/vault/instagram_saved_automated.json" 2>&1 | tee -a "$LOG_FILE"
fi

if [ -f "$DATA_DIR/twitter_bookmarks_automated.json" ]; then
    gcloud storage cp "$DATA_DIR/twitter_bookmarks_automated.json" "gs://$GCS_BUCKET/vault/twitter_bookmarks_automated.json" 2>&1 | tee -a "$LOG_FILE"
fi

# Make files world-readable for cloud function access
if [ -f "$DATA_DIR/instagram_scrape.json" ]; then
    gcloud storage objects add-iam-policy-binding "gs://$GCS_BUCKET/vault/instagram_saved_automated.json" --member="allUsers" --role="roles/storage.objectViewer" 2>&1 | tee -a "$LOG_FILE"
fi

if [ -f "$DATA_DIR/twitter_bookmarks_automated.json" ]; then
    gcloud storage objects add-iam-policy-binding "gs://$GCS_BUCKET/vault/twitter_bookmarks_automated.json" --member="allUsers" --role="roles/storage.objectViewer" 2>&1 | tee -a "$LOG_FILE"
fi

# Trigger VL agents after successful upload
log "Triggering VL agents..."
for i in 1 2 3 4; do
    AGENT_URL="https://vl-agent-${i}-${REGION}-${PROJECT}.run.app"
    log "Triggering vl-agent-${i}..."
    curl -s -m 10 "$AGENT_URL" >> "$LOG_FILE" 2>&1 || log "VL agent ${i} trigger failed (may not be deployed yet)"
done

log "=== Vault Sync Completed ==="
