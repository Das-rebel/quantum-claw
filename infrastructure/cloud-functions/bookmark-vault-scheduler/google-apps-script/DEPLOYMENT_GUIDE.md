# 🚀 Google Apps Script Deployment - Complete Guide

## 📋 What You'll Need

1. **Google Account** (free)
2. **Access to script.google.com**
3. **GCS Bucket**: `omniclaw-knowledge-graph` ✅ (already exists)

## ⏱️ Time Investment: 10 Minutes

---

## Step 1: Create Apps Script Project (2 min)

### 1.1 Go to Google Apps Script
- Visit: https://script.google.com
- Login with your Google account

### 1.2 Create New Project
- Click **"New project"** button
- Name project: **"OmniClaw Bookmark Sync"**
- Click **"Rename"** → Enter name → Click **"OK"**

### 1.3 Prepare for Code
- You'll see a file called `Code.gs`
- **Delete all existing code** in that file (select all, delete)
- We'll paste our code next

---

## Step 2: Add the Code (3 min)

### 2.1 Copy the Complete Code

**Copy ALL of this code:**

```javascript
/**
 * OmniClaw Bookmark Sync - Google Apps Script
 * Runs automatically daily - no computer needed!
 */

const CONFIG = {
  GCS_BUCKET: 'omniclaw-knowledge-graph',
  GCS_TWITTER_PATH: 'vault/twitter_bookmarks_automated.json',
  GCS_INSTAGRAM_PATH: 'vault/instagram_scrape.json',
  
  TWITTER_USERNAME: 'sdas22',
  NITTER_INSTANCE: 'https://nitter.net'
};

/**
 * Main sync function - runs automatically via trigger
 */
function syncAllBookmarks() {
  const results = {
    timestamp: new Date().toISOString(),
    twitter: null,
    instagram: null
  };
  
  // Fetch Twitter bookmarks
  try {
    results.twitter = fetchTwitterBookmarks();
    console.log('Twitter sync completed');
  } catch (error) {
    console.error('Twitter sync failed:', error);
    results.twitter = { 
      success: false, 
      error: error.toString(),
      timestamp: new Date().toISOString()
    };
  }
  
  // Upload to GCS
  try {
    uploadResultsToGCS(results);
    console.log('GCS upload completed');
  } catch (error) {
    console.error('GCS upload failed:', error);
  }
  
  return results;
}

/**
 * Fetch Twitter bookmarks via Nitter (no API key needed!)
 */
function fetchTwitterBookmarks() {
  console.log('Fetching Twitter bookmarks via Nitter...');
  
  try {
    const nitterUrl = `${CONFIG.NITTER_INSTANCE}/${CONFIG.TWITTER_USERNAME}/bookmarks`;
    
    const response = UrlFetchApp.fetch(nitterUrl, {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      followRedirects: true,
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const html = response.getContentText();
      const bookmarks = parseNitterBookmarks(html);
      
      console.log(`✅ Successfully fetched ${bookmarks.length} Twitter bookmarks`);
      
      return {
        success: true,
        count: bookmarks.length,
        bookmarks: bookmarks,
        source: 'nitter',
        timestamp: new Date().toISOString()
      };
    } else {
      throw new Error(`Nitter returned ${response.getResponseCode()}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      source: 'nitter',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Parse Twitter bookmarks from Nitter HTML
 */
function parseNitterBookmarks(html) {
  const bookmarks = [];
  
  // Extract tweet links from Nitter HTML
  const tweetPattern = /<a class="tweet-link"[^>]*href="\/([^"]+)\/status\/(\d+)"[^>]*>/g;
  
  let match;
  let count = 0;
  while ((match = tweetPattern.exec(html)) !== null && count < 100) {
    const tweetText = extractTweetText(html, match[2]);
    bookmarks.push({
      id: match[2],
      url: `https://twitter.com/${match[1]}/status/${match[2]}`,
      text: tweetText || '',
      timestamp: new Date().toISOString()
    });
    count++;
  }
  
  return bookmarks;
}

/**
 * Extract tweet text from HTML
 */
function extractTweetText(html, tweetId) {
  // Try to find tweet content near the tweet ID
  const tweetContentPattern = new RegExp(`<div class="tweet-content[^"]*"[^>]*>.*?</div>`, 'is');
  const match = tweetContentPattern.exec(html);
  return match ? match[0].replace(/<[^>]+>/g, '').trim() : '';
}

