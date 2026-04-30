# 🚀 Google Apps Script Bookmark Sync - Setup Guide

## 🎯 Why Google Apps Script?

```
✅ FREE - No cost at all
✅ Google's IPs - Highly trusted, not blocked
✅ Cloud-based - Your Mac can stay off
✅ Built-in scheduler - Runs automatically daily
✅ GCS integration - Native Google Cloud Storage support
✅ 100% reliable - Runs on Google's infrastructure
```

## 📋 Prerequisites

1. **Google Account** - Free
2. **Twitter API Key** (Free tier available)
3. **GCS Bucket** - Already have `omniclaw-knowledge-graph`

## 🚀 Setup Steps (10 Minutes)

### Step 1: Create Google Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **"New project"**
3. Name it: **"OmniClaw Bookmark Sync"**

### Step 2: Add the Code

1. Create a new script file called **`Code.js`**
2. Copy the contents of `Code.js` from this folder
3. Paste it into the editor
4. Save (⌘+S or Ctrl+S)

### Step 3: Configure GCS Access

1. In Apps Script editor, click **"Services"** (+ icon)
2. Add **"Google Cloud Storage"**
3. Click **"Google Cloud Platform Project"**
4. Select your project: **"omniclaw-personal-assistant"**
5. Click **"Authorize"** and grant permissions

### Step 4: Get Twitter API Key (Free Tier)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new app (free tier)
3. Get your **Bearer Token** (API key)
4. Update `CONFIG.TWITTER_API_KEY` in the code

**No API key needed initially** - the script has Nitter fallback!

### Step 5: Configure Settings

1. In `Code.js`, update the CONFIG section:
```javascript
const CONFIG = {
  TWITTER_USERNAME: 'sdas22',  // Your Twitter username
  // Leave other settings as-is
};
```

### Step 6: Test the Script

1. In Apps Script editor, select **`testSync`** from the function dropdown
2. Click **"Run"**
3. Check the **"Execution log"** for results
4. Verify files uploaded to GCS

### Step 7: Set Up Automatic Trigger

1. Select **`setupTrigger`** from function dropdown
2. Click **"Run"**
3. Grant permissions when prompted
4. Trigger created: **Daily at 8:30 AM IST**

## ✅ Verification

**Check if it worked:**
```bash
# Check GCS for uploaded files
gsutil ls gs://omniclaw-knowledge-graph/vault/

# Check sync status
gsutil cat gs://omniclaw-knowledge-graph/vault/sync-status.json
```

## 📊 How It Works

```
┌─────────────────────────────────────────┐
│  Google Cloud Infrastructure           │
│  (Apps Script runs here)              │
└──────────┬──────────────────────────────┘
           │
           ↓ [Daily at 8:30 AM IST]
┌─────────────────────────────────────────┐
│  Apps Script Execution                 │
│  - Fetches Twitter bookmarks          │
│    via API or Nitter                   │
│  - Attempts Instagram sync              │
│  - Uploads both to GCS                │
└──────────┬──────────────────────────────┘
           │
           ↓ [JSON files]
┌─────────────────────────────────────────┐
│  GCS Bucket                             │
│  - twitter_bookmarks_automated.json    │
│  - instagram_scrape.json               │
│  - sync-status.json                    │
└──────────┬──────────────────────────────┘
           │
           ↓ [Reads from GCS]
┌─────────────────────────────────────────┐
│  Your VM (WhatsApp service)            │
│  - VM reads from GCS                   │
│  - Serves to Alexa                     │
└─────────────────────────────────────────┘
```

## 🔧 Troubleshooting

### Issue: "GCS upload failed"

**Solution:**
1. Make sure you added **"Google Cloud Storage"** service in Apps Script
2. Verify project ID matches: `omniclaw-personal-assistant`
3. Re-authorize the service

### Issue: "Twitter API returned 403"

**Solution:**
- The script automatically falls back to **Nitter** (no API key needed!)
- Nitter is an open-source Twitter frontend that works perfectly

