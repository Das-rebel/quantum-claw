# Twitter Bookmark Sync — Cloud Function (twscrape + GraphQL)

Fetches Twitter bookmarks using the proprietary approach (NOT Nitter).

## Architecture

Two-method pipeline with automatic fallback:

1. **Primary: Direct GraphQL API** — Uses cookies from GCS (`vault/cookies/twitter_cookies.json`)
   to hit Twitter's GraphQL bookmarks endpoint directly via `httpx`.
   Handles pagination, parses full tweet data.

2. **Fallback: twscrape library** — Uses username/password login via twscrape.
   Only used if cookies fail.

Both methods have a configurable timeout (`ATTEMPT_TIMEOUT`, default 45s) to prevent hanging.

## Cookie Format (in GCS)

```json
{
  "cookies": {
    "auth_token": "...",
    "ct0": "..."
  },
  "timestamp": "2026-04-22T00:00:00Z"
}
```

Cookies expire after ~7 days. Upload fresh cookies to GCS to keep the function working.

## Deploy

```bash
cd infrastructure/cloud-functions/twitter-sync-function

gcloud functions deploy twitter-sync \
  --gen2 --region=asia-south1 --runtime=python311 \
  --entry-point=fetch_twitter_bookmarks \
  --trigger-http --allow-unauthenticated \
  --project=omniclaw-personal-assistant \
  --source=. \
  --timeout=120 --memory=512MB \
  --set-env-vars="TWITTER_USERNAME=sdas22,TWITTER_PASSWORD=...,TWITTER_EMAIL=...,ATTEMPT_TIMEOUT=50"
```

## Test

```bash
# Health check
curl "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync"

# Sync bookmarks
curl -X POST \
  "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/twitter-sync" \
  -H "Content-Type: application/json" \
  -d '{"send_summary": true}'
```

## GCS Output

- `vault/twitter_bookmarks_automated.json` — bookmark data
- `vault/latest_sync_summary.json` — sync status summary (if `send_summary=true`)

## Known Issues

- **Stale cookies**: Cookies expire after ~7 days. The function will return HTTP 401 if cookies are old. Fix by uploading fresh cookies to GCS.
- **GCP IP blocking**: Twitter/Cloudflare blocks password login from GCP IP ranges. The fallback only works from residential IPs.
- **Query ID rotation**: The GraphQL query ID (`QUERY_ID` in main.py) changes periodically. Needs manual update.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| TWITTER_USERNAME | Yes | - | Twitter username |
| TWITTER_PASSWORD | No* | - | Password for twscrape fallback |
| TWITTER_EMAIL | No | - | Email for twscrape fallback |
| GCS_BUCKET | No | omniclaw-knowledge-graph | GCS bucket name |
| MAX_BOOKMARKS | No | 800 | Maximum bookmarks to fetch |
| ATTEMPT_TIMEOUT | No | 45 | Per-method timeout in seconds |

*Required if no valid cookies in GCS.
