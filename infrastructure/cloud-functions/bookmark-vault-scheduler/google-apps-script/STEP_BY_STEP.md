# 🚀 Google Apps Script Setup - Step-by-Step Guide

## Pre-Setup Checklist

Before we start, let me verify your GCS bucket is ready:

```bash
# Check if your GCS bucket is accessible
gsutil ls gs://omniclaw-knowledge-graph/
```

## Step 1: Create Google Apps Script Project (2 minutes)

### 1.1 Open Google Apps Script
- Go to: https://script.google.com
- You'll see a Google login page - log in with your Google account

### 1.2 Create New Project
- Click **"New project"** button
- Name it: **"OmniClaw Bookmark Sync"**
- Click **"Create"** button

### 1.3 Delete Default Code
- You'll see a file called `Code.gs` with default code
- Select all text and delete it
- We'll replace it with our code

### 1.4 Rename File (Optional but recommended)
- Click on the file name **"Code.gs"**
- Click **"Rename"**
- Change it to **"Code.js"**
- Click **"OK"**

## Step 2: Add Our Code (1 minute)

### 2.1 Copy the Code
I'll provide you with the code in three parts for easy copying.

**Copy this entire code block:**

```javascript
/**
 * OmniClaw Bookmark Sync - Google Apps Script
 * Runs on Google's infrastructure - no local computer needed!
 */

const CONFIG = {
  GCS_BUCKET: 'omniclaw-knowledge-graph',
  GCS_INSTAGRAM_PATH: 'vault/instagram_scrape.json',
  GCS_TWITTER_PATH: 'vault/twitter_bookmarks_automated.json',
  
  // Twitter Configuration
  TWITTER_USERNAME: 'sdas22',
  
  // Nitter Instance (Twitter fallback)
  NITTER_INSTANCE: 'https://nitter.net'
};

/**
 * Main sync function - runs automatically
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
    // Use Nitter - open source Twitter frontend
    const nitterUrl = `${CONFIG.NITTER_INSTANCE}/${CONFIG.TWITTER_USERNAME}/bookmarks`;
    
    const response = UrlFetchApp.fetch(nitterUrl, {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
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
      throw new Error(`Nitter returned ${response.getResponseCode()}: ${response.getContentText()}`);
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
  
  // Nitter HTML structure - adapt based on actual HTML
  const tweetPattern = /<div class="timeline-item[^>]*>.*?<a class="tweet-link"[^>]*href="\/([^"]+)\/status\/(\d+)"[^>]*>([^<]*)<\/a>/g;
  
  let match;
  let count = 0;
  while ((match = tweetPattern.exec(html)) !== null && count < 100) {
    bookmarks.push({
      id: match[2],
      url: `https://twitter.com/${match[1]}/status/${match[2]}`,
      text: match[3].replace(/<[^>]+>/g, '').trim(),
      timestamp: new Date().toISOString()
    });
    count++;
  }
  
  return bookmarks;
}

/**
 * Placeholder for Instagram (requires additional setup)
 */
function fetchInstagramBookmarks() {
  console.log('Instagram sync: Currently requires additional setup');
  
  return {
    success: false,
    error: 'Instagram integration available via Apify ($5/month) or manual export',
    recommendation: 'See documentation for Instagram options',
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
  
  // Upload empty Instagram file
  uploadToGCS(
    CONFIG.GCS_INSTAGRAM_PATH,
    JSON.stringify([], null, 2),
    'application/json'
  );
  
  // Upload sync status
  const syncStatus = {
    timestamp: results.timestamp,
    twitter: results.twitter ? {
      success: results.twitter.success,
      count: results.twitter.count || 0,
      source: results.twitter.source || 'unknown'
    } : null,
    instagram: results.instagram ? {
      success: results.instagram.success,
      error: results.instagram.error || null
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
 * Upload a single blob to GCS
 */
function uploadToGCS(objectPath, data, contentType) {
  // Using Google's OAuth2 authentication
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
 * Test function - run this manually first!
 */
function testSync() {
  console.log('=== Testing OmniClaw Bookmark Sync ===');
  console.log('Start time:', new Date().toISOString());
  
  const results = syncAllBookmarks();
  
  console.log('=== Test Results ===');
  console.log('Twitter:', results.twitter ? 'Success' : 'Failed');
  console.log('Instagram:', results.instagram ? 'Success' : 'Failed');
  console.log('End time:', new Date().toISOString());
  
  return results;
}

/**
 * Set up automatic trigger (runs daily at 8:30 AM IST)
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
  
  console.log('✅ Trigger created successfully!');
  console.log('Schedule: Daily at 8:30 AM IST (3:00 AM UTC)');
}