### Issue: "Instagram sync failed"

**Expected behavior:**
- Instagram doesn't have an official API for saved posts
- The script notes this in the error message
- **Recommendation**: Use **Apify** ($5/month) or manual export

### Issue: "Trigger not running"

**Solution:**
1. Check triggers: Click **"Triggers"** (clock icon) in Apps Script
2. Verify trigger is active
3. Check execution log for errors

## 🎯 Architecture Benefits

### Why Google Apps Script is Superior:

| Feature | Google Apps Script | GitHub Actions | VM + Proxy |
|---------|---------------------|-----------------|-------------|
| **Cost** | FREE | FREE | $75-300/month |
| **Setup** | 10 min | 30 min | 1-2 hours |
| **IP Reputation** | Google's IPs | Varies | Datacenter IP |
| **Cloudflare Issues** | ✅ None | ✅ None | ❌ Blocked |
| **Maintenance** | Zero | Low | Medium |
| **Scheduling** | Built-in | Built-in | Cron jobs |
| **Your Computer** | ❌ Not needed | ❌ Not needed | ❌ Not needed |

## 📱 Management

**View Executions:**
- Go to script.google.com
- Click **"Executions"** in left sidebar
- See history of all runs with timestamps

**View/Edit Code:**
- Go to script.google.com
- Click **"Code"** in left sidebar
- Edit code directly in browser

**Manage Triggers:**
- Click **"Triggers"** (clock icon)
- Enable/disable/delete triggers

**View Logs:**
- Click **"Executions"**
- Click on any execution
- See detailed logs and output

## 🔄 Making Changes

**To update the code:**
1. Edit in Apps Script editor
2. Save (⌘+S)
3. Run `testSync` to test
4. No deployment needed!

**To change schedule:**
1. Delete existing triggers
2. Run `setupTrigger` again
3. Or manually: Edit → Triggers → Add trigger

## 💡 Advanced Options

### Add Instagram via Apify ($5/month):

```javascript
function fetchInstagramBookmarks() {
  // Use Apify API (requires API key)
  const apifyClient = Apify.newClient({
    token: 'YOUR_APIFY_TOKEN'
  });

  const actor = apifyClient.actor('apify/instagram-scraper');
  const input = {
    usernames: [CONFIG.INSTAGRAM_USERNAME],
    resultsType: 'posts',
    resultsLimit: 50
  };

  const run = await actor.call(input);
  return {
    success: true,
    bookmarks: run.getDataset().items,
    source: 'apify'
  };
}
```

### Add Error Notifications:

```javascript
function sendErrorNotification(error) {
  MailApp.sendEmail({
    to: 'your-email@gmail.com',
    subject: '❌ OmniClaw Sync Failed',
    body: `Sync failed at ${new Date()}: ${error}`
  });
}
```

## ✅ Success Criteria

You'll know it's working when:

1. ✅ **Test run succeeds**: Click "Run" on `testSync` - no errors
2. ✅ **Files in GCS**: `gsutil ls gs://omniclaw-knowledge-graph/vault/`
3. ✅ **Trigger active**: Click "Triggers" - see daily trigger
4. ✅ **VM can read**: Files are publicly accessible
5. ✅ **Alexa works**: "Alexa, search my vault" returns results

## 🎉 You're Done!

**What happens now:**
- 📅 **Daily at 8:30 AM IST**: Script runs automatically
- 🌐 **On Google's servers**: No local computer needed
- 📊 **Bookmarks synced**: VM reads fresh data from GCS
- 🔊 **Alexa works**: Voice search your vault anytime

**Cost:** **$0/month**  
**Reliability:** ⭐⭐⭐⭐⭐  
**Maintenance:** **Zero**

## 📞 Need Help?

1. Check execution logs in Apps Script
2. Verify GCS permissions
3. Test with `testSync` function
4. Check this guide's troubleshooting section

---

**Built with ❤️ using Google Apps Script**

This solution runs entirely on Google's trusted infrastructure, costs nothing, and requires zero maintenance!
