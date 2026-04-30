# Celebrity Voice Cloning - Quick Start Guide

**Get started with celebrity voice TTS in 15 minutes**

---

## Prerequisites

```bash
# Install dependencies
pip install fastapi uvicorn TTS torch torchaudio

# OR use Docker (recommended)
docker --version
```

---

## Step 1: Prepare Voice Samples (5 minutes)

### Option A: Use Public Domain Clips

Download short clips from:
- [LibriVox](https://librivox.org/) - Public domain audiobooks
- [Archive.org](https://archive.org/) - Old movies, speeches
- YouTube movie clips (fair use for personal projects)

### Option B: Record Your Own

```bash
# Record 5-10 second sample
ffmpeg -f avfoundation -i ":0" -t 5 sample.wav

# Convert to required format
ffmpeg -i sample.wav -ar 24000 -ac 1 output.wav
```

### Sample Requirements

- **Duration**: 5-10 seconds
- **Format**: WAV
- **Sample Rate**: 24kHz
- **Channels**: Mono (1 channel)
- **Quality**: Clear speech, minimal noise

### Organize Samples

```bash
cd celebrity-tts-service
mkdir -p voice_samples

# Add your samples
mv ~/Downloads/amitabh_sample.wav voice_samples/amitabh_bachan_sample.wav
mv ~/Downloads/sandra_sample.wav voice_samples/sandra_bullock_sample.wav
mv ~/Downloads/morgan_sample.wav voice_samples/morgan_freeman_sample.wav
```

---

## Step 2: Test Locally (5 minutes)

### Option A: Python (No Docker)

```bash
cd celebrity-tts-service

# Install dependencies
pip install -r requirements.txt

# Run service
python main.py
```

### Option B: Docker (Recommended)

```bash
cd celebrity-tts-service

# Build image
docker build -t celebrity-tts:test .

# Run container
docker run -p 8000:8000 \
  -v $(pwd)/voice_samples:/app/voice_samples \
  celebrity-tts:test
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8000/health

# List celebrities
curl http://localhost:8000/celebrities

# Synthesize English with Amitabh
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Once upon a time, there was a brave hero.",
    "celebrity": "amitabh_bachan",
    "language": "en"
  }'

# Synthesize Hindi with Amitabh
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "एक बार की बात है, एक राजा था।",
    "celebrity": "amitabh_bachan",
    "language": "hi"
  }'
```

### Save Audio Output

```bash
# Synthesize and save audio
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","celebrity":"amitabh_bachan","language":"en"}' \
  | jq -r '.audio' \
  | xxd -r -p \
  > output.wav

# Play audio
afplay output.wav  # macOS
# OR
vlc output.wav     # Linux/Windows
```

---

## Step 3: Deploy to Cloud Run (5 minutes)

### Automated Deployment

```bash
cd celebrity-tts-service

# Run deployment script
./deploy.sh
```

Choose deployment type:
- **Option 1 (CPU)**: $50-100/month, 5-10s synthesis
- **Option 2 (GPU)**: $200-400/month, 0.5-2s synthesis

### Manual Deployment

```bash
# CPU version (development)
gcloud run deploy celebrity-tts \
  --source=. \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=2 \
  --allow-unauthenticated \
  --project=omniclaw-enhanced

# GPU version (production)
gcloud run deploy celebrity-tts \
  --source=. \
  --region=us-central1 \
  --memory=8Gi \
  --cpu=4 \
  --accelerator=nvidia-tesla-t4 \
  --allow-unauthenticated \
  --project=omniclaw-enhanced
```

### Get Service URL

```bash
gcloud run services describe celebrity-tts \
  --region=us-central1 \
  --project=omniclaw-enhanced \
  --format='value(status.url)'
```

---

## Step 4: Integrate with Story Narrator

### Update Environment Variable

```bash
# In story narrator function
export CELEBRITY_TTS_URL="https://celebrity-tts-xxxxx.a.run.app"
```

### Test Integration

```javascript
const CelebrityTTSClient = require('../../shared/tts/celebrity-tts-client');

const client = new CelebrityTTSClient(process.env.CELEBRITY_TTS_URL);

// Test synthesis
const audio = await client.synthesize(
  'Once upon a time...',
  'amitabh_bachan',
  'en'
);

console.log(`Audio duration: ${audio.duration}s`);
console.log(`Sample rate: ${audio.sampleRate}Hz`);
```

---

## Troubleshooting

### Issue: Model not loading

```
Error: Cannot load XTTS model
```

**Solution**: Ensure sufficient memory and download model first

```python
from TTS.api import TTS
TTS("tts_models/multilingual/multi-dataset/xtts_v2")
```

### Issue: Voice sample not found

```
Error: Voice sample file not found
```

**Solution**: Check voice_samples directory and file paths

```bash
ls -la voice_samples/
# Should see: amitabh_bachan_sample.wav, etc.
```

### Issue: Slow synthesis

```
Synthesis taking > 10s
```

**Solution**:
- Use GPU deployment
- Reduce text length
- Enable audio caching

### Issue: Poor voice quality

```
Voice doesn't sound like celebrity
```

**Solution**:
- Use high-quality voice samples (5-10s)
- Ensure clear speech with minimal noise
- Try different sample clips

---

## Next Steps

1. **Add More Celebrities**: Collect voice samples for additional celebrities
2. **Improve Archetype Detection**: Use LLM for better character analysis
3. **Enable Caching**: Cache synthesized audio to reduce costs
4. **Add Emotions**: Implement emotional modulation (angry, sad, excited)
5. **Cross-Language Cloning**: Clone Hindi voice for English text

---

## Testing Checklist

- [ ] Health check endpoint works
- [ ] Can list all celebrity voices
- [ ] English synthesis works for all celebrities
- [ ] Hindi synthesis works for Indian celebrities
- [ ] Archetype detection maps correctly
- [ ] Smart synthesis auto-detects archetype
- [ ] Audio quality is acceptable
- [ ] Synthesis time is reasonable (< 10s CPU, < 2s GPU)
- [ ] Service URL is accessible
- [ ] Integration with story narrator works

---

## Cost Summary

| Deployment | Monthly Cost | Synthesis Speed | Use Case |
|------------|--------------|-----------------|----------|
| Local (CPU) | $0 | 5-10s | Development |
| Local (GPU) | $0 | 0.5-2s | Development |
| Cloud Run (CPU) | $50-100 | 5-10s | Testing |
| Cloud Run (GPU) | $200-400 | 0.5-2s | Production |

**Recommendation**: Start with local testing, deploy to CPU for initial testing, upgrade to GPU for production.

---

**Quick Start Time**: 15 minutes
**Difficulty**: Easy
**Prerequisites**: Python 3.11+, Docker (optional), gcloud (for deployment)

*Last Updated: 2026-03-26*
