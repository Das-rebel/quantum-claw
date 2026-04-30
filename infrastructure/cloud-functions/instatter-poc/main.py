import asyncio
import base64
import json
import os
from datetime import datetime, timezone
from typing import Dict, List

import functions_framework

try:
    from google.cloud import storage

    GCS_AVAILABLE = True
except ImportError:
    storage = None
    GCS_AVAILABLE = False

try:
    from playwright.async_api import async_playwright

    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    async_playwright = None
    PLAYWRIGHT_AVAILABLE = False


BUCKET_NAME = os.environ.get("INSTAGRAM_BUCKET_NAME", "omniclaw-knowledge-graph")
OUTPUT_FILE = os.environ.get(
    "INSTAGRAM_OUTPUT_FILE", "vault/instagram_saved_automated.json"
)
COOKIES_FILE = os.environ.get(
    "INSTAGRAM_COOKIES_GCS_PATH", "vault/cookies/instagram_cookies.json"
)
LOCAL_COOKIES_FILE = os.environ.get("INSTAGRAM_COOKIES_LOCAL_FILE", "")
COOKIES_JSON_ENV = os.environ.get("INSTAGRAM_COOKIES_JSON", "")
COOKIES_BASE64_ENV = os.environ.get("INSTAGRAM_COOKIES_BASE64", "")
MAKE_OUTPUT_PUBLIC = os.environ.get("INSTAGRAM_OUTPUT_PUBLIC", "").lower() in {
    "1",
    "true",
    "yes",
}
MAX_ITEMS = int(os.environ.get("INSTAGRAM_MAX_ITEMS", "200"))
SCROLL_LIMIT = int(os.environ.get("INSTAGRAM_SCROLL_LIMIT", "20"))
SCRAPER_MODE = os.environ.get("INSTAGRAM_SCRAPER_MODE", "playwright")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_response(payload: Dict, status: int = 200):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
    }
    return json.dumps(payload), status, headers


def cors_preflight():
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    return "", 204, headers


@functions_framework.http
def fetch_instagram_saved(request):
    if request.method == "OPTIONS":
        return cors_preflight()

    if request.method == "GET" and request.path in {"/", "/health"}:
        return json_response(
            {
                "service": "instatter-sync",
                "status": "healthy",
                "gcs_available": GCS_AVAILABLE,
                "playwright_available": PLAYWRIGHT_AVAILABLE,
                "scraper_mode": SCRAPER_MODE,
                "cookie_sources": {
                    "env_json": bool(COOKIES_JSON_ENV),
                    "env_base64": bool(COOKIES_BASE64_ENV),
                    "local_file": bool(LOCAL_COOKIES_FILE),
                    "gcs_path": COOKIES_FILE,
                },
                "timestamp": utc_now_iso(),
            }
        )

    if not PLAYWRIGHT_AVAILABLE:
        return json_response(
            {
                "error": "playwright is not installed",
                "solution": "Install playwright and its browser binaries",
                "timestamp": utc_now_iso(),
            },
            500,
        )

    try:
        instatter = Instatter()
        saved_posts = asyncio.run(instatter.fetch_saved_posts(max_items=MAX_ITEMS))
        instatter.upload_to_gcs(saved_posts)
        return json_response(
            {
                "success": True,
                "count": len(saved_posts),
                "output_file": OUTPUT_FILE,
                "timestamp": utc_now_iso(),
            }
        )
    except Exception as exc:
        return json_response(
            {
                "error": str(exc),
                "timestamp": utc_now_iso(),
            },
            500,
        )