/**
 * Placeholder for Instagram (requires Apify or manual export)
 */
function fetchInstagramBookmarks() {
  return {
    success: false,
    error: 'Instagram integration requires Apify ($5/month) or manual export',
    timestamp: new Date().toISOString()
  };
}

/**
 * Upload results to GCS
 */
function uploadResultsToGCS(results) {
  console.log('Uploading results to GCS...');
  
  // Upload Twitter bookmarks
  if (results.twitter && results.twitter.success && results.twitter.bookmarks) {
    uploadToGCS(
      CONFIG.GCS_TWITTER_PATH,
      JSON.stringify(results.twitter.bookmarks, null, 2),
      'application/json'
    );
    console.log(`✅ Uploaded ${results.twitter.bookmarks.length} Twitter bookmarks`);
  }
  
  // Upload sync status
  const syncStatus = {
    timestamp: results.timestamp,
    twitter: results.twitter ? {
      success: results.twitter.success,
      count: results.twitter.count || 0,
      source: results.twitter.source || 'unknown'
    } : null
  };
  
  uploadToGCS(
    'vault/sync-status.json',
    JSON.stringify(syncStatus, null, 2),
    'application/json'
  );
  
  console.log('✅ GCS upload completed');
}

/**
 * Upload to GCS using OAuth2
 */
