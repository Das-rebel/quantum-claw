# Instatter Status

## Current state

- Core entrypoint: `main.py`
- Auth method: full Instagram browser cookie jar from GCS
- Scraper engine: Playwright + rendered saved-page scraping
- Storage target: `vault/instagram_saved_automated.json`
- Packaging target: browser-capable container via `Dockerfile`

## What changed

- Removed the unsupported `instagrapi` path
- Replaced it with Playwright loaded from the GCS/browser cookie jar
- Added support for both `cookies` maps and `browserCookies` arrays
- Added container packaging so the scraper can run with Chromium installed

## Remaining prerequisite

The GCS cookie object must contain the full Instagram browser cookie jar. The minimal `sessionid/csrftoken/ds_user_id` subset is not enough to maintain an authenticated browser session.

See `GET_FRESH_COOKIES.md`.
