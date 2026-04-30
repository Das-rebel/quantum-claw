# Omniclaw

Unified AI assistant platform consolidating multi-channel voice/text interfaces with intelligent routing and skill orchestration.

## Architecture

```
omniclaw/
├── apps/                          # User-facing entry points
│   ├── alexa/                     # Alexa skill handler + interaction models
│   ├── whatsapp/                  # WhatsApp bridge
│   ├── telegram/                  # Telegram bot
│   └── web/                       # Future web UI
├── services/                       # Backend services
│   ├── api-gateway/               # API routing layer
│   ├── tunnel/                    # Omniclaw tunnel service (WhatsApp relay)
│   ├── automation/                # Workflow orchestration
│   └── celebrity-tts-service/      # TTS voice synthesis
├── skills/                         # Reusable AI capabilities
│   ├── llm/                       # LLM providers (GLM, OpenAI, Anthropic, Groq, Cerebras)
│   ├── tts/                       # TTS engines (Sarvam, Google)
│   ├── stt/                       # Speech-to-text
│   ├── translate/                 # Translation (Google)
│   ├── search/                    # Search (Tavily, Wikipedia)
│   ├── browser/                   # Browser automation (sota-browser)
│   ├── memory/                    # Memory systems
│   ├── orchestration/             # Execution engines (MCTS, role assignment)
│   ├── routing/                   # Intent routing and classification
│   ├── state/                     # State management
│   └── agents/                    # Agent implementations
├── clients/                        # External API clients
│   ├── alexa_handler.js           # Alexa skill entry point
│   ├── glm_client.js             # GLM (ZhipuAI) client
│   ├── sarvam_client.js           # Sarvam AI (TTS/STT)
│   ├── youtube_client.js          # YouTube API
│   ├── spotify_client.js          # Spotify API
│   ├── plex_client.js             # Plex Media Server
│   ├── kodi_client.js             # Kodi
│   ├── twitter_client.js          # Twitter/X
│   ├── reddit_client.js           # Reddit
│   └── wikipedia_client.js        # Wikipedia
├── shared/                         # Shared utilities
│   ├── security/                   # Auth, validation, sanitization
│   └── utils/                      # Common helpers
├── infrastructure/                  # Cloud deployment
│   ├── cloud-functions/           # GCP Cloud Functions
│   └── deployment/                 # Deployment configs
├── tests/                           # Test suites
│   ├── unit/                       # Unit tests
│   └── integration/                 # Integration tests
├── package.json
├── pyproject.toml
└── README.md
```

## Quick Start

### Node.js Services (Alexa, Clients)

```bash
# Install dependencies
npm install

# Run Alexa skill handler
npm run alexa

# Run development mode (no TMLPD)
npm run alexa:dev
```

### Python Skills

```bash
# Install Python dependencies
pip install -e .

# Run tests
pytest
```

## Skills

### LLM Providers (`skills/llm/`)
- **GLM**: ZhipuAI's GLM-4 models
- **OpenAI**: GPT-4, GPT-3.5
- **Anthropic**: Claude models
- **Groq**: Fast inference
- **Cerebras**: Fast inference

### TTS Engines (`skills/tts/`)
- **Sarvam AI**: Indian languages support
- **Google TTS**: Universal coverage

### STT (`skills/stt/`)
- **Sarvam STT**: Indian languages

### Translation (`skills/translate/`)
- **Google Translate**: 100+ languages

### Search (`skills/search/`)
- **Tavily**: AI-powered search
- **Wikipedia**: Factual queries

### Browser Automation (`skills/browser/`)
- **sota-browser**: Browser-use based automation

## Clients

| Client | Purpose |
|--------|---------|
| `alexa_handler.js` | Main Alexa skill entry point |
| `glm_client.js` | GLM API integration |
| `sarvam_client.js` | Sarvam TTS/STT |
| `youtube_client.js` | YouTube data/search |
| `spotify_client.js` | Spotify playback control |
| `plex_client.js` | Plex media server |
| `kodi_client.js` | Kodi home theater |
| `twitter_client.js` | Twitter scraping |
| `reddit_client.js` | Reddit API |
| `wikipedia_client.js` | Wikipedia queries |

## Services

### API Gateway (`services/api-gateway/`)
Central routing and request handling.

### Tunnel Service (`services/tunnel/`)
WhatsApp tunnel relay for remote access.

### Automation (`services/automation/`)
Workflow orchestration and parallelization.

### Celebrity TTS (`services/celebrity-tts-service/`)
Voice synthesis service.

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:
- `GLM_API_KEY`: ZhipuAI API key
- `SARVAM_API_KEY`: Sarvam AI API key
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key

## Development

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration
```

### Code Style

```bash
# Lint JavaScript
npm run lint
```

## Infrastructure

### Cloud Deployment

- **GCP Cloud Functions**: `infrastructure/cloud-functions/`
- **Cloud Run**: `infrastructure/deployment/`

### Docker

```bash
# Build image
docker build -t omniclaw .

# Run container
docker run -p 3000:3000 --env-file .env omniclaw
```

## Migration History

This repository was unified from:
1. `omniclaw-personal-assistant` - Main Python orchestration
2. `openclaw-alexa-bridge` - Alexa-specific Node.js handlers
3. `omniclaw-fresh` - Tunnel service variant

## License

Private project - All rights reserved
