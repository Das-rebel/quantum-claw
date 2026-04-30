"""
Twitter Bookmark Sync — Cloud Function

Strategy:
  1. Load auth cookies from GCS (vault/cookies/twitter_cookies.json)
  2. Hit Twitter's GraphQL Bookmarks endpoint directly using cookies
  3. If that fails, try twscrape library with password fallback
  4. Upload results to GCS
"""

import os
import json
import asyncio
import traceback
import random
import time
from datetime import datetime, timezone

import functions_framework

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

try:
    from twscrape import API, AccountsPool
    TWSCRAPE_AVAILABLE = True
except ImportError:
    TWSCRAPE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BUCKET_NAME = os.getenv("GCS_BUCKET", "omniclaw-knowledge-graph")
COOKIE_PATH = "vault/cookies/twitter_cookies.json"
BOOKMARKS_PATH = "vault/twitter_bookmarks_automated.json"
SUMMARY_PATH = "vault/latest_sync_summary.json"

TWITTER_USERNAME = os.getenv("TWITTER_USERNAME", "")
TWITTER_PASSWORD = os.getenv("TWITTER_PASSWORD", "")
TWITTER_EMAIL = os.getenv("TWITTER_EMAIL", "")

MAX_BOOKMARKS = int(os.getenv("MAX_BOOKMARKS", "800"))
ATTEMPT_TIMEOUT = int(os.getenv("ATTEMPT_TIMEOUT", "45"))

# Twitter GraphQL endpoint for bookmarks
BOOKMARKS_GRAPHQL_URL = "https://api.x.com/graphql/{query_id}/Bookmarks"
# Known query ID (changes periodically; this is the current one)
QUERY_ID = "WUAL-t2Pq4sg3dZp5-6Srw"

# Twitter API headers
TWITTER_HEADERS = {
    "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
}

