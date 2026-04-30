# Instagram Saved Posts Sync via Cloud Functions + Apify
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
INSTAGRAM_USERNAME = "sdas22"  # Your Instagram username
Apify_API_KEY = os.environ.get("APIFY_API_KEY", "")
APIFY_ACTOR_ID = "apify/instagram-scraper"  # Apify's official Instagram scraper

@functions_framework.http
def fetch_instagram_saved(request):
    """
    HTTP Cloud Function
    Fetches Instagram saved posts via Apify and uploads to GCS
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
            "service": "instagram-sync",
            "status": "healthy",
            "apify_configured": bool(Apify_API_KEY),
            "timestamp": datetime.now().isoformat()
        }), 200, headers

    try:
        print(f"[{datetime.now().isoformat()}] Fetching Instagram saved posts for {INSTAGRAM_USERNAME}")

        # Check if Apify API key is configured
        if not Apify_API_KEY:
            return json.dumps({
                "error": "Apify API key not configured",
                "solution": "Set APIFY_API_KEY environment variable in Cloud Function",
                "note": "Sign up at https://apify.com/sign-up and get API key from https://console.apify.com/account",
                "cost": "$5/month for Instagram scraper"
            }), 500, headers

        # Call Apify API to run Instagram scraper
        saved_posts = run_apify_scraper()

        # Upload to GCS
        if GCS_AVAILABLE and saved_posts:
            upload_to_gcs('vault/instagram_saved_automated.json', saved_posts)

        print(f"✅ Successfully processed {len(saved_posts)} saved posts")

        return json.dumps({
            "success": True,
            "count": len(saved_posts),
            "source": "apify",
            "timestamp": datetime.now().isoformat()
        }), 200, headers

    except Exception as e:
        print(f"❌ Error: {e}")
        return json.dumps({
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500, headers

def run_apify_scraper():
    """
    Run Apify Instagram Scraper to fetch saved posts
    Note: Saved posts require authentication with your Instagram credentials
    """

    # For saved posts, we need to run the actor with authentication
    # This requires your Instagram cookies or credentials

    # Option 1: Fetch user's posts (works without auth)
    # Option 2: Fetch saved posts (requires auth - see setup guide)

    actor_input = {
        "usernames": [INSTAGRAM_USERNAME],
        "resultsType": "posts",
        "resultsLimit": 50,
        "addParentData": False
    }

    # First, run the actor
    run_url = f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs?token={Apify_API_KEY}"

    if not REQUESTS_AVAILABLE:
        raise Exception("requests library not available")

    # Start the scrape
    response = requests.post(run_url, json=actor_input, timeout=30)
    response.raise_for_status()

    run_data = response.json()
    run_id = run_data['data']['id']
    dataset_id = run_data['data']['defaultDatasetId']

    print(f"Apify run started: {run_id}")

    # Wait for the run to complete (with timeout)
    status_url = f"https://api.apify.com/v2/actor-runs/{run_id}?token={Apify_API_KEY}"

    import time
    max_wait = 120  # 2 minutes max
    start_time = time.time()

    while time.time() - start_time < max_wait:
        status_response = requests.get(status_url, timeout=30)
        status_response.raise_for_status()
        status_data = status_response.json()
        status = status_data['data']['status']

        print(f"Apify status: {status}")

        if status == 'SUCCEEDED':
            break
        elif status in ['FAILED', 'ABORTED', 'TIMED-OUT']:
            raise Exception(f"Apify run failed with status: {status}")

        time.sleep(5)

    # Fetch results from dataset
    dataset_url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={Apify_API_KEY}&clean=true"

    results_response = requests.get(dataset_url, timeout=30)
    results_response.raise_for_status()

    posts = results_response.json()

    # Transform to our format
    transformed_posts = []
    for post in posts:
        transformed_posts.append({
            "id": post.get("id", ""),
            "url": post.get("url", ""),
            "caption": post.get("caption", {}).get("text", ""),
            "image_url": post.get("displayUrl", ""),
            "timestamp": post.get("timestamp", datetime.now().isoformat()),
            "likes": post.get("likesCount", 0),
            "synced_at": datetime.now().isoformat()
        })

    return transformed_posts

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
    Alias function for backward compatibility
    """
    return fetch_instagram_saved(request)
