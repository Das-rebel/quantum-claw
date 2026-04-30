/**
 * Sarvam TTS Client - Generate native Hindi/Bengali audio
 *
 * Uses Sarvam AI's text-to-speech API to generate high-quality
 * native pronunciation audio for Hindi and Bengali languages.
 *
 * Returns base64-encoded WAV audio that can be hosted and streamed to Alexa.
 */

const https = require('https');

class SarvamTTSClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'api.sarvam.ai';
  }

  /**
     * Generate speech audio from text
     * @param {string} text - Text to convert to speech
     * @param {string} language - Language code ('hi' or 'bn')
     * @param {string} gender - Speaker gender ('Male' or 'Female', default: 'Female')
     * @returns {Promise<Buffer>} Audio buffer (WAV format)
     */
  async synthesize(text, language = 'hi', gender = 'Female') {
    const langMap = {
      'hi': 'hi-IN',
      'bn': 'bn-IN'
    };

    const languageCode = langMap[language] || 'hi-IN';

    console.log(`🎙️  Sarvam TTS: Generating ${language} audio for "${text.substring(0, 50)}..."`);

    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        text: text,
        language_code: languageCode,
        speaker_gender: gender
      });

      const options = {
        hostname: this.baseURL,
        path: '/text-to-speech',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.apiKey
        },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);

            if (response.audios && response.audios[0]) {
              const base64Audio = response.audios[0];
              const audioBuffer = Buffer.from(base64Audio, 'base64');

              console.log(`✅ TTS: Generated ${audioBuffer.length} bytes of audio`);
              resolve(audioBuffer);
            } else {
              reject(new Error('No audio in response'));
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('TTS request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
     * Synthesize and save audio to file
     * @param {string} text - Text to convert
     * @param {string} outputPath - Where to save the audio file
     * @param {string} language - Language code ('hi' or 'bn')
     * @returns {Promise<string>} Path to saved audio file
     */
  async synthesizeToFile(text, outputPath, language = 'hi') {
    const audioBuffer = await this.synthesize(text, language);

    // Ensure directory exists
    const dir = require('path').dirname(outputPath);
    require('fs').mkdirSync(dir, { recursive: true });

    // Write audio file
    require('fs').writeFileSync(outputPath, audioBuffer);

    console.log(`💾 TTS: Saved audio to ${outputPath}`);
    return outputPath;
  }
}

module.exports = SarvamTTSClient;
