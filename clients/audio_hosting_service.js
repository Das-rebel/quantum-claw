/**
 * Audio Hosting Service
 *
 * Manages temporary storage and HTTPS hosting of TTS audio files.
 * Integrates with ngrok for public HTTPS URLs.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class AudioHostingService {
  constructor(options = {}) {
    this.audioDir = options.audioDir || path.join(__dirname, '../public/audio');
    this.baseUrl = options.baseUrl || process.env.NGROK_URL || 'https://localhost:3000';
    this.maxAge = options.maxAge || 3600000; // 1 hour default
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes

    // Ensure audio directory exists
    this.ensureAudioDir();

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
     * Ensure audio directory exists
     */
  ensureAudioDir() {
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
      console.log(`📁 Created audio directory: ${this.audioDir}`);
    }
  }

  /**
     * Generate unique filename for audio
     * @param {string} extension - File extension (mp3, wav)
     * @returns {string} Unique filename
     */
  generateFilename(extension = 'mp3') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}-${random}.${extension}`;
  }

  /**
     * Convert WAV to MP3 with Alexa-compatible settings
     * Alexa requires: MPEG-1 Layer III, 16000 Hz OR 24000 Hz sample rate, 48 kbps bitrate, mono
     * Note: 24000 Hz is used to ensure MPEG-1 Layer III (16000 Hz defaults to MPEG-2 Layer III)
     * @param {string} inputPath - Path to input WAV file
     * @param {string} outputPath - Path to output MP3 file
     * @returns {Promise<boolean>} Success status
     */
  async convertWavToMp3(inputPath, outputPath) {
    try {
      console.log('🎵 Converting WAV → MP3 (Alexa-compatible)...');
      console.log(`   Input: ${path.basename(inputPath)}`);

      // Convert using ffmpeg to MPEG-1 Layer III (standard MP3)
      // Using 24000 Hz to ensure MPEG-1 Layer III encoding
      // -codec:a libmp3lame: MPEG-1 Layer III encoder
      // -ar 24000: Sample rate 24000 Hz (Alexa-compatible, ensures MPEG-1)
      // -ac 1: Mono channel
      // -b:a 48k: Bitrate 48 kbps (Alexa requirement)
      const command = `ffmpeg -y -i "${inputPath}" -codec:a libmp3lame -ar 24000 -ac 1 -b:a 48k "${outputPath}" 2>&1`;

      execSync(command, { stdio: 'pipe' });

      console.log(`   ✅ Output: ${path.basename(outputPath)}`);
      console.log('   Format: MPEG-1 Layer III, 24000 Hz, mono, 48 kbps');

      return true;
    } catch (error) {
      console.error(`   ❌ Conversion failed: ${error.message}`);
      throw new Error(`ffmpeg conversion failed: ${error.message}`);
    }
  }

  /**
     * Save audio buffer and return public URL
     * @param {Buffer} audioBuffer - Audio data
     * @param {string} extension - File extension
     * @returns {Promise<string>} Public HTTPS URL
     */
  async saveAudio(audioBuffer, extension = 'mp3') {
    const filename = this.generateFilename(extension);
    const filePath = path.join(this.audioDir, filename);

    // Save audio file
    fs.writeFileSync(filePath, audioBuffer);

    console.log(`💾 Saved audio: ${filename} (${audioBuffer.length} bytes)`);

    // Generate public URL
    const publicUrl = `${this.baseUrl}/audio/${filename}`;
    console.log(`🔗 Public URL: ${publicUrl}`);

    return publicUrl;
  }

  /**
     * Save audio with metadata
     * @param {Buffer} audioBuffer - Audio data
     * @param {object} metadata - Metadata (text, language, etc.)
     * @returns {Promise<string>} Public URL
     */
  async saveAudioWithMetadata(audioBuffer, metadata = {}) {
    let extension = metadata.extension || 'mp3';
    let finalBuffer = audioBuffer;
    let finalExtension = extension;

    // Convert WAV to MP3 if needed (for Sarvam TTS compatibility)
    if (extension === 'wav') {
      const tempWavPath = path.join(this.audioDir, `temp-${Date.now()}.wav`);
      const tempMp3Path = path.join(this.audioDir, `temp-${Date.now()}.mp3`);

      try {
        // Save temporary WAV file
        fs.writeFileSync(tempWavPath, audioBuffer);

        // Convert to MP3 with Alexa-compatible settings
        await this.convertWavToMp3(tempWavPath, tempMp3Path);

        // Read converted MP3
        finalBuffer = fs.readFileSync(tempMp3Path);
        finalExtension = 'mp3';

        // Clean up temp files
        fs.unlinkSync(tempWavPath);
        fs.unlinkSync(tempMp3Path);

        console.log('   🔄 Converted WAV → MP3 for Alexa compatibility');
      } catch (error) {
        console.error(`   ⚠️  Conversion failed, using original WAV: ${error.message}`);
        // Fallback to original WAV (may not work on Alexa)
        finalBuffer = audioBuffer;
        finalExtension = 'wav';

        // Clean up temp files if they exist
        if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
        if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path);
      }
    }

    const filename = this.generateFilename(finalExtension);
    const filePath = path.join(this.audioDir, filename);
    const metaPath = path.join(this.audioDir, `${filename}.json`);

    // Save audio file
    fs.writeFileSync(filePath, finalBuffer);

    // Save metadata
    const meta = {
      ...metadata,
      filename,
      converted: extension !== finalExtension,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.maxAge).toISOString()
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    console.log(`💾 Saved audio: ${filename}`);
    console.log(`   Size: ${finalBuffer.length} bytes`);
    console.log(`   Language: ${metadata.language || 'unknown'}`);
    console.log(`   Service: ${metadata.service || 'unknown'}`);
    console.log(`   Text: "${(metadata.text || '').substring(0, 50)}..."`);

    return `${this.baseUrl}/audio/${filename}`;
  }

  /**
     * Delete audio file and metadata
     * @param {string} filename - Filename to delete
     */
  deleteAudio(filename) {
    try {
      const filePath = path.join(this.audioDir, filename);
      const metaPath = path.join(this.audioDir, `${filename}.json`);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }

      console.log(`🗑️  Deleted audio: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to delete ${filename}:`, error.message);
    }
  }

  /**
     * Cleanup old audio files
     */
  cleanup() {
    try {
      const files = fs.readdirSync(this.audioDir);
      const now = Date.now();
      let deletedCount = 0;

      files.forEach(file => {
        if (file.endsWith('.json')) return; // Skip metadata files

        const filePath = path.join(this.audioDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > this.maxAge) {
          this.deleteAudio(file);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        console.log(`🧹 Cleanup: Removed ${deletedCount} old audio file(s)`);
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error.message);
    }
  }

  /**
     * Start periodic cleanup
     */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    console.log(`🔄 Auto-cleanup started (interval: ${this.cleanupInterval}ms)`);
  }

  /**
     * Stop periodic cleanup
     */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      console.log('⏹️  Auto-cleanup stopped');
    }
  }

  /**
     * Get audio file info
     * @param {string} filename - Filename to check
     * @returns {object|null} File info or null
     */
  getAudioInfo(filename) {
    try {
      const metaPath = path.join(this.audioDir, `${filename}.json`);
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
     * Set base URL (for ngrok updates)
     * @param {string} baseUrl - New base URL
     */
  setBaseUrl(baseUrl) {
    this.baseUrl = baseUrl;
    console.log(`🔗 Base URL updated: ${this.baseUrl}`);
  }
}

module.exports = AudioHostingService;
