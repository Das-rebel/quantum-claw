const fs = require('fs');
const path = require('path');

class VaultDigestClient {
  constructor(options = {}) {
    this.vaultPath = options.vaultPath || path.join(__dirname, '../learning_base/instagram_scrape.json');
    this.kgPath = options.kgPath || path.join(__dirname, '../learning_base/unified_knowledge_graph.json');
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
  }

  _getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheExpiry) {
      return entry.data;
    }
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  _loadVaultData() {
    const cacheKey = 'vault_posts';
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const raw = fs.readFileSync(this.vaultPath, 'utf8');
      const data = JSON.parse(raw);
      const posts = Array.isArray(data) ? data : (data.posts || []);
      this._setCache(cacheKey, posts);
      return posts;
    } catch (err) {
      return [];
    }
  }

  _loadKnowledgeGraph() {
    const cacheKey = 'knowledge_graph';
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const raw = fs.readFileSync(this.kgPath, 'utf8');
      const data = JSON.parse(raw);
      const nodes = data.nodes || [];
      const relationships = data.relationships || [];
      const kg = { nodes, relationships };
      this._setCache(cacheKey, kg);
      return kg;
    } catch (err) {
      return { nodes: [], relationships: [] };
    }
  }

  _normalizeTopic(topic) {
    return topic.toLowerCase().trim();
  }

  _matchesTopic(post, topic) {
    const normalizedTopic = this._normalizeTopic(topic);
    const tagMatch = (post.vlTags || []).some(tag =>
      this._normalizeTopic(tag).includes(normalizedTopic) ||
      normalizedTopic.includes(this._normalizeTopic(tag))
    );
    const subjectMatch = post.vlSubject &&
      this._normalizeTopic(post.vlSubject).includes(normalizedTopic);
    return tagMatch || subjectMatch;
  }

  generateDailyDigest(topic, options = {}) {
    try {
      const posts = this._loadVaultData();
      const matchedPosts = posts.filter(post => this._matchesTopic(post, topic));
      const limit = options.limit || 10;
      const highlights = matchedPosts.slice(0, limit).map(post => ({
        id: post.id,
        caption: post.caption?.substring(0, 200) || '',
        vlSubject: post.vlSubject,
        vlStyle: post.vlStyle,
        vlMood: post.vlMood,
        tags: post.vlTags?.slice(0, 5) || [],
        permalink: post.permalink
      }));

      const summaries = highlights.map(h => h.caption).join(' ');
      const summary = summaries.length > 300
        ? summaries.substring(0, 297) + '...'
        : summaries;

      return {
        topic,
        postCount: matchedPosts.length,
        highlights,
        summary: summary || `Found ${matchedPosts.length} posts related to ${topic}`,
        source: 'instagram_vault'
      };
    } catch (err) {
      return { topic, postCount: 0, highlights: [], summary: null, source: 'instagram_vault' };
    }
  }

  getTrendingTopics(limit = 5) {
    try {
      const posts = this._loadVaultData();
      const tagCounts = new Map();

      posts.forEach(post => {
        (post.vlTags || []).forEach(tag => {
          const count = tagCounts.get(tag) || 0;
          tagCounts.set(tag, count + 1);
        });
      });

      const sorted = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

      const topics = sorted.map(([tag, count]) => ({
        tag,
        postCount: count,
        percentage: Math.round((count / posts.length) * 100)
      }));

      return {
        topics,
        timeRange: 'all_time',
        totalPosts: posts.length
      };
    } catch (err) {
      return { topics: [], timeRange: 'all_time', totalPosts: 0 };
    }
  }

  getThisDayRetrospective() {
    try {
      const posts = this._loadVaultData();
      const today = new Date();
      const currentDayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

      const historical = [];
      const similar = [];
      const seenDays = new Set();
      const seenCaptions = new Set();

      for (const post of posts) {
        if (!post.postDate) continue;
        const postDate = new Date(post.postDate);
        if (isNaN(postDate.getTime())) continue;

        const dayOfYear = Math.floor((postDate - new Date(postDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const yearsAgo = today.getFullYear() - postDate.getFullYear();

        if (dayOfYear === currentDayOfYear && yearsAgo > 0) {
          if (!seenDays.has(postDate.toDateString())) {
            historical.push({
              id: post.id,
              date: postDate.toISOString().split('T')[0],
              yearsAgo,
              caption: post.caption?.substring(0, 150) || '',
              vlTags: post.vlTags?.slice(0, 3) || []
            });
            seenDays.add(postDate.toDateString());
          }
        }

        if (yearsAgo === 0 && !seenCaptions.has(post.id)) {
          similar.push({
            id: post.id,
            caption: post.caption?.substring(0, 150) || '',
            vlTags: post.vlTags?.slice(0, 3) || []
          });
          seenCaptions.add(post.id);
        }
      }

      historical.sort((a, b) => b.yearsAgo - a.yearsAgo);
      similar.sort((a, b) => new Date(b.id.split('_')[2] || 0) - new Date(a.id.split('_')[2] || 0));

      let fact = 'No historical posts found for this day.';
      if (historical.length > 0) {
        const latest = historical[0];
        fact = `On this day ${latest.yearsAgo} year(s) ago, you saved a post about ${latest.vlTags[0] || 'various topics'}.`;
      }

      return {
        historical: historical.slice(0, 5),
        similar: similar.slice(0, 5),
        fact
      };
    } catch (err) {
      return { historical: [], similar: [], fact: 'Unable to generate retrospective.' };
    }
  }

  getSkillProgress(skillName) {
    try {
      const kg = this._loadKnowledgeGraph();
      const skillNode = kg.nodes.find(n =>
        n.type === 'skill' && n.name.toLowerCase() === skillName.toLowerCase()
      );

      const posts = this._loadVaultData();
      const relatedPosts = posts.filter(post =>
        (post.vlTags || []).some(tag =>
          tag.toLowerCase().includes(skillName.toLowerCase())
        ) ||
        (post.vlSubject && post.vlSubject.toLowerCase().includes(skillName.toLowerCase()))
      ).slice(0, 10).map(post => ({
        id: post.id,
        caption: post.caption?.substring(0, 150) || '',
        vlSubject: post.vlSubject,
        vlStyle: post.vlStyle,
        tags: post.vlTags
      }));

      const masteryIndicators = [];
      if (skillNode) {
        const conf = skillNode.confidence || 0;
        if (conf >= 0.9) masteryIndicators.push('Mastery level achieved');
        else if (conf >= 0.7) masteryIndicators.push('Advanced understanding');
        else if (conf >= 0.5) masteryIndicators.push('Building competence');

        if ((skillNode.mentions || skillNode.saves || 0) > 30) {
          masteryIndicators.push('High engagement with content');
        }
      }

      if (relatedPosts.length > 20) {
        masteryIndicators.push('Extensive practice through vault');
      } else if (relatedPosts.length > 5) {
        masteryIndicators.push('Regular engagement with skill content');
      }

      const advice = masteryIndicators.length > 0
        ? `Based on your vault activity, you demonstrate ${masteryIndicators[0].toLowerCase()}.`
        : 'Continue exploring content related to this skill in your vault.';

      return {
        skill: skillName,
        relatedPosts,
        masteryIndicators,
        advice
      };
    } catch (err) {
      return {
        skill: skillName,
        relatedPosts: [],
        masteryIndicators: [],
        advice: 'Unable to determine skill progress.'
      };
    }
  }
}

module.exports = { VaultDigestClient };