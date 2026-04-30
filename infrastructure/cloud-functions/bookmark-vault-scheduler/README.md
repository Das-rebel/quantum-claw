# Bookmark Vault Scheduler

GCP Cloud Function + Cloud Scheduler for daily Twitter/Instagram bookmark scraping with AI-powered VL tagging.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Scheduler (Daily)                       │
│              Twitter: 9 AM UTC  |  Instagram: 10 AM UTC          │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌──────────────────┐             ┌──────────────────┐
│ Twitter Scraper  │             │ Instagram Scraper│
│   (Puppeteer)    │             │   (Scrapling)    │
└────────┬─────────┘             └────────┬─────────┘
         │                               │
         ▼                               ▼
┌──────────────────┐             ┌──────────────────┐
│ twitter_bookmarks│             │ instagram_scrape │
│ _automated.json  │             │     .json       │
└────────┬─────────┘             └────────┬─────────┘
         │                               │
         └───────────────┬───────────────┘
                         ▼
              ┌─────────────────────┐
              │   VL Agents (4x)     │
              │  Cerebras/Groq AI   │
              │  Adds: vlTags,      │
              │  vlSubject, vlStyle,│
              │  vlMood             │
              └─────────────────────┘
```

## Features

- **Twitter Scraping**: Puppeteer-based browser automation
- **Instagram Scraping**: Scrapling framework with anti-bot bypass
- **Parallel VL Processing**: 4 agents process 500 posts each
- **Distributed Locking**: Safe concurrent writes to shared JSON
- **Daily Automation**: Cloud Scheduler triggers at 9 AM & 10 AM UTC

## Files

| File | Description |
|------|-------------|
| `index.js` | Main Cloud Function - handles Twitter + Instagram scraping |
| `instagram_scraper.py` | Python scraper using Scrapling |
| `vl_agents.js` | Parallel VL tagging agents |
| `deploy.sh` | GCP deployment script |
| `package.json` | Node.js dependencies |

## Setup

### 1. Environment Variables

```bash
# Twitter
export TWITTER_USERNAME="your_username"
export TWITTER_PASSWORD="your_password"
export TWITTER_COOKIES="auth_token=xxx;ct0=yyy"  # Recommended!

# Instagram
export INSTAGRAM_USERNAME="your_username"
export INSTAGRAM_PASSWORD="your_password"
export INSTAGRAM_COOKIES="sessionid=xxx;csrftoken=yyy"  # Recommended!

# AI Processing
export AI_PROVIDER="cerebras"  # or "groq"
export CEREBRAS_API_KEY="your_key"
export GROQ_API_KEY="your_key"
```

### 2. Deploy

```bash
cd infrastructure/cloud-functions/bookmark-vault-scheduler
chmod +x deploy.sh
./deploy.sh
```

### 3. Get Instagram Cookies

Instagram cookies are more reliable than password login:

1. Open Instagram in Chrome
2. Login normally
3. Press F12 → Application → Cookies → instagram.com
4. Copy `sessionid`, `csrftoken`, `ds_user_id`
5. Format: `sessionid=xxx;csrftoken=yyy;ds_user_id=zzz`

## Usage

### Cloud Scheduler (Automatic)

- **Twitter**: Daily at 9 AM UTC
- **Instagram**: Daily at 10 AM UTC

### Manual Trigger

```bash
# Twitter
gcloud scheduler jobs run bookmark-vault-daily --location asia-south1

# Instagram
gcloud scheduler jobs run instagram-vault-daily --location asia-south1
```

### Run VL Agents Locally

```bash
# Process Twitter bookmarks (4 agents in parallel)
node vl_agents.js 1 0 500 &
node vl_agents.js 2 500 1000 &
node vl_agents.js 3 1000 1500 &
node vl_agents.js 4 1500 2000 &
wait

# Process Instagram bookmarks
python3 instagram_scraper.py
```

## Output

Each bookmark gets AI-generated tags:

```json
{
  "id": "twitter_1234567890_0",
  "type": "twitter_post",
  "text": "Post content...",
  "url": "https://x.com/user/status/123",
  "author": "@username",
  "timestamp": "2026-04-15T...",
  "vlTags": ["AI", "Programming", "Tutorial"],
  "vlSubject": "Machine Learning",
  "vlStyle": "tutorial",
  "vlMood": "informative",
  "searchTerms": ["AI tutorial", "ML guide"]
}
```

## Vault Location

```
infrastructure/data/
├── twitter_bookmarks_automated.json  # Twitter with vlTags
├── instagram_scrape.json             # Instagram posts
├── bookmarks_vault.json             # Combined metadata
└── instagram_bookmarks_since.json   # Last run info
```

## Scraping Technologies

| Platform | Method | Why |
|----------|--------|-----|
| Twitter | Puppeteer | Full browser for dynamic content |
| Instagram | Scrapling | Anti-bot bypass, Cloudflare Turnstile support |

## Troubleshooting

**Twitter: Bot detection**
- Use cookies instead of password login
- Set `BROWSERLESS_TOKEN` for Browserless.io

**Instagram: Session expired**
- Refresh cookies from browser
- Instagram sessions expire frequently

**VL agents: API errors**
- Check API key validity
- Try switching `AI_PROVIDER` between cerebras/groq
