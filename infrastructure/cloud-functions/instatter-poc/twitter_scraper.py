#!/usr/bin/env python3
"""
Twitter Bookmark Scraper using Playwright
Same pattern as Instagram scraper - Playwright + GCS cookies
"""
import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
    exit(1)

BUCKET = "omniclaw-knowledge-graph"
COOKIES_PATH = "vault/cookies/twitter_cookies.json"
OUTPUT = "vault/twitter_bookmarks_automated.json"
MAX_ITEMS = int(os.environ.get("TWITTER_MAX_ITEMS", "200"))
SCROLL_LIMIT = int(os.environ.get("TWITTER_SCROLL_LIMIT", "20"))
LOG_FILE = "/opt/instatter/twitter_scraper.log"

def log(msg):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def load_cookies():
    result = subprocess.run(
        ["gcloud", "storage", "cat", f"gs://{BUCKET}/{COOKIES_PATH}"],
        capture_output=True, text=True, timeout=30
    )
    data = json.loads(result.stdout)
    cookies = data.get("cookies", {})
    if not cookies:
        raise Exception("No cookies in GCS cookie file")
    log(f"Loaded Twitter cookies: auth_token={cookies.get('auth_token','')[:10]}..., ct0={cookies.get('ct0','')[:10]}...")
    return cookies

def upload_bookmarks(bookmarks):
    payload = json.dumps({
        "synced_at": utc_now(),
        "count": len(bookmarks),
        "bookmarks": bookmarks
    }, indent=2)
    import tempfile, os
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(payload)
        tmp_path = f.name
    try:
        result = subprocess.run(
            ["gcloud", "storage", "cp", tmp_path, f"gs://{BUCKET}/{OUTPUT}",
             "--content-type=application/json"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode != 0:
            raise Exception(f"GCS upload failed: {result.stderr}")
    finally:
        os.unlink(tmp_path)
    log(f"Uploaded {len(bookmarks)} bookmarks to gs://{BUCKET}/{OUTPUT}")

async def scrape_twitter(cookies):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()

        # Add Twitter cookies for both x.com and twitter.com domains
        twitter_cookies = []
        for name, value in cookies.items():
            for domain in [".x.com", ".twitter.com"]:
                twitter_cookies.append({
                    "name": name,
                    "value": value,
                    "domain": domain,
                    "path": "/",
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "None"
                })

        await context.add_cookies(twitter_cookies)

        page = await context.new_page()
        await page.goto(
            "https://x.com/i/bookmarks",
            wait_until="networkidle", timeout=120000
        )

        # Scroll to top first to trigger lazy loading
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(3000)

        # Dismiss any popups/modals
        try:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(500)
        except:
            pass

        # Check if logged in
        if "/login" in page.url:
            await browser.close()
            raise Exception("Twitter redirected to login. Cookies expired.")

        log(f"Logged in, URL: {page.url}")

        # Scroll to load bookmarks
        prev, stable = -1, 0
        for i in range(SCROLL_LIMIT):
            await page.wait_for_timeout(2000)
            cnt = await page.locator("a[href*='/status/']").count()
            log(f"Scroll {i+1}: {cnt} tweet links found")
            if cnt == prev:
                stable += 1
            else:
                stable = 0
            prev = cnt
            if stable >= 3 or (MAX_ITEMS and cnt >= MAX_ITEMS):
                break
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Extract tweet links (format: /username/status/TWEET_ID)
        items = await page.locator("a[href*='/status/']").evaluate_all("""
            elements => elements.map(el => ({
                href: el.getAttribute('href'),
                text: (el.textContent || '').trim().substring(0, 300)
            }))
        """)

        seen, bookmarks = set(), []
        for item in items:
            href = item.get("href", "")
            if not href or href in seen or '/photo/' in href or '/video/' in href or '/analytics' in href:
                continue
            seen.add(href)
            # Extract tweet ID from href like /karlocreates/status/2044737952140398898
            parts = href.strip("/").split("/")
            tweet_id = parts[-1] if parts else ""
            username = parts[-3] if len(parts) >= 3 else ""
            bookmarks.append({
                "id": tweet_id,
                "tweet_id": tweet_id,
                "url": f"https://x.com{href}" if href.startswith("/") else href,
                "text": item.get("text", ""),
                "source": "twitter_bookmarks_browser",
                "synced_at": utc_now(),
            })
            if MAX_ITEMS and len(bookmarks) >= MAX_ITEMS:
                break

        await browser.close()
        return bookmarks

def main():
    log("Twitter scraper starting")
    try:
        cookies = load_cookies()
        bookmarks = asyncio.run(scrape_twitter(cookies))
        log(f"Found {len(bookmarks)} bookmarks")
        if bookmarks:
            upload_bookmarks(bookmarks)
            log(f"SUCCESS: {len(bookmarks)} bookmarks synced")
        else:
            log("WARNING: No bookmarks found")
    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
