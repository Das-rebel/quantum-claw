# Vault Pipeline

Unified bookmark ingestion pipeline for omniclaw. Consolidates Twitter, Instagram, and browser bookmarks into a single SQLite database with proper schema, deduplication, and GCS sync.

## Architecture

```
Sources                Pipeline                Storage
─────────────────      ────────────────        ──────────────
Twitter (twscrape) ─┐                         ┌─ vault.db (SQLite)
Instagram (instagrapi)┤─► ingest_* ─► schema ─┤   (single source of truth)
GCS JSON files ──────┘                        └─ GCS backup export
```

## Schema

**bookmarks** - Core table, one row per unique URL across all sources:
- `id`, `source` (twitter/instagram/browser), `source_id`, `url` (unique dedup key)
- `title`, `content`, `bookmarked_at`, `scraped_at`, `metadata` (full JSON)

**bookmarks_tags** - Normalized tag index for fast queries

**bookmarks_meta** - Key-value sync state (last_scrape per source)

**sync_log** - Audit trail of all operations

**relationships** - Preserved from legacy vault.db

## Files

| File | Purpose |
|------|---------|
| `unified_schema.py` | DB schema, connection helpers, meta utilities |
| `migrate_existing.py` | One-time migration of 5862 tweets + 2037 IG posts |
| `ingest_twitter.py` | Twitter scrape (twscrape/GCS/local) → DB |
| `ingest_instagram.py` | Instagram scrape (instagrapi/GCS/local) → DB |
| `sync_pipeline.py` | Orchestrator: scrape → ingest → export GCS |
| `vault_api.py` | Flask REST API (port 5100) |
| `requirements.txt` | Python dependencies |

## Quick Start

```bash
# 1. One-time migration of existing vault.db data
python migrate_existing.py

# 2. Run full sync (scrape all sources + export to GCS)
python sync_pipeline.py

# 3. Single source only
python sync_pipeline.py --source twitter
python sync_pipeline.py --source instagram

# 4. Just export current DB to GCS
python sync_pipeline.py --export-only

# 5. Start API server
python vault_api.py
```

## API Endpoints

```
GET  /api/stats              - counts per source, date ranges
GET  /api/bookmarks?source=twitter&limit=50&offset=0
GET  /api/bookmarks/123      - single bookmark by ID
GET  /api/search?q=AI&source=twitter
POST /api/sync/twitter       - trigger Twitter scrape + ingest
POST /api/sync/instagram     - trigger Instagram scrape + ingest
GET  /api/sync/status        - last sync timestamps + recent log
```

## Environment Variables

```bash
TWITTER_COOKIES="auth_token=...; ct0=..."    # For twscrape live scrape
TWITTER_USERNAME="your_handle"
INSTAGRAM_COOKIES="sessionid=...; ds_user_id=..."  # For instagrapi live scrape
INSTAGRAM_USERNAME="your_handle"
```

## Key Design Decisions

1. **Dedup by URL** - Same bookmark from different sources = one record (ON CONFLICT url DO UPDATE)
2. **GCS as backup** - Full DB exported as JSON after every sync, not primary storage
3. **Idempotent** - Safe to run ingest multiple times, no duplicates
4. **Sync state in DB** - `bookmarks_meta` tracks last_scrape per source
5. **Legacy preserved** - All VL tags, sentiment, entities, clip embeddings kept in metadata JSON

## Cron Setup

```bash
# Every 6 hours: sync + export
0 */6 * * * cd ~/omniclaw/services/vault-pipeline && python sync_pipeline.py >> /tmp/vault_sync.log 2>&1
```
