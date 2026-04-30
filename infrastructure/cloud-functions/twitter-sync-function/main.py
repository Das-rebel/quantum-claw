# Twitter Timeline Sync via Cloud Functions
# Replaces dead Nitter instances with working free APIs
#
# Method priority:
#   1. Twitter Syndication API (timeline-profile) — returns full tweet JSON, no auth
#   2. RSSHub Twitter route — included for when/if routes come back
#   3. oEmbed enrichment — used to flesh out individual tweets if needed

import os
import re
import json
from datetime import datetime
import functions_framework

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False
    print("google-cloud-storage not available")

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("requests not available")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BUCKET_NAME = "omniclaw-knowledge-graph"
TWITTER_USERNAME = "sdas22"

SYNDICATION_URL = (
    "https://syndication.twitter.com/srv/timeline-profile/screen-name/{username}"
)
RSSHUB_URL = "https://rsshub.app/twitter/user/{username}"
OEMBED_URL = "https://publish.twitter.com/oembed?url={tweet_url}"

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://platform.twitter.com/",
}

# Month abbreviation -> number for parsing "Thu Apr 28 00:56:58 +0000 2022"
_MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_twitter_date(ts: str) -> str:
    """Convert 'Thu Apr 28 00:56:58 +0000 2022' → ISO-8601."""
    try:
        parts = ts.split()
        # dow month day time tz year
        month = _MONTH_MAP.get(parts[1], 1)
        day = int(parts[2])
        year = int(parts[5])
        h, m, s = parts[3].split(":")
        return datetime(year, month, day, int(h), int(m), int(s)).isoformat()
    except Exception:
        return ts


def _tweet_entry_to_bookmark(entry: dict) -> dict | None:
    """Convert a syndication entry into the canonical bookmark shape."""
    tweet = entry.get("content", {}).get("tweet", {})
    tweet_id = tweet.get("id_str") or tweet.get("conversation_id_str")
    if not tweet_id:
        # fall back to entry_id which is "tweet-12345"
        eid = entry.get("entry_id", "")
        if eid.startswith("tweet-"):
            tweet_id = eid.split("-", 1)[1]
    if not tweet_id:
        return None

    screen_name = tweet.get("user", {}).get("screen_name", TWITTER_USERNAME)
    full_text = tweet.get("full_text", "")
    created_at = tweet.get("created_at", "")
    iso_ts = _parse_twitter_date(created_at) if created_at else datetime.now().isoformat()

    return {
        "id": str(tweet_id),
        "url": f"https://twitter.com/{screen_name}/status/{tweet_id}",
        "text": full_text,
        "timestamp": iso_ts,
    }


def _rss_item_to_bookmark(item: dict) -> dict | None:
    """Convert an RSS <item> dict (from feedparser-style parsing) into a bookmark."""
    link = item.get("link", "")
    if not link:
        return None
    # extract tweet id from URL
    m = re.search(r"/status/(\d+)", link)
    tweet_id = m.group(1) if m else ""
    title = item.get("title", "")
    pub_date = item.get("pubDate", item.get("published", ""))
    if pub_date:
        try:
            from email.utils import parsedate_to_datetime
            iso_ts = parsedate_to_datetime(pub_date).isoformat()
        except Exception:
            iso_ts = pub_date
    else:
        iso_ts = datetime.now().isoformat()

    return {
        "id": tweet_id,
        "url": link,
        "text": title,
        "timestamp": iso_ts,
    }


# ---------------------------------------------------------------------------
# Fetch methods
# ---------------------------------------------------------------------------

