# Nitter → Instagram: Architectural Analysis & Implementation Plan

## Executive Summary

This document breaks down Nitter's architecture to its core components and proposes a similar approach for Instagram. The goal is to create an "Instatter" equivalent for fetching Instagram saved posts without official API access.

**TL;DR**: Nitter reverse-engineers Twitter's GraphQL API using cookie-based auth. Instagram requires a similar approach but with stricter anti-scraping measures.

---

## Part 1: Nitter Architecture Breakdown

### 1.1 Core Technology Stack

```
Language:    Nim (systems programming language)
Framework:   Jester (Nim web framework)
Database:    Redis/Valkey (caching layer)
Deployment:  Self-hosted Docker
```

### 1.2 Authentication Strategy

#### Cookie-Based Authentication (Session Pool)

**File**: `src/auth.nim`

```nim
type
  Session = ref object
    id*: int64                    # Twitter account ID
    username*: string             # @username
    kind*: SessionKind            # oauth or cookie
    pending*: int                 # Concurrent requests
    limited*: bool                # Rate limit status
    apis*: Table[string, RateLimit]  # API-specific limits
    limitedAt*: int               # Unix timestamp

  SessionKind = enum
    oauth    # OAuth 2.0 bearer token
    cookie   # Session cookies from browser
```

**How it works:**
1. Load multiple Twitter accounts from `sessions.jsonl` (one per line)
2. Each account has session cookies (e.g., `auth_token`, `ct0`)
3. Rotate through accounts to distribute load
4. Track rate limits per API endpoint per account
5. Mark accounts as "limited" when hit rate limit

**Example `sessions.jsonl`:**
```jsonl
{"id": "123456789", "username": "user1", "cookies": {"auth_token": "abc123", "ct0": "xyz789"}}
{"id": "987654321", "username": "user2", "cookies": {"auth_token": "def456", "ct0": "uvw123"}}
```

### 1.3 API Reverse Engineering

#### GraphQL Endpoint Discovery

**File**: `src/consts.nim`

Nitter hardcodes Twitter's GraphQL API endpoints:

```nim
const
  # User profile endpoints
  graphUser* = "oaLodhGbbnzJBACb1kk2Q/UserByScreenName"
  graphUserV2* = "WEoGnYB0EG1yGwamDCF6zg/UserResultByScreenNameQuery"

  # Tweet fetching endpoints
  graphUserTweetsV2* = "6QdSuZ5feXxOadEdXa4XZg/UserWithProfileTweetsQueryV2"
  graphTweet* = "b4pV7sWOe97RncwHcGESUA/ConversationTimeline"

  # Search endpoint
  graphSearchTimeline* = "bshMIjqDk8LTXTq4w91WKw/SearchTimeline"
```

**How these were discovered:**
1. Inspect Twitter's web app network traffic (Chrome DevTools)
2. Look for GraphQL requests to `https://twitter.com/i/api/graphql/`
3. Extract query hashes and variable structures
4. Reverse-engineer request/response format

#### Request Format

**File**: `src/api.nim`

```nim
proc genParams(variables: string; fieldToggles = ""): seq[(string, string)] =
  result.add ("variables", variables)
  result.add ("features", gqlFeatures)  # Hardcoded feature flags
  if fieldToggles.len > 0:
    result.add ("fieldToggles", fieldToggles)

# Example: Fetch user profile
let url = apiUrl(
  graphUser,
  """{"screen_name":"elonmusk","withGrokTranslatedBio":false}"""
)
```

**Request headers:**
```http
GET /i/api/graphql/oaLodhGbbnzJBACb1kk2Q/UserByScreenName?variables={...} HTTP/1.1
Host: twitter.com
Authorization: Bearer AAAAAAAAAAAAAAAAAAAAANRILg...
X-Csrf-Token: <cookie_value>
Cookie: auth_token=abc123; ct0=xyz789
```

### 1.4 HTTP Connection Pooling

**File**: `src/http_pool.nim`

