#!/usr/bin/env python3
"""
Twitter Bookmark Scraper using twscrape
Fetches bookmarked tweets using session cookies
"""

import os
import json
import asyncio
from datetime import datetime
from pathlib import Path

from twscrape import API
from twscrape.accounts_pool import AccountsPool


# Configuration from environment
TWITTER_COOKIES = os.getenv("TWITTER_COOKIES", "")
TWITTER_USERNAME = os.getenv("TWITTER_USERNAME", "")
VAULT_DIR = os.getenv("VAULT_DIR", "/Users/Subho/omniclaw-personal-assistant/infrastructure/data")
TWITTER_OUTPUT = os.path.join(VAULT_DIR, "twitter_bookmarks_automated.json")
LAST_RUN_FILE = os.path.join(VAULT_DIR, "twitter_last_run.json")


def log(msg):
    print(f"[TWITTER] {datetime.now().isoformat()} {msg}", flush=True)


def parse_cookies(cookie_string: str) -> dict:
    """Parse Twitter cookies from string format"""
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
    """
    Scrape Twitter bookmarks using twscrape (internal API)
    Uses cookies parameter for authentication
    """
    log("=" * 50)
    log("Twitter Bookmark Scraper Started (twscrape)")
    log("=" * 50)

    if not TWITTER_COOKIES:
        log("ERROR: TWITTER_COOKIES not set")
        return {"success": False, "error": "No cookies"}

    cookies = parse_cookies(TWITTER_COOKIES)
    log(f"Parsed cookies: {list(cookies.keys())}")

    if "auth_token" not in cookies and "ct0" not in cookies:
        log("ERROR: auth_token or ct0 cookie not found")
        return {"success": False, "error": "Missing required cookies"}

    log(f"Using auth_token: {cookies.get('auth_token', '')[:20]}...")
    log(f"Using ct0: {cookies.get('ct0', '')[:10]}...")

    try:
        # Create accounts pool with cookies
        # Note: email/email_password required but cookies are used for auth
        pool = AccountsPool()
        await pool.add_account(
            username=TWITTER_USERNAME,
            password="",  # Not needed when using cookies
            email="",     # Not needed when using cookies
            email_password="",  # Not needed when using cookies
            cookies=TWITTER_COOKIES  # This is what actually authenticates
        )
        await pool.login_all()

        # Create API instance
        api = API(pool)

        log("Fetching bookmarks...")
        tweets = []

        # Get bookmarks
        async for tweet in api.bookmarks(limit=100):
            tweets.append({
                "id": f"twitter_{tweet.id}",
                "type": "twitter_post",
                "text": tweet.rawText,
                "author": tweet.user.screenName if tweet.user else "",
                "url": f"https://x.com/{tweet.user.screenName if tweet.user else 'unknown'}/status/{tweet.id}",
                "timestamp": tweet.dateStr if hasattr(tweet, 'dateStr') else datetime.now().isoformat(),
                "scrapedAt": datetime.now().isoformat()
            })

        log(f"Fetched {len(tweets)} tweets from bookmarks")

        # Deduplicate by URL
        seen_urls = set()
        unique_tweets = []
        for tweet in tweets:
            if tweet["url"] not in seen_urls:
                seen_urls.add(tweet["url"])
                unique_tweets.append(tweet)

        log(f"Found {len(unique_tweets)} unique tweet bookmarks")

        # Load existing and merge
        existing = []
        if Path(TWITTER_OUTPUT).exists():
            try:
                with open(TWITTER_OUTPUT, "r") as f:
                    existing = json.load(f)
                log(f"Loaded {len(existing)} existing bookmarks")
            except Exception as e:
                log(f"Error loading existing: {e}")

        existing_urls = {b.get("url", "") for b in existing}
        new_bookmarks = [t for t in unique_tweets if t.get("url", "") not in existing_urls]

        merged = existing + new_bookmarks

        # Save
        Path(VAULT_DIR).mkdir(parents=True, exist_ok=True)
        with open(TWITTER_OUTPUT, "w") as f:
            json.dump(merged, f, indent=2)

        log(f"Added {len(new_bookmarks)} new bookmarks. Total: {len(merged)}")

        # Save last run info
        with open(LAST_RUN_FILE, "w") as f:
            json.dump({
                "last_run": datetime.now().isoformat(),
                "bookmarks_added": len(new_bookmarks),
                "total_bookmarks": len(merged)
            }, f, indent=2)

        return {
            "success": True,
            "new_bookmarks": len(new_bookmarks),
            "total_bookmarks": len(merged)
        }

    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


def scrape_twitter_bookmarks():
    """Sync wrapper for twscrape async function"""
    return asyncio.run(scrape_twitter_bookmarks_async())


if __name__ == "__main__":
    result = scrape_twitter_bookmarks()
    print(f"Result: {result}")
