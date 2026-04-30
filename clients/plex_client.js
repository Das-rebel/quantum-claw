const http = require('http');

class PlexClient {
  constructor(options = {}) {
    this.host = options.host || 'localhost';
    this.port = options.port || 32400;
    this.token = options.token || process.env.PLEX_TOKEN;
    this.enabled = !!this.token;
    this.timeoutMs = options.timeoutMs || 6000;
  }

  async getServerStatus() {
    const fallback = {
      success: false,
      available: false,
      enabled: this.enabled,
      server: `${this.host}:${this.port}`,
      friendlyName: null,
      version: null,
      machineIdentifier: null,
      error: null
    };

    try {
      const data = await this._request('/identity');
      const container = this._getContainer(data) || {};

      return {
        ...fallback,
        success: true,
        available: true,
        friendlyName: container.friendlyName || null,
        version: container.version || null,
        machineIdentifier: container.machineIdentifier || null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getLibraries() {
    const fallback = {
      success: false,
      libraries: [],
      error: null
    };

    try {
      const data = await this._request('/library/sections');
      const dirs = this._extractItems(data, ['Directory']);

      return {
        success: true,
        libraries: dirs.map((item) => ({
          key: item.key || null,
          title: item.title || null,
          type: item.type || null,
          uuid: item.uuid || null,
          agent: item.agent || null,
          scanner: item.scanner || null,
          updatedAt: item.updatedAt || null
        })),
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getRecentlyAdded(limit = 10) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Number(limit))) : 10;
    const fallback = {
      success: false,
      items: [],
      error: null
    };

    try {
      const data = await this._request('/library/recentlyAdded', {
        'X-Plex-Container-Start': 0,
        'X-Plex-Container-Size': safeLimit
      });

      return {
        success: true,
        items: this._mapMediaItems(data),
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async searchMedia(query) {
    const fallback = {
      success: false,
      items: [],
      query: query || '',
      error: null
    };

    if (!query || !String(query).trim()) {
      return { ...fallback, error: 'Search query is required.' };
    }

    try {
      const data = await this._request('/search', { query: String(query).trim() });

      return {
        success: true,
        items: this._mapMediaItems(data),
        query: String(query).trim(),
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getMetadata(ratingKey) {
    const fallback = {
      success: false,
      item: null,
      ratingKey: ratingKey || null,
      error: null
    };

    if (!ratingKey) {
      return { ...fallback, error: 'ratingKey is required.' };
    }

    try {
      const data = await this._request(`/library/metadata/${encodeURIComponent(String(ratingKey))}`);
      const item = this._mapMediaItems(data)[0] || null;

      return {
        success: !!item,
        item,
        ratingKey: String(ratingKey),
        error: item ? null : 'Metadata not found.'
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getOnDeck() {
    const fallback = {
      success: false,
      items: [],
      error: null
    };

    try {
      const data = await this._request('/library/onDeck');
      return {
        success: true,
        items: this._mapMediaItems(data),
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getPlaylists() {
    const fallback = {
      success: false,
      playlists: [],
      error: null
    };

    try {
      const data = await this._request('/playlists');
      const playlists = this._extractItems(data, ['Playlist', 'Metadata']).map((item) => ({
        ratingKey: item.ratingKey || null,
        key: item.key || null,
        title: item.title || null,
        playlistType: item.playlistType || item.type || null,
        leafCount: item.leafCount ? Number(item.leafCount) : null,
        duration: item.duration ? Number(item.duration) : null,
        thumb: item.thumb || null
      }));

      return {
        success: true,
        playlists,
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getArtists() {
    const fallback = {
      success: false,
      artists: [],
      error: null
    };

    try {
      const libsResp = await this.getLibraries();
      const musicLibraries = (libsResp.libraries || []).filter((lib) => lib.type === 'artist');

      if (!musicLibraries.length) {
        return {
          success: true,
          artists: [],
          error: null
        };
      }

      const allArtists = [];
      for (const lib of musicLibraries) {
        if (!lib.key) continue;
        const data = await this._request(`/library/sections/${encodeURIComponent(String(lib.key))}/all`, { type: 8 });
        const artists = this._extractItems(data, ['Directory', 'Metadata'])
          .filter((item) => (item.type || '').toLowerCase() === 'artist' || !!item.title)
          .map((item) => ({
            ratingKey: item.ratingKey || null,
            key: item.key || null,
            title: item.title || null,
            summary: item.summary || null,
            thumb: item.thumb || null,
            libraryKey: lib.key
          }));

        allArtists.push(...artists);
      }

      return {
        success: true,
        artists: allArtists,
        error: null
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  async getArtistMetadata(artistKey) {
    const fallback = {
      success: false,
      artist: null,
      artistKey: artistKey || null,
      error: null
    };

    if (!artistKey) {
      return { ...fallback, error: 'artistKey is required.' };
    }

    try {
      const data = await this._request(`/library/metadata/${encodeURIComponent(String(artistKey))}`);
      const item = this._mapMediaItems(data)[0] || null;

      return {
        success: !!item,
        artist: item,
        artistKey: String(artistKey),
        error: item ? null : 'Artist metadata not found.'
      };
    } catch (error) {
      return { ...fallback, error: error.message };
    }
  }

  _request(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
      const mergedParams = { ...params };
      if (this.token) {
        mergedParams['X-Plex-Token'] = this.token;
      }

      const query = new URLSearchParams();
      Object.entries(mergedParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });

      const path = `${endpoint}${query.toString() ? `?${query.toString()}` : ''}`;
      const options = {
        host: this.host,
        port: this.port,
        path,
        method: 'GET',
        headers: {
          Accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8'
        },
        timeout: this.timeoutMs
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            return reject(new Error(`Plex API error (${statusCode}) at ${endpoint}`));
          }

          if (!body.trim()) {
            return resolve({ MediaContainer: {} });
          }

          try {
            const parsedJson = JSON.parse(body);
            return resolve(parsedJson);
          } catch (_jsonError) {
            try {
              const parsedXml = this._parseXml(body);
              return resolve(parsedXml);
            } catch (_xmlError) {
              return reject(new Error(`Unable to parse Plex response at ${endpoint}`));
            }
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Plex request timed out at ${endpoint}`));
      });

      req.on('error', (error) => {
        reject(new Error(`Plex request failed at ${endpoint}: ${error.message}`));
      });

      req.end();
    });
  }

  _getContainer(data) {
    if (!data) return null;
    if (data.MediaContainer && typeof data.MediaContainer === 'object') return data.MediaContainer;
    return null;
  }

  _extractItems(data, tagNames) {
    const container = this._getContainer(data) || {};

    if (Array.isArray(container.Metadata)) {
      return container.Metadata;
    }

    const all = [];
    for (const tag of tagNames) {
      const value = container[tag];
      if (Array.isArray(value)) {
        all.push(...value);
      } else if (value && typeof value === 'object') {
        all.push(value);
      }
    }

    return all;
  }

  _mapMediaItems(data) {
    const items = this._extractItems(data, ['Metadata', 'Video', 'Track', 'Directory', 'Playlist']);

    return items.map((item) => ({
      ratingKey: item.ratingKey || null,
      key: item.key || null,
      type: item.type || null,
      title: item.title || item.grandparentTitle || null,
      year: item.year ? Number(item.year) : null,
      summary: item.summary || null,
      thumb: item.thumb || null,
      art: item.art || null,
      index: item.index ? Number(item.index) : null,
      parentTitle: item.parentTitle || null,
      grandparentTitle: item.grandparentTitle || null,
      originallyAvailableAt: item.originallyAvailableAt || null,
      addedAt: item.addedAt || null,
      duration: item.duration ? Number(item.duration) : null,
      viewCount: item.viewCount ? Number(item.viewCount) : 0
    }));
  }

  _parseXml(xml) {
    const containerMatch = xml.match(/<MediaContainer\b([^>]*)>/i) || xml.match(/<MediaContainer\b([^>]*)\/?>/i);
    const mediaContainerAttrs = containerMatch ? this._parseAttributes(containerMatch[1]) : {};

    const tags = ['Directory', 'Metadata', 'Video', 'Track', 'Playlist'];
    const parsed = { MediaContainer: { ...mediaContainerAttrs } };

    for (const tag of tags) {
      const selfClosing = new RegExp(`<${tag}\\b([^>]*)\\/?>`, 'gi');
      const items = [];
      let match;

      while ((match = selfClosing.exec(xml)) !== null) {
        const attrs = this._parseAttributes(match[1]);
        if (Object.keys(attrs).length) {
          items.push(attrs);
        }
      }

      if (items.length) {
        parsed.MediaContainer[tag] = items;
      }
    }

    return parsed;
  }

  _parseAttributes(attributeString) {
    const attrs = {};
    const regex = /(\w+)="([^"]*)"/g;
    let match;

    while ((match = regex.exec(attributeString)) !== null) {
      attrs[match[1]] = this._decodeXml(match[2]);
    }

    return attrs;
  }

  _decodeXml(value) {
    return String(value)
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
}

module.exports = PlexClient;
