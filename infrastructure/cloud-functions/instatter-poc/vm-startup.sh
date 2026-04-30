#!/bin/bash
set -e
exec > /var/log/vm-startup.log 2>&1

echo "[STARTUP] $(date) - VM startup beginning"

# Install Node.js 18 WITH shared libraries (critical for camofox)
echo "[STARTUP] Installing Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify libnode is available
ls /usr/lib/x86_64-linux-gnu/libnode* && echo "libnode found"

# Install camofox
echo "[STARTUP] Installing camofox..."
cd /opt
git clone https://github.com/jo-inc/camofox-browser
cd camofox-browser
npm install

# Fetch Camoufox browser binary
echo "[STARTUP] Fetching Camoufox browser..."
node_modules/.bin/camoufox-js fetch

# Verify browser
echo "[STARTUP] Browser path:"
node_modules/.bin/camoufox-js path

# Create Instagram scraper service
mkdir -p /opt/instatter

cat > /opt/instatter/scraper.py << 'SCRIPT'
#!/usr/bin/env python3
"""Instatter - Instagram Saved Posts Scraper using Camofox"""
import asyncio, json, os, sys, subprocess, time
from datetime import datetime, timezone

BUCKET = "omniclaw-knowledge-graph"
OUTPUT = "vault/instagram_saved_automated.json"
COOKIES_PATH = "vault/cookies/instagram_cookies.json"
CAMOFOX_URL = os.environ.get("CAMOFOX_URL", "http://localhost:9377")
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
        ["gcloud", "storage", "cp", "-", f"gs://{BUCKET}/{OUTPUT}",
         "--content-type=application/json"],
        input=payload.encode(), capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        raise Exception(f"GCS upload failed: {result.stderr}")
    log(f"Uploaded {len(posts)} posts to gs://{BUCKET}/{OUTPUT}")

def camofox_post(endpoint, payload):
    import urllib.request
    import urllib.error
    req = urllib.request.Request(
        f"{CAMOFOX_URL}{endpoint}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())

def scrape_with_camofox(cookies):
    log("Creating camofox session...")
    session_id = f"instatter_{int(time.time())}"

    # Import cookies into camofox
    # Netscape cookie format for camofox
    netscape_cookies = []
    for c in cookies:
        expiry = int(c.get("expirationDate", 0)) if c.get("expirationDate") else 0
        netscape_cookies.append(
            f"{c.get('domain','.instagram.com')}\t"
            f"{'TRUE' if c.get('domain','').startswith('.') else 'FALSE'}\t"
            f"{c.get('path','/')}\t"
            f"{'TRUE' if c.get('secure',True) else 'FALSE'}\t"
            f"{expiry}\t"
            f"{c['name']}\t"
            f"{c['value']}"
        )
    cookie_text = "\n".join(netscape_cookies)

    # Write cookies to file for camofox import
    cookie_file = f"/tmp/cookies_{session_id}.txt"
    with open(cookie_file, "w") as f:
        f.write(cookie_text)

    # Create session
    session = camofox_post("/sessions", {
        "userId": session_id,
        "session": session_id,
        "proxy": None
    })
    log(f"Session created: {session}")

    # Import cookies
    import_result = camofox_post("/import_cookies", {
        "userId": session_id,
        "session": session_id,
        "cookies": cookie_text,
        "url": "https://www.instagram.com"
    })
    log(f"Cookies imported: {import_result}")

    # Navigate to saved posts
    log("Navigating to Instagram saved posts...")
    nav = camofox_post("/navigate", {
        "userId": session_id,
        "session": session_id,
        "url": "https://www.instagram.com/dasrebel/saved/all-posts/"
    })
    log(f"Navigation result keys: {list(nav.get('result',{}).keys()) if 'result' in nav else nav.keys()}")

    # Wait for content to load
    time.sleep(5)

    # Get snapshot
    snap = camofox_post("/snapshot", {
        "userId": session_id,
        "session": session_id,
        "screenshot": False
    })

    # Extract post links from accessibility tree
    posts = []
    seen = set()
    tree = nav.get("result", {}).get(" accessibility_tree", "") or nav.get("result", {}).get("html", "")

    if isinstance(tree, str):
        import re
        links = re.findall(r'href="(/p/[^"]+)"', tree)
        for link in links:
            if link not in seen:
                seen.add(link)
                posts.append({
                    "id": link.strip("/").replace("/", "_"),
                    "url": f"https://www.instagram.com{link}",
                    "source": "instagram_saved_camofox",
                    "synced_at": utc_now(),
                })

    log(f"Found {len(posts)} posts")

    # Cleanup session
    try:
        camofox_post("/close_session", {"userId": session_id, "session": session_id})
    except:
        pass
    os.unlink(cookie_file)

    return posts

def main():
    log("Instatter scraper starting")
    try:
        cookies = load_cookies()
        posts = scrape_with_camofox(cookies)
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

# Install Python deps
apt-get install -y python3 python3-pip
pip3 install google-cloud-storage

# Start camofox in background
echo "[STARTUP] Starting camofox server..."
cd /opt/camofox-browser
nohup node server.js > /var/log/camofox.log 2>&1 &
sleep 5

# Check if running
if curl -s http://localhost:9377/ > /dev/null 2>&1; then
    echo "[STARTUP] Camofox server is running!"
else
    echo "[STARTUP] Camofox server failed to start. Logs:"
    cat /var/log/camofox.log
fi

# Run initial scrape
echo "[STARTUP] Running initial scrape..."
python3 /opt/instatter/scraper.py

# Set up cron for 3 AM daily
echo "0 3 * * * root python3 /opt/instatter/scraper.py >> /var/log/instatter-cron.log 2>&1" > /etc/cron.d/instatter
chmod 644 /etc/cron.d/instatter

echo "[STARTUP] $(date) - Setup complete!"
