#!/bin/bash
set -e

echo "[STARTUP] $(date) - Instatter VM setup starting"

# Install Python and dependencies
apt-get update -y
apt-get install -y python3 python3-pip curl git

# Install Playwright and Chrome
pip3 install --break-system-packages playwright google-cloud-storage
playwright install --with-deps chromium

# Create service directory
mkdir -p /opt/instatter

# Download the scraper from GCS (or we can bake it into the VM image)
# For now, create the scraper inline
cat > /opt/instatter/scraper.py << 'SCRIPT'
#!/usr/bin/env python3
"""Instatter - Instagram Saved Posts Scraper for GCE VM"""
import asyncio, json, os, sys, subprocess
from datetime import datetime, timezone
from playwright.async_api import async_playwright

BUCKET = "omniclaw-knowledge-graph"
OUTPUT = "vault/instagram_saved_automated.json"
COOKIES_PATH = "vault/cookies/instagram_cookies.json"
SCROLL_LIMIT = int(os.environ.get("INSTAGRAM_SCROLL_LIMIT", "20"))
MAX_ITEMS = int(os.environ.get("INSTAGRAM_MAX_ITEMS", "200"))
LOG_FILE = "/var/log/instatter.log"

def log(msg):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def load_cookies():
    result = subprocess.run(
        ["gcloud", "storage", "cat", f"gs://{BUCKET}/{COOKIES_PATH}"],
        capture_output=True, text=True, timeout=30
    )
    data = json.loads(result.stdout)
    browser_cookies = data.get("browserCookies", [])
    if not browser_cookies:
        raise Exception("No browserCookies in GCS cookie file")
    log(f"Loaded {len(browser_cookies)} cookies from GCS")
    return browser_cookies

def upload_posts(posts):
    payload = json.dumps({"synced_at": utc_now(), "count": len(posts), "posts": posts}, indent=2)
    result = subprocess.run(
        ["gcloud", "storage", "upload", "-", f"gs://{BUCKET}/{OUTPUT}",
         "--content-type=application/json"],
        input=payload, capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        raise Exception(f"GCS upload failed: {result.stderr}")
    log(f"Uploaded {len(posts)} posts to gs://{BUCKET}/{OUTPUT}")

async def scrape(browser_cookies):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        await context.add_cookies(browser_cookies)

        page = await context.new_page()
        await page.goto(
            "https://www.instagram.com/dasrebel/saved/all-posts/",
            wait_until="domcontentloaded", timeout=120000
        )
        await page.wait_for_timeout(3000)

        if "/accounts/login" in page.url or "/login" in page.url:
            await browser.close()
            raise Exception("Instagram redirected to login. Cookies expired.")

        # Scroll to load all posts
        prev, stable = -1, 0
        for _ in range(SCROLL_LIMIT):
            await page.wait_for_timeout(1500)
            cnt = await page.locator("a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']").count()
            if cnt == prev:
                stable += 1
            else:
                stable = 0
            prev = cnt
            if stable >= 3 or (MAX_ITEMS and cnt >= MAX_ITEMS):
                break
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        raw = await page.locator("a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']").evaluate_all("""
            elements => elements.map(el => ({
                href: el.getAttribute('href'),
                img: el.querySelector('img')?.currentSrc || '',
                alt: el.querySelector('img')?.alt || ''
            }))
        """)

        seen, posts = set(), []
        for item in raw:
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
                "synced_at": utc_now(),
            })
            if MAX_ITEMS and len(posts) >= MAX_ITEMS:
                break

        await browser.close()
        return posts

def main():
    log("Instatter scraper starting")
    try:
        cookies = load_cookies()
        posts = asyncio.run(scrape(cookies))
        log(f"Found {len(posts)} posts")
        if posts:
            upload_posts(posts)
            log(f"SUCCESS: {len(posts)} posts synced")
        else:
            log("WARNING: No posts found")
    except Exception as e:
        log(f"ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
SCRIPT

chmod +x /opt/instatter/scraper.py

# Set up cron job at 3 AM UTC daily
echo "0 3 * * * root python3 /opt/instatter/scraper.py >> /var/log/instatter-cron.log 2>&1" > /etc/cron.d/instatter
chmod 644 /etc/cron.d/instatter

# Run once on startup for immediate sync
echo "[STARTUP] Running initial scrape..."
python3 /opt/instatter/scraper.py

echo "[STARTUP] $(date) - Instatter setup complete. Cron scheduled for 3 AM daily."
