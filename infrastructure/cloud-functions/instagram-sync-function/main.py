# Instagram Saved Posts Sync - FREE (No Apify)
# Serves existing GCS data + attempts free public profile fetch
# The original 30 saved posts were populated by browser extension on Apr 22

import os
import json
import time
from datetime import datetime, timezone
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
GCS_INSTAGRAM_PATH = "vault/instagram_saved_automated.json"
GCS_SYNC_SUMMARY_PATH = "vault/latest_sync_summary.json"
INSTAGRAM_USERNAME = "sdas22"


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }


def _get_gcs_blob(filename):
    """Get a GCS blob object."""
    if not GCS_AVAILABLE:
        return None
    try:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        return bucket.blob(filename)
    except Exception as e:
        print(f"GCS client error: {e}")
        return None


def _read_gcs_json(filename):
    """Read and parse JSON from GCS. Handles double-encoded strings."""
    blob = _get_gcs_blob(filename)
    if blob is None:
        return None
    try:
        if not blob.exists():
            return None
        raw = blob.download_as_text()
        data = json.loads(raw)
        # Handle double-encoded JSON (existing data is stored this way)
        if isinstance(data, str):
            data = json.loads(data)
        return data
    except Exception as e:
        print(f"Error reading {filename} from GCS: {e}")
        return None


def _write_gcs_json(filename, data, make_public=True):
    """Write JSON to GCS."""
    blob = _get_gcs_blob(filename)
    if blob is None:
        print(f"Cannot write to GCS: {filename}")
        return False
    try:
        blob.upload_from_string(
            json.dumps(data, indent=2),
            content_type="application/json",
        )
        if make_public:
            try:
                blob.make_public()
            except Exception:
                pass  # Public access may not be configured
        print(f"Uploaded to GCS: {filename}")
        return True
    except Exception as e:
        print(f"GCS upload failed for {filename}: {e}")
        return False


def _get_existing_data_status():
    """Get status of existing Instagram data in GCS."""
    data = _read_gcs_json(GCS_INSTAGRAM_PATH)
    if data is None:
        return {
            "has_data": False,
            "message": "No existing Instagram data in GCS",
        }

    posts = data.get("posts", []) if isinstance(data, dict) else []
    synced_at = data.get("synced_at", "unknown") if isinstance(data, dict) else "unknown"
    count = data.get("count", len(posts)) if isinstance(data, dict) else len(posts)
    source = posts[0].get("source", "unknown") if posts else "unknown"

    # Check freshness
    age_hours = None
    try:
        if synced_at != "unknown":
            synced_dt = datetime.fromisoformat(synced_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - synced_dt).total_seconds() / 3600
    except Exception:
        pass

    return {
        "has_data": True,
        "count": count,
        "last_synced": synced_at,
        "source": source,
        "age_hours": round(age_hours, 1) if age_hours is not None else None,
        "stale": age_hours is not None and age_hours > 72,
    }


def _try_public_profile_fetch():
    """
    Attempt to fetch recent posts from public Instagram profile.
    This gets the user's own posts (not saved posts), which is still useful.
    Uses the public Instagram page HTML parsing approach.
    """
    if not REQUESTS_AVAILABLE:
        return None, "requests library not available"

    # Try multiple free approaches
    errors = []

    # Approach 1: Instagram public page with __a=1 (may require login now)
    try:
        url = f"https://www.instagram.com/{INSTAGRAM_USERNAME}/?__a=1&__d=dis"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
        }
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            # GraphQL structure
            user_data = data.get("graphql", {}).get("user", {})
            timeline = user_data.get("edge_owner_to_timeline_media", {})
            edges = timeline.get("edges", [])
            if edges:
                posts = []
                for edge in edges[:20]:
                    node = edge.get("node", {})
                    caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
                    caption = caption_edges[0]["node"]["text"] if caption_edges else ""
                    posts.append({
                        "id": f"p_{node.get('shortcode', '')}",
                        "url": f"https://www.instagram.com/p/{node.get('shortcode', '')}/",
                        "image_url": node.get("display_url", ""),
                        "caption": caption,
                        "timestamp": datetime.fromtimestamp(
                            node.get("taken_at_timestamp", 0),
                            tz=timezone.utc,
                        ).isoformat() if node.get("taken_at_timestamp") else "",
                        "likes": node.get("edge_liked_by", {}).get("count", 0),
                        "source": "instagram_public_profile",
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                    })
                return posts, "public_profile"
        errors.append(f"__a=1 returned {resp.status_code}")
    except Exception as e:
        errors.append(f"__a=1 error: {e}")

    # Approach 2: Parse HTML from public profile page
    try:
        url = f"https://www.instagram.com/{INSTAGRAM_USERNAME}/"
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (compatible; Googlebot/2.1; "
                "+http://www.google.com/bot.html)"
            ),
        }
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            html = resp.text
            # Look for shortcode references in the HTML
            import re
            shortcodes = re.findall(r'/p/([A-Za-z0-9_-]+)/', html)
            # Deduplicate
            seen = set()
            unique_codes = []
            for code in shortcodes:
                if code not in seen and len(code) > 5:
                    seen.add(code)
                    unique_codes.append(code)
            if unique_codes:
                posts = []
                for code in unique_codes[:20]:
                    posts.append({
                        "id": f"p_{code}",
                        "url": f"https://www.instagram.com/p/{code}/",
                        "caption": "",
                        "source": "instagram_public_html",
                        "synced_at": datetime.now(timezone.utc).isoformat(),
                    })
                return posts, "public_html"
        errors.append(f"HTML parse returned {resp.status_code}")
    except Exception as e:
        errors.append(f"HTML parse error: {e}")

    return None, "; ".join(errors)


