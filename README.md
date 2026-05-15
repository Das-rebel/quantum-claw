# OmniClaw

> Built by a growth operator who needed a multi-channel AI automation layer
> that wasn't locked to a single provider, a single channel, or a single use case.

I spent 10 years running growth at Axis Bank, Groww, and NIRO. Every time I needed
to automate a customer communication workflow — retention nudges, embedded lending
activation, lifecycle triggers — I was either locked into one AI provider's pricing
and rate limits, or stitching together three separate tools that didn't talk to each other.

OmniClaw is the orchestration layer I built to fix that.

## What it does for growth operators

- **Routes across 8+ LLMs** (OpenAI, Anthropic, Gemini, Groq, Cerebras, Perplexity) based
  on cost, latency, and task type — so you're not paying GPT-4 prices for simple classification
- **Deploys across WhatsApp, Telegram, and Alexa** in the same system — one orchestration
  layer, multiple customer touchpoints
- **Speaks Hindi, Bengali, and Hinglish** natively via Sarvam AI TTS/STT — built for
  India's vernacular-first customer base, not retrofitted
- **18 MCP browser automation tools** — navigate, click, screenshot, evaluate JS — for
  automating growth research and competitive intelligence workflows
- **Production-deployed on GCP** — not a demo, not a local prototype

## Who this is for

Growth leads and GTM operators building AI-assisted retention, lifecycle automation,
or multi-channel customer engagement — who need provider flexibility and don't want
to rebuild the orchestration layer from scratch.

---

## ✨ What is Omniclaw?

**Omniclaw** is a modular AI assistant platform that unifies multiple communication channels — **voice assistants, messaging apps, and browser automation** — into a single, extensible codebase.

Instead of maintaining separate repos for Alexa skills, WhatsApp bridges, and Telegram bots, Omniclaw provides:

- 🤖 **8+ LLM Providers** — GLM, OpenAI, Anthropic, Cerebras, Groq, Gemini, Perplexity, and more
- 🗣️ **Multi-Language TTS/STT** — Native support for English, Hindi, Bengali, Hinglish, and 100+ languages
- 💬 **Unified Message Handling** — WhatsApp, Telegram, Alexa voice, and web interfaces
- 🔀 **Intelligent Routing** — Automatic provider selection based on task, cost, and latency
- 🌐 **Browser Automation** — Full web interaction via MCP protocol
- ⚡ **18 Browser Tools** — Navigate, click, type, screenshot, evaluate JavaScript, and more

---

## 🎯 Key Features

| Category | Capabilities |
|----------|-------------|
| **Voice AI** | Alexa Skills, multi-language TTS/STT, voice config |
| **Messaging** | WhatsApp relay, Telegram bot, message orchestration |
| **LLM Orchestration** | Multi-provider routing, fallback chains, cost optimization |
| **Browser Automation** | Headless Chromium, Chrome CDP, 18 MCP tools |
| **Search & Research** | Tavily AI search, Wikipedia, Reddit, YouTube |
| **Media Control** | Spotify, Plex, Kodi integration |
| **Security** | Input sanitization, API key management, rate limiting |

---

## 🏗️ Architecture

```
omniclaw/
├── apps/                    # User-facing entry points
│   ├── alexa/              # 🎙️ Alexa Skill Handler
│   ├── whatsapp/           # 💬 WhatsApp Bridge
│   ├── telegram/           # ✈️ Telegram Bot
│   └── web/                # 🌐 Web Interface
│
├── skills/                  # 🧠 AI Capabilities
│   ├── llm/                # 8+ LLM providers
│   ├── tts/                # Text-to-Speech
│   ├── stt/                # Speech-to-Text
│   ├── translate/          # Translation
│   ├── search/             # AI Search
│   ├── browser/            # 🌐 Browser Automation (MCP)
│   ├── memory/             # Memory Systems
│   └── orchestration/      # Workflow Engine
│
├── clients/                 # 📡 External API Clients
│   ├── glm_client.js       # ZhipuAI GLM
│   ├── sarvam_client.js     # Sarvam AI (India)
│   ├── spotify_client.js   # Spotify
│   └── 40+ more clients
│
├── services/               # ⚙️ Backend Services
│   ├── api-gateway/        # Rate limiting & routing
│   ├── tunnel/            # WhatsApp relay
│   └── automation/        # Workflow orchestration
│
├── shared/                 # 🔒 Utilities & Security
├── infrastructure/         # ☁️ GCP Deployment
└── tests/                 # 🧪 Test Suites
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **Python** ≥ 3.9
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/Das-rebel/omniclaw.git
cd omniclaw

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -e .

# Configure environment
cp .env.example .env
```

### Run

```bash
# Start Alexa Skill Handler
npm run alexa

# Start with development mode (no TMLPD)
npm run alexa:dev

# Run Python tests
pytest
```

---

## 📱 Supported Platforms

### Alexa Skills
```bash
# Deploy Alexa skill
npm run deploy:alexa
```
- Multi-language support (English, Hindi, Bengali, Hinglish)
- Sarvam AI TTS for natural Indian voice synthesis
- Fallback to Google TTS

