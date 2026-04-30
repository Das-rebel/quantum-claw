#!/usr/bin/env python3
"""
Instagram Bookmark Scraper using instagrapi
Fetches saved posts using session cookies (auto-refreshed)
"""

import os
import json
import asyncio
from datetime import datetime
from pathlib import Path

from instagrapi import Client


# Configuration from environment
INSTAGRAM_COOKIES = os.getenv("INSTAGRAM_COOKIES", "")
INSTAGRAM_USERNAME = os.getenv("INSTAGRAM_USERNAME", "")
VAULT_DIR = os.getenv("VAULT_DIR", "/Users/Subho/omniclaw-personal-assistant/infrastructure/data")
INSTAGRAM_OUTPUT = os.path.join(VAULT_DIR, "instagram_scrape.json")
LAST_RUN_FILE = os.path.join(VAULT_DIR, "instagram_last_run.json")


def log(msg):
    print(f"[INSTAGRAM] {datetime.now().isoformat()} {msg}", flush=True)


def parse_cookies(cookie_string: str) -> dict:
    """Parse Instagram cookies from string format"""
    cookies = {}
    if not cookie_string:
        return cookies

    for part in cookie_string.split(";"):
        part = part.strip()
        if "=" in part:
            key, value = part.split("=", 1)
            cookies[key.strip()] = value.strip()

    return cookies


async def scrape_instagram_saved_async():
    """
    Scrape Instagram saved posts using instagrapi
    """
    log("=" * 50)
    log("Instagram Bookmark Scraper Started (instagrapi)")
    log("=" * 50)

    if not INSTAGRAM_COOKIES:
        log("ERROR: INSTAGRAM_COOKIES not set")
        return {"success": False, "error": "No cookies"}

    cookies = parse_cookies(INSTAGRAM_COOKIES)

    if "sessionid" not in cookies:
        log("ERROR: sessionid cookie not found")
        return {"success": False, "error": "No sessionid"}

    log(f"Using sessionid: {cookies.get('sessionid', '')[:20]}...")

    try:
        # Create client and set session
        cl = Client()
        cl.set_settings({
            "cookies": cookies,
            "username": INSTAGRAM_USERNAME
        })

        # Get all collections (saved posts)
        log("Fetching collections (saved posts)...")
        collections = cl.collections()

        posts = []
        for coll in collections:
            try:
                log(f"Fetching media from collection: {coll.name}")
                medias = cl.collection_medias(coll.id)
                for media in medias:
                    posts.append({
                        "id": f"ig_{media.code}",
                        "type": "instagram_post",
                        "url": f"https://www.instagram.com/p/{media.code}",
                        "permalink": f"https://www.instagram.com/p/{media.code}",
                        "shortcode": media.code,
                        "postId": f"instagram_{media.id}",
                        "scraped_at": datetime.now().isoformat(),
                        "media_type": str(media.media_type).lower() if hasattr(media, 'media_type') else "photo",
                        "collection": coll.name
                    })
            except Exception as e:
                log(f"Error fetching collection {coll.id}: {e}")

        log(f"Fetched {len(posts)} saved posts")

        # Deduplicate by shortcode
        seen = set()
        unique_posts = []
        for post in posts:
            if post["shortcode"] not in seen:
                seen.add(post["shortcode"])
                unique_posts.append(post)

        log(f"Found {len(unique_posts)} unique post bookmarks")

        # Load existing and merge
        existing = []
        if Path(INSTAGRAM_OUTPUT).exists():
            try:
                with open(INSTAGRAM_OUTPUT, "r") as f:
                    existing = json.load(f)
                log(f"Loaded {len(existing)} existing bookmarks")
            except Exception as e:
                log(f"Error loading existing: {e}")

        existing_codes = {b.get("shortcode", "") for b in existing}
        new_bookmarks = [p for p in unique_posts if p.get("shortcode", "") not in existing_codes]

        merged = existing + new_bookmarks

        # Save
        Path(VAULT_DIR).mkdir(parents=True, exist_ok=True)
        with open(INSTAGRAM_OUTPUT, "w") as f:
            json.dump(merged, f, indent=2)

        log(f"Added {len(new_bookmarks)} new bookmarks. Total: {len(merged)}")

        # Save last run info
        with open(LAST_RUN_FILE, "w") as f:
            json.dump({
                "last_run": datetime.now().isoformat(),
                "posts_added": len(new_bookmarks),
                "total_posts": len(merged)
            }, f, indent=2)

        return {
            "success": True,
            "new_posts": len(new_bookmarks),
            "total_posts": len(merged)
        }

    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


async def scrape_instagram_saved():
    """Async wrapper"""
    return await scrape_instagram_saved_async()


if __name__ == "__main__":
    result = asyncio.run(scrape_instagram_saved())
    print(f"Result: {result}")