#!/bin/bash
# Daily index rebuild - run after bookmark processing
set -e

echo "[INDEX-REBUILD] Starting daily rebuild at $(date)"
cd /Users/Subho/omniclaw/infrastructure/cloud-functions/deploy

# 1. Sync bookmarks to nodes (in case ingest added new bookmarks)
echo "[INDEX-REBUILD] Syncing bookmarks to nodes..."
python3 sync_bookmarks_to_nodes.py

# 2. Export unified bookmarks to GCS
echo "[INDEX-REBUILD] Exporting to GCS..."
python3 -c "
import sys
sys.path.insert(0, '/Users/Subho/omniclaw/services/vault-pipeline')
from sync_pipeline import export_to_gcs
result = export_to_gcs()
print('Export:', result)
"

echo "[INDEX-REBUILD] Daily rebuild complete at $(date)"