# Feature flags required by the bookmarks endpoint (as of 2026)
FEATURES = {
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "articles_preview_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg: str):
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[twitter-sync] {ts} {msg}", flush=True)


# ---------------------------------------------------------------------------
# GCS helpers
# ---------------------------------------------------------------------------

def _gcs_client():
    if not GCS_AVAILABLE:
        return None
    return storage.Client()


def gcs_download_json(path: str) -> dict | None:
    try:
        client = _gcs_client()
        if client is None:
            return None
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(path)
        if not blob.exists():
            log(f"GCS blob not found: {path}")
            return None
        return json.loads(blob.download_as_text())
    except Exception as exc:
        log(f"GCS download failed for {path}: {exc}")
        return None


def gcs_upload_json(path: str, data):
    try:
        client = _gcs_client()
        if client is None:
            log("GCS unavailable, skipping upload")
            return False
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(path)
        blob.upload_from_string(
            json.dumps(data, indent=2, ensure_ascii=False),
            content_type="application/json",
        )
        log(f"Uploaded {path} to GCS")
        return True
    except Exception as exc:
        log(f"GCS upload failed for {path}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Cookie loading
# ---------------------------------------------------------------------------

def load_cookies_from_gcs() -> dict | None:
    data = gcs_download_json(COOKIE_PATH)
    if data is None:
        return None
    cookies = data.get("cookies", {})
    if not cookies.get("auth_token") and not cookies.get("ct0"):
        log("Cookie file present but missing auth_token/ct0")
        return None
    ts = data.get("timestamp", "unknown")
    log(f"Loaded cookies from GCS (uploaded: {ts})")
    return cookies


# ---------------------------------------------------------------------------
# Method 1: Direct GraphQL API with cookies (no twscrape dependency)
# ---------------------------------------------------------------------------

def _extract_bookmarks_from_response(data: dict) -> tuple[list[dict], str | None]:
    """
    Parse the GraphQL response JSON and extract bookmark entries.
    Returns (bookmarks_list, cursor_for_next_page).
    """
    bookmarks = []
    cursor = None

    try:
        instructions = (
            data.get("data", {})
            .get("viewer", {})
            .get("bookmarks_timeline", {})
            .get("timeline", {})
            .get("instructions", [])
        )

        for instruction in instructions:
            entries = instruction.get("entries", [])
            for entry in entries:
                entry_id = entry.get("entryId", "")

                # Cursor entry (pagination)
                if "cursor-bottom" in entry_id:
                    content = entry.get("content", {})
                    cursor = (
                        content.get("value", "")
                        or content.get("itemContent", {}).get("value", "")
                    )
                    continue

                # Tweet entry
                if not entry_id.startswith("tweet-"):
                    continue

                tweet_results = (
                    entry.get("content", {})
                    .get("itemContent", {})
                    .get("tweet_results", {})
                    .get("result", {})
                )

                # Sometimes nested under __typename == "TweetWithVisibilityResults"
                if tweet_results.get("__typename") == "TweetWithVisibilityResults":
                    tweet_results = tweet_results.get("tweet", {})

                legacy = tweet_results.get("legacy", {})
                core = tweet_results.get("core", {}).get("user_results", {}).get("result", {})
                user_legacy = core.get("legacy", {})
                tweet_id = tweet_results.get("rest_id") or entry_id.replace("tweet-", "")

                bm = {
                    "id": str(tweet_id),
                    "url": f"https://x.com/{user_legacy.get('screen_name', 'i')}/status/{tweet_id}",
                    "text": legacy.get("full_text", ""),
                    "author": user_legacy.get("screen_name", ""),
                    "author_name": user_legacy.get("name", ""),
                    "created_at": legacy.get("created_at", ""),
                    "like_count": legacy.get("favorite_count", 0),
                    "retweet_count": legacy.get("retweet_count", 0),
                    "reply_count": legacy.get("reply_count", 0),
                    "view_count": (
                        tweet_results.get("views", {}).get("count", 0)
                        or 0
                    ),
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                }

                # Media
                media = legacy.get("extended_entities", {}).get("media", [])
                if media:
                    bm["media"] = [
                        {
                            "type": m.get("type", "photo"),
                            "url": m.get("media_url_https", ""),
                        }
                        for m in media
                    ]

                bookmarks.append(bm)

    except Exception as exc:
        log(f"Error parsing GraphQL response: {exc}")

    return bookmarks, cursor


async def _fetch_graphql_bookmarks(cookies: dict) -> list[dict]:
    """
    Fetch bookmarks using Twitter's GraphQL API directly with cookies.
    Handles pagination to fetch up to MAX_BOOKMARKS entries.
    """
    if not HTTPX_AVAILABLE:
        raise RuntimeError("httpx not installed")

    auth_token = cookies.get("auth_token", "")
    ct0 = cookies.get("ct0", "")

    if not auth_token or not ct0:
        raise ValueError("Missing auth_token or ct0 in cookies")

    all_bookmarks = []
    cursor = None
    page = 0

    # Build cookie jar
    cookie_jar = {
        "auth_token": auth_token,
        "ct0": ct0,
    }

    async with httpx.AsyncClient(
        cookies=cookie_jar,
        headers={
            **TWITTER_HEADERS,
            "x-csrf-token": ct0,
            "content-type": "application/json",
        },
        follow_redirects=True,
        timeout=30,
    ) as client:
        while len(all_bookmarks) < MAX_BOOKMARKS:
            page += 1
            log(f"Fetching bookmarks page {page} (have {len(all_bookmarks)} so far)")

            url = BOOKMARKS_GRAPHQL_URL.format(query_id=QUERY_ID)
            params = {
                "variables": json.dumps({
                    "count": 20,
                    "includePromotedContent": False,
                    **({"cursor": cursor} if cursor else {}),
                }),
                "features": json.dumps(FEATURES),
            }

            resp = await client.get(url, params=params)

            if resp.status_code == 429:
                log("Rate limited (429), waiting 60s")
                await asyncio.sleep(60)
                continue

            if resp.status_code != 200:
                log(f"GraphQL returned HTTP {resp.status_code}")
                # Try to log a snippet of the response
                body = resp.text[:500]
                log(f"Response: {body}")
                if resp.status_code in (401, 403):
                    raise ValueError(f"Auth failed (HTTP {resp.status_code}): cookies may be stale")
                # For other errors, break out
                break

            data = resp.json()
            page_bookmarks, cursor = _extract_bookmarks_from_response(data)

            if not page_bookmarks:
                log(f"Page {page} returned 0 bookmarks, stopping pagination")
                break

            all_bookmarks.extend(page_bookmarks)
            log(f"Page {page}: got {len(page_bookmarks)} bookmarks (total: {len(all_bookmarks)})")

            if not cursor:
                log("No more pages (no cursor)")
                break

            # Small delay between pages to avoid rate limiting
            await asyncio.sleep(random.uniform(1.0, 2.5))

    return all_bookmarks[:MAX_BOOKMARKS]


# ---------------------------------------------------------------------------
# Method 2: twscrape with password login (fallback)
# ---------------------------------------------------------------------------

async def _attempt_twscrape_password() -> tuple[list[dict], str | None]:
    """Fallback: use twscrape with username/password."""
    if not TWSCRAPE_AVAILABLE:
        return [], "twscrape not installed"
    if not TWITTER_USERNAME or not TWITTER_PASSWORD:
        return [], "TWITTER_USERNAME or TWITTER_PASSWORD not set"

    log(f"Attempting twscrape password login for {TWITTER_USERNAME}")
    try:
        pool = AccountsPool()
        await pool.add_account(
            username=TWITTER_USERNAME,
            password=TWITTER_PASSWORD,
            email=TWITTER_EMAIL or f"{TWITTER_USERNAME}@gmail.com",
            email_password=TWITTER_PASSWORD,
        )
        await pool.login_all()
        api = API(pool)

        bookmarks = []
        async for tweet in api.bookmarks(limit=MAX_BOOKMARKS):
            entry = {
                "id": str(tweet.id),
                "url": f"https://x.com/i/status/{tweet.id}",
                "text": tweet.rawText if hasattr(tweet, "rawText") else (tweet.text or ""),
                "author": "",
                "created_at": "",
                "like_count": 0,
                "retweet_count": 0,
                "reply_count": 0,
                "view_count": 0,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            }
            if hasattr(tweet, "user") and tweet.user:
                user = tweet.user
                entry["author"] = getattr(user, "username", "") or getattr(user, "screenName", "")
                entry["url"] = f"https://x.com/{entry['author']}/status/{tweet.id}"
            if hasattr(tweet, "date") and tweet.date:
                entry["created_at"] = tweet.date.isoformat()
            for field in ("like_count", "retweet_count", "reply_count", "view_count"):
                if hasattr(tweet, field):
                    entry[field] = getattr(tweet, field, 0) or 0
            bookmarks.append(entry)

        return bookmarks, None
    except Exception as exc:
        return [], str(exc)


# ---------------------------------------------------------------------------
# Core orchestrator
# ---------------------------------------------------------------------------

async def _fetch_bookmarks() -> dict:
    """
    Primary: GraphQL direct API with GCS cookies.
    Fallback: twscrape password login.
    """
    errors = []

    # --- Attempt 1: Direct GraphQL with GCS cookies ---
    log("--- Attempt 1: Direct GraphQL with GCS cookies ---")
    gcs_cookies = load_cookies_from_gcs()
    if gcs_cookies and HTTPX_AVAILABLE:
        try:
            bookmarks = await asyncio.wait_for(
                _fetch_graphql_bookmarks(gcs_cookies),
                timeout=ATTEMPT_TIMEOUT,
            )
            if bookmarks:
                return {
                    "success": True,
                    "bookmarks": bookmarks,
                    "count": len(bookmarks),
                    "auth_method": "graphql_gcs_cookies",
                }
            log("GraphQL returned 0 bookmarks")
            errors.append("graphql_cookies: returned 0 bookmarks")
        except asyncio.TimeoutError:
            log(f"GraphQL attempt timed out after {ATTEMPT_TIMEOUT}s")
            errors.append(f"graphql_cookies: timed out after {ATTEMPT_TIMEOUT}s")
        except Exception as exc:
            log(f"GraphQL attempt failed: {exc}")
            errors.append(f"graphql_cookies: {exc}")
    elif not gcs_cookies:
        errors.append("graphql_cookies: no cookies in GCS")
    else:
        errors.append("graphql_cookies: httpx not installed")

    # --- Attempt 2: twscrape with password ---
    log("--- Attempt 2: twscrape password fallback ---")
    try:
        bookmarks, err = await asyncio.wait_for(
            _attempt_twscrape_password(),
            timeout=ATTEMPT_TIMEOUT,
        )
        if bookmarks:
            return {
                "success": True,
                "bookmarks": bookmarks,
                "count": len(bookmarks),
                "auth_method": "twscrape_password",
            }
        errors.append(f"twscrape_password: {err or 'returned 0 bookmarks'}")
    except asyncio.TimeoutError:
        errors.append(f"twscrape_password: timed out after {ATTEMPT_TIMEOUT}s")
    except Exception as exc:
        errors.append(f"twscrape_password: {exc}")

    return {
        "success": False,
        "error": "All methods failed: " + " | ".join(errors),
    }


# ---------------------------------------------------------------------------
# Cloud Function entry point
# ---------------------------------------------------------------------------

@functions_framework.http
def fetch_twitter_bookmarks(request):
    """
    HTTP Cloud Function — fetches Twitter bookmarks.

    Methods:
      1. Direct GraphQL API with cookies from GCS
      2. twscrape library with password login (fallback)

    Query / JSON params:
      send_summary (bool) – if true, also writes vault/latest_sync_summary.json
    """
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    if request.method == "OPTIONS":
        return ("", 204, cors)

    resp_headers = {**cors, "Content-Type": "application/json"}

    # Health check
    if request.method == "GET":
        return (
            json.dumps({
                "service": "twitter-sync",
                "engine": "graphql_direct",
                "status": "healthy",
                "twscrape_available": TWSCRAPE_AVAILABLE,
                "gcs_available": GCS_AVAILABLE,
                "httpx_available": HTTPX_AVAILABLE,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
            200,
            resp_headers,
        )

    # Parse params
    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}
    send_summary = payload.get("send_summary", False)

    log("=" * 60)
    log(f"Twitter bookmark sync started (timeout={ATTEMPT_TIMEOUT}s)")
    log(f"send_summary={send_summary}")

    # Run async scraper
    try:
        result = asyncio.run(_fetch_bookmarks())
    except Exception as exc:
        log(f"Unhandled async error: {exc}")
        traceback.print_exc()
        return (
            json.dumps({
                "success": False,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
            500,
            resp_headers,
        )

    # Process result
    bookmarks = result.pop("bookmarks", [])
    success = result.get("success", False)
    count = result.get("count", 0)
    auth_method = result.get("auth_method", "none")
    error = result.get("error")

    # Upload to GCS
    gcs_ok = False
    if success and bookmarks:
        gcs_ok = gcs_upload_json(BOOKMARKS_PATH, bookmarks)
        if not gcs_ok:
            log("WARNING: Bookmarks fetched but GCS upload failed")

    # Optional summary
    if send_summary:
        summary = {
            "twitter": {
                "status": "success" if success else "failed",
                "count": count,
                "auth_method": auth_method,
                "gcs_uploaded": gcs_ok,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **({"error": error} if error else {}),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        gcs_upload_json(SUMMARY_PATH, summary)

    response = {
        "success": success,
        "count": count,
        "auth_method": auth_method,
        "gcs_uploaded": gcs_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        response["error"] = error

    code = 200 if success else (500 if error else 200)
    log(f"Done: success={success}, count={count}, auth={auth_method}")
    return json.dumps(response), code, resp_headers