def _merge_with_existing(new_posts, existing_data):
    """Merge new posts with existing data, deduplicating by id."""
    if not existing_data:
        return {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "count": len(new_posts),
            "posts": new_posts,
        }

    existing_posts = existing_data.get("posts", [])
    existing_ids = {p.get("id") for p in existing_posts}

    # Add new posts that don't already exist
    added = 0
    for post in new_posts:
        if post.get("id") not in existing_ids:
            existing_posts.append(post)
            existing_ids.add(post.get("id"))
            added += 1

    # Update sync metadata
    existing_data["synced_at"] = datetime.now(timezone.utc).isoformat()
    existing_data["count"] = len(existing_posts)

    return existing_data


def _write_sync_summary(instagram_result, send_summary=True):
    """Write or merge sync summary to GCS."""
    if not send_summary:
        return

    # Read existing summary (may have twitter data)
    existing = _read_gcs_json(GCS_SYNC_SUMMARY_PATH) or {}

    existing["instagram"] = {
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "success": instagram_result.get("success", False),
        "count": instagram_result.get("count", 0),
        "source": instagram_result.get("source", "none"),
    }
    existing["last_updated"] = datetime.now(timezone.utc).isoformat()

    _write_gcs_json(GCS_SYNC_SUMMARY_PATH, existing)


@functions_framework.http
def fetch_instagram_saved(request):
    """
    HTTP Cloud Function for Instagram sync.
    No Apify. No paid APIs. Uses:
      1. Existing GCS data (populated by browser extension)
      2. Free public profile fetch as augmentation
      3. GCS passthrough for all downstream consumers
    """
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })

    headers = _cors_headers()

    # Health check
    if request.method == "GET":
        status = _get_existing_data_status()
        return json.dumps({
            "service": "instagram-sync",
            "status": "healthy",
            "apify_required": False,
            "cost": "$0/month",
            "existing_data": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }), 200, headers

    # Parse request parameters
    try:
        req_json = request.get_json(silent=True) or {}
    except Exception:
        req_json = {}

    send_summary = req_json.get("send_summary", True)
    force_refresh = req_json.get("force_refresh", False)

    print(f"[{datetime.now(timezone.utc).isoformat()}] Instagram sync triggered "
          f"(force_refresh={force_refresh})")

    # Step 1: Check existing data
    existing_data = _read_gcs_json(GCS_INSTAGRAM_PATH)
    existing_status = _get_existing_data_status()

    result = {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "existing",
        "count": 0,
    }

    # Step 2: Try free public fetch to augment existing data
    new_posts = None
    fetch_source = None
    if REQUESTS_AVAILABLE:
        new_posts, fetch_source = _try_public_profile_fetch()
        if new_posts:
            print(f"Fetched {len(new_posts)} posts via {fetch_source}")
            result["source"] = f"merged_with_{fetch_source}"

    # Step 3: Merge and upload
    if new_posts and existing_data:
        merged = _merge_with_existing(new_posts, existing_data)
        _write_gcs_json(GCS_INSTAGRAM_PATH, merged)
        result["count"] = merged["count"]
        result["new_added"] = merged["count"] - existing_status.get("count", 0)
    elif new_posts and not existing_data:
        payload = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "count": len(new_posts),
            "posts": new_posts,
        }
        _write_gcs_json(GCS_INSTAGRAM_PATH, payload)
        result["count"] = len(new_posts)
        result["source"] = fetch_source
    elif existing_data:
        # No new data fetched, keep existing
        result["count"] = existing_status.get("count", 0)
        result["message"] = (
            f"Using existing data from {existing_status.get('last_synced', 'unknown')}. "
            f"Public profile fetch: {fetch_source or 'skipped'}. "
            f"Note: Instagram saved posts require browser extension or manual export."
        )
    else:
        result["success"] = False
        result["message"] = (
            "No existing data and no free fetch method succeeded. "
            "Populate via browser extension export or manual upload."
        )
        result["public_fetch_error"] = fetch_source

    # Step 4: Write sync summary
    _write_sync_summary(result, send_summary)

    status_code = 200 if result["success"] else 404
    return json.dumps(result), status_code, headers


def fetch_instagram_bookmarks(request):
    """Alias for backward compatibility."""
    return fetch_instagram_saved(request)