def fetch_via_syndication(username: str) -> tuple[list[dict], str]:
    """
    Primary method.  Twitter Syndication API returns an HTML page whose
    <script id="__NEXT_DATA__"> contains a full JSON payload with tweet
    entries.  No auth required.

    Includes retry with backoff for 429 responses (rate limit = 30 req/min).
    """
    import time

    url = SYNDICATION_URL.format(username=username)
    print(f"[syndication] GET {url}")

    resp = None
    for attempt in range(2):  # at most 2 attempts (initial + 1 retry)
        resp = requests.get(url, headers=REQUEST_HEADERS, timeout=30, allow_redirects=True)
        if resp.status_code == 429 and attempt == 0:
            # Respect rate-limit-reset header if present, capped at 10s
            # (Cloud Function max runtime is typically 60s-9min depending on config)
            wait = 10
            print(f"[syndication] 429 rate-limited, retrying in {wait}s")
            time.sleep(wait)
            continue
        break

    if resp is None or resp.status_code != 200:
        print(f"[syndication] HTTP {resp.status_code if resp else 'N/A'}")
        return [], "syndication"

    html = resp.text
    marker = '__NEXT_DATA__'
    start = html.find(marker)
    if start < 0:
        print("[syndication] No __NEXT_DATA__ in response")
        return [], "syndication"

    json_start = html.find("{", start)
    json_end = html.find("</script>", json_start)
    if json_start < 0 or json_end < 0:
        print("[syndication] Could not locate JSON bounds")
        return [], "syndication"

    try:
        data = json.loads(html[json_start:json_end])
    except json.JSONDecodeError as exc:
        print(f"[syndication] JSON parse error: {exc}")
        return [], "syndication"

    entries = (
        data.get("props", {})
        .get("pageProps", {})
        .get("timeline", {})
        .get("entries", [])
    )
    print(f"[syndication] {len(entries)} entries found")

    bookmarks = []
    for entry in entries:
        bm = _tweet_entry_to_bookmark(entry)
        if bm:
            bookmarks.append(bm)

    return bookmarks, "syndication"


def fetch_via_rsshub(username: str) -> tuple[list[dict], str]:
    """
    Fallback method.  RSSHub /twitter/user/{name} used to work; currently
    returns 404 but we keep it as a fallback in case routes are restored.
    """
    url = RSSHUB_URL.format(username=username)
    print(f"[rsshub] GET {url}")

    resp = requests.get(url, headers=REQUEST_HEADERS, timeout=20, allow_redirects=True)
    if resp.status_code != 200:
        print(f"[rsshub] HTTP {resp.status_code}")
        return [], "rss"

    # Parse RSS XML
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        print("[rsshub] XML parse error")
        return [], "rss"

    ns = {"rss": "http://purl.org/rss/1.0/", "atom": "http://www.w3.org/2005/Atom"}
    items = root.findall(".//item") or root.findall(".//rss:item", ns)
    if not items:
        # Try Atom <entry>
        items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

    print(f"[rsshub] {len(items)} items found")
    bookmarks = []
    for item in items:
        # Build a simple dict from the element children
        child_tags = {}
        for child in item:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            child_tags[tag] = child.text or ""
        bm = _rss_item_to_bookmark(child_tags)
        if bm:
            bookmarks.append(bm)

    return bookmarks, "rss"


def enrich_via_oembed(bookmarks: list[dict]) -> list[dict]:
    """
    Last-resort enrichment.  For bookmarks that have a URL but empty text,
    hit the oEmbed endpoint to fill in the text.  Rate-limited to 1 req/sec
    and capped at 20 requests to avoid abuse.
    """
    import time
    enriched = 0
    for bm in bookmarks:
        if bm.get("text") or not bm.get("url"):
            continue
        if enriched >= 20:
            break
        try:
            oembed_url = OEMBED_URL.format(tweet_url=bm["url"])
            resp = requests.get(oembed_url, headers=REQUEST_HEADERS, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                # oEmbed html contains the tweet text in a <p> tag
                html = data.get("html", "")
                m = re.search(r"<p[^>]*>(.*?)</p>", html, re.DOTALL)
                if m:
                    raw = m.group(1)
                    # strip HTML entities
                    import html as html_mod
                    bm["text"] = html_mod.unescape(raw).strip()
                    enriched += 1
            time.sleep(1)
        except Exception as exc:
            print(f"[oembed] Error enriching {bm['url']}: {exc}")
    if enriched:
        print(f"[oembed] Enriched {enriched} bookmarks")
    return bookmarks


# ---------------------------------------------------------------------------
# GCS upload
# ---------------------------------------------------------------------------

def upload_to_gcs(filename: str, data):
    """Upload JSON data to GCS bucket."""
    if not GCS_AVAILABLE:
        print("GCS not available, skipping upload")
        return False

    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)
        blob.upload_from_string(
            json.dumps(data, indent=2, ensure_ascii=False),
            content_type="application/json",
        )
        try:
            blob.make_public()
        except Exception:
            pass  # fine if uniform bucket-level access is on
        print(f"[gcs] Uploaded {filename}")
        return True
    except Exception as exc:
        print(f"[gcs] Upload failed: {exc}")
        return False


# ---------------------------------------------------------------------------
# Cloud Function entry point
# ---------------------------------------------------------------------------

@functions_framework.http
def fetch_twitter_bookmarks(request):
    """
    HTTP Cloud Function.
    Fetches the public Twitter timeline for TWITTER_USERNAME using free,
    no-auth APIs and uploads the result to GCS.

    Query / JSON params:
      send_summary (bool)  – if true, also writes vault/latest_sync_summary.json
    """
    # ---- CORS ----
    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    if request.method == "OPTIONS":
        return ("", 204, cors_headers)

    resp_headers = {**cors_headers, "Content-Type": "application/json"}

    # ---- Health check ----
    if request.method == "GET" and request.path in ("/health", "/", ""):
        return (
            json.dumps({
                "service": "twitter-sync",
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
            }),
            200,
            resp_headers,
        )

    # ---- Determine params ----
    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}
    send_summary = payload.get("send_summary", False)

    # ---- Fetch pipeline ----
    bookmarks: list[dict] = []
    method_used = "none"
    status = "failed"
    last_error = None

    try:
        print(f"[{datetime.now().isoformat()}] Starting sync for @{TWITTER_USERNAME}")

        # 1) Syndication API (primary)
        if REQUESTS_AVAILABLE:
            bookmarks, method_used = fetch_via_syndication(TWITTER_USERNAME)

        # 2) RSSHub fallback
        if not bookmarks and REQUESTS_AVAILABLE:
            bookmarks, method_used = fetch_via_rsshub(TWITTER_USERNAME)

        # 3) oEmbed enrichment for entries missing text
        if bookmarks and REQUESTS_AVAILABLE:
            empty_text = sum(1 for b in bookmarks if not b.get("text"))
            if empty_text > 0 and empty_text <= 20:
                bookmarks = enrich_via_oembed(bookmarks)

        # If we got nothing from all methods, still record a clean result
        if bookmarks:
            status = "success"
            # Upload bookmarks
            if GCS_AVAILABLE:
                upload_to_gcs("vault/twitter_bookmarks_automated.json", bookmarks)
        else:
            status = "no_data"
            last_error = (
                "Syndication returned 0 entries and RSSHub returned no data. "
                "The account may be private, empty, or the username may be incorrect."
            )

        # ---- Build response ----
        result = {
            "success": len(bookmarks) > 0,
            "count": len(bookmarks),
            "status": status,
            "method": method_used,
            "timestamp": datetime.now().isoformat(),
        }
        if last_error:
            result["error"] = last_error

        # ---- Optional summary file ----
        if send_summary:
            summary = {
                "twitter": {
                    "status": status,
                    "count": len(bookmarks),
                    "method": method_used,
                    "timestamp": datetime.now().isoformat(),
                },
                "instagram": {
                    "status": "pending",
                    "note": "separate function",
                },
                "generated_at": datetime.now().isoformat(),
            }
            if GCS_AVAILABLE:
                upload_to_gcs("vault/latest_sync_summary.json", summary)

        print(f"[sync] Done: {status}, {len(bookmarks)} items via {method_used}")

        code = 200 if bookmarks else 200  # 200 even for 0 results (not an error)
        return json.dumps(result), code, resp_headers

    except Exception as exc:
        print(f"[sync] Unhandled error: {exc}")
        return (
            json.dumps({
                "success": False,
                "error": str(exc),
                "timestamp": datetime.now().isoformat(),
            }),
            500,
            resp_headers,
        )


# ---------------------------------------------------------------------------
# Placeholder — kept for backward compatibility
# ---------------------------------------------------------------------------

def fetch_instagram_bookmarks(request):
    """Placeholder for Instagram (not part of this sync)."""
    resp_headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }
    return (
        json.dumps({
            "success": False,
            "error": "Instagram integration requires additional setup",
            "recommendation": "Use Apify or manual export",
            "note": "Twitter sync uses Syndication API",
        }),
        200,
        resp_headers,
    )