### WhatsApp
```bash
# Start WhatsApp tunnel
cd services/omniclaw-tunnel
./start_tunnel.sh
```
- Baileys-based WhatsApp Web API
- Remote session management
- Message relay and orchestration

### Telegram Bot
```bash
# Configure bot token in .env
TELEGRAM_BOT_TOKEN=your_token

# Run bot
npm run telegram
```

### Browser Automation
```bash
# Start MCP browser server
cd skills/browser/sota-browser
./install.sh
python3 mcp_server.py
```
- Connect to existing Chrome via CDP
- Headless Chromium support
- 18 automation tools via MCP protocol

---

## 🤖 AI Providers

Omniclaw intelligently routes requests across 8+ providers:

| Provider | Models | Best For | Region |
|----------|--------|----------|--------|
| **GLM (ZhipuAI)** | GLM-4, GLM-4V | Reasoning, Vision | China |
| **OpenAI** | GPT-4, GPT-3.5 | General purpose | Global |
| **Anthropic** | Claude 3.5, Claude 3 | Safety, analysis | Global |
| **Cerebras** | Llama-3.3, Qwen | Fast inference | US |
| **Groq** | Llama, Mixtral | Low latency | Global |
| **Gemini** | Gemini Pro, Flash | Multimodal | Global |
| **Perplexity** | Sonar | Real-time search | Global |
| **Groq** | Speech-to-Text | Transcription | Global |

---

## 🌐 Browser Automation (SOTA Browser)

Access 18 MCP tools for full browser control:

| Tool | Capability |
|------|------------|
| `browser_create_session` | New browser session |
| `browser_create_tab` | Open new tab |
| `browser_navigate` | Go to URL |
| `browser_snapshot` | Get DOM tree |
| `browser_click` | Click elements |
| `browser_type` | Input text |
| `browser_scroll` | Scroll page |
| `browser_screenshot` | Capture screenshot |
| `browser_evaluate` | Run JavaScript |
| `browser_extract_images` | Find images |
| `browser_list_tabs` | List open tabs |
| `browser_close_tab` | Close tab |
| `browser_close_session` | End session |
| `browser_http_get` | Direct HTTP GET |
| `browser_import_cookies` | Set cookies |
| `browser_info` | Browser status |
| `browser_press_key` | Keyboard input |
| `browser_wait` | Wait for element |

### Chrome CDP Mode

Connect to your existing Chrome browser with authenticated sessions:

```bash
# Get Chrome WebSocket URL
chrome://inspect/#devices

# Set environment
export CHROME_CDP_URL="ws://localhost:60807/devtools/browser/xxx"

# Run with Chrome CDP
cd skills/browser/sota-browser
python3 mcp_server.py
```

---

## 🔧 Configuration

### Environment Variables

```bash
# AI Providers
GLM_API_KEY=your_glm_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
CEREBRAS_API_KEY=your_cerebras_key
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key

# Regional AI (India)
SARVAM_API_KEY=your_sarvam_key

# Voice Services
GOOGLE_TTS_API_KEY=your_google_key

# Messaging
TELEGRAM_BOT_TOKEN=your_telegram_token
WHATSAPP_SESSION_DIR=./whatsapp_sessions

# Browser
CHROME_CDP_URL=ws://localhost:60807/devtools/browser/xxx
```

---

## 📊 Project Stats

| Metric | Value |
|--------|-------|
| **Files** | 353+ |
| **LLM Providers** | 8+ |
| **External Clients** | 50+ |
| **Browser Tools** | 18 |
| **Languages Supported** | 100+ |
| **Platforms** | Alexa, WhatsApp, Telegram, Web |

---

## 🗺️ Roadmap

- [ ] **v2.0** — Mobile app integration (iOS, Android)
- [ ] **v2.1** — Discord support
- [ ] **v2.2** — Slack integration
- [ ] **v2.3** — Signal/Threema support
- [ ] **v2.4** — Advanced agent memory
- [ ] **v2.5** — Multimodal orchestration

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

MIT License — See [LICENSE](LICENSE)

---

## 🔗 Links

- **GitHub**: [github.com/Das-rebel/omniclaw](https://github.com/Das-rebel/omniclaw)
- **Issues**: [GitHub Issues](https://github.com/Das-rebel/omniclaw/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Das-rebel/omniclaw/discussions)

---

<p align="center">
  <strong>Built with ❤️ for universal AI orchestration</strong>
</p>

<p align="center">
  <a href="https://github.com/Das-rebel/omniclaw/stargazers">⭐ Star us on GitHub</a>
  ·
  <a href="https://github.com/Das-rebel/omniclaw/fork">Fork</a>
  ·
  <a href="https://twitter.com/intent/tweet?text=Check%20out%20Omniclaw%20-%20Universal%20AI%20Orchestration%20Platform&url=https://github.com/Das-rebel/omniclaw">Share</a>
</p>