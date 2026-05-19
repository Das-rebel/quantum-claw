# OmniClaw

<a href="https://github.com/Das-rebel/omniclaw/releases"><img src="https://img.shields.io/github/v/tag/Das-rebel/omniclaw?style=flat-square&logo=github&label=latest" alt="GitHub tag"></a>
<a href="https://github.com/Das-rebel/omniclaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Das-rebel/omniclaw?style=flat-square&logo=github" alt="License MIT"></a>
<a href="https://github.com/Das-rebel/omniclaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/Das-rebel/omniclaw/ci.yml?style=flat-square&logo=github" alt="CI"></a>
<a href="https://github.com/Das-rebel/omniclaw"><img src="https://img.shields.io/github/repo-size/Das-rebel/omniclaw?style=flat-square&logo=github" alt="Repo size"></a>
<img src="https://img.shields.io/github/languages/code-size/Das-rebel/omniclaw?style=flat-square&logo=github" alt="Language count">
<a href="https://github.com/Das-rebel/omniclaw/stargazers"><img src="https://img.shields.io/github/stars/Das-rebel/omniclaw?style=flat-square&logo=github" alt="Stars"></a>

> **Unified AI assistant platform with multi-channel support (Alexa, WhatsApp, Telegram, Hindi/Bengali/Hinglish). Multi-provider LLM orchestration: 8+ models (OpenAI, Anthropic, Gemini, Groq, Cerebras, Ollama, LM Studio, vLLM).**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           OmniClaw Architecture                              │
│                                                                              │
│  ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐  │
│  │  Alexa  │    │ WhatsApp │    │Telegram │    │  Web    │    │  Telegram│  │
│  │ Skills  │    │  Bridge  │    │   Bot   │    │ Interface│   │   Bot    │  │
│  └────┬────┘    └────┬─────┘    └────┬────┘    └────┬────┘    └────┬─────┘  │
│       │              │              │              │               │         │
│       └──────────────┴──────────────┴──────────────┴───────────────┘         │
│                                    │                                          │
│                          ┌─────────▼─────────┐                               │
│                          │   OmniClaw Core   │                               │
│                          │   Signal→Plan→    │                               │
│                          │   Execute→Respond │                               │
│                          └─────────┬─────────┘                               │
│                                    │                                          │
│       ┌────────────────────────────┼────────────────────────────┐            │
│       │                            │                            │            │
│  ┌────▼────────┐            ┌──────▼───────┐           ┌───────▼──────┐     │
│  │LLM Routing  │            │  MCP Servers │           │   Skills    │     │
│  │  Engine    │            │  (Browser,   │           │ (TDD,Grill, │     │
│  │            │            │  TaskMaster, │           │ Diagnose,   │     │
│  │            │            │  TMLPD)      │           │  ZoomOut...) │     │
│  └────┬────────┘            └──────┬───────┘           └───────┬──────┘     │
│       │                            │                           │            │
│  ┌────▼────────────────────────────▼───────────────────────────▼──────┐     │
│  │                     50+ API Clients                                 │     │
│  │  OpenAI │ Anthropic │ Gemini │ Groq │ Cerebras │ Ollama │ LMStudio│     │
│  └────────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