```nim
type
  HttpPool* = ref object
    conns*: seq[AsyncHttpClient]  # Reusable connections

template use*(pool: HttpPool; heads: HttpHeaders; body: untyped):
  # Acquire connection from pool
  var c = pool.acquire(heads)

  try:
    body  # Execute request
  except BadClientError, ProtocolError:
    # Connection failed, create new one
    pool.release(c, true)
    c = pool.acquire(heads)
    body  # Retry
  finally:
    # Return connection to pool
    pool.release(c)
```

**Benefits:**
- Reuse TCP connections (performance)
- Handle connection failures gracefully
- Limit max concurrent connections

### 1.5 Rate Limit Management

**Per-API tracking:**

```nim
type
  RateLimit = ref object
    limit*: int      # Max requests (e.g., 15, 180, 900)
    remaining*: int  # Requests left
    reset*: int      # Unix timestamp when limit resets

# Twitter returns rate limit info in headers:
x-rate-limit-limit: 15
x-rate-limit-remaining: 12
x-rate-limit-reset: 1699123456
```

**Strategy:**
1. Parse rate limit headers from responses
2. Store per-session, per-API limits
3. Avoid using sessions with <10 remaining requests
4. Reset "limited" status after 1 hour

### 1.6 Caching Layer

**File**: `src/redis_cache.nim` (not shown but referenced)

```
Purpose:  Reduce API calls by caching responses
TTL:      5-15 minutes for timelines, 1 hour for user profiles
Backend:  Redis/Valkey (key-value store)
```

**Example cache keys:**
```
twitter:profile:elonmusk        → User object (1 hour TTL)
twitter:timeline:1234567890     → Last 20 tweets (5 min TTL)
twitter:tweet:1699123456789     → Single tweet (1 hour TTL)
```

### 1.7 Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Request                                             │
│    GET /elonmusk                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Check Redis Cache                                        │
│    Key: twitter:profile:elonmusk                            │
└────────────────────┬────────────────────────────────────────┘
                     │
            ┌────────┴────────┐
            │                 │
         Cache Hit         Cache Miss
            │                 │
            ↓                 ↓
      Return Cached    ┌──────────────────────┐
      Response        │ 3. Get Session       │
                      │    - Find available  │
                      │    - Check limits    │
                      └──────────┬───────────┘
                                 │
                                 ↓
                      ┌──────────────────────┐
                      │ 4. Make API Request  │
                      │    GET /i/api/graphql/│
                      │    UserByScreenName  │
                      │    + headers/cookies │
                      └──────────┬───────────┘
                                 │
                                 ↓
                      ┌──────────────────────┐
                      │ 5. Parse Response    │
                      │    JSON → User obj   │
                      └──────────┬───────────┘
                                 │
                                 ↓
                      ┌──────────────────────┐
                      │ 6. Store in Redis    │
                      │    Cache for 1 hour  │
                      └──────────┬───────────┘
                                 │
                                 ↓
                      ┌──────────────────────┐
                      │ 7. Return to User    │
                      │    Render HTML       │
                      └──────────────────────┘
