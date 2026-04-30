/**
 * Auto Bookmark Sync Client
 *
 * Handles automatic synchronization of bookmarks across platforms:
 * - Instagram saved content
 * - Twitter/X bookmarks
 * - Reddit saved posts
 * - YouTube watch later
 */

class AutoBookmarkSync {
  constructor(options = {}) {
    this.syncInterval = options.syncInterval || 3600000; // 1 hour
    this.enabled = options.enabled !== false;
    this.lastSync = null;
    this.syncStatus = 'idle';
  }

  /**
   * Sync all bookmarks
   *
   * @returns {Promise<Object>} Sync results
   */
  async syncAll() {
    if (!this.enabled) {
      return { success: false, reason: 'Sync disabled' };
    }

    console.log('[AutoBookmarkSync] Starting sync...');
    this.syncStatus = 'syncing';

    const results = {
      instagram: null,
      twitter: null,
      reddit: null,
      youtube: null,
      timestamp: Date.now()
    };

    try {
      // Sync each platform
      results.instagram = await this.syncInstagram();
      results.twitter = await this.syncTwitter();
      results.reddit = await this.syncReddit();
      results.youtube = await this.syncYoutube();

      this.lastSync = Date.now();
      this.syncStatus = 'idle';

      console.log('[AutoBookmarkSync] Sync complete');
      return { success: true, results };

    } catch (error) {
      this.syncStatus = 'error';
      console.error('[AutoBookmarkSync] Sync failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync Instagram bookmarks
   */
  async syncInstagram() {
    try {
      const InstagramScraperClient = require('./instagram_scraper_client');
      const client = new InstagramScraperClient();
      const bookmarks = await client.getSavedContent(50);
      return { count: bookmarks.length, success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync Twitter bookmarks
   */
  async syncTwitter() {
    try {
      const TwitterClient = require('./twitter_client');
      const client = new TwitterClient();
      const bookmarks = await client.getBookmarks ? await client.getBookmarks(50) : [];
      return { count: bookmarks.length, success: true };
    } catch (error) {
      return { success: false, error: error.message, note: 'API access required' };
    }
  }

  /**
   * Sync Reddit saved posts
   */
  async syncReddit() {
    try {
      const RedditClient = require('./reddit_client');
      const client = new RedditClient();
      const saved = await client.getSavedPosts ? await client.getSavedPosts(50) : [];
      return { count: saved.length, success: true };
    } catch (error) {
      return { success: false, error: error.message, note: 'OAuth required' };
    }
  }

  /**
   * Sync YouTube watch later
   */
  async syncYoutube() {
    try {
      const YouTubeClient = require('./youtube_client');
      const client = new YouTubeClient();
      const watchLater = await client.getWatchLater ? await client.getWatchLater(50) : [];
      return { count: watchLater.length, success: true };
    } catch (error) {
      return { success: false, error: error.message, note: 'YouTube API key required' };
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      syncStatus: this.syncStatus,
      lastSync: this.lastSync,
      timeSinceLastSync: this.lastSync ? Date.now() - this.lastSync : null
    };
  }

  /**
   * Enable/disable auto sync
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[AutoBookmarkSync] ${enabled ? 'Enabled' : 'Disabled'}`);
  }
}

module.exports = AutoBookmarkSync;
