# Celebrity Voice Cloning TTS Service

**Open-source celebrity voice synthesis using XTTS**

## Overview

This service provides celebrity voice cloning for the OmniClaw Enhanced story narrator system. It uses XTTS (Coqui's multi-speaker TTS) to clone celebrity voices from short audio samples and synthesize text in those voices.

## Supported Celebrity Voices

| Celebrity | Archetype | Language | Voice Characteristics |
|-----------|-----------|----------|---------------------|
| **Amitabh Bachan** | Serious, Wise Old | Hindi/English | Deep, authoritative, heavy |
| **Sandra Bullock** | Elegant Female | English | Sophisticated, warm, clear |
| **Morgan Freeman** | Narrator, Villain | English | Deep, engaging, smooth |
| **Tom Cruise** | Hero | English | Strong, confident, energetic |
| **Shah Rukh Khan** | Hero, Narrator | Hindi/English | Passionate, expressive |
| **Alia Bhatt** | Young Female | Hindi/English | Cheerful, youthful |

## Architecture

```
┌──────────────────────────────────────┐
│   Story Narrator Function            │
│   (Cloud Function)                   │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Celebrity TTS Client               │
│   - Archetype detection              │
│   - Celebrity mapping                │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Celebrity TTS Service              │
│   (Cloud Run + GPU)                  │
│   - XTTS model                       │
│   - Voice cloning                    │
│   - Multi-language synthesis         │
└──────────────────────────────────────┘
```

## Quick Start

### 1. Build Docker Image

```bash
cd celebrity-tts-service
docker build -t celebrity-tts:v1 .
```

### 2. Run Locally (Testing)

```bash
docker run -p 8000:8000 celebrity-tts:v1
```

### 3. Test Endpoints

```bash
# Health check
curl http://localhost:8000/health

# List celebrities
curl http://localhost:8000/celebrities

# Synthesize with celebrity voice
curl -X POST http://localhost:8000/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Once upon a time, there was a brave hero.",
    "celebrity": "tom_cruise",
    "language": "en"
  }'
```

## Deployment to Google Cloud Run

### Prerequisites

- Google Cloud project with billing enabled
- GPU-enabled region (us-central1, europe-west1, etc.)
- gcloud CLI installed and configured

### Deploy with GPU

```bash
gcloud run deploy celebrity-tts \
  --source=. \
  --platform=managed \
  --region=us-central1 \
  --memory=8Gi \
  --cpu=4 \
  --accelerator=nvidia-tesla-t4 \
  --allow-unauthenticated \
  --max-instances=10 \
  --min-instances=0 \
  --project=omniclaw-enhanced
```

### Environment Variables

```bash
--set-env-vars=(
    LOG_LEVEL=info,
    MODEL_NAME=xtts_v2,
    DEVICE=cuda
)
```

## API Documentation

### Health Check

```http
GET /health
```

**Response**:
```json
{
  "status": "healthy",
  "model": "xtts_v2",
  "device": "cuda",
  "celebrity_voices": 6,
  "languages": ["en", "hi", "hinglish"]
}
```

### List Celebrities

```http
GET /celebrities
```

**Response**:
```json
{
  "celebrities": [
    "amitabh_bachan",
    "sandra_bullock",
    "morgan_freeman",
    "tom_cruise",
    "shah_rukh_khan",
    "alia_bhatt"
  ],
  "count": 6
}
```

### Synthesize with Celebrity Voice

```http
POST /synthesize
Content-Type: application/json

{
  "text": "एक बार की बात है, एक राजा था।",
  "celebrity": "amitabh_bachan",
  "language": "hi"
}
```

**Response**:
```json
{
  "success": true,
  "audio": "hex_encoded_audio_bytes",
  "celebrity": "amitabh_bachan",
  "language": "hi",
  "sample_rate": 24000,
  "duration": 3.5
}
```

### Synthesize by Archetype

```http
POST /synthesize-by-archetype?text=...&archetype=serious&language=en
```

**Archetypes**:
- `serious` - Amitabh Bachan
- `hero` - Tom Cruise
- `elegant_female` - Sandra Bullock
- `villain` - Morgan Freeman
- `wise_old` - Amitabh Bachan
- `young_female` - Alia Bhatt
- `narrator` - Morgan Freeman

## Voice Sample Preparation

### 1. Collect Voice Samples

Sources:
- Movie dialogues (public domain)
- Interview clips
- Audiobook samples
- Speeches

### 2. Process Samples

```bash
# Extract 5-10 second clips
ffmpeg -i input.mp3 -t 10 -ar 24000 -ac 1 output.wav

# Organize by celebrity
mkdir -p voice_samples
mv output.wav voice_samples/amitabh_bachan_sample.wav
```

### 3. Sample Requirements

- **Duration**: 5-10 seconds
- **Format**: WAV
- **Sample Rate**: 24kHz
- **Channels**: Mono
- **Quality**: Clear speech, minimal background noise

## Integration with Story Narrator

### Client Usage

```javascript
const CelebrityTTSClient = require('../../shared/tts/celebrity-tts-client');

const client = new CelebrityTTSClient(
  'https://celebrity-tts-xxxxx.a.run.app'
);

// Synthesize with specific celebrity
const audio1 = await client.synthesize(
  'Once upon a time...',
  'amitabh_bachan',
  'en'
);

// Synthesize by archetype
const audio2 = await client.synthesizeByArchetype(
  'The story begins...',
  'narrator',
  'en'
);

// Smart synthesize with auto-detection
const audio3 = await client.smartSynthesize(
  'I am a powerful king.',
  'A serious, authoritative character',
  'en'
);
```

## Performance

### Synthesis Time

| Hardware | Duration | Quality |
|----------|----------|---------|
| CPU (4 vCPUs) | 5-10s | Good |
| GPU (Tesla T4) | 0.5-2s | Excellent |
| GPU (A100) | 0.3-1s | Excellent |

### Costs

| Configuration | Monthly Cost | Use Case |
|---------------|--------------|----------|
| CPU (4 vCPUs, 8GB) | $50-100 | Development |
| GPU (Tesla T4) | $200-400 | Production |
| GPU (A100) | $600-800 | High volume |

## Testing

### Run Tests

```bash
cd ../tests/integration
node celebrity-tts.test.js
```

### Test Coverage

- ✅ Health checks
- ✅ Celebrity listing
- ✅ Archetype detection
- ✅ English synthesis
- ✅ Hindi synthesis
- ✅ Archetype-based synthesis
- ✅ Smart synthesis with auto-detection

## Legal & Ethical Considerations

### Voice Cloning Ethics

⚠️ **Important**: Celebrity voice cloning raises ethical and legal considerations:

**Acceptable Use**:
- ✅ Personal projects and experimentation
- ✅ Educational purposes and research
- ✅ Open-source demonstrations
- ✅ Parody and satire (where legally permitted)

**Not Acceptable**:
- ❌ Commercial use without permission
- ❌ Misrepresentation as actual celebrity
- ❌ Deceptive practices
- ❌ Defamation or harmful content

### Recommendations

1. **Attribution**: Always label AI-generated celebrity voices
2. **Consent**: Obtain permission for commercial use
3. **Fair Use**: Understand fair use laws in your jurisdiction
4. **Alternatives**: Consider generic archetype voices for commercial use

### Legal Status

- **Personal Use**: Generally acceptable under fair use
- **Educational Use**: Acceptable with proper attribution
- **Commercial Use**: Requires licensing and permissions

## Troubleshooting

### Common Issues

**Issue 1: Model not loading**
```
Error: Cannot load XTTS model
```
**Solution**: Ensure sufficient memory and GPU availability

**Issue 2: Voice sample not found**
```
Error: Voice sample file not found
```
**Solution**: Check voice_samples/ directory and file paths

**Issue 3: Slow synthesis**
```
Synthesis taking > 10s
```
**Solution**: Enable GPU acceleration or reduce audio length

**Issue 4: Poor voice quality**
```
Voice doesn't sound like celebrity
```
**Solution**: Improve voice sample quality and duration

### Diagnostic Commands

```bash
# Check service health
curl https://celebrity-tts-xxxxx.a.run.app/health

# View service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=celebrity-tts" \
  --project=omniclaw-enhanced \
  --limit=50

# Test celebrity synthesis
curl -X POST https://celebrity-tts-xxxxx.a.run.app/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","celebrity":"amitabh_bachan","language":"en"}'
```

## Future Enhancements

### Planned Features

- [ ] More celebrity voices (Johnny Lever, Kapil Sharma, etc.)
- [ ] Cross-language voice cloning (Hindi voice for English text)
- [ ] Emotional modulation (angry, sad, excited)
- [ ] Voice style transfer
- [ ] Real-time streaming synthesis
- [ ] Voice embedding caching

### Community Contributions

We welcome contributions! Areas for contribution:

1. Additional celebrity voice samples
2. Improved archetype detection
3. Better voice quality
4. Performance optimizations
5. Documentation improvements

## References

### Technologies Used

- **XTTS**: Coqui's multi-speaker TTS model
- **FastAPI**: Modern Python web framework
- **PyTorch**: Deep learning framework
- **Docker**: Containerization
- **Google Cloud Run**: Serverless compute

### Related Projects

- [Coqui TTS](https://github.com/coqui-ai/TTS) - Open-source TTS
- [XTTS v2](https://huggingface.co/coqui/XTTS-v2) - Model card
- [RVC Models](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion) - Voice cloning

## Support

### Getting Help

- **Issues**: Report bugs and feature requests on GitHub
- **Discussions**: Community forum for questions
- **Documentation**: Full API docs available at `/docs` endpoint

### License

This project is for educational and personal use. Celebrity voice cloning may be subject to legal restrictions in your jurisdiction. Always obtain proper permissions for commercial use.

---

**Version**: 1.0.0
**Last Updated**: 2026-03-26
**Maintainer**: OmniClaw Enhanced Team
**License**: Educational Use Only