```

---

## Part 2: Instagram vs Twitter Comparison

### 2.1 API Access

| Feature | Twitter | Instagram |
|---------|---------|-----------|
| **Official API** | ✅ Bookmarks NOT in API | ❌ Saved posts NOT in API |
| **GraphQL API** | ✅ Documented (reverse-engineered) | ✅ Exists (undocumented) |
| **Web Scraping** | ✅ Possible (Nitter proves it) | ⚠️ Harder ( stricter anti-bot) |
| **Authentication** | Cookies (auth_token, ct0) | Cookies (sessionid, ds_user_id) |
| **Rate Limits** | Per-endpoint, documented | Unknown, aggressive |

### 2.2 Anti-Scraping Measures

| Platform | Challenges |
|----------|------------|
| **Twitter** | • Rate limiting (15-900 req/15min)<br>• IP bans (rare)<br>• CAPTCHA (rare) |
| **Instagram** | • **Challenge-Required** (common)<br>• **Login verification**<br>• **IP-based blocking**<br>• **Request signing** (HMAC)<br>• **CAPTCHA** (frequent) |
| **Key Difference** | Twitter is lenient with authenticated requests | Instagram is aggressive, blocks suspicious patterns |

### 2.3 Authentication Cookies

#### Twitter Cookies
```http
auth_token=abc123        # Main session token
ct0=xyz789              # CSRF token
twid=%01...             # User ID (base64 encoded)
```

#### Instagram Cookies
```http
sessionid=abc123        # Main session token (most important)
ds_user_id=123456789    # Numeric user ID
csrftoken=xyz789        # CSRF token
mid=legacy_id           # Machine ID (fingerprint)
ig_cb=1                 # Cookie banner state
shbid=xxx; shbts=yyy    # Session "health" tokens
```

**Critical difference:**
- Twitter: `auth_token` alone works
- Instagram: **ALL cookies must be valid** (especially `mid`, `shbid`, `shbts`)

---

## Part 3: Instatter - Proposed Architecture

### 3.1 High-Level Design

```
┌────────────────────────────────────────────────────────────┐
│  Instatter Service (Python + Flask/FastAPI)                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Auth Layer (Cookie Management)                       │ │
│  │  - Multi-account rotation                            │ │
│  │  - Health check endpoint                             │ │
│  │  - Auto-refresh on expiry                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Instagram Private API Client                         │ │
│  │  - GraphQL request builder                           │ │
│  │  - Request signing (HMAC)                            │ │
│  │  - Challenge handling                                │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Response Parser                                      │ │
│  │  - Extract saved posts                               │ │
│  │  - Handle pagination                                 │ │
│  │  - Error recovery                                    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Cache Layer (Redis)                                  │ │
│  │  - Reduce API calls                                  │ │
│  │  - Store results                                     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

```
Language:       Python 3.12 (easier than Nim, more libraries)
Framework:      FastAPI (async support, auto OpenAPI docs)
Database:       Redis (caching), GCS (persistent storage)
Deployment:     Google Cloud Functions (serverless)
```

**Why Python over Nim?**
- More Instagram scraping libraries exist (`instagrapi`, `instagram-private-api`)
- Easier to iterate and debug
- Sufficient performance for our use case (low request volume)

### 3.3 Core Components

#### 3.3.1 Instagram Private API Client

**Key Endpoints to Reverse-Engineer:**

```
1. GET /api/v1/feed/saved/            # Legacy REST (deprecated)
2. POST /api/graphql/                 # Modern GraphQL
   Query hash: <discover_saved_media>
   Variables: {"count": 24, "after": "<cursor>"}
```

**How to find query hash:**
1. Open Instagram in browser (logged in)
2. Go to "Saved" collection
3. Open DevTools → Network tab
4. Filter for "graphql"
5. Look for request with `"saved_posts"` in variables
6. Copy query hash (e.g., `abc123def456...`)

**Example GraphQL Request:**
```python
import requests

headers = {
    "X-IG-App-ID": "936619743392459",  # Constant
    "X-CSRFToken": csrftoken,
    "X-IG-Device-ID": device_id,
    "User-Agent": "Instagram 219.0.0.12.117 Android",
    "Cookie": f"sessionid={sessionid}; ds_user_id={ds_user_id}; ..."
}

graphql_query = {
    "variables": json.dumps({
        "count": 24,
        "include_group_info": True,
        "after": cursor  # For pagination
    }),
    "query_hash": "abc123def456..."  # From reverse engineering
}

response = requests.get(
    "https://www.instagram.com/api/graphql",
    params=graphql_query,
    headers=headers
)
```

#### 3.3.2 Request Signing (Critical)

Instagram signs requests with HMAC-SHA256 to prevent replay attacks:

```python
import hmac
import hashlib
import time

def generate_signature(payload: str, session_id: str) -> str:
    """
    Instagram requires signed requests for certain endpoints.
    This is a simplified version - actual implementation is more complex.
    """
    # Instagram uses a secret key (hardcoded in app)
    secret_key = "INSTAGRAM_APP_SECRET_KEY"  # Reverse engineered

    # Create HMAC-SHA256 signature
    signature = hmac.new(
        secret_key.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    return signature

# Add to headers
headers["X-IG-Signature"] = generate_signature(json_body, session_id)
headers["X-IG-Signed-Body"] = f"{signature}.{json_body}"
```

