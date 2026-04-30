# Instatter Deployment Guide

## 1. Prepare a full cookie jar

Create a cookie JSON file that includes both:

- `cookies`: a simple name/value map
- `browserCookies`: the full browser cookie list with metadata

See `README.md`.

## 2. Verify locally

```bash
cd /Users/Subho/omniclaw-personal-assistant/infrastructure/cloud-functions/instatter-poc
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
export INSTAGRAM_COOKIES_LOCAL_FILE="$PWD/instagram_cookies.local.json"
python3 main.py
```

## 3. Upload cookies to GCS

```bash
gcloud storage cp instagram_cookies.local.json \
  gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json
```

## 4. Build the container

```bash
docker build -t instatter-poc .
```

## 5. Deploy target

Deploy the container to Cloud Run or another browser-capable container runtime.

The previous Cloud Function deployment path is no longer the preferred target because this scraper depends on Chromium.