- [Why OmniClaw](#-why-omniclaw)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [Features](#-features)
- [Comparison](#-comparison)
- [AI Provider Routing](#-ai-provider-routing)
- [Browser Automation (MCP)](#-browser-automation-mcp)
- [Multi-Language Support](#-multi-language-support)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [When NOT to Use This](#-when-not-to-use-this)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## Why OmniClaw

Built by a growth operator with 10 years at Axis Bank, Groww, and NIRO. Every automation workflow hit the same walls: locked into one AI provider's pricing, rate limits that didn't scale, and tools that didn't talk to each other.

OmniClaw is the orchestration layer that fixes all three.

| Feature | OmniClaw | Single-provider bot | Ad-hoc scripts |
|---------|----------|---------------------|----------------|
| **LLM Providers** | 8+ (OpenAI, Anthropic, Gemini, Groq, Cerebras, Ollama, LM Studio, vLLM) | 1 | 0 |
| **Channels** | Alexa + WhatsApp + Telegram + Web | 1 | 0 |
| **Languages** | 100+ (including Hindi, Bengali, Hinglish) | 1-2 | 0 |
| **Browser Automation** | 18 MCP tools (navigate, click, screenshot, JS eval) | None | Fragile XPaths |
| **Multi-turn Memory** | Persistent session context across turns | None | None |
| **Fallback Chains** | Automatic failover if provider rate-limits | Manual retry | None |
| **Cost Optimization** | Route by task type (cheap models for simple tasks) | No routing | No routing |
| **Production-Ready** | GCP-deployed, rate limiting, input sanitization | Prototype | Prototype |
| **Skills System** | 12 built-in skills (TDD, diagnose, grill-me, etc.) | None | None |
| **MCP Integration** | Browser, TaskMaster AI, TMLPD servers | None | None |
| **Audio Pipeline** | Whisper STT + TTS + wake word detection | None | None |
| **Storage** | Google Drive (rclone), local filesystem | None | None |

---

## Quick Start

### Method 1: Full Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/Das-rebel/omniclaw.git
cd omniclaw

# Install Node.js dependencies (workspaces)
npm install

# Install Python dependencies
pip install -e .

# Copy environment template
cp .env.example .env

# Edit .env with your API keys (see Configuration section)
nano .env

# Run Alexa Skill Handler
npm run alexa

# Run Telegram Bot
npm run telegram

# Run tests
npm test
```

### Method 2: Docker

```bash
# Pull pre-built image
docker pull ghcr.io/das-rebel/omniclaw:latest

# Run with environment file
docker run -it --env-file .env \
  -p 3000:3000 \
  ghcr.io/das-rebel/omniclaw:latest

# Or use docker-compose for full stack
# See docker-compose.yml in repository root
```

### Method 3: Development Mode (No TMLPD)

For local development without TMLPD integration:

```bash
# Start without TMLPD (faster startup)
npm run alexa:dev

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

### Method 4: GCP Cloud Run

```bash
# Set GCP project
gcloud config set project YOUR_PROJECT_ID

# Deploy to Cloud Run
gcloud run deploy omniclaw \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated

# Or use the deployment script
cd infrastructure/gcp
./deploy.sh
```

---

## Architecture

### High-Level System Design

```
                                    ┌─────────────────────────────────────────────┐
                                    │                  USERS                      │
                                    └──────┬──────────┬───────────┬──────────────┘
                                           │          │           │
                          ┌───────────────┼───────────┼───────────┼───────────────┐
                          │               │           │           │               │
                    ┌─────▼─────┐  ┌──────▼───┐ ┌─────▼────┐ ┌───▼────┐        │
                    │   Alexa   │  │ WhatsApp │ │ Telegram │ │  Web   │        │
                    │  Handler  │  │  Bridge  │ │   Bot    │ │  App   │        │
                    └─────┬─────┘  └──────┬───┘ └─────┬────┘ └───┬────┘        │
                          │              │           │           │              │
                          └──────────────┴───────────┴───────────┘              │
                                             │                                  │
                                    ┌────────▼────────────────────────────────────▼┐
                                    │              OmniClaw Core                   │
                                    │          Signal → Plan → Execute → Respond   │
                                    └────────────────┬────────────────────────────┘
                                                     │
                    ┌────────────────────────────────┼────────────────────────────┐
                    │                                │                             │
          ┌─────────▼─────────┐          ┌──────────▼──────────┐        ┌──────────▼──────────┐
          │   LLM Router      │          │   MCP Server Hub    │        │   Skills Engine     │
          │                   │          │                    │        │                    │
          │ • Cost-based      │          │ • Browser (sota)    │        │ • LLM               │
          │ • Latency-aware   │          │ • TaskMaster AI     │        │ • TTS/STT           │
          │ • Task routing    │          │ • TMLPD             │        │ • Translation       │
          │ • Fallback chains │          │ • Memory            │        │ • Search            │
          │ • Rate limit      │          │                    │        │ • Orchestration      │
          └─────────┬─────────┘          └──────────┬──────────┘        └──────────┬──────────┘
                    │                               │                             │
                    └───────────────────────────────┼─────────────────────────────┘
                                                  │
                         ┌────────────────────────┼────────────────────────────────┐
                         │                        │                                 │
               ┌─────────▼─────────┐    ┌────────▼────────┐     ┌─────────▼─────────┐
               │   50+ Clients    │    │   Storage        │     │   Audio Pipeline   │
               │                   │    │                  │     │                   │
               │ OpenAI            │    │ Google Drive     │     │ Whisper STT        │
               │ Anthropic         │    │ (rclone mount)   │     │ TTS (Sarvam/       │
               │ Gemini            │    │ Local filesystem │     │ Google/Amazon)     │
               │ Groq              │    │ Session state    │     │ Wake word detection│
               │ Cerebras          │    │                  │     │                   │
               │ Ollama (local)    │    │                  │     │                   │
               │ LM Studio        │    │                  │     │                   │
               │ vLLM             │    │                  │     │                   │
               └───────────────────┘    └──────────────────┘     └───────────────────┘
```

### Directory Structure

```
omniclaw/
├── apps/                          # User-facing entry points (channel adapters)
│   ├── alexa/                     # 🎙️ Alexa Skill Handler (Node.js)
│   │   ├── alexa_handler.js       # Main handler (with TMLPD)
│   │   ├── alexa_handler_no_tmlpd.js
│   │   ├── alexa_intent_router.js # Intent-based routing
│   │   ├── alexa_response_builder.js
│   │   ├── language/localization.js # Hindi/Bengali/Hinglish
│   │   └── package.json
│   ├── whatsapp/                  # 💬 WhatsApp Bridge (Baileys)
│   │   ├── whatsapp_relay.js
│   │   ├── session_manager.js
│   │   └── message_processor.js
│   ├── telegram/                  # ✈️ Telegram Bot
│   │   ├── telegram_bot.js
│   │   ├── command_handlers.js
│   │   └── inline_query_handler.js
│   └── web/                       # 🌐 Web Interface (Express)
│       ├── web_server.js
│       └── static/
│
├── skills/                        # 🧠 AI Capabilities (Modular skill system)
│   ├── browser/                   # 🌐 Browser Automation (MCP)
│   │   └── sota-browser/          # 18-tool MCP server
│   │       ├── mcp_server.py
│   │       ├── install.sh
│   │       └── tools/
│   │           ├── navigate.py
│   │           ├── click.py
│   │           ├── snapshot.py
│   │           └── ...
│   ├── llm/                       # Multi-provider LLM routing
│   │   ├── router.js              # Cost + latency routing engine
│   │   ├── providers/
│   │   │   ├── openai_client.js
│   │   │   ├── anthropic_client.js
│   │   │   ├── gemini_client.js
│   │   │   ├── groq_client.js
│   │   │   ├── cerebras_client.js
│   │   │   ├── ollama_client.js
│   │   │   ├── lmstudio_client.js
│   │   │   └── vllm_client.js
│   │   └── fallback_chain.js
│   ├── tts/                       # Text-to-Speech
│   │   ├── sarvam_tts.js          # Sarvam AI (India-focused)
│   │   ├── google_tts.js
│   │   └── amazon_polly.js
│   ├── stt/                       # Speech-to-Text
│   │   ├── whisper_stt.js
│   │   └── google_stt.js
│   ├── translate/                 # Translation
│   │   └── translation_service.js
│   ├── search/                    # AI-powered search
│   │   ├── tavily_search.js
│   │   ├── wikipedia_search.js
│   │   └── reddit_search.js
│   ├── memory/                    # Memory systems
│   │   └── session_memory.js
│   └── orchestration/             # Workflow engine
│       ├── pipeline.js            # Signal → Plan → Execute → Respond
│       └── skill_dispatcher.js
│
├── clients/                       # 📡 External API Clients (50+)
│   ├── glm_client.js              # ZhipuAI GLM (China)
│   ├── sarvam_client.js            # Sarvam AI (India)
│   ├── spotify_client.js          # Spotify
│   ├── plex_client.js             # Plex
│   ├── kodi_client.js             # Kodi
│   ├── tavily_client.js           # Tavily AI Search
│   ├── wikipedia_client.js        # Wikipedia
│   └── [40+ more clients]
│
├── services/                      # ⚙️ Backend services
│   ├── api-gateway/               # Rate limiting + routing
│   │   ├── rate_limiter.js
│   │   ├── request_queue.js
│   │   └── api_key_manager.js
│   ├── tunnel/                    # WhatsApp relay tunnel
│   │   ├── omniclaw-tunnel/
│   │   │   ├── tunnel_server.js
│   │   │   └── start_tunnel.sh
│   │   └── ngrok_manager.js
│   └── automation/                # Workflow orchestration
│       ├── workflow_executor.js
│       └── trigger_manager.js
│
├── shared/                        # 🔒 Shared utilities + security
│   ├── security/
│   │   ├── input_sanitizer.js
│   │   ├── rate_limiter.js
│   │   └── api_key_manager.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── config_loader.js
│   │   └── retry_handler.js
│   └── constants/
│       └── intent_definitions.js
│
├── infrastructure/                # ☁️ GCP Deployment
│   ├── gcp/
│   │   ├── cloudrun/
│   │   │   └── Dockerfile
│   │   ├── cloud_build.yaml
│   │   └── deploy.sh
│   └── docker/
│       ├── docker-compose.yml
│       └── Dockerfile
│
├── tests/                         # 🧪 Test suites
│   ├── unit/
│   ├── integration/
│   └── run-tests.js
│
├── package.json                   # Node.js workspace root
├── .env.example                   # Environment template
├── docker-compose.yml             # Full stack Docker
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

### OmniClaw Pipeline: Signal → Plan → Execute → Respond

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              OmniClaw Pipeline                                 │
│                                                                                │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────┐  │
│   │ SIGNAL  │───▶│  PLAN   │───▶│ EXECUTE │───▶│ RESPOND │───▶│  COMPLETE   │  │
│   │         │    │         │    │         │    │         │    │             │  │
│   │ • Parse │    │ • Route │    │ • Call  │    │ • Build │    │ • Log       │  │
│   │   intent│    │   LLM   │    │   API   │    │   voice │    │ • Store     │  │
│   │ • Extract│   │ • Check│    │ • Run   │    │   or    │    │   memory    │  │
│   │   slots │    │   cache │    │   skill │    │   text  │    │ • Cleanup   │  │
│   │ • Lang  │    │ • Fall-│    │ • Check │    │   response│  │             │  │
│   │   detect│    │   back  │    │   rate  │    │         │    │             │  │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### 🤖 AI Provider Orchestration

OmniClaw routes requests across 8+ LLM providers based on cost, latency, and task type. Simple classification tasks use cheap models; complex reasoning uses premium models. Automatic fallback chains ensure reliability.

| Provider | Models | Context | Cost Tier | Latency |
|----------|--------|---------|-----------|---------|
| **OpenAI** | GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo | 128K | $$$$ | ~1-3s |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | 200K | $$$$ | ~1-4s |
| **Gemini** | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash | 1M | $$ | ~0.5-2s |
| **Groq** | Llama 3.3 70B, Mixtral 8x7B, Whisper | - | $ | ~0.2-0.5s |
| **Cerebras** | Llama 3.3 70B, Qwen 2.5 32B | 8K | $ | ~0.3-0.8s |
| **Ollama** | Any GGUF model (local) | 8K | Free | ~0.1-2s |
| **LM Studio** | Any GGUF model (local) | 8K | Free | ~0.1-2s |
| **vLLM** | Any HuggingFace model (self-hosted) | - | Free | ~0.3-2s |

### 🌐 Browser Automation (MCP Protocol)

18 tools for full browser control via Model Context Protocol:

| Tool | Signature | Description |
|------|-----------|-------------|
| `browser_create_session` | `(user_id: string) → Session` | Create isolated browser session |
| `browser_create_tab` | `(session_id, url?) → Tab` | Open new tab (optionally navigate) |
| `browser_navigate` | `(tab_id, url) → void` | Navigate to URL |
| `browser_snapshot` | `(tab_id, screenshot?) → PageTree` | Get DOM tree + element refs + frame info |
| `browser_screenshot` | `(tab_id, full?) → base64` | Capture screenshot (viewport or full-page) |
| `browser_click` | `(tab_id, selector) → void` | Click element by CSS selector |
| `browser_type` | `(tab_id, selector, text) → void` | Type text into input field |
| `browser_press_key` | `(tab_id, key) → void` | Press keyboard key |
| `browser_scroll` | `(tab_id, x, y) → void` | Scroll to position |
| `browser_wait` | `(tab_id, selector, timeout?) → void` | Wait for element to appear |
| `browser_evaluate` | `(tab_id, script, frame_index?) → any` | Execute JavaScript |
| `browser_extract_images` | `(tab_id) → Image[]` | Get all images with src/alt/dims |
| `browser_list_tabs` | `(session_id) → Tab[]` | List all open tabs |
| `browser_close_tab` | `(tab_id) → void` | Close specific tab |
| `browser_close_session` | `(session_id) → void` | End session + all tabs |
| `browser_http_get` | `(url, headers?) → Response` | Direct HTTP GET (no browser) |
| `browser_import_cookies` | `(tab_id, cookies) → void` | Set cookies for authenticated sessions |
| `browser_info` | `() → BrowserStatus` | Get browser state |

### 🗣️ Multi-Language Support

Built for India's vernacular-first customer base:

| Language | TTS | STT | Coverage |
|----------|-----|-----|----------|
| **English** | ✅ | ✅ | 100% |
| **Hindi** | ✅ (Sarvam AI) | ✅ (Sarvam AI) | Native |
| **Bengali** | ✅ (Sarvam AI) | ✅ (Sarvam AI) | Native |
| **Hinglish** | ✅ (Sarvam AI) | ✅ (Sarvam AI) | Native |
| **Tamil** | ✅ | ✅ | Native |
| **Telugu** | ✅ | ✅ | Native |
| **Marathi** | ✅ | ✅ | Native |
| **100+ languages** | ✅ (Google TTS fallback) | ✅ (Google STT fallback) | via API |

### 💬 Multi-Channel Messaging

| Channel | Protocol | Features |
|---------|----------|----------|
| **Alexa Skills** | Alexa Skills Kit (ASK) | Voice, multi-language, in-skill purchasing |
| **WhatsApp** | Baileys (WhatsApp Web) | Message relay, session persistence, media |
| **Telegram** | Telegram Bot API | Commands, inline queries, groups, channels |
| **Web** | Express.js | REST API, webhooks, static serving |

### 🎯 Skills System

12 built-in skills for specialized tasks:

| Skill | Command | Description |
|-------|---------|-------------|
| **Diagnose** | `/diagnose` | Disciplined bug diagnosis: reproduce → minimize → hypothesize → instrument → fix → regression-test |
| **Grill-Me** | `/grill-me` | Relentless interview to resolve every branch of a design decision tree |
| **Grill-With-Docs** | `/grill-with-docs` | Grilling that updates CONTEXT.md and ADRs inline as decisions crystallize |
| **Improve Architecture** | `/improve-codebase-architecture` | Find deepening opportunities, propose refactors for testability and AI-navigability |
| **TDD** | `/tdd` | Test-driven development with vertical tracer-bullet slices, red-green-refactor |
| **To-Issues** | `/to-issues` | Break a plan/PRD into independently-grabbable vertical-slice issues |
| **To-PRD** | `/to-prd` | Turn conversation context into a PRD and publish to issue tracker |
| **Triage** | `/triage` | Move issues through a triage state machine (needs-triage → ready-for-agent) |
| **Write-a-Skill** | `/write-a-skill` | Author new agent skills with proper structure and progressive disclosure |
| **Zoom-Out** | `/zoom-out` | Step up abstraction layer, map relevant modules and callers |
| **Caveman** | `/caveman` | Ultra-compressed communication mode (~75% token reduction) |
| **Vault** | `/vault` | Search personal knowledge vault (bookmarks, tweets, Instagram posts) |

### 📊 MCP Server Integrations

| Server | Protocol | Capabilities |
|--------|----------|--------------|
| **sota-browser** | MCP | 18 browser automation tools |
| **TaskMaster AI** | MCP | Task management, agent deployment |
| **TMLPD** | MCP | Parallel execution, cost tracking, intelligent routing |

### 🔐 Security & Rate Limiting

- **Input sanitization**: XSS/CSRF protection on all user inputs
- **API key management**: Environment-based, never in code
- **Rate limiting**: Per-user, per-endpoint, configurable windows
- **Session isolation**: Each user session is sandboxed
- **Telegram**: Bot token validation, /commands, webhook verification
- **WhatsApp**: Baileys session encryption, QR-code auth

### 🗄️ Storage Options

| Provider | Method | Use Case |
|----------|--------|----------|
| **Google Drive** | rclone mount | 135GB+ shared storage, cross-device |
| **Local filesystem** | Node.js fs | Fast local reads, session state |
| **Session persistence** | JSON files | Cross-request context memory |

---

## Comparison

### OmniClaw vs Other Orchestration Frameworks

| Feature | OmniClaw | LangChain | AutoGen | CrewAI |
|---------|----------|-----------|---------|--------|
| **Channels** | Alexa, WhatsApp, Telegram, Web | None | None | None |
| **Browser automation** | 18 MCP tools (built-in) | Via tool calls | None | None |
| **Multi-language** | 100+ (built-in) | Via adapter | None | None |
| **Local models** | Ollama, LM Studio, vLLM | Via LangServe | Via AutoGen | Via crewAI |
| **Skills system** | 12 built-in skills | Agents | Agents | Agents |
| **India focus** | Hindi/Bengali/Hinglish | None | None | None |
| **Production deploy** | GCP Cloud Run | Manual | Manual | Manual |
| **Rate limiting** | Built-in | Via LangSmith | None | None |
| **Fallback chains** | Automatic | Manual | Manual | Manual |
| **Audio pipeline** | Whisper + TTS | Via adapter | None | None |
| **Cost routing** | Automatic (8+ providers) | Manual | Manual | Manual |
| **Complexity** | Medium | High | High | Medium |
| **Learning curve** | Low | High | High | Medium |

---

## AI Provider Routing

### Routing Decision Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Incoming Request                            │
│                  (intent, context, user_id)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌─────────▼──────────┐
                    │   Task Classifier  │
                    │                    │
                    │ • Classification   │───low_complexity──┐
                    │ • Intent detection │                   │
                    │ • Language ID      │                   │
                    └─────────┬──────────┘                   │
                             │                               │
              ┌──────────────┼──────────────┐                │
              │              │              │                │
    ┌──────────▼──┐   ┌───────▼─────┐  ┌────▼────────────┐  │
    │   Simple    │   │  Medium     │  │    Complex       │  │
    │   Task      │   │  Task       │  │    Task          │  │
    │             │   │             │  │                  │  │
    │ → Groq      │   │ → Gemini    │  │ → OpenAI GPT-4o  │  │
    │ → Cerebras  │   │ → Anthropic │  │ → Anthropic     │  │
    │ → Ollama    │   │   Haiku     │  │   Opus           │  │
    └──────────────┘   └─────────────┘  └──────────────────┘  │
                             │                               │
                    ┌─────────▼──────────────────────────────┐
                    │           Fallback Chain                │
                    │                                          │
                    │  Primary → Secondary → Tertiary → Error │
                    │  (with rate limit + timeout handling)    │
                    └──────────────────────────────────────────┘
                             │
                    ┌────────▼──────────┐
                    │   Response Cache   │ (optional, TTL-based)
                    └────────────────────┘
```

### Configuration Example

```javascript
// skills/llm/router.js - Routing configuration
const ROUTING_RULES = {
  // Simple tasks → cheap, fast models
  classification: {
    providers: ['groq', 'cerebras', 'ollama'],
    model: 'llama-3.3-70b',
    max_cost: 0.001, // $0.001 per call
    max_latency_ms: 500
  },
  
  // Medium tasks → balanced cost/latency
  summarization: {
    providers: ['gemini', 'anthropic-haiku'],
    model: 'gemini-1.5-flash',
    max_cost: 0.01,
    max_latency_ms: 2000
  },
  
  // Complex tasks → premium models
  reasoning: {
    providers: ['openai', 'anthropic'],
    model: 'gpt-4o',
    max_cost: 0.10,
    max_latency_ms: 10000
  },
  
  // Voice tasks → low latency critical
  speech_synthesis: {
    providers: ['sarvam', 'google'],
    model: 'sarvam-mono',
    max_cost: 0.005,
    max_latency_ms: 1000
  }
};
```

---

## Browser Automation (MCP)

### Chrome CDP Mode (Connect to Existing Chrome)

```bash
# 1. Open Chrome with remote debugging enabled
chrome --remote-debugging-port=60807

# 2. Get WebSocket URL from chrome://inspect/#devices
# Example: ws://localhost:60807/devtools/browser/abc123

# 3. Set environment variable
export CHROME_CDP_URL="ws://localhost:60807/devtools/browser/abc123"

# 4. Run MCP browser server
cd skills/browser/sota-browser
./install.sh  # Only needed once
python3 mcp_server.py

# 5. Test connection
curl -X POST http://localhost:3000/api/browser/connect
```

### Headless Chromium Mode (No Existing Chrome)

```bash
# 1. Install headless Chromium
./skills/browser/sota-browser/install.sh

# 2. Run MCP server (auto-launches headless)
cd skills/browser/sota-browser
python3 mcp_server.py

# 3. The server will spawn its own Chromium process
```

### MCP Tool Usage Examples

```javascript
// Navigate and take screenshot
const tabId = await mcp.createTab();
await mcp.navigate(tabId, 'https://news.ycombinator.com');
await mcp.snapshot(tabId);

// Click element and type
await mcp.click(tabId, '.login-btn');
await mcp.type(tabId, '#username', 'myuser');
await mcp.type(tabId, '#password', 'mypass');
await mcp.click(tabId, 'button[type="submit"]');

// Run JavaScript in page context
const title = await mcp.evaluate(tabId, 
  "document.querySelector('h1').textContent"
);

// Get all images from page
const images = await mcp.extractImages(tabId);
console.log(images.map(img => img.src));

// Multi-tab management
const tabs = await mcp.listTabs(sessionId);
await mcp.closeTab(tabs[0].id);
```

---

## Multi-Language Support

### Language Detection & Routing

```
┌─────────────────────────────────────────────────────────────┐
│                    Language Routing                          │
│                                                             │
│  User Input                                                  │
│      │                                                       │
│      ▼                                                       │
│  ┌────────────────┐                                         │
│  │ Detect Language│                                         │
│  │   (50+ langs)  │                                         │
│  └───────┬────────┘                                         │
│          │                                                   │
│    ┌─────┼─────┬────────┬────────┬────────┐                │
│    │     │     │        │        │        │                │
│   English Hindi Bengali Tamil Telugu Others                 │
│    │     │     │        │        │        │                │
│    ▼     ▼     ▼        ▼        ▼        ▼                │
│  ┌────┬────┬───┐      ┌────┬────┐      ┌────┐             │
│  │TTS │TTS │TTS│      │TTS │TTS │      │TTS │             │
│  │en  │hi  │bn │      │ta  │te  │      │..  │             │
│  └──┬─┴──┬─┴──┘      └──┬─┴──┬┘      └──┬─┘             │
│     │    │              │    │           │                 │
│  ┌──▼────▼──┐      ┌───▼────▼──┐  ┌───▼──────┐          │
│  │ Sarvam   │      │  Sarvam    │  │  Google   │          │
│  │  (hi)    │      │  (ta/te)   │  │  (other)  │          │
│  └──────────┘      └───────────┘  └───────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Sarvam AI Configuration (India-focused)

```javascript
// skills/tts/sarvam_tts.js
const SARVAM_CONFIG = {
  api_key: process.env.SARVAM_API_KEY,
  base_url: 'https://api.sarvam.ai',
  
  // Supported languages
  languages: {
    'en': 'english',
    'hi': 'hindi',
    'bn': 'bengali',
    'ta': 'tamil',
    'te': 'telugu',
    'mr': 'marathi',
    'kn': 'kannada',
    'ml': 'malayalam'
  },
  
  // Voice settings per language
  voice_presets: {
    'hi': { voice_id: 'vidya', speed: 1.0, pitch: 0 },
    'bn': { voice_id: 'avi', speed: 1.0, pitch: 0 },
    'ta': { voice_id: 'kumar', speed: 1.0, pitch: 0 }
  }
};
```

---

## Configuration

### Environment Variables

```bash
# =============================================================================
# AI PROVIDERS
# =============================================================================

# OpenAI
OPENAI_API_KEY=sk-...                    # GPT-4o, GPT-4o-mini, GPT-3.5

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...            # Claude 3.5 Sonnet, Claude 3 Opus

# Google Gemini
GEMINI_API_KEY=AIza...                  # Gemini 2.0 Flash, 1.5 Pro

# Groq (fast inference)
GROQ_API_KEY=gsk_...                    # Llama 3.3 70B, Mixtral

# Cerebras (fast inference)
CEREBRAS_API_KEY=cscr_...               # Llama 3.3 70B

# ZhipuAI GLM (China)
GLM_API_KEY=...

# =============================================================================
# REGIONAL AI (INDIA)
# =============================================================================

# Sarvam AI (TTS/STT for Hindi, Bengali, Hinglish)
SARVAM_API_KEY=...

# Google TTS/STT (fallback)
GOOGLE_TTS_API_KEY=...
GOOGLE_STT_API_KEY=...

# =============================================================================
# MESSAGING PLATFORMS
# =============================================================================

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ

# WhatsApp (Baileys session directory)
WHATSAPP_SESSION_DIR=./whatsapp_sessions

# Alexa Skills
ALEXA_APP_ID=amzn1.ask.skill.xxx
ALEXA_SKILL_ID=amzn1.ask.skill.xxx

# =============================================================================
# BROWSER AUTOMATION
# =============================================================================

# Chrome CDP URL (for existing Chrome)
# Format: ws://localhost:60807/devtools/browser/xxx
CHROME_CDP_URL=ws://localhost:60807/devtools/browser/abc123

# Or use headless Chromium (no existing Chrome needed)
USE_HEADLESS_CHROMIUM=true

# =============================================================================
# SEARCH & RESEARCH
# =============================================================================

# Tavily AI (AI-powered search)
TAVILY_API_KEY=tvly-...

# =============================================================================
# STORAGE
# =============================================================================

# Google Drive (rclone mount path)
GDRIVE_MOUNT_PATH=/mnt/gdrive

# Local session storage
SESSION_STORAGE_PATH=./sessions

# =============================================================================
# RATE LIMITING
# =============================================================================

# Telegram rate limit (requests per minute per user)
TELEGRAM_RATE_LIMIT=10

# Global concurrency limit
GLOBAL_CONCURRENCY_MAX=5

# =============================================================================
# SERVER CONFIG
# =============================================================================

# Port for local server
PORT=3000

# GCP Cloud Run (if deployed)
GCP_PROJECT_ID=your-project-id
GCP_REGION=asia-south1

# =============================================================================
# LOGGING
# =============================================================================

LOG_LEVEL=info                          # debug, info, warn, error
LOG_FORMAT=json                         # json, simple
```

---

## Deployment

### GCP Cloud Run

```bash
# 1. Set up GCP project
gcloud config set project YOUR_PROJECT_ID
gcloud config set region asia-south1

# 2. Build and push container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/omniclaw:latest

# 3. Deploy to Cloud Run
gcloud run deploy omniclaw \
  --image gcr.io/YOUR_PROJECT_ID/omniclaw:latest \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --concurrency 80

# 4. Set environment variables in Cloud Run
gcloud run services update omniclaw \
  --set-env-vars "OPENAI_API_KEY=sk-...,ANTHROPIC_API_KEY=sk-ant-..."

# 5. Get service URL
gcloud run services describe omniclaw --format 'value(status.url)'
```

### Docker Compose (Local Production)

```yaml
# docker-compose.yml
version: '3.8'

services:
  omniclaw:
    build:
      context: .
      dockerfile: infrastructure/docker/Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./sessions:/app/sessions
      - ./whatsapp_sessions:/app/whatsapp_sessions
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mcp-browser:
    build:
      context: ./skills/browser/sota-browser
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - CHROME_CDP_URL=${CHROME_CDP_URL}
    volumes:
      - /tmp/chromium:/tmp/chromium
    restart: unless-stopped

networks:
  default:
    name: omniclaw-network
```

### WhatsApp Tunnel (Production)

```bash
# Start WhatsApp tunnel service
cd services/tunnel/omniclaw-tunnel

# Start ngrok tunnel (or use your own domain)
./start_tunnel.sh

# This exposes WhatsApp webhook to your server
# Configure webhook URL in Baileys config
```

---

## API Reference

### Telegram Bot Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Start bot, show welcome message | `/start` |
| `/help` | Show help and available commands | `/help` |
| `/status` | Check bot and service status | `/status` |
| `/search <query>` | Search with AI routing | `/search latest AI news` |
| `/translate <text>` | Translate between languages | `/translate hello in hindi` |
| `/tts <text>` | Text-to-speech synthesis | `/tts hello in hindi` |

### REST Endpoints (Web Interface)

| Method | Endpoint | Description | Request Body |
|--------|----------|-------------|--------------|
| `POST` | `/api/chat` | Send message to LLM | `{ text, user_id, channel }` |
| `POST` | `/api/tts` | Text-to-speech | `{ text, language, voice }` |
| `POST` | `/api/stt` | Speech-to-text | `{ audio_url, language }` |
| `GET` | `/api/health` | Health check | - |
| `GET` | `/api/status` | Service status | - |
| `POST` | `/api/browser/connect` | Connect browser | `{ cdp_url }` |
| `POST` | `/api/browser/navigate` | Navigate URL | `{ tab_id, url }` |

### Alexa Intent Schema

```json
{
  "intents": [
    {
      "name": "ChatIntent",
      "slots": [
        { "name": "Message", "type": "AMAZON.SearchQuery" }
      ]
    },
    {
      "name": "TranslateIntent",
      "slots": [
        { "name": "Text", "type": "AMAZON.SearchQuery" },
        { "name": "Language", "type": "AMAZON.SearchQuery" }
      ]
    },
    {
      "name": "SearchIntent",
      "slots": [
        { "name": "Query", "type": "AMAZON.SearchQuery" }
      ]
    }
  ]
}
```

---

## When NOT to Use This

OmniClaw is a general-purpose orchestration layer. Consider alternatives in these scenarios:

| Scenario | Consider Instead | Reason |
|----------|-----------------|--------|
| **Single-channel bot only** | python-telegram-bot, whatsapp-web.js | OmniClaw is overkill for a single channel |
| **No multi-provider routing needed** | Direct OpenAI/Anthropic SDK calls | Adds unnecessary complexity |
| **Pure conversational AI** | Vercel AI SDK, LangChain | More focused on LLM chains |
| **Embedded/bot-specific framework** | Botpress, Flowise | Those are no-code; OmniClaw is code-first |
| **Very low latency critical** | Custom WebSocket with single provider | Routing adds ~50-100ms |
| **No multi-language needed** | english-only bot | Overhead for language detection/routing |
| **Hosted bot platform** | Chatbot.com, Intercom | No-code solutions if you don't need code |
| **Simple webhook relay** | Zapier, Make | No-code automation if no custom logic |

---

## Roadmap

### v2.0 (Next)
- [ ] Mobile app integration (iOS, Android)
- [ ] Discord support
- [ ] Advanced agent memory with vector store

### v2.1
- [ ] Slack integration
- [ ] Multi-region fallback for reliability

### v2.2
- [ ] Signal/Threema support
- [ ] Enterprise SSO (OAuth, SAML)

### v2.3
- [ ] Multimodal orchestration (image + audio + text)
- [ ] Real-time collaboration features

### v2.4
- [ ] Plugin marketplace
- [ ] Third-party skill marketplace

---

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/omniclaw.git
cd omniclaw

# Add upstream remote
git remote add upstream https://github.com/Das-rebel/omniclaw.git

# Create feature branch
git checkout -b feature/amazing-feature

# Install dependencies
npm install

# Run in development mode
npm run alexa:dev

# Run tests
npm test

# Push to your fork
git push origin feature/amazing-feature

# Open Pull Request against upstream main
```

### Code Style

- Use **ESLint** for JavaScript linting
- Use **Prettier** for code formatting
- Write **unit tests** for new features
- Update **documentation** for API changes

### Reporting Bugs

1. Check existing issues
2. Create minimal reproduction case
3. Include environment details (Node.js version, OS, etc.)
4. Submit issue with `bug` label

---

## License

MIT License - See [LICENSE](LICENSE)

---

## Project Stats

| Metric | Value |
|--------|-------|
| **Files** | 353+ |
| **LLM Providers** | 8+ |
| **External Clients** | 50+ |
| **Browser Tools** | 18 |
| **Languages Supported** | 100+ |
| **Platforms** | Alexa, WhatsApp, Telegram, Web |
| **Skills** | 12 |
| **MCP Servers** | 3 |
| **Node.js Version** | ≥ 18.0.0 |

---

## Links

- **GitHub**: [github.com/Das-rebel/omniclaw](https://github.com/Das-rebel/omniclaw)
- **Issues**: [GitHub Issues](https://github.com/Das-rebel/omniclaw/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Das-rebel/omniclaw/discussions)
- **Telegram Bot**: [t.me/Dasomni_bot](https://t.me/Dasomni_bot)
- **Production URL**: [dasomni-bot-338789220059.asia-south1.run.app](https://dasomni-bot-338789220059.asia-south1.run.app)

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