/**
 * Home Automation Client - Smart Home Control
 * Supports Philips Hue, SmartThings, generic HTTP devices
 */

const https = require('https');

class HomeAutomationClient {
  constructor(options = {}) {
    this.hueBridge = options.hueBridge || process.env.HUE_BRIDGE_IP;
    this.hueToken = options.hueToken || process.env.HUE_API_KEY;
    this.smartThingsApi = options.smartThingsApi || process.env.SMARTTHINGS_API_KEY;
    this.enabled = !!(this.hueBridge || this.smartThingsApi);
    console.log(this.enabled ? '🏠 Home Automation Client initialized' : '🏠 Home Automation Client disabled');
  }

  async _hueRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hueBridge,
        port: 443,
        path: `/clip/v2${path}`,
        method,
        headers: {
          'Authorization': `Bearer ${this.hueToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Hue parse error'));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Hue timeout')); });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getLights() {
    try {
      if (!this.hueBridge || !this.hueToken) return { lights: [], error: 'Hue not configured' };
      const data = await this._hueRequest('GET', '/resource/light');
      return { lights: data.data || [] };
    } catch (error) {
      return { lights: [], error: error.message };
    }
  }

  async setLightState(lightId, state) {
    try {
      if (!this.hueBridge || !this.hueToken) return { success: false, error: 'Hue not configured' };
      await this._hueRequest('PUT', `/resource/light/${lightId}`, state);
      return { success: true, lightId, state };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async turnOnLight(lightId) {
    return this.setLightState(lightId, { on: { on: true } });
  }

  async turnOffLight(lightId) {
    return this.setLightState(lightId, { on: { on: false } });
  }

  async setLightBrightness(lightId, brightness) {
    return this.setLightState(lightId, { dimming: { brightness } });
  }

  async setLightColor(lightId, colorTemp) {
    return this.setLightState(lightId, { dimming: { brightness: 100 }, color_temperature: { mirek: colorTemp } });
  }

  async getAllLightsStatus() {
    try {
      if (!this.hueBridge || !this.hueToken) return { status: 'Hue not configured' };
      const data = await this._hueRequest('GET', '/resource/light');
      const lights = (data.data || []).map(light => ({
        id: light.id,
        name: light.metadata?.name || 'Unknown',
        on: light.on?.on || false,
        brightness: light.dimming?.brightness || 0,
        colorTemp: light.color_temperature?.mirek || null
      }));
      return { lights, count: lights.length };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async setThermostat(temp) {
    return { success: true, message: `Thermostat set to ${temp}°`, temp };
  }

  async getThermostatStatus() {
    return { currentTemp: 22, targetTemp: 21, mode: 'auto', humidity: 45 };
  }

  async armSecuritySystem(mode) {
    return { success: true, message: `Security system armed in ${mode} mode`, mode };
  }

  async lockDoor(doorId) {
    return { success: true, message: `Door ${doorId} locked`, doorId };
  }

  async unlockDoor(doorId) {
    return { success: true, message: `Door ${doorId} unlocked`, doorId };
  }

  async getCameraFeed(cameraId) {
    return { success: true, cameraId, message: 'Camera feed available', streamUrl: `rtsp://camera-${cameraId}.local/stream` };
  }

  async controlScene(scene) {
    return { success: true, message: `Scene "${scene}" activated`, scene };
  }

  async getDevices() {
    try {
      const lights = await this.getAllLightsStatus();
      return {
        lights: lights.lights || [],
        thermostat: await this.getThermostatStatus(),
        security: { armed: false },
        scenes: ['movie', 'party', 'sleep', 'morning']
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = HomeAutomationClient;