**Note**: Request signing is complex and changes frequently. Consider using existing libraries.

#### 3.3.3 Challenge Handling

Instagram throws challenges for suspicious activity:

```python
def handle_challenge(response, account):
    """
    Handle Instagram's 'challenge_required' error.
    """
    if response.status_code == 403 and "challenge" in response.json():
        # Get challenge URL
        challenge_url = response.json()["challenge"]["url"]

        # Option 1: Send verification code (if phone number linked)
        # Option 2: Manual browser intervention
        # Option 3: Rotate to next account (preferred)

        return "rotate_account"  # Auto-rotate

    return "proceed"
```

#### 3.3.4 Multi-Account Rotation

```python
class InstagramAccountPool:
    def __init__(self, accounts: list[dict]):
        self.accounts = accounts  # List of {cookies, username, status}
        self.current_index = 0

    def get_account(self) -> dict:
        """Get next healthy account."""
        # Filter out rate-limited accounts
        healthy = [a for a in self.accounts if a["status"] == "healthy"]

        if not healthy:
            raise Exception("All accounts rate-limited")

        # Round-robin selection
        account = healthy[self.current_index % len(healthy)]
        self.current_index += 1

        return account

    def mark_limited(self, account):
        """Mark account as rate-limited."""
        account["status"] = "limited"
        account["limited_at"] = time.time()

    def reset_accounts(self):
        """Reset accounts after cooldown period (1 hour)."""
        now = time.time()
        for account in self.accounts:
            if account["status"] == "limited":
                if now - account["limited_at"] > 3600:  # 1 hour
                    account["status"] = "healthy"
```

### 3.4 Implementation Options

#### Option A: Build from Scratch (Recommended for Learning)

**Pros:**
- Full control
- Learn Instagram's API internals
- No external dependencies

**Cons:**
- High development effort (2-3 weeks)
- Frequent breakage (Instagram changes API)
- Need to reverse-engineer query hashes

**Effort Level**: ⭐⭐⭐⭐⭐ (Very High)

#### Option B: Use Existing Library (Recommended for Speed)

**Libraries:**
1. `instagrapi` - Active, 2.5k stars, pure Python
2. `instagram-private-api` - Older but comprehensive

**Example with instagrapi:**
```python
from instagrapi import Client

client = Client()
client.login(username, password)
client.user_id  # Get user ID
saved_posts = client.saved_medias()  # Fetch saved posts
```

**Pros:**
- Working implementation
- Handles challenges/auth
- Active maintenance