class Instatter:
    def __init__(self):
        self.cookie_payload = self._load_cookies()

    def _load_cookies(self) -> Dict:
        if COOKIES_JSON_ENV:
            return self._parse_cookie_payload(COOKIES_JSON_ENV, source="env_json")

        if COOKIES_BASE64_ENV:
            decoded = base64.b64decode(COOKIES_BASE64_ENV).decode("utf-8")
            return self._parse_cookie_payload(decoded, source="env_base64")

        if LOCAL_COOKIES_FILE:
            with open(LOCAL_COOKIES_FILE, "r", encoding="utf-8") as handle:
                return self._parse_cookie_payload(
                    handle.read(), source=f"local_file:{LOCAL_COOKIES_FILE}"
                )

        if not GCS_AVAILABLE:
            raise Exception(
                "No cookie source available. Set INSTAGRAM_COOKIES_JSON, "
                "INSTAGRAM_COOKIES_BASE64, or INSTAGRAM_COOKIES_LOCAL_FILE."
            )

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(COOKIES_FILE)
        return self._parse_cookie_payload(
            blob.download_as_text(), source=f"gcs:{COOKIES_FILE}"
        )

    def _parse_cookie_payload(self, payload: str, source: str) -> Dict:
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise Exception(f"Invalid cookie JSON from {source}: {exc}") from exc

        browser_cookies = self._normalize_browser_cookies(data)
        cookie_map = self._normalize_cookie_map(data)

        if "sessionid" not in cookie_map:
            raise Exception(
                f"Cookie payload from {source} must include sessionid. "
                "Use the full browser-cookie export path."
            )

        return {
            "source": source,
            "timestamp": data.get("timestamp"),
            "cookie_map": cookie_map,
            "browser_cookies": browser_cookies,
        }

    def _normalize_cookie_map(self, data: Dict) -> Dict[str, str]:
        raw = data.get("cookies", {})
        if isinstance(raw, dict):
            return {k: str(v) for k, v in raw.items()}
        if isinstance(raw, list):
            result = {}
            for cookie in raw:
                name = cookie.get("name")
                value = cookie.get("value")
                if name and value is not None:
                    result[str(name)] = str(value)
            return result
        return {}

    def _normalize_browser_cookies(self, data: Dict) -> List[Dict]:
        raw = data.get("browserCookies") or data.get("cookies")
        if isinstance(raw, list):
            return [self._playwright_cookie(cookie) for cookie in raw]

        if isinstance(raw, dict):
            result = []
            for name, value in raw.items():
                result.append(
                    {
                        "name": name,
                        "value": str(value),
                        "domain": ".instagram.com",
                        "path": "/",
                        "httpOnly": False,
                        "secure": True,
                        "sameSite": "None",
                    }
                )
            return result

        return []

    def _playwright_cookie(self, cookie: Dict) -> Dict:
        same_site = str(cookie.get("sameSite", "None")).lower()
        same_site_map = {
            "no_restriction": "None",
            "none": "None",
            "lax": "Lax",
            "strict": "Strict",
            "unspecified": "Lax",
        }
        item = {
            "name": cookie["name"],
            "value": str(cookie["value"]),
            "domain": cookie.get("domain", ".instagram.com"),
            "path": cookie.get("path", "/"),
            "httpOnly": bool(cookie.get("httpOnly", False)),
            "secure": bool(cookie.get("secure", True)),
            "sameSite": same_site_map.get(same_site, "Lax"),
        }
        expires = cookie.get("expires")
        expiration_date = cookie.get("expirationDate")
        if expiration_date is not None:
            item["expires"] = float(expiration_date)
        elif expires not in (None, "", -1):
            item["expires"] = float(expires)
        return item

    async def fetch_saved_posts(self, max_items: int = 200) -> List[Dict]:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context()
            await context.add_cookies(self.cookie_payload["browser_cookies"])

            page = await context.new_page()
            await page.goto(
                "https://www.instagram.com/dasrebel/saved/all-posts/",
                wait_until="domcontentloaded",
                timeout=120000,
            )
            await page.wait_for_timeout(3000)

            if "/accounts/login" in page.url or "/login" in page.url:
                await browser.close()
                raise Exception(
                    "Instagram redirected to login. The GCS cookie jar is incomplete "
                    "or expired. Upload the full browser cookie set, not only sessionid/csrftoken."
                )

            body_text = await page.text_content("body")
            if body_text and "log into instagram" in body_text.lower():
                await browser.close()
                raise Exception(
                    "Instagram rendered the login page. The GCS cookie jar is incomplete "
                    "or expired."
                )

            posts = await self._collect_saved_posts(page, max_items=max_items)
            await browser.close()
            return posts

    async def _collect_saved_posts(self, page, max_items: int) -> List[Dict]:
        previous_count = -1
        stable_rounds = 0

        for _ in range(SCROLL_LIMIT):
            await page.wait_for_timeout(1500)
            current_count = await page.locator(
                "a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']"
            ).count()

            if current_count == previous_count:
                stable_rounds += 1
            else:
                stable_rounds = 0
            previous_count = current_count

            if stable_rounds >= 3 or (max_items and current_count >= max_items):
                break

            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        raw_items = await page.locator(
            "a[href*='/p/'], a[href*='/reel/'], a[href*='/tv/']"
        ).evaluate_all(
            """
            elements => elements.map((el, index) => {
              const href = el.getAttribute('href') || '';
              const img = el.querySelector('img');
              return {
                href,
                image_url: img ? (img.currentSrc || img.src || '') : '',
                alt: img ? (img.alt || '') : '',
                text: (el.textContent || '').trim(),
                index
              };
            })
            """
        )

        seen = set()
        posts = []
        for item in raw_items:
            href = item.get("href", "")
            if not href or href in seen:
                continue
            seen.add(href)
            posts.append(
                {
                    "id": href.strip("/").replace("/", "_"),
                    "url": f"https://www.instagram.com{href}",
                    "image_url": item.get("image_url", ""),
                    "caption": (item.get("alt") or item.get("text") or "")[:500],
                    "source": "instagram_saved_browser",
                    "synced_at": utc_now_iso(),
                }
            )
            if max_items and len(posts) >= max_items:
                break

        if not posts:
            raise Exception(
                "Saved page loaded but no post anchors were found. "
                "Either the cookie jar is still incomplete or Instagram changed the page structure."
            )

        return posts

    def upload_to_gcs(self, posts: List[Dict]) -> None:
        if not GCS_AVAILABLE:
            raise Exception("google-cloud-storage is not installed")

        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(OUTPUT_FILE)
        payload = {
            "synced_at": utc_now_iso(),
            "count": len(posts),
            "posts": posts,
        }
        blob.upload_from_string(
            json.dumps(payload, indent=2),
            content_type="application/json",
        )

        if MAKE_OUTPUT_PUBLIC:
            blob.make_public()


def fetch_instagram_bookmarks(request):
    return fetch_instagram_saved(request)


if __name__ == "__main__":
    instatter = Instatter()
    posts = asyncio.run(instatter.fetch_saved_posts(max_items=MAX_ITEMS))
    print(json.dumps({"count": len(posts), "sample": posts[:3]}, indent=2))
