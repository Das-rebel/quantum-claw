/**
 * OmniClaw Bookmark Sync - Google Apps Script
 * Fetches Twitter & Instagram bookmarks and uploads to GCS
 * Runs on Google's infrastructure (trusted IPs)
 * Scheduled automation - no local computer needed!
 */

// Configuration
const CONFIG = {
  GCS_BUCKET: 'omniclaw-knowledge-graph',
  GCS_INSTAGRAM_PATH: 'vault/instagram_scrape.json',
  GCS_TWITTER_PATH: 'vault/twitter_bookmarks_automated.json',

  // Twitter API (Free tier)
  TWITTER_API_KEY: 'YOUR_TWITTER_API_KEY', // Get from https://developer.twitter.com/
  TWITTER_USERNAME: 'sdas22',

  // Instagram (via Nitter instance)
  INSTAGRAM_USERNAME: 'Dasrebel',
  NITTER_INSTANCE: 'https://nitter.net', // Fallback public instances

  // Alternative: Use your existing cookie extractor Cloud Function
  COOKIE_FUNCTION_URL: 'https://asia-south1-omniclaw-personal-assistant.cloudfunctions.net/cookieRefresh'
};

/**
 * Main function - fetches all bookmarks and uploads to GCS
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
  } catch (error) {
    console.error('Twitter sync failed:', error);
    results.twitter = { success: false, error: error.toString() };
  }

  // Fetch Instagram bookmarks
  try {
    results.instagram = fetchInstagramBookmarks();
  } catch (error) {
    console.error('Instagram sync failed:', error);
    results.instagram = { success: false, error: error.toString() };
  }

  // Upload to GCS
  uploadToGCS(results);

  return results;
}

/**
 * Fetch Twitter bookmarks using official API (Free tier)
 */
function fetchTwitterBookmarks() {
  console.log('Fetching Twitter bookmarks via API...');

  try {
    // Twitter API v2 bookmarks endpoint
    // Using free tier: https://developer.twitter.com/en/portal/dashboard
    const apiUrl = `https://api.twitter.com/2/users/${CONFIG.TWITTER_USERNAME}/bookmarks`;

    const response = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${CONFIG.TWITTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      const json = JSON.parse(response.getContentText());

      // Extract bookmark data
      const bookmarks = json.data || [];
      const formattedBookmarks = bookmarks.map(tweet => ({
        id: tweet.id,
        tweet_id: tweet.id,
        text: tweet.text,
        url: `https://twitter.com/i/status/${tweet.id}`,
        author: tweet.author_id,
        created_at: tweet.created_at,
        timestamp: new Date().toISOString()
      }));

      console.log(`✅ Fetched ${formattedBookmarks.length} Twitter bookmarks`);

      return {
        success: true,
        count: formattedBookmarks.length,
        bookmarks: formattedBookmarks
      };
    } else {
      throw new Error(`Twitter API returned ${response.getResponseCode()}`);
    }
  } catch (error) {
    console.log('Twitter API failed, trying Nitter fallback...');
    return fetchTwitterViaNitter();
  }
}

/**
 * Fallback: Fetch Twitter bookmarks via Nitter
 */
function fetchTwitterViaNitter() {
  console.log('Fetching Twitter bookmarks via Nitter...');

  try {
    // Nitter instance (no Cloudflare blocking)
    const nitterUrl = `${CONFIG.NITTER_INSTANCE}/${CONFIG.TWITTER_USERNAME}/bookmarks`;

    const response = UrlFetchApp.fetch(nitterUrl, {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OmniClaw/1.0)'
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200) {
      const html = response.getContentText();
      const bookmarks = parseNitterBookmarks(html);

      console.log(`✅ Fetched ${bookmarks.length} Twitter bookmarks via Nitter`);

      return {
        success: true,
        count: bookmarks.length,
        bookmarks: bookmarks,
        source: 'nitter'
      };
    } else {
      throw new Error(`Nitter returned ${response.getResponseCode()}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      source: 'nitter'
    };
  }
}

/**
 * Parse bookmarks from Nitter HTML page
 */
function parseNitterBookmarks(html) {
  const bookmarks = [];

  // Simple parser - extract tweet data from HTML
  // You may need to adjust selectors based on Nitter's HTML structure
  const tweetRegex = /<div class="timeline-item.*?data-id="(\d+)".*?<a href="\/([^"]+)".*?<div class="tweet-content".*?<div class="tweet-text".*?>([^<]+)<\/div>/g;

  let match;
  while ((match = tweetRegex.exec(html)) !== null) {
    bookmarks.push({
      id: match[1],
      url: `https://twitter.com/${match[2]}`,
      text: match[3].trim(),
      timestamp: new Date().toISOString()
    });
  }

  return bookmarks;
}

