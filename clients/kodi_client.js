/**
 * Kodi Client - Media Center Control
 * Controls Kodi/XBMC via JSON-RPC API
 */

const http = require('http');

class KodiClient {
  constructor(options = {}) {
    this.host = options.host || process.env.KODI_HOST || 'localhost';
    this.port = options.port || process.env.KODI_PORT || 8080;
    this.username = options.username || process.env.KODI_USERNAME || 'kodi';
    this.password = options.password || process.env.KODI_PASSWORD || '';
    this.enabled = !!(this.host);
    console.log(this.enabled ? '🎬 Kodi Client initialized' : '🎬 Kodi Client disabled (no host)');
  }

  async _rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      });

      const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const options = {
        hostname: this.host,
        port: this.port,
        path: '/jsonrpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Basic ${auth}`
        },
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.error) {
              reject(new Error(result.error.message));
            } else {
              resolve(result.result);
            }
          } catch (e) {
            reject(new Error('Kodi parse error'));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Kodi timeout')); });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async getPlayerStatus() {
    try {
      const player = await this._rpc('Player.GetActivePlayers');
      if (player && player.length > 0) {
        const playerId = player[0].playerid;
        const props = await this._rpc('Player.GetProperties', {
          playerid: playerId,
          properties: ['speed', 'position', 'duration', 'title', 'file']
        });
        return { playing: true, ...props };
      }
      return { playing: false, speed: 0 };
    } catch (error) {
      return { playing: false, error: error.message };
    }
  }

  async playPause() {
    try {
      const players = await this._rpc('Player.GetActivePlayers');
      if (players.length === 0) return { success: false, message: 'No active player' };
      await this._rpc('Player.PlayPause', { playerid: players[0].playerid });
      return { success: true, message: 'Play/Pause toggled' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async stop() {
    try {
      const players = await this._rpc('Player.GetActivePlayers');
      if (players.length === 0) return { success: false, message: 'No active player' };
      await this._rpc('Player.Stop', { playerid: players[0].playerid });
      return { success: true, message: 'Playback stopped' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async setVolume(level) {
    try {
      await this._rpc('Application.SetVolume', { volume: level });
      return { success: true, volume: level };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationUp() {
    try {
      await this._rpc('Input.Up');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationDown() {
    try {
      await this._rpc('Input.Down');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationLeft() {
    try {
      await this._rpc('Input.Left');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationRight() {
    try {
      await this._rpc('Input.Right');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationSelect() {
    try {
      await this._rpc('Input.Select');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async navigationBack() {
    try {
      await this._rpc('Input.Back');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async home() {
    try {
      await this._rpc('Input.Home');
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async showNotifications(title, message) {
    try {
      await this._rpc('GUI.ShowNotification', { title, message });
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async getMovies(limit = 10) {
    try {
      const movies = await this._rpc('VideoLibrary.GetMovies', {
        properties: ['title', 'year', 'rating', 'thumbnail'],
        limits: { end: limit }
      });
      return movies.movies || [];
    } catch (error) {
      return [];
    }
  }

  async getTVShows(limit = 10) {
    try {
      const shows = await this._rpc('VideoLibrary.GetTVShows', {
        properties: ['title', 'year', 'rating'],
        limits: { end: limit }
      });
      return shows.tvshows || [];
    } catch (error) {
      return [];
    }
  }

  async getMusic() {
    try {
      const artists = await this._rpc('AudioLibrary.GetArtists');
      return artists.artists || [];
    } catch (error) {
      return [];
    }
  }
}

module.exports = KodiClient;