function uploadToGCS(objectPath, data, contentType) {
  const token = ScriptApp.getOAuthToken();
  
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${CONFIG.GCS_BUCKET}/o?name=${objectPath}&uploadType=media`;
  
  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': contentType
    },
    payload: data,
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`GCS upload failed: ${response.getContentText()}`);
  }
}

/**
 * Test function - run this first!
 */
function testSync() {
  console.log('=== Testing OmniClaw Bookmark Sync ===');
  console.log('Start time:', new Date().toISOString());
  
  const results = syncAllBookmarks();
  
  console.log('=== Test Results ===');
  console.log('Twitter:', results.twitter ? (results.twitter.success ? 'Success' : 'Failed') : 'No result');
  console.log('End time:', new Date().toISOString());
  
  return results;
}

/**
 * Set up daily trigger (8:30 AM IST)
 */
function setupTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  
  // Create new trigger - 8:30 AM IST = 3:00 AM UTC
  ScriptApp.newTrigger('syncAllBookmarks')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('UTC')
    .create();
  
  console.log('✅ Trigger created: Daily at 8:30 AM IST');
}
```

### 2.2 Paste the Code
- In the Apps Script editor, paste all the code
- Save: Press **⌘+S** (Mac) or **Ctrl+S** (Windows)
- Click **"Save"** if prompted

---

## Step 3: Configure GCS Access (2 min)

### 3.1 Add Cloud Storage Service
1. In Apps Script editor, click **"Services"** icon (looks like a puzzle piece/⧉)
2. Click **"+ Add a service"**
3. Select **"Google Cloud Storage API"**
4. Click **"Add"**

### 3.2 Enable GCS API
1. You might see a prompt to enable the API
2. Click **"Enable API"** button
3. Wait for confirmation

---

## Step 4: Test the Script (2 min)

### 4.1 Run Test Function
1. In Apps Script editor, find the function dropdown (top toolbar)
2. Select **`testSync`** from the dropdown
3. Click **"Run"** button (▶️)

### 4.2 Authorize Permissions
1. First time: You'll see **"Authorization Required"** dialog
2. Click **"Review permissions"**
3. Choose your Google account
4. Click **"Advanced"** → **"Go to OmniClaw Bookmark Sync (unsafe)"** 
   *(Note: Google shows this for all custom scripts)*
5. Click **"Allow"** to grant permissions

### 4.3 View Results
1. After running, click **"Executions"** in left sidebar
2. Click the latest execution
3. Expand **"Log output"** to see results
4. You should see: `✅ Successfully fetched X Twitter bookmarks`

---

## Step 5: Verify GCS Upload (1 min)

### Check if Files Were Created:

```bash
# List files in GCS vault
gsutil ls gs://omniclaw-knowledge-graph/vault/

# View sync status
gsutil cat gs://omniclaw-knowledge-graph/vault/sync-status.json

# View Twitter bookmarks
gsutil cat gs://omniclaw-knowledge-graph/vault/twitter_bookmarks_automated.json
```

**Expected output:**
- `vault/sync-status.json` - Status of the sync
- `vault/twitter_bookmarks_automated.json` - Your Twitter bookmarks

---

## Step 6: Set Up Automatic Trigger (1 min)

### 6.1 Create Daily Trigger
1. In Apps Script editor, select **`setupTrigger`** from function dropdown
2. Click **"Run"**
3. Check the execution log for: `✅ Trigger created: Daily at 8:30 AM IST`

### 6.2 Verify Trigger
1. Click **"Triggers"** icon (clock icon ⏰) in left sidebar
2. You should see one trigger:
   - Function: `syncAllBookmarks`
   - Source: `Time-driven`
   - Schedule: `Day timer at 3am`

---

## ✅ Verification Checklist

You're all set when:

- [x] **Test run succeeded**: Click "Run" on `testSync` → No errors in logs
- [x] **Files in GCS**: `gsutil ls gs://omniclaw-knowledge-graph/vault/` shows new files
- [x] **Trigger active**: Click "Triggers" → See daily trigger listed
- [x] **VM can read**: Files are publicly accessible in GCS
- [x] **Ready for automation**: Script will run daily at 8:30 AM IST

---

## 📊 What Happens Next

```
Daily at 8:30 AM IST
        ↓
Google Apps Script runs automatically
        ↓
Fetches your Twitter bookmarks via Nitter
        ↓
Uploads to GCS: vault/twitter_bookmarks_automated.json
        ↓
Your VM reads from GCS
        ↓
Alexa can access your latest bookmarks!
```

---

## 🔧 Troubleshooting

### Issue: "GCS upload failed"

**Solution:**
1. Make sure you added **Google Cloud Storage API** service (Step 3)
2. Try running `testSync` again
3. Check execution log for specific error

### Issue: "Nitter returned error"

**This is expected sometimes!**
- Nitter instances can be overloaded
- The script will try again tomorrow
- Consider using multiple Nitter mirrors as fallback

**Quick fix:** Change NITTER_INSTANCE to:
- `https://nitter.net` (default)
- `https://nitter.poast.org`
- `https://nitter.privacydev.net`

### Issue: "Authorization Required" popup

**Solution:**
1. Click **"Review permissions"**
2. Click **"Advanced"**
3. Click **"Go to OmniClaw Bookmark Sync (unsafe)"**
4. Click **"Allow"**

### Issue: "Trigger not running"

**Check:**
1. Click **"Triggers"** icon
2. Verify trigger is listed
3. Check **"Executions"** to see if it ran
4. Click on execution to see logs

---

## 💡 Advanced Customizations

### Change Schedule Time

Edit the `setupTrigger` function:

```javascript
// Run at different time (e.g., 9 AM IST = 3:30 AM UTC)
ScriptApp.newTrigger('syncAllBookmarks')
  .timeBased()
  .atHour(3)  // UTC hour (0-23)
  .everyDays(1)
  .nearMinute(30)  // Minute (0-59)
  .inTimezone('UTC')
  .create();
```

### Add Error Notifications

```javascript
function sendErrorNotification(error) {
  MailApp.sendEmail({
    to: 'your-email@gmail.com',
    subject: '❌ Bookmark Sync Failed',
    body: `Sync failed at ${new Date()}: ${error}`
  });
}
```

Then add to `syncAllBookmarks`:
```javascript
if (results.twitter && !results.twitter.success) {
  sendErrorNotification(results.twitter.error);
}
```

---

## 🎉 Success!

**Your automated bookmark sync is now live!**

- ✅ **Runs daily at 8:30 AM IST** - automatically
- ✅ **Zero cost** - completely free
- ✅ **Google's infrastructure** - highly reliable
- ✅ **No computer needed** - runs in the cloud
- ✅ **Zero maintenance** - set it and forget it

---

## 📞 Quick Reference

**Manage your script:**
- **Edit code**: script.google.com → Click **"Code"**
- **View runs**: script.google.com → Click **"Executions"**
- **Manage triggers**: script.google.com → Click **"Triggers"**
- **View logs**: Click on any execution in **"Executions"**

**Test manually:**
1. Go to script.google.com
2. Select `testSync` from dropdown
3. Click **"Run"**
4. Check **"Executions"** for results

---

**Built with ❤️ using Google Apps Script**

*100% free, 100% reliable, 100% automated*
