# Instagram Saved Posts Sync — instagrapi (Zero Paid APIs)

## Architecture

```
Cloud Function (instagrapi) → Instagram API → GCS bucket
                                  ↓ (if cookies expired)
                            Password login fallback
                                  ↓ (if cloud IP blocked)
                            Report clear error, serve existing data
```

## Cost: $0/month

- No Apify, no paid APIs
- instagrapi is open-source (MIT)
- Cloud Function free tier
- GCS free tier

## Auth Flow (3-tier)

1. **GCS cookies** — Load from `vault/cookies/instagram_cookies.json`
2. **Password login** — Fallback if cookies are dead
3. **Existing data** — Serve stale data from GCS if both fail

## Cloud IP Limitation

Instagram aggressively blocks/rate-limits API calls from known cloud IPs (GCP, AWS, etc.).
The password login may succeed, but subsequent API calls often get `PleaseWaitFewMinutes`.

**Solutions:**
- Upload fresh cookies regularly (browser extension or manual export)
- Run from a residential IP instead (local cron job)
- Use a proxy service (not free)

## Cookie Upload

Cookies go to: `gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json`

Format:
```json
{
  "cookies": {
    "sessionid": "...",
    "ds_user_id": "...",
    "csrftoken": "...",
    "ig_did": "...",
    "mid": "...",
    "rur": "..."
  },
  "timestamp": "2026-04-30T00:00:00Z"
}
```

To extract cookies from browser:
1. Login to instagram.com
2. Open DevTools → Application → Cookies → instagram.com
3. Export the cookies above
4. Upload to GCS

## Deploy

```bash
cd infrastructure/cloud-functions/instagram-sync-function

gcloud functions deploy instagram-sync \
  --gen2 --region=asia-south1 --runtime=python311 \
  --entry-point=fetch_instagram_saved \
  --trigger-http --allow-unauthenticated \
  --project=omniclaw-personal-assistant \
  --source=. \
  --memory=512MB --timeout=120s \
  --set-env-vars="INSTAGRAM_USERNAME=sdas22,INSTAGRAM_PASSWORD=<password>"
```

## Test

```bash
# Health check
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync

# Trigger sync
curl -X POST https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync \
  -H "Content-Type: application/json" \
  -d '{"force_refresh": true}'
```

## GCS Output

| Path | Description |
|------|-------------|
| `vault/instagram_saved_automated.json` | Saved posts data |
| `vault/latest_sync_summary.json` | Sync status (merged with other services) |
| `vault/cookies/instagram_cookies.json` | Input cookies |

## Response Codes

- **200** — Success (new data fetched or existing data served)
- **502** — Auth failure (cookies expired + password login failed)

## Key Differences from Old Apify Version

| Aspect | Old (Apify) | New (instagrapi) |
|--------|-------------|-------------------|
| Cost | $5/month | $0 |
| Saved posts | No (only public profile) | Yes (collections API) |
| Auth | None (public scrape) | Cookies + password fallback |
| Data quality | Low (HTML parsing) | High (official API) |
| Cloud IP | Works (proxy) | Blocked (no proxy) |
