# Instatter POC

This is the GCS-based Instagram saved-post scraper.

The maintained path is:

1. Store a full Instagram browser cookie jar in GCS
2. Load those cookies into Playwright
3. Open `https://www.instagram.com/explore/saved/`
4. Scrape rendered saved-post links
5. Write the output JSON back to GCS

Password login and `instagrapi` are no longer the supported path.

## Cookie source precedence

1. `INSTAGRAM_COOKIES_JSON`
2. `INSTAGRAM_COOKIES_BASE64`
3. `INSTAGRAM_COOKIES_LOCAL_FILE`
4. GCS object at `INSTAGRAM_COOKIES_GCS_PATH`

Defaults:

- Bucket: `omniclaw-knowledge-graph`
- Cookies: `vault/cookies/instagram_cookies.json`
- Output: `vault/instagram_saved_automated.json`

## Required cookie format

For the browser-session flow, a full cookie jar is recommended.

```json
{
  "platform": "instagram",
  "cookies": {
    "sessionid": "paste-sessionid",
    "csrftoken": "paste-csrftoken",
    "ds_user_id": "paste-ds-user-id",
    "mid": "paste-mid-if-present",
    "ig_did": "paste-ig-did-if-present"
  },
  "browserCookies": [
    {
      "name": "sessionid",
      "value": "paste-sessionid",
      "domain": ".instagram.com",
      "path": "/",
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    }
  ],
  "timestamp": "2026-04-17T12:00:00Z"
}
```

If only `cookies` is present, the scraper will synthesize browser cookies from that map, but that is usually not enough for a real logged-in browser session.

## Local run

```bash
cd /Users/Subho/omniclaw-personal-assistant/infrastructure/cloud-functions/instatter-poc
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
export INSTAGRAM_COOKIES_LOCAL_FILE="$PWD/instagram_cookies.local.json"
python3 main.py
```

## Containerized deployment

This scraper is intended for a browser-capable container. The included `Dockerfile` installs Chromium via Playwright.

Build locally:

```bash
docker build -t instatter-poc .
docker run --rm -p 8080:8080 instatter-poc
```

Deploy target should be Cloud Run or another container runtime with outbound access to Instagram and GCS.

## Optional env vars

- `INSTAGRAM_BUCKET_NAME`
- `INSTAGRAM_COOKIES_GCS_PATH`
- `INSTAGRAM_OUTPUT_FILE`
- `INSTAGRAM_MAX_ITEMS`
- `INSTAGRAM_SCROLL_LIMIT`
- `INSTAGRAM_OUTPUT_PUBLIC`

## Health check

GET `/` and GET `/health` return configuration status. POST triggers a sync.
