# 🍪 OmniClaw Cookie Refresh System - Complete Guide

## 🎯 Overview

The Cookie Refresh System solves the problem of expired Instagram and Twitter cookies that block VM scrapers. It provides a simple browser-based interface to refresh cookies from your authenticated browser sessions.

`★ Insight ─────────────────────────────────────`
- **Browser cookies vs. VM scrapers**: Social media platforms trust browser cookies more than server-side requests, making browser-based cookie extraction the most reliable method
- **GCS as middleware**: Using Google Cloud Storage as a cookie cache allows the browser extension to upload once while multiple VM scrapers can read the same cookies
- **Security layer**: API key authentication on the Cloud Function ensures only authorized users can upload cookies
`─────────────────────────────────────────────────`

## 🏗️ System Architecture

```
┌─────────────────┐
│  Your Browser   │
│ (Logged in to   │
│  IG + Twitter)  │
└────────┬────────┘
         │ 1. Click "Refresh Cookies"
         ▼
┌─────────────────────────────────────┐
│  Cookie Extractor (browser ext)     │
│  - Extracts cookies from browser    │
│  - Sends to Cloud Function          │
└────────┬────────────────────────────┘
         │ 2. POST /cookies
         ▼
┌─────────────────────────────────────┐
│  Cloud Function (cookieRefresh)     │
│  - Validates API key                │
│  - Stores in GCS                    │
└────────┬────────────────────────────┘
         │ 3. JSON file
         ▼
┌─────────────────────────────────────┐
│  GCS Bucket: vault/cookies/         │
│  - instagram_cookies.json           │
│  - twitter_cookies.json             │
└────────┬────────────────────────────┘
         │ 4. Reads every 6 hours
         ▼
┌─────────────────────────────────────┐
│  VM Scrapers (GCP VM)               │
│  - instagram_scraper_gcs.py         │
│  - twitter_scraper_gcs.py           │
│  - Fetch fresh bookmarks            │
└─────────────────────────────────────┘
```

## 📋 Prerequisites

### Google Cloud Setup
- ✅ GCP Project: `omniclaw-personal-assistant`
- ✅ GCS Bucket: `omniclaw-knowledge-graph`
- ✅ Service Account: `338789220059-compute@developer.gserviceaccount.com`
- ✅ VM: `omniclaw-whatsapp` in zone `asia-south1-b`

### Local Requirements
- ✅ Chrome/Edge browser
- ✅ Instagram and Twitter accounts (logged in)
- ✅ gcloud CLI installed and configured

## 🚀 Deployment Steps

### Step 1: Deploy Cloud Function

⚠️ **Note**: There's a known issue with gcloud functions deploy. If deployment fails, use the manual workaround below.

**Option A: Automated Deployment** (may fail due to gcloud bug)
```bash
cd infrastructure/cloud-functions/cookie-refresh
npm install
gcloud functions deploy cookieRefresh \
  --runtime nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-south1 \
  --set-env-vars COOKIE_REFRESH_API_KEY=omniclaw-cookie-refresh-2024 \
  --project omniclaw-personal-assistant \
  --entry-point=cookieRefreshHandler
```

**Option B: Manual Deployment** (if automated fails)
1. Go to [GCP Cloud Functions Console](https://console.cloud.google.com/functions/list)
2. Click "Create Function"
3. Configure:
   - **Name**: `cookieRefresh`
   - **Region**: `asia-south1`
   - **Trigger**: HTTP
   - **Runtime**: Node.js 20
   - **Allow unauthenticated**: ✅ Checked
   - **Entry point**: `cookieRefreshHandler`
   - **Environment variables**:
     - `COOKIE_REFRESH_API_KEY` = `omniclaw-cookie-refresh-2024`
4. Copy contents of `index.js` to the inline editor
5. Copy contents of `package.json` dependencies
6. Click "Deploy"

### Step 2: Deploy Updated VM Scrapers

```bash
# Copy new scrapers to VM
gcloud compute scp --zone=asia-south1-b \
  infrastructure/cloud-functions/bookmark-vault-scheduler/instagram_scraper_gcs.py \
  ubuntu@omniclaw-whatsapp:~/vault_scraper/

gcloud compute scp --zone=asia-south1-b \
  infrastructure/cloud-functions/bookmark-vault-scheduler/twitter_scraper_gcs.py \
  ubuntu@omniclaw-whatsapp:~/vault_scraper/

# Copy updated sync script
gcloud compute scp --zone=asia-south1-b \
  infrastructure/cloud-functions/bookmark-vault-scheduler/vm_sync_gcs.sh \
  ubuntu@omniclaw-whatsapp:~/vault_scraper/vm_sync.sh

# Install Google Cloud Storage library on VM
gcloud compute ssh --tunnel-through-iap ubuntu@omniclaw-whatsapp --zone=asia-south1-b \
  "pip3 install --break-system-packages google-cloud-storage"

# Test the new sync script
gcloud compute ssh --tunnel-through-iap ubuntu@omniclaw-whatsapp --zone=asia-south1-b \
  "cd ~/vault_scraper && bash vm_sync.sh"
```

### Step 3: Load Cookie Extractor in Browser

**Option A: As Browser Extension** (Recommended)
```bash
# Create extension directory
mkdir -p ~/chrome-extensions/omniclaw-cookie-refresh
cp infrastructure/cloud-functions/cookie-refresh/cookie-extractor.html \
   ~/chrome-extensions/omniclaw-cookie-refresh/

# Create manifest.json
cat > ~/chrome-extensions/omniclaw-cookie-refresh/manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "OmniClaw Cookie Refresh",
  "version": "1.0",
  "description": "Refresh Instagram and Twitter cookies for OmniClaw",
  "permissions": ["cookies", "activeTab", "scripting"],
  "host_permissions": ["https://*.instagram.com/*", "https://*.twitter.com/*", "https://*.x.com/*"],
  "action": {
    "default_popup": "cookie-extractor.html",
    "default_icon": {
      "16": "icon16.png",
      "48": "icon48.png",
      "128": "icon128.png"
    }
  }
}
EOF

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select ~/chrome-extensions/omniclaw-cookie-refresh
```

**Option B: As Standalone Page**
```bash
# Open cookie-extractor.html directly in your browser
open infrastructure/cloud-functions/cookie-refresh/cookie-extractor.html
```

## 📖 Usage Instructions

### First-Time Setup

1. **Open Social Media Sites**
   - Open Instagram in a new tab and log in to your account
   - Open Twitter in a new tab and log in to your account
   - Keep these tabs open in the background

2. **Extract Cookies**
   - Click the OmniClaw extension icon (or open the standalone page)
   - Click "Extract Cookies" for Instagram
   - Click "Extract Cookies" for Twitter
   - You should see green checkmarks

3. **Upload to Cloud**
   - Click "Upload to Cloud" for Instagram
   - Click "Upload to Cloud" for Twitter
   - Wait for success messages

4. **Verify Upload**
   ```bash
   # Check GCS for cookie files
   gsutil ls gs://omniclaw-knowledge-graph/vault/cookies/

   # View cookie contents
   gsutil cat gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json
   gsutil cat gs://omniclaw-knowledge-graph/vault/cookies/twitter_cookies.json
   ```

### Ongoing Maintenance

**Refresh Cookies Weekly** (or when scrapers fail):
1. Open the cookie extractor extension/page
2. Click "Refresh All Cookies" button
3. Done! VM scrapers will automatically use fresh cookies

**Monitor Cookie Expiry**:
```bash
# Check cookie status via Cloud Function
curl "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/status"
```

## 🧪 Testing

### Test Cloud Function
```bash
# Health check
curl "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/health"

# Expected output:
{
  "service": "omniclaw-cookie-refresh",
  "status": "healthy",
  "timestamp": "2026-04-17T..."
}
```

### Test Cookie Upload
```bash
# Upload test cookies (replace with real cookies)
curl -X POST \
  "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/instagram" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: omniclaw-cookie-refresh-2024" \
  -d '{
    "cookies": {
      "sessionid": "test_session_id",
      "csrftoken": "test_csrf_token"
    },
    "timestamp": "2026-04-17T00:00:00Z"
  }'
```

### Test VM Scrapers
```bash
# Run sync manually
gcloud compute ssh --tunnel-through-iap ubuntu@omniclaw-whatsapp --zone=asia-south1-b \
  "cd ~/vault_scraper && bash vm_sync.sh"

# Check sync logs
gcloud compute ssh --tunnel-through-iap ubuntu@omniclaw-whatsapp --zone=asia-south1-b \
  "tail -50 ~/vault_scraper/sync.log"
```

## 🔐 Security Best Practices

1. **API Key**: The `COOKIE_REFRESH_API_KEY` is set to `omniclaw-cookie-refresh-2024`. Change this in production.
2. **HTTPS Only**: Always use HTTPS when uploading cookies
3. **Cookie Expiry**: Cookies automatically expire after 7 days
4. **IAM Permissions**: Only the VM service account can read cookies from GCS

## 📊 Monitoring

### Check Cookie Status
```bash
# Via Cloud Function
curl "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/status"

# Via GCS
gsutil cat gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json | jq '.expiresAt'
gsutil cat gs://omniclaw-knowledge-graph/vault/cookies/twitter_cookies.json | jq '.expiresAt'
```

### View Sync Logs
```bash
# VM sync logs
gcloud compute ssh --tunnel-through-iap ubuntu@omniclaw-whatsapp --zone=asia-south1-b \
  "tail -f ~/vault_scraper/sync.log"

# Cloud Function logs
gcloud functions logs read cookieRefresh --region asia-south1 --limit 50
```

## 🛠️ Troubleshooting

### Issue: Cloud Function returns 401 Unauthorized
**Solution**: Check API key in request headers
```bash
curl -H "X-API-Key: omniclaw-cookie-refresh-2024" \
  "https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh/health"
```

### Issue: Scrapers still fail with "Login Required"
**Solution**: Cookies might be expired. Check expiry:
```bash
gsutil cat gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json | jq '.expiresAt'
```

### Issue: Cookie extractor can't read cookies
**Solution**: Make sure you're logged into Instagram/Twitter in the browser

### Issue: GCS permission errors
**Solution**: Ensure service account has storage.objectViewer role:
```bash
gcloud projects add-iam-policy-binding omniclaw-personal-assistant \
  --member="serviceAccount:338789220059-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

## 🎉 Benefits

✅ **No more expired cookie errors** - Refresh cookies from your browser in one click
✅ **Secure** - API key authentication, proper IAM permissions
✅ **Automatic** - Scrapers pick up fresh cookies automatically
✅ **No cost** - Uses existing GCP infrastructure
✅ **Reliable** - Works with browser cookies, bypasses Cloudflare
✅ **Easy to use** - One-click cookie refresh from your browser

## 📞 Support

For issues:
1. Check Cloud Function logs: `gcloud functions logs read cookieRefresh`
2. Check VM sync logs: `gcloud compute ssh ubuntu@omniclaw-whatsapp --tail ~/vault_scraper/sync.log`
3. Check GCS cookie files: `gsutil ls gs://omniclaw-knowledge-graph/vault/cookies/`

## 🔄 Update Frequency

- **Cookie refresh**: Manual (user clicks button) - recommended weekly
- **VM sync**: Every 6 hours (automatic via cron)
- **Cookie expiry**: 7 days (auto-enforced)

## 📚 Files Created

```
infrastructure/cloud-functions/cookie-refresh/
├── cookie-extractor.html          # Browser extension/standalone page
├── index.js                       # Cloud Function code
├── package.json                   # Dependencies
├── deploy.sh                      # Deployment script
├── README.md                      # Technical documentation
└── DEPLOYMENT_GUIDE.md            # This file

infrastructure/cloud-functions/bookmark-vault-scheduler/
├── instagram_scraper_gcs.py       # Updated Instagram scraper (GCS-enabled)
├── twitter_scraper_gcs.py         # Updated Twitter scraper (GCS-enabled)
└── vm_sync_gcs.sh                 # Updated sync script
```

## 🚀 Next Steps

1. Deploy the Cloud Function (see Step 1 above)
2. Deploy updated VM scrapers (see Step 2 above)
3. Load cookie extractor in browser (see Step 3 above)
4. Extract and upload cookies for the first time
5. Test VM sync: `gcloud compute ssh ubuntu@omniclaw-whatsapp -- "cd ~/vault_scraper && bash vm_sync.sh"`
6. Set up weekly reminder to refresh cookies

You're done! 🎉
