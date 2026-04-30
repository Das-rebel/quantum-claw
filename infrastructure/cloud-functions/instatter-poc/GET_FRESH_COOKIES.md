# Refresh Instagram Cookies

The browser-session scraper needs the full Instagram cookie jar, not only `sessionid` and `csrftoken`.

## Browser steps

1. Log into Instagram in a browser.
2. Open the browser cookie extractor/extension.
3. Export all cookies for `instagram.com`.
4. Upload that full cookie jar to GCS.

## Minimum recommended cookies

These are the most important ones, but they are not always sufficient by themselves:

- `sessionid`
- `csrftoken`
- `ds_user_id`
- `mid`
- `ig_did`

## Preferred JSON format

```json
{
  "platform": "instagram",
  "cookies": {
    "sessionid": "paste-sessionid",
    "csrftoken": "paste-csrftoken",
    "ds_user_id": "paste-ds-user-id",
    "mid": "paste-mid",
    "ig_did": "paste-ig-did"
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

## Upload to GCS

```bash
gcloud storage cp instagram_cookies.local.json \
  gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json
```
