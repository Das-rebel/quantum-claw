# Omniclaw Repository File Map

## Canonical Location
**Main Repository:** `~/omniclaw` (https://github.com/Das-rebel/omniclaw)

This is the **only** active omniclaw repository. All active code, scripts, and documentation lives here.

---

## Current Structure

```
~/omniclaw/
├── apps/                      # 🎯 User-facing entry points
│   ├── alexa/                # Alexa Skill Handler + interaction models
│   ├── whatsapp/             # WhatsApp Bridge
│   ├── telegram/             # Telegram Bot
│   └── web/                  # Web Interface
│
├── skills/                    # 🧠 AI Capabilities
│   ├── agents/               # Agent implementations
│   ├── browser/              # Browser automation (sota-browser MCP)
│   ├── llm/                  # LLM providers (8+ models)
│   ├── memory/              # Memory systems
│   ├── orchestration/       # Workflow engines
│   ├── providers/           # Provider base classes
│   ├── routing/             # Intent routing
│   ├── state/               # State management
│   ├── skills/              # Skill manager (TMLPD)
│   ├── tts/                 # Text-to-Speech
│   ├── stt/                 # Speech-to-Text
│   ├── translate/           # Translation
│   ├── search/              # Search (Tavily, Wikipedia)
│   ├── tmlpd_agent.py       # TMLPD agent
│   └── tmpld_v2.py          # TMLPD v2
│
├── clients/                   # 📡 External API Clients (50+)
│   ├── alexa_handler.js      # Alexa entry point
│   ├── glm_client.js        # ZhipuAI GLM
│   ├── sarvam_client.js      # Sarvam AI (India)
│   ├── spotify_client.js    # Spotify
│   ├── youtube_client.js    # YouTube
│   ├── plex_client.js       # Plex Media Server
│   ├── kodi_client.js       # Kodi
│   ├── twitter_client.js    # Twitter/X
│   ├── reddit_client.js     # Reddit
│   ├── wikipedia_client.js  # Wikipedia
│   └── 40+ more clients
│
├── services/                  # ⚙️ Backend Services
│   ├── api-gateway/         # API routing, rate limiting
│   ├── automation/          # Workflow orchestration
│   ├── omniclaw-tunnel/     # WhatsApp relay tunnel
│   ├── tts/                 # TTS services (ElevenLabs, Google, Amazon)
│   └── celebrity-tts-service/ # Voice synthesis
│
├── scripts/                   # 🔧 Utility Scripts (migrated from ~/)
│   ├── omniclaw-mac-api.js   # macOS API server
│   ├── omniclaw-simple-api.py # Simple API
│   ├── omniclaw.js           # Main app
│   ├── omniclaw_baileys.js   # WhatsApp Baileys
│   ├── omniclaw_direct.js    # Direct handler
│   ├── omniclaw_direct_whatsapp.js # WhatsApp direct
│   ├── omniclaw_ws_listener.py # WebSocket listener
│   ├── openclaw_bridge_enhanced.js # Enhanced bridge
│   ├── openclaw_browser_relay.py # Browser relay
│   ├── openclaw_relay_final.py # Final relay
│   ├── openclaw_relay_simple.py # Simple relay
│   ├── openclaw_tmlpd_agent.py # TMLPD agent
│   └── start_omniclaw.sh     # Launcher
│
├── tests/                     # 🧪 Test Suites
│   ├── test-omniclaw-comprehensive.sh
│   └── test_openclaw_auto_reply_complete.sh
│
├── docs/                      # 📚 Documentation
│   ├── planning/              # Planning documents (historical)
│   │   ├── OMNICLAW_ALEXA_*.md
│   │   ├── OPENCLAW_ALEXA_*.md
│   │   ├── OPENCLAW_BROWSER_*.md
│   │   ├── OPENCLAW_CLAUDE_*.md
│   │   ├── OPENCLAW_DEPLOYMENT_*.md
│   │   ├── OPENCLAW_FIXES_*.md
│   │   ├── OPENCLAW_WHATSAPP_*.md
│   │   └── TMLPD_OPENCLAW_*.md
│   └── historical/            # Historical status docs
│       ├── FINAL_OMNICLAW_STATUS.md
│       └── FINAL_OMNICLAW_STATUS_COMPLETE.md
│
├── infrastructure/            # ☁️ Cloud Deployment
│   ├── cloud-functions/      # GCP Cloud Functions
│   └── deployment/           # Deployment configs & scripts
│
├── shared/                    # 🔒 Shared Utilities
│   ├── security/             # Auth, validation
│   └── utils/                # Error handling, input validation
│
├── .env.example               # Environment template
├── package.json               # Node.js dependencies
├── pyproject.toml             # Python dependencies
├── Dockerfile                 # Docker build
└── README.md                  # This file
```

---

## Local File References

### Configuration (NOT in repo)
| Path | Purpose |
|------|---------|
| `~/.omniclaw_auth/` | Auth tokens (git-ignored) |
| `~/.openclaw/` | OpenClaw config (legacy) |

### Canonical Repo
| Path | URL |
|------|-----|
| `~/omniclaw/` | https://github.com/Das-rebel/omniclaw |

---

## Old Repos (Deleted)
These were merged into `~/omniclaw`:
- ❌ `~/omniclaw-personal-assistant/` → merged
- ❌ `~/openclaw-alexa-bridge/` → merged
- ❌ `~/omniclaw-fresh/` → merged
- ❌ `~/mcp-browser/` → merged into `skills/browser/`

---

## Migration History
- **2026-04-30**: Unified 3 repos into single monorepo
  - omniclaw-personal-assistant
  - openclaw-alexa-bridge
  - omniclaw-fresh
