#!/usr/bin/env python3
"""
Twitter Bookmark Scraper with GCS Cookie Support (v2 - Fixed for twscrape 0.17.0)
- Uses api.bookmarks() instead of api.search()
- Cookies passed as JSON string (twscrape API requirement)
- Proper async event loop handling
"""

import os
import json
import asyncio
from datetime import datetime
from pathlib import Path

try:
    import twscrape
    from twscrape import AccountsPool, API
    TWSCRAPE_AVAILABLE = True
except ImportError:
    TWSCRAPE_AVAILABLE = False
    print("[TWITTER] twscrape not installed")

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

BUCKET_NAME = "omniclaw-knowledge-graph"
COOKIE_FILE = "vault/cookies/twitter_cookies.json"

TWITTER_COOKIES = os.getenv("TWITTER_COOKIES", "")
TWITTER_USERNAME = os.getenv("TWITTER_USERNAME", "")
TWITTER_PASSWORD = os.getenv("TWITTER_PASSWORD", "")
TWITTER_EMAIL = os.getenv("TWITTER_EMAIL", "")
VAULT_DIR = os.getenv("VAULT_DIR", "/home/ubuntu/vault_data")
TWITTER_OUTPUT = os.path.join(VAULT_DIR, "twitter_bookmarks_automated.json")
LAST_RUN_FILE = os.path.join(VAULT_DIR, "twitter_last_run.json")

def log(msg):
    print(f"[TWITTER] {datetime.now().isoformat()} {msg}")

def load_cookies_from_gcs():
    """Load cookies from GCS, return as JSON string for twscrape"""
    if not GCS_AVAILABLE:
        return None
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(COOKIE_FILE)
        if not blob.exists():
            log("No cookie file in GCS")
            return None
        contents = blob.download_as_text()
        cookie_data = json.loads(contents)
        
        # Check expiry
        expires_at = cookie_data.get('expiresAt')
        if expires_at:
            try:
                from datetime import timezone
                expiry_date = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                if expiry_date < datetime.now(timezone.utc):
                    log(f"Cookies expired at {expires_at}")
                    return None
            except:
                pass
        
        cookies = cookie_data.get('cookies', {})
        if not cookies:
            return None
        
        # Convert to JSON string (twscrape expects str)
        cookie_str = json.dumps(cookies)
        log(f"Loaded cookies from GCS (uploaded: {cookie_data.get('timestamp', 'unknown')})")
        return cookie_str
    except Exception as e:
        log(f"GCS load failed: {e}")
        return None

def parse_cookies(cookie_string):
    """Parse Twitter cookies from env string -> JSON dict"""
    cookies = {}
    if not cookie_string:
        return cookies
    for part in cookie_string.split(";"):
        part = part.strip()
        if "=" in part:
            key, value = part.split("=", 1)
            cookies[key.strip()] = value.strip()
    return cookies

async def scrape_twitter_bookmarks_async():
    """Main async scraper"""
    log("=== Twitter Scraper v2 Started ===")
    
    if not TWSCRAPE_AVAILABLE:
        return {"success": False, "error": "twscrape not installed"}
    
    os.makedirs(VAULT_DIR, exist_ok=True)
    
    # Get cookies as JSON string (twscrape requirement)
    cookie_str = load_cookies_from_gcs()
    
    if not cookie_str and TWITTER_COOKIES:
        parsed = parse_cookies(TWITTER_COOKIES)
        if parsed:
            cookie_str = json.dumps(parsed)
            log("Using cookies from env")
    
    if not cookie_str:
        return {"success": False, "error": "No valid cookies from GCS or env"}
    
    pool = AccountsPool()
    
    try:
        # add_account: cookies param is a JSON string
        await pool.add_account(
            username=TWITTER_USERNAME or "user",
            password=TWITTER_PASSWORD or "",
            email=TWITTER_EMAIL or "",
            email_password="",
            cookies=cookie_str
        )
        log(f"Account added with cookies")
        
        api = API(pool)
        
        # Use api.bookmarks() instead of api.search()
        tweets = []
        count = 0
        async for tweet in api.bookmarks(limit=200):
            tweets.append({
                "id": str(tweet.id) if hasattr(tweet, 'id') else str(hash(tweet.rawContent)),
                "text": tweet.rawContent if hasattr(tweet, 'rawContent') else str(tweet),
                "url": getattr(tweet, 'url', '') or (
                    f"https://twitter.com/{getattr(tweet.user, 'username', 'unknown')}/status/{getattr(tweet, 'id', '')}"
                ),
                "created_at": str(tweet.date) if hasattr(tweet, 'date') else (
                    str(tweet.createdAt) if hasattr(tweet, 'createdAt') else ""
                ),
                "like_count": getattr(tweet, 'likeCount', 0),
                "retweet_count": getattr(tweet, 'retweetCount', 0),
                "user": {
                    "username": getattr(tweet.user, 'username', '') if hasattr(tweet, 'user') else ''
                }
            })
            count += 1
            
        log(f"Fetched {count} bookmarks")
        
        # Save locally
        with open(TWITTER_OUTPUT, 'w') as f:
            json.dump(tweets, f, indent=2)
        
        # Upload to GCS
        if GCS_AVAILABLE and tweets:
            try:
                client = storage.Client()
                bucket = client.bucket(BUCKET_NAME)
                blob = bucket.blob('vault/twitter_bookmarks_automated.json')
                with open(TWITTER_OUTPUT, 'rb') as f:
                    blob.upload_from_file(f, content_type='application/json')
                log("Uploaded to GCS")
            except Exception as e:
                log(f"GCS upload failed: {e}")
        
        # Save last run
        with open(LAST_RUN_FILE, 'w') as f:
            json.dump({"timestamp": datetime.now().isoformat(), "count": len(tweets)}, f)
        
        log(f"✅ Complete: {len(tweets)} tweets")
        return {"success": True, "count": len(tweets)}
        
    except Exception as e:
        log(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

def scrape_twitter_bookmarks():
    """Sync wrapper with proper event loop"""
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(scrape_twitter_bookmarks_async())
        finally:
            loop.close()
    except Exception as e:
        log(f"Event loop error: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    result = scrape_twitter_bookmarks()
    print(json.dumps(result, indent=2))
