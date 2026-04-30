#!/bin/bash
#
# OmniClaw Vault Sync Script (GCS-Enabled)
# Syncs Instagram and Twitter bookmarks to GCS
# Cookies are automatically fetched from GCS
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="/home/ubuntu/vault_data"
GCS_BUCKET="omniclaw-knowledge-graph"
SA_KEY="/tmp/vm-sa-key.json"
LOG_FILE="/home/ubuntu/vault_scraper/sync.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Vault Sync Started (GCS-Enabled) ==="

# Use service account key for GCS authentication
export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY"

# Ensure data directory exists
mkdir -p "$DATA_DIR"

# Export environment variables
# Instagram
export INSTAGRAM_USERNAME="Dasrebel"
export INSTAGRAM_PASSWORD="Dasrebel@321"
export INSTAGRAM_COOKIES=""  # Will be fetched from GCS
export VAULT_DIR="$DATA_DIR"

# Twitter
export TWITTER_USERNAME="sdas22"
export TWITTER_PASSWORD="Abfl@4321"
export TWITTER_EMAIL="sdas22@gmail.com"

cd "$SCRIPT_DIR"

# Install Google Cloud Storage library if not present
if ! python3 -c "import google.cloud.storage" 2>/dev/null; then
    log "Installing google-cloud-storage..."
    pip3 install --break-system-packages google-cloud-storage 2>&1 | tee -a "$LOG_FILE"
fi

# Run Instagram scraper (GCS-enabled)
log "Running Instagram scraper (GCS-enabled)..."
if [ -f "instagram_scraper_gcs.py" ]; then
    python3 instagram_scraper_gcs.py >> "$LOG_FILE" 2>&1 || log "Instagram scraper error"
else
    log "WARNING: instagram_scraper_gcs.py not found, using old scraper"
    python3 instagram_scraper.py >> "$LOG_FILE" 2>&1 || log "Instagram scraper error"
fi

# Run Twitter scraper (GCS-enabled)
log "Running Twitter scraper (GCS-enabled)..."
if [ -f "twitter_scraper_gcs.py" ]; then
    python3 twitter_scraper_gcs.py >> "$LOG_FILE" 2>&1 || log "Twitter scraper error"
else
    log "WARNING: twitter_scraper_gcs.py not found, using old scraper"
    python3 twitter_scraper.py >> "$LOG_FILE" 2>&1 || log "Twitter scraper error"
fi

# Upload to GCS using gcloud storage (with SA key auth)
log "Uploading to GCS..."
if [ -f "$DATA_DIR/instagram_scrape.json" ]; then
    gcloud storage cp "$DATA_DIR/instagram_scrape.json" "gs://$GCS_BUCKET/vault/instagram_scrape.json" 2>&1 | tee -a "$LOG_FILE"
fi

if [ -f "$DATA_DIR/twitter_bookmarks_automated.json" ]; then
    gcloud storage cp "$DATA_DIR/twitter_bookmarks_automated.json" "gs://$GCS_BUCKET/vault/twitter_bookmarks_automated.json" 2>&1 | tee -a "$LOG_FILE"
fi

# Make files world-readable for cloud function access
log "Setting public read permissions..."
if [ -f "$DATA_DIR/instagram_scrape.json" ]; then
    gcloud storage objects add-iam-policy-binding "gs://$GCS_BUCKET/vault/instagram_scrape.json" \
        --member="allUsers" --role="roles/storage.objectViewer" 2>&1 | tee -a "$LOG_FILE"
fi

if [ -f "$DATA_DIR/twitter_bookmarks_automated.json" ]; then
    gcloud storage objects add-iam-policy-binding "gs://$GCS_BUCKET/vault/twitter_bookmarks_automated.json" \
        --member="allUsers" --role="roles/storage.objectViewer" 2>&1 | tee -a "$LOG_FILE"
fi

log "=== Vault Sync Completed ==="
