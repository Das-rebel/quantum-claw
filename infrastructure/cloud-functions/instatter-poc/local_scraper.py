#!/usr/bin/env python3
"""
Instatter Local Scraper
Reads cookies from GCS, runs Playwright browser locally (your residential IP),
 scrapes saved posts, uploads results to GCS.

Usage:
    python3 local_scraper.py

Or with custom settings:
    INSTAGRAM_MAX_ITEMS=200 python3 local_scraper.py
"""
import asyncio
import json
import os
import subprocess
from datetime import datetime, timezone

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
    exit(1)

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

BUCKET_NAME = os.environ.get("INSTAGRAM_BUCKET_NAME", "omniclaw-knowledge-graph")
OUTPUT_FILE = os.environ.get("INSTAGRAM_OUTPUT_FILE", "vault/instagram_saved_automated.json")
COOKIES_FILE = os.environ.get("INSTAGRAM_COOKIES_GCS_PATH", "vault/cookies/instagram_cookies.json")
MAX_ITEMS = int(os.environ.get("INSTAGRAM_MAX_ITEMS", "200"))
SCROLL_LIMIT = int(os.environ.get("INSTAGRAM_SCROLL_LIMIT", "20"))
SAVED_URL = os.environ.get("INSTAGRAM_SAVED_URL", "https://www.instagram.com/dasrebel/saved/all-posts/")
USE_GCLOUD_CLI = os.environ.get("USE_GCLOUD_CLI", "true").lower() in {"true", "1", "yes"}


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def load_gcs_cookies():
    if USE_GCLOUD_CLI:
        result = subprocess.run(
            ["gcloud", "storage", "cat", f"gs://{BUCKET_NAME}/{COOKIES_FILE}"],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(result.stdout)
    else:
        if not GCS_AVAILABLE:
            raise Exception("google-cloud-storage not installed")
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(COOKIES_FILE)
        data = json.loads(blob.download_as_text())
    browser_cookies = data.get("browserCookies", [])
    if not browser_cookies:
        raise Exception("No browserCookies in GCS cookie file. Refresh cookies using the extractor.")
    return browser_cookies


def upload_to_gcs(posts):
    payload = json.dumps({
        "synced_at": utc_now_iso(),
        "count": len(posts),
        "posts": posts,
    }, indent=2)
    if USE_GCLOUD_CLI:
        import tempfile, os
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(payload)
            tmp_path = f.name
        try:
            result = subprocess.run(
                ["gcloud", "storage", "cp", tmp_path, f"gs://{BUCKET_NAME}/{OUTPUT_FILE}",
                 "--content-type=application/json"],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode != 0:
                raise Exception(f"GCS upload failed: {result.stderr}")
        finally:
            os.unlink(tmp_path)
    else:
        if not GCS_AVAILABLE:
            raise Exception("google-cloud-storage not installed")
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(OUTPUT_FILE)
        blob.upload_from_string(payload, content_type="application/json")
    print(f"Uploaded {len(posts)} posts to gs://{BUCKET_NAME}/{OUTPUT_FILE}")


async def fetch_saved_posts(browser_cookies, max_items=200):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        await context.add_cookies(browser_cookies)

        page = await context.new_page()
        await page.goto(SAVED_URL, wait_until="domcontentloaded", timeout=120000)
        await page.wait_for_timeout(3000)

        if "/accounts/login" in page.url or "/login" in page.url:
            await browser.close()
            raise Exception("Instagram redirected to login. Cookies expired. Refresh via extractor.")

        body_text = await page.text_content("body")
        if "log into instagram" in body_text.lower():
            await browser.close()
            raise Exception("Instagram rendered login page. Cookies may be expired.")

        # Scroll to load posts
        previous_count = -1
        stable_rounds = 0
        for _ in range(SCROLL_LIMIT):
            await page.wait_for_timeout(1500)
            current_count = await page.locator("a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']").count()
            if current_count == previous_count:
                stable_rounds += 1
            else:
                stable_rounds = 0
            previous_count = current_count
            if stable_rounds >= 3 or (max_items and current_count >= max_items):
                break
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Extract post links
        raw_items = await page.locator("a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']").evaluate_all("""
            elements => elements.map(el => ({
                href: el.getAttribute('href'),
                img: el.querySelector('img')?.currentSrc || el.querySelector('img')?.src || '',
                alt: el.querySelector('img')?.alt || ''
            }))
        """)

        seen = set()
        posts = []
        for item in raw_items:
            href = item.get("href", "")
            if not href or href in seen:
                continue
            seen.add(href)
            posts.append({
                "id": href.strip("/").replace("/", "_"),
                "url": f"https://www.instagram.com{href}",
                "image_url": item.get("img", ""),
                "caption": (item.get("alt") or "")[:500],
                "source": "instagram_saved_browser",
                "synced_at": utc_now_iso(),
            })
            if max_items and len(posts) >= max_items:
                break

        await browser.close()
        return posts


def main():
    print(f"[{utc_now_iso()}] Loading cookies from GCS...")
    browser_cookies = load_gcs_cookies()
    print(f"Loaded {len(browser_cookies)} cookies")

    print(f"Fetching saved posts from {SAVED_URL}...")
    posts = asyncio.run(fetch_saved_posts(browser_cookies, max_items=MAX_ITEMS))
    print(f"Found {len(posts)} posts")

    if posts:
        upload_to_gcs(posts)
        print(f"\nSample post: {posts[0]['url']}")
    else:
        print("No posts found")

    print(f"\n[{utc_now_iso()}] Done!")


if __name__ == "__main__":
    main()
