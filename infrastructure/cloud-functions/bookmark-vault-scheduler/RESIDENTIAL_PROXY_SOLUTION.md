# Residential Proxy + Browserless Setup

## Overview
Use a residential proxy service with the existing Browserless deployment to bypass Cloudflare blocking.

## Architecture
```
VM (GCP)
  ↓ Makes requests through residential proxy
Residential Proxy Service
  ↓ Routes through real home IP
Twitter/Instagram
  ↓ Sees request from residential IP
✅ Allows access!
```

## Proxy Services (Ranked by Price/Reliability)

### 1. Bright Data (Super Proxy)
- **Price**: $500+/month
- **Reliability**: ⭐⭐⭐⭐⭐
- **Setup**: Complex
- **Best for**: Enterprise

### 2. Oxylabs
- **Price**: $300/month for 10 IPs
- **Reliability**: ⭐⭐⭐⭐
- **Setup**: Medium
- **Best for**: Business

### 3. Smartproxy
- **Price**: $75/month for residential plan
- **Reliability**: ⭐⭐⭐⭐
- **Setup**: Easy
- **Best for**: Personal projects (RECOMMENDED)

### 4. ZenRows
- **Price**: $49/month base
- **Reliability**: ⭐⭐⭐⭐
- **Setup**: Very Easy (API-based)
- **Best for**: Developers (RECOMMENDED)

## Implementation with ZenRows (Easiest)

### Why ZenRows?
- No proxy setup needed
- API-based (simple HTTP requests)
- Built-in headless browser
- Automatic Cloudflare bypass
- $49/month for 50K requests

### Integration

```python
# Replace in instagram_scraper.py
import requests

ZENROWS_API_KEY = "your_zenrows_api_key"

def fetch_with_zenrows(url):
    response = requests.get(
        f"https://api.zenrows.com/v1/",
        params={
            "url": url,
            "apikey": ZENROWS_API_KEY,
            "js_render": "true",
            "custom_headers": "true"
        },
        headers={
            "Cookie": cookie_string
        }
    )
    return response.json()
```

## Cost Summary

| Service | Monthly Cost | Setup Time |
|---------|--------------|------------|
| ZenRows | $49 | 10 min |
| Smartproxy | $75 | 30 min |
| Oxylabs | $300 | 1 hour |
| Bright Data | $500+ | 2 hours |

## Recommendation: ZenRows
- Lowest cost
- Easiest setup
- Reliable for Instagram/Twitter
- No proxy management needed
