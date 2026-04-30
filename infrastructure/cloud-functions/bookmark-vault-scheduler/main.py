"""
Bookmark Vault Scheduler - Twitter & Instagram Scraping
GCP Cloud Function entry points (Gen 2)
"""

import asyncio
import json
import os
from datetime import datetime

# Configuration
VAULT_DIR = os.getenv("VAULT_DIR", "/workspace/data")
TWITTER_OUTPUT = os.path.join(VAULT_DIR, "twitter_bookmarks_automated.json")
INSTAGRAM_OUTPUT = os.path.join(VAULT_DIR, "instagram_scrape.json")
VAULT_FILE = os.path.join(VAULT_DIR, "bookmarks_vault.json")


def log(msg):
    print(f"[SCHEDULER] {datetime.now().isoformat()} {msg}", flush=True)


async def twitter_scrape_async():
    """Async Twitter scraper wrapper"""
    log("=== Twitter Scraper Started ===")
    try:
        from twitter_scraper import scrape_twitter_bookmarks
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, scrape_twitter_bookmarks)
        log(f"=== Twitter scrape completed: {result} ===")
        return result
    except Exception as e:
        log(f"Twitter scrape error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def instagram_scrape_async():
    """Async Instagram scraper"""
    log("=== Instagram Scraper Started ===")
    try:
        from instagram_scraper import scrape_instagram_saved
        result = await scrape_instagram_saved()
        log(f"=== Instagram scrape completed: {result} ===")
        return result
    except Exception as e:
        log(f"Instagram scrape error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# GCP Cloud Functions entry points
def twitter_scrape(event=None, context=None):
    """Entry point for Twitter scraper Cloud Function"""
    return asyncio.run(twitter_scrape_async())


def instagram_scrape(event=None, context=None):
    """Entry point for Instagram scraper Cloud Function"""
    return asyncio.run(instagram_scrape_async())


def scheduler(event=None, context=None):
    """Entry point for combined scheduler"""
    log("=== Bookmark Vault Scheduler Started ===")

    try:
        from twitter_scraper import scrape_twitter_bookmarks
        from instagram_scraper import scrape_instagram_saved

        # Twitter scraper is sync, call directly
        twitter_result = scrape_twitter_bookmarks()

        # Instagram scraper is async, run in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        instagram_result = loop.run_until_complete(scrape_instagram_saved())
        loop.close()

        os.makedirs(VAULT_DIR, exist_ok=True)
        vault = {
            "lastUpdated": datetime.now().isoformat(),
            "twitterSuccess": twitter_result.get("success", False),
            "instagramSuccess": instagram_result.get("success", False),
            "twitterNewBookmarks": twitter_result.get("new_bookmarks", 0),
            "instagramNewPosts": instagram_result.get("new_posts", 0),
            "source": "bookmark-vault-scheduler"
        }

        with open(VAULT_FILE, "w") as f:
            json.dump(vault, f, indent=2)

        log(f"=== Scheduler completed: {vault} ===")
        return vault

    except Exception as e:
        log(f"Scheduler error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


# Aliases
main = scheduler