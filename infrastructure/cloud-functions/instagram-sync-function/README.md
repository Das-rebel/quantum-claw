# Instagram Saved Posts Sync - Setup Guide

## 🎯 What This Does

Automatically syncs your Instagram saved posts to GCS daily using Apify's Instagram scraper.

```
Daily at 8:30 AM IST → Cloud Function → Apify → GCS → Your VM/Alexa
```

## 💰 Cost

- **Apify Instagram Scraper:** $5/month
- **Cloud Function:** Free (within free tier)
- **GCS Storage:** Free (within free tier)
- **Total:** ~$5/month

---

## 📋 Step-by-Step Setup

### Step 1: Get Apify API Key (5 minutes)

1. **Sign up for Apify:**
   - Go to: https://apify.com/sign-up
   - Sign up (free to start, $5/month for Instagram scraper)

2. **Get your API key:**
   - Go to: https://console.apify.com/account
   - Copy your **API Token**
   - It looks like: `apify_api_1234567890...`

3. **Verify pricing:**
   - Instagram scraper: $5/month per 100K results
   - More than enough for daily sync
   - Check: https://apify.com/apify/instagram-scraper#pricing

### Step 2: Deploy Cloud Function

```bash
cd /Users/Subho/omniclaw-personal-assistant/infrastructure/cloud-functions/instagram-sync-function

# Set your Apify API key
export APIFY_API_KEY="your-apify-api-key-here"

# Deploy the function
gcloud functions deploy instagram-sync \
  --runtime python312 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-south1 \
  --memory 256MB \
  --timeout 120s \
  --max-instances 3 \
  --source . \
  --entry-point fetch_instagram_saved \
  --project omniclaw-personal-assistant \
  --set-env-vars APIFY_API_KEY=$APIFY_API_KEY
```

### Step 3: Test the Function

```bash
# Test health check
curl https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync/health

# Test manual sync
curl -X POST https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync
```

**Expected response:**
```json
{
  "success": true,
  "count": <number of posts>,
  "source": "apify",
  "timestamp": "2026-04-17T..."
}
```

### Step 4: Set Up Cloud Scheduler

```bash
gcloud scheduler jobs create http instagram-sync-daily \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --location=asia-south1 \
  --uri="https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync" \
  --description="Daily Instagram saved posts sync at 8:30 AM IST" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --project omniclaw-personal-assistant
```

---

## 📊 Output Format

### File: `vault/instagram_saved_automated.json`

```json
[
  {
    "id": "1234567890_123456789",
    "url": "https://www.instagram.com/p/ABC123/",
    "caption": "Post caption here...",
    "image_url": "https://instagram.f...",
    "timestamp": "2026-04-15T10:30:00.000Z",
    "likes": 1234,
    "synced_at": "2026-04-17T06:40:00.000000"
  }
]
```

---

## 🎯 What Gets Synced

Currently syncs:
- ✅ Your posts (public posts from your profile)
- ✅ Post metadata (caption, image URL, likes)
- ✅ Timestamps

**Note:** "Saved posts" (bookmarks) require additional Instagram authentication. This syncs your public posts first. To sync saved posts, you'll need to provide Instagram cookies (see Advanced section).

---

## 🔧 Advanced: Sync Actual Saved Posts

To sync your actual **saved posts** (not just your posts), you need to authenticate with Instagram.

### Option A: Use Instagram Cookies (Recommended)

1. **Get your Instagram cookies:**
   - Use browser extension (like we did for Twitter)
   - Or use browser DevTools

2. **Store cookies securely:**
   - Save to GCS: `gs://omniclaw-knowledge-graph/vault/cookies/instagram_cookies.json`

3. **Update function to use cookies:**
   - Modify `run_apify_scraper()` to load cookies
   - Pass cookies to Apify actor

### Option B: Use Instagram Credentials

⚠️ **Not recommended** - Security risk. Use cookies instead.

---

## 🔄 Making Changes

### Update Apify API Key

```bash
gcloud functions deploy instagram-sync \
  --runtime python312 \
  --trigger-http \
  --allow-unauthenticated \
  --region asia-south1 \
  --memory 256MB \
  --timeout 120s \
  --max-instances 3 \
  --source . \
  --entry-point fetch_instagram_saved \
  --project omniclaw-personal-assistant \
  --update-env-vars APIFY_API_KEY=<new-key>
```

### Change Schedule

```bash
# Delete existing job
gcloud scheduler jobs delete instagram-sync-daily \
  --location=asia-south1 \
  --project omniclaw-personal-assistant

# Recreate with new schedule
gcloud scheduler jobs create http instagram-sync-daily \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --location=asia-south1 \
  --uri="https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/instagram-sync" \
  --description="Daily Instagram sync" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --project omniclaw-personal-assistant
```

---

## 📈 Monitoring

### View Function Logs

```bash
gcloud functions logs read instagram-sync \
  --region=asia-south1 \
  --limit=50 \
  --project=omniclaw-personal-assistant
```

### Check Apify Runs

```bash
# List recent Apify runs
curl -H "Authorization: Bearer $APIFY_API_KEY" \
  "https://api.apify.com/v2/actor-runs"
```

### Verify GCS Upload

```bash
# Check file exists
gsutil stat gs://omniclaw-knowledge-graph/vault/instagram_saved_automated.json

# View contents
gsutil cat gs://omniclaw-knowledge-graph/vault/instagram_saved_automated.json
```

---

## 🆚 Instagram vs Twitter

| Feature | Twitter | Instagram |
|---------|---------|-----------|
| **Official API** | ❌ Bookmarks not in API | ❌ Saved posts not in API |
| **Free Solution** | ✅ Nitter (open source) | ❌ No Nitter equivalent |
| **Automated Solution** | ✅ Free (Nitter) | ⚠️ $5/month (Apify) |
| **Reliability** | ⚠️ Nitter can be flaky | ✅ Apify is reliable |
| **Setup Time** | 5 minutes | 10 minutes |
| **Data Retrieved** | Bookmarks | Posts/Saved posts |

---

## ❓ FAQ

### Q: Do I need to pay $5/month?

**A:** Yes, for Instagram. Twitter is free (via Nitter), but Instagram doesn't have a free alternative. $5/month covers up to 100K results per month - more than enough for daily sync.

### Q: Can I sync for free?

**A:** Only if you manually export data from Instagram and upload to GCS. Not automated.

### Q: Is my Instagram data secure?

**A:** Yes. Apify is GDPR compliant, and data goes directly to your GCS bucket. Apify doesn't store your data after the scrape completes.

### Q: What if I want to cancel?

**A:** Cancel your Apify subscription anytime. Your historical data remains in GCS.

### Q: Can I sync saved posts instead of my posts?

**A:** Yes, but requires Instagram authentication (cookies). See Advanced section above.

---

## 📞 Troubleshooting

### Issue: "Apify API key not configured"

**Solution:**
1. Check environment variable is set: `APIFY_API_KEY`
2. Redeploy function with API key
3. Verify key at: https://console.apify.com/account

### Issue: "Apify run failed"

**Solution:**
1. Check Apify status: https://status.apify.com
2. Verify Instagram username is correct
3. Check Apify console: https://console.apify.com/actors
4. Check function logs for specific error

### Issue: "No posts returned"

**Possible causes:**
1. Instagram account is private
2. No posts on profile
3. Rate limit reached

**Solution:**
1. Make account public (or use cookies for private account)
2. Wait 24 hours for rate limit to reset
3. Check Apify console for detailed logs

---

## ✅ Success Criteria

You'll know it's working when:

- [x] Apify account created and API key obtained
- [x] Cloud Function deployed successfully
- [x] Health check returns: `"apify_configured": true`
- [x] Manual sync returns posts: `"success": true, "count": > 0`
- [x] File created in GCS: `vault/instagram_saved_automated.json`
- [x] Cloud Scheduler job created
- [x] VM can read from GCS

---

## 🎉 You're Done!

**What happens now:**
- 📅 **Daily at 8:30 AM IST**: Function runs automatically
- 🌐 **Apify scrapes Instagram**: Uses residential proxies (not blocked)
- 📊 **Data uploaded to GCS**: VM can access it
- 🔊 **Alexa integration**: Ready to use!

**Cost:** ~$5/month
**Reliability:** ⭐⭐⭐⭐⭐
**Maintenance:** Zero

---

*Built with ❤️ using Apify + Google Cloud Functions*