/**
 * Fetch Instagram saved posts (workaround approach)
 * Instagram doesn't provide an official API for saved posts
 */
function fetchInstagramBookmarks() {
  console.log('Fetching Instagram saved posts...');

  // Option 1: Use a third-party service API
  // Option 2: Use browser automation via external service
  // Option 3: Use your cookie extractor + fetch via Apps Script

  try {
    // Get fresh cookies from your Cloud Function
    const cookieData = getInstagramCookiesFromCloudFunction();

    if (!cookieData || !cookieData.cookies) {
      throw new Error('No cookies available');
    }

    // Use Instagrapi-like approach with Google's trusted IP
    // This is where you'd integrate a service like:
    // - Apify Instagram Actor ($5/month)
    // - Browserbase Studio
    // - Or your own solution

    // For now, return empty with explanation
    return {
      success: false,
      error: 'Instagram requires third-party service (Apify: $5/month)',
      recommendation: 'Use Apify Instagram Actor or export manually'
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Get Instagram cookies from your deployed Cloud Function
 */
function getInstagramCookiesFromCloudFunction() {
  try {
    const response = UrlFetchApp.fetch(
      `${CONFIG.COOKIE_FUNCTION_URL}/status`,
      {
        method: 'get',
        headers: {
          'X-API-Key': 'omniclaw-cookie-refresh-2024'
        },
        muteHttpExceptions: true
      }
    );

    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch cookies:', error);
    return null;
  }
}

/**
 * Upload results to Google Cloud Storage
 */
function uploadToGCS(results) {
  console.log('Uploading to GCS...');

  // Upload Twitter bookmarks
  if (results.twitter && results.twitter.bookmarks) {
    uploadBlobToGCS(
      CONFIG.GCS_TWITTER_PATH,
      JSON.stringify(results.twitter.bookmarks, null, 2),
      'application/json'
    );
    console.log(`✅ Uploaded ${results.twitter.bookmarks.length} Twitter bookmarks`);
  }

  // Upload Instagram bookmarks
  if (results.instagram && results.instagram.bookmarks) {
    uploadBlobToGCS(
      CONFIG.GCS_INSTAGRAM_PATH,
      JSON.stringify(results.instagram.bookmarks, null, 2),
      'application/json'
    );
    console.log(`✅ Uploaded ${results.instagram.bookmarks.length} Instagram bookmarks`);
  }

  // Upload sync status
  const syncStatus = {
    timestamp: results.timestamp,
    twitter: results.twitter ? {
      success: results.twitter.success,
      count: results.twitter.count || 0
    } : null,
    instagram: results.instagram ? {
      success: results.instagram.success,
      count: results.instagram.count || 0
    } : null
  };

  uploadBlobToGCS(
    'vault/sync-status.json',
    JSON.stringify(syncStatus, null, 2),
    'application/json'
  );
}

/**
 * Upload a blob to Google Cloud Storage
 */
function uploadBlobToGCS(objectPath, data, contentType) {
  // Google Apps Script has built-in access to GCS via Advanced Drive Service
  // For this implementation, we'll use the GCS API directly

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${CONFIG.GCS_BUCKET}/o?uploadType=media&name=${objectPath}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ScriptApp.getOAuthToken()}`,
      'Content-Type': contentType
    },
    payload: data,
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`GCS upload failed: ${response.getContentText()}`);
  }

  // Make file public (so VM can read it)
  const aclUrl = `https://storage.googleapis.com/storage/v1/b/${CONFIG.GCS_BUCKET}/o/${objectPath}/acl/allUsers`;

  UrlFetchApp.fetch(aclUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ScriptApp.getOAuthToken()}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({
      role: 'roles/storage.objectViewer'
    }),
    muteHttpExceptions: true
  });
}

/**
 * Test function - run manually to test the sync
 */
function testSync() {
  console.log('=== Testing Bookmark Sync ===');
  const results = syncAllBookmarks();
  console.log(JSON.stringify(results, null, 2));
  return results;
}

/**
 * Set up time-based trigger (runs daily at 8 AM IST = 3:30 AM UTC)
 */
function setupTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncAllBookmarks') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger for 8:30 AM IST (3:00 AM UTC)
  ScriptApp.newTrigger('syncAllBookmarks')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('UTC')
    .create();

  console.log('✅ Trigger created: Daily at 8:30 AM IST');
}