**Cons:**
- Black-box (don't know internals)
- May break without notice
- Dependency on third-party

**Effort Level**: ⭐⭐ (Low)

#### Option C: Hybrid Approach (Recommended Balance)

Use library for auth/request signing, custom logic for:

- GCS integration
- Cloud Function deployment
- Pagination optimization
- Error handling

**Effort Level**: ⭐⭐⭐ (Medium)

### 3.5 Minimal Viable Implementation (MVP)

**File Structure:**
```
instatter/
├── main.py                 # FastAPI app
├── instagram_client.py     # API client (use instagrapi)
├── account_pool.py         # Multi-account rotation
├── parser.py               # Response parsing
├── gcs.py                  # GCS upload
├── requirements.txt
└── README.md
```

**Core Implementation (100 lines):**

```python
from instagrapi import Client
from google.cloud import storage
import json

class Instatter:
    def __init__(self, accounts: list[dict]):
        self.accounts = accounts
        self.current_account = None

    def get_client(self) -> Client:
        """Get authenticated Instagram client."""
        # Rotate accounts
        account = self.accounts.pop(0)
        self.accounts.append(account)

        client = Client()
        client.login(account["username"], account["password"])
        self.current_account = account

        return client

    def fetch_saved_posts(self) -> list[dict]:
        """Fetch all saved posts."""
        client = self.get_client()

        saved_posts = []
        max_items = 1000  # Safety limit

        while len(saved_posts) < max_items:
            batch = client.saved_medias(len(saved_posts))

            if not batch:
                break

            for post in batch:
                saved_posts.append({
                    "id": post.pk,
                    "url": f"https://instagram.com/p/{post.code}/",
                    "image_url": post.url,
                    "caption": post.caption_text,
                    "timestamp": post.taken_at.isoformat(),
                    "likes": post.like_count
                })

        return saved_posts

    def upload_to_gcs(self, posts: list[dict]):
        """Upload to GCS."""
        client = storage.Client()
        bucket = client.bucket("omniclaw-knowledge-graph")
        blob = bucket.blob("vault/instagram_saved_automated.json")

        blob.upload_from_string(
            json.dumps(posts, indent=2),
            content_type="application/json"
        )
        blob.make_public()

# Usage
accounts = [
    {"username": "user1", "password": "pass1"},
    {"username": "user2", "password": "pass2"}
]

instatter = Instatter(accounts)
posts = instatter.fetch_saved_posts()
instatter.upload_to_gcs(posts)

print(f"✅ Synced {len(posts)} saved posts")
```

---

## Part 4: Deployment Architecture

### 4.1 Google Cloud Function (Serverless)

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud Scheduler                                            │
│  Cron: "0 3 * * *" (8:30 AM IST)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ [POST trigger]
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Cloud Function: instatter-sync                             │
│  Runtime: Python 3.12                                       │
│  Timeout: 9 minutes (max)                                   │
│  Memory: 1GB                                                │
│  Environment:                                               │
│    - INSTAGRAM_ACCOUNTS_JSON: <base64_encoded>              │
│    - GCS_BUCKET: omniclaw-knowledge-graph                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ [JSON upload]
                       ↓
┌─────────────────────────────────────────────────────────────┐
│  Google Cloud Storage                                       │
│  gs://omniclaw-knowledge-graph/vault/                       │
│  └── instagram_saved_automated.json                         │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Security Considerations

#### 4.2.1 Storing Instagram Credentials

**Option 1: Secret Manager (Recommended)**
```bash
# Encrypt credentials
echo '{"accounts": [...]}' | \
  gcloud secrets create instagram-accounts --data-file=-

# Use in Cloud Function
from google.cloud import secretmanager
client = secretmanager.SecretManagerServiceClient()
secret = client.access_secret_version(name="...")
accounts = json.loads(secret.payload.data)
```

**Option 2: Base64 Environment Variable**
```bash
# Encode to base64
cat accounts.json | base64 > accounts.b64

# Set as env var
export INSTAGRAM_ACCOUNTS_JSON="$(cat accounts.b64)"

# Decode in Python
import os, base64, json
accounts = json.loads(base64.b64decode(os.environ["INSTAGRAM_ACCOUNTS_JSON"]))
```

**Option 3: GCS Encrypted File**
```bash
# Upload encrypted file
gcloud storage cp accounts.json \
  gs://omniclaw-knowledge-graph/vault/credentials/instagram_accounts.json.enc

# Decrypt in Cloud Function
# Use KMS to decrypt
```

#### 4.2.2 Request Signing Keys

Instagram's request signing requires a secret key. This key:
- Is hardcoded in Instagram's mobile app
- Can be extracted via reverse engineering
- **Should be stored in Secret Manager**

### 4.3 Cost Comparison

| Solution | Monthly Cost | Setup Effort |
|----------|--------------|--------------|
| **Nitter (Twitter)** | $0 (Nitter instances) | ⭐⭐ (Low) |
| **Instatter (Self-built)** | $0 (Cloud Functions free tier) | ⭐⭐⭐⭐ (High) |
| **Apify (Instagram)** | $5/month | ⭐ (Very Low) |
| **Hybrid (Library + GCF)** | $0 | ⭐⭐ (Low) |

---

## Part 5: Recommended Approach

### 5.1 Quick Start (1 Day)

**Use existing library + Cloud Functions:**

1. **Install instagrapi:**
   ```bash
   pip install instagrapi google-cloud-storage
   ```

2. **Create `main.py`:**
   ```python
   from instagrapi import Client
   from google.cloud import storage
   import json, os

   def fetch_instagram_saved(request):
       # Get credentials from Secret Manager
       accounts = get_accounts()

       # Fetch posts
       client = Client()
       client.login(accounts[0]["username"], accounts[0]["password"])
       saved_posts = client.saved_medias()

       # Transform
       transformed = [transform_post(p) for p in saved_posts]

       # Upload to GCS
       upload_to_gcs(transformed)

       return {"count": len(transformed)}, 200
   ```

3. **Deploy:**
   ```bash
   gcloud functions deploy instatter-sync \
     --runtime python312 \
     --trigger-http \
     --region asia-south1 \
     --source .
   ```

### 5.2 Production-Ready (1 Week)

**Enhancements:**
- Multi-account rotation
- Challenge handling
- Redis caching
- Error monitoring
- Auto-retry logic

### 5.3 Enterprise-Grade (2-3 Weeks)

**Full reverse-engineering:**
- Custom request signing
- GraphQL query discovery
- Fingerprint rotation (device IDs, user agents)
- Proxy rotation (residential IPs)
- Comprehensive error handling

---

## Part 6: Actionable Next Steps

### Phase 1: Proof of Concept (Today)

```bash
# 1. Test instagrapi locally
pip install instagrapi

python3 << 'EOF'
from instagrapi import Client

client = Client()
client.login("your_username", "your_password")
posts = client.saved_medias()
print(f"Found {len(posts)} saved posts")
EOF

# 2. If successful, proceed to Cloud Function deployment
# 3. If failed, try instagram-private-api or manual approach
```

### Phase 2: Cloud Function Deployment (Tomorrow)

```bash
# 1. Create Cloud Function structure
mkdir instatter-function
cd instatter-function

# 2. Copy main.py, requirements.txt
# 3. Set up Secret Manager for credentials
# 4. Deploy to GCP
```

### Phase 3: Automation (Day 3)

```bash
# 1. Test Cloud Function endpoint
curl -X POST https://asia-south1-.../instatter-sync

# 2. Create Cloud Scheduler job
gcloud scheduler jobs create http instatter-daily \
  --schedule="0 3 * * *" \
  --uri="https://asia-south1-.../instatter-sync" \
  --http-method=POST

# 3. Verify GCS upload
gsutil cat gs://omniclaw-knowledge-graph/vault/instagram_saved_automated.json
```

---

## Part 7: Risks & Mitigations

### Risk 1: Instagram Blocks Cloud Function IPs

**Probability**: Medium

**Mitigation:**
- Use multiple accounts
- Slow down requests (add delays)
- Respect rate limits
- Consider residential proxies (if critical)

### Risk 2: Credentials Expire/Revoked

**Probability**: High

**Mitigation:**
- Store multiple accounts
- Health check endpoint
- Auto-rotate on failure
- Alert on auth failures

### Risk 3: Instagram Changes API

**Probability**: Medium (happens ~2-3 times/year)

**Mitigation:**
- Use maintained library (instagrapi)
- Monitor for updates
- Have fallback plan (Apify)

### Risk 4: Challenge Required (Manual Intervention)

**Probability**: Low (with proper usage)

**Mitigation:**
- Don't spam requests
- Use realistic user agents
- Rotate accounts
- Implement challenge detection

---

## Conclusion

Nitter proves that reverse-engineering social media APIs is **feasible but fragile**. For Instagram:

✅ **Recommended approach:**
1. Use `instagrapi` library (battle-tested)
2. Deploy on Cloud Functions (serverless, reliable)
3. Multi-account rotation (redundancy)
4. GCS storage (VM can read)

⚠️ **Not recommended:**
- Building from scratch (high maintenance)
- Using residential proxies (expensive, unnecessary)

🎯 **Success criteria:**
- Fetch 50-200 saved posts per day
- Run automatically at 8:30 AM IST
- Cost: $0/month (within free tier)
- Reliability: 90%+ uptime

---

**Status**: Ready to implement
**Estimated effort**: 1-3 days (depending on approach)
**Maintenance**: Low (if using library)

Built with ❤️ based on Nitter's architecture.
