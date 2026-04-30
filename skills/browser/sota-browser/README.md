# SOTA Browser MCP Server

A comprehensive browser automation MCP server combining the best features from:
- **browser-harness**: Self-healing CDP-based browser control
- **camofox-browser**: Anti-detection with fingerprint spoofing
- **Scrapling**: Adaptive web scraping with element relocalization

## Features

### Browser Control
- CDP-based browser automation via Playwright
- Isolated browser sessions per user
- Stable element refs (e1, e2, e3...) for reliable interaction
- Accessibility tree snapshots (~90% smaller than raw HTML)

### Anti-Detection
- Removes `webdriver` automation indicators
- Spoofs hardware concurrency and device memory
- Randomizes canvas fingerprints
- WebGL renderer spoofing
- Configurable user agent and locale

### Scraping Integration
- Scrapling adapter for adaptive parsing
- Handles JavaScript-heavy sites
- Network idle detection
- Proxy support

## Installation

```bash
cd ~/mcp-browser
./install.sh
```

## Usage

### Mode 1: MCP Stdio (for PI)

```bash
source venv/bin/activate
python3 mcp_server.py
```

Configure in PI's MCP settings:
```json
{
  "mcpServers": {
    "sota-browser": {
      "command": "python3",
      "args": ["/Users/Subho/mcp-browser/mcp_server.py"]
    }
  }
}
```

### Mode 2: HTTP Server (for cloud/remote)

```bash
source venv/bin/activate
python3 -m uvicorn src.server:app --host 0.0.0.0 --port 9377
```

## Available Tools

| Tool | Description |
|------|-------------|
| `browser_create_session` | Create isolated browser session |
| `browser_create_tab` | Create new tab in session |
| `browser_navigate` | Navigate to URL |
| `browser_snapshot` | Get accessibility tree with element refs |
| `browser_click` | Click by selector/ref/coordinates |
| `browser_type` | Type text into element |
| `browser_scroll` | Scroll page |
| `browser_screenshot` | Take screenshot |
| `browser_evaluate` | Execute JavaScript |
| `browser_list_tabs` | List open tabs |
| `browser_close_tab` | Close tab |
| `browser_import_cookies` | Import cookies for auth |
| `browser_close_session` | Close session and all tabs |
| `browser_fetch` | Fetch URL with Scrapling |
| `browser_extract` | Extract structured data |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_BROWSER_HOST` | `http://localhost:9377` | HTTP server URL |
| `MCP_BROWSER_API_KEY` | (none) | API key for auth |
| `MCP_BROWSER_PORT` | `9377` | Server port |
| `BH_DEBUG_CLICKS` | `false` | Show click overlays |
| `CAMOFOX_API_KEY` | (none) | Alternative API key name |

## API Endpoints (HTTP mode)

### Sessions
- `POST /sessions` - Create session
- `GET /sessions` - List sessions
- `GET /sessions/{id}` - Get session
- `DELETE /sessions/{id}` - Delete session

### Tabs
- `POST /sessions/{id}/tabs` - Create tab
- `GET /sessions/{id}/tabs` - List tabs
- `POST /sessions/{id}/tabs/{tab}/navigate` - Navigate
- `GET /sessions/{id}/tabs/{tab}/snapshot` - Get snapshot
- `POST /sessions/{id}/tabs/{tab}/click` - Click
- `POST /sessions/{id}/tabs/{tab}/type` - Type
- `POST /sessions/{id}/tabs/{tab}/scroll` - Scroll
- `GET /sessions/{id}/tabs/{tab}/screenshot` - Screenshot
- `DELETE /sessions/{id}/tabs/{tab}` - Close tab

### Scraping
- `POST /fetch` - Fetch URL
- `POST /extract` - Extract structured data

## Example Workflow

```python
from mcp_client import BrowserMCPClient

async def demo():
    client = BrowserMCPClient()
    
    # Create session
    session = await client.create_session(user_id="test")
    
    # Create tab and navigate
    tab = await client.create_tab(session_id=session["id"])
    await client.navigate(session_id=session["id"], tab_id=tab["id"], url="https://example.com")
    
    # Get page snapshot
    snapshot = await client.snapshot(session_id=session["id"], tab_id=tab["id"])
    print(f"Found {len(snapshot['elements'])} elements")
    
    # Click e5 (5th interactive element)
    await client.click(session_id=session["id"], tab_id=tab["id"], ref="e5")
    
    # Type into search field
    await client.type_text(session_id=session["id"], tab_id=tab["id"], 
                          text="search query", ref="e3")
    
    # Clean up
    await client.close_session(session["id"])
```

## Local vs Cloud

### Local Usage (PI)
- Run `mcp_server.py` as stdio process
- PI spawns the server and communicates via JSON-RPC

### Cloud Usage (Remote API)
- Deploy HTTP server on cloud infrastructure
- Use REST API with Bearer token auth
- Supports horizontal scaling with session affinity

## Security

- API key authentication via `X-API-Key` header
- Cookie import restricted to logged-in sessions
- Proxy support for IP rotation
- Session isolation between users

## License

MIT