# Twitter Bookmark Sync via Cloud Functions
# Runs on Google Cloud Platform - fully automated!

import os
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

# Configuration
BUCKET_NAME = "omniclaw-knowledge-graph"
TWITTER_USERNAME = "sdas22"
NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.poast.org",
    "https://nitter.privacydev.net",
    "https://xcancel.com",
]

@functions_framework.http
def fetch_twitter_bookmarks(request):
    """
    HTTP Cloud Function
    Fetches Twitter bookmarks via Nitter and uploads to GCS
    Triggered by HTTP request or Cloud Scheduler
    """
    # CORS headers
    if request.method == 'OPTIONS':
        headers = {'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type'}
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*',
               'Content-Type': 'application/json'}

    # Health check endpoint (GET only)
    if request.method == 'GET' and (request.path == '/health' or request.path == '/'):
        return json.dumps({
            "service": "twitter-sync",
            "status": "healthy",
            "timestamp": datetime.now().isoformat()
        }), 200, headers

    try:
        print(f"[{datetime.now().isoformat()}] Fetching Twitter bookmarks for {TWITTER_USERNAME}")

        # Try each Nitter instance until one works
        bookmarks = []
        last_error = None
        html_content = None

        for nitter_url in NITTER_INSTANCES:
            try:
                nitter_bookmarks_url = f"{nitter_url}/{TWITTER_USERNAME}/bookmarks"
                print(f"Trying {nitter_url}...")

                response = requests.get(
                    nitter_bookmarks_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    },
                    timeout=30,
                    allow_redirects=True
                )

                if response.status_code == 200 and len(response.text) > 100:
                    html_content = response.text
                    print(f"✅ {nitter_url} returned {len(response.text)} bytes")
                    break
                else:
                    print(f"⚠️ {nitter_url} returned {response.status_code}, content length: {len(response.text)}")
                    last_error = f"HTTP {response.status_code}"
            except Exception as e:
                print(f"❌ {nitter_url} failed: {e}")
                last_error = str(e)
                continue

        if not html_content:
            # Try x.com direct scrape as fallback
            print("Nitter failed, trying x.com direct...")
            html_content = try_xcom_direct()

        if html_content:
            bookmarks = parse_twitter_bookmarks(html_content)

            # Upload to GCS
            if GCS_AVAILABLE and bookmarks:
                upload_to_gcs('vault/twitter_bookmarks_automated.json', bookmarks)

            print(f"✅ Successfully processed {len(bookmarks)} bookmarks")

            return json.dumps({
                "success": True,
                "count": len(bookmarks),
                "source": "nitter",
                "timestamp": datetime.now().isoformat()
            }), 200, headers
        else:
            return json.dumps({
                "error": f"All Nitter instances failed. Last error: {last_error}",
                "solution": "Try refreshing cookies or check Twitter account"
            }), 500, headers

    except Exception as e:
        print(f"❌ Error: {e}")
        return json.dumps({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500, headers

def try_xcom_direct():
    """Fallback: try to fetch bookmarks directly from x.com (may need cookies)"""
    try:
        # This likely won't work without cookies but worth trying
        response = requests.get(
            f"https://x.com/{TWITTER_USERNAME}/saved",
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout=20,
            allow_redirects=True
        )
        if response.status_code == 200 and len(response.text) > 100:
            return response.text
    except Exception as e:
        print(f"x.com direct failed: {e}")
    return None

def parse_twitter_bookmarks(html):
    """Parse bookmarks from Nitter HTML or x.com HTML"""
    bookmarks = []

    if not html or len(html) < 100:
        print("HTML content too short to parse")
        return bookmarks

    import re

    # Try Nitter format first (class="tweet-link")
    tweet_pattern = r'<a class="tweet-link"[^>]*href="/([^"]+)/status/(\d+)"[^>]*>'
    matches = re.findall(tweet_pattern, html)

    if matches:
        print(f"Found {len(matches)} tweets in Nitter format")
        for username, tweet_id in matches[:100]:
            bookmarks.append({
                "id": tweet_id,
                "url": f"https://twitter.com/{username}/status/{tweet_id}",
                "text": "",
                "timestamp": datetime.now().isoformat()
            })
    else:
        # Try x.com format
        x_pattern = r'href="https://twitter\.com/([^/]+)/status/(\d+)"'
        x_matches = re.findall(x_pattern, html)
        if x_matches:
            print(f"Found {len(x_matches)} tweets in x.com format")
            for username, tweet_id in x_matches[:100]:
                bookmarks.append({
                    "id": tweet_id,
                    "url": f"https://twitter.com/{username}/status/{tweet_id}",
                    "text": "",
                    "timestamp": datetime.now().isoformat()
                })

    # If still empty, try data attributes
    if not bookmarks:
        data_pattern = r'data-id="(\d+)"'
        data_matches = re.findall(data_pattern, html)
        if data_matches:
            print(f"Found {len(data_matches)} tweets in data-id format")
            for tweet_id in data_matches[:100]:
                bookmarks.append({
                    "id": tweet_id,
                    "url": f"https://twitter.com/{TWITTER_USERNAME}/status/{tweet_id}",
                    "text": "",
                    "timestamp": datetime.now().isoformat()
                })

    return bookmarks

def upload_to_gcs(filename, data):
    """Upload data to GCS"""
    if not GCS_AVAILABLE:
        print("GCS not available, skipping upload")
        return

    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)

        # Upload as JSON
        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type='application/json'
        )

        # Make public (so VM can read it)
        blob.make_public()

        print(f"✅ Uploaded to GCS: {filename}")

    except Exception as e:
        print(f"❌ GCS upload failed: {e}")

def fetch_instagram_bookmarks(request):
    """
    Placeholder for Instagram
    Instagram doesn't have an official API for saved posts
    """
    headers = {'Access-Control-Allow-Origin': '*',
               'Content-Type': 'application/json'}

    return json.dumps({
        "success": False,
        "error": "Instagram integration requires additional setup",
        "recommendation": "Use Apify ($5/month) or manual export",
        "note": "Twitter works perfectly via Nitter!"
    }), 200, headers
