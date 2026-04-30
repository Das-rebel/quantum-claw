# SOTA Browser MCP Server - Changelog

## v1.1.0 (2026-04-30) - Integrated into omniclaw-personal-assistant

### Performance Improvements
- Reduced default viewport from 1920x1080 to 1280x720 for faster rendering
- Reduced default timeouts from 30s to 10s
- Optimized DOM tree parsing script (max 200 elements vs 500)
- Reduced HTTP response content truncation from 50KB to 30KB
- Simplified stealth script to single-line injection

### Chrome CDP Support
Added ability to connect to existing Chrome browser via CDP (Chrome DevTools Protocol):
- Set `CHROME_CDP_URL` environment variable with Chrome's WebSocket URL
- Example: `ws://localhost:60807/devtools/browser/xxx`
- Auto-detects and connects to existing Chrome if URL is set
- Falls back to local browser if CDP fails

### Bug Fixes
- Fixed timeout handling in request tracking
- Fixed promise resolution that was clearing timer before it could trigger
- Added proper cleanup of pending requests when server closes
- Improved error messages for better debugging

### Helper Script
Added `use-chrome-cdp.sh` for easy Chrome CDP mode:
```bash
cd ~/omniclaw-personal-assistant/sota-browser
./use-chrome-cdp.sh -p "your prompt"
```

### Integration with omniclaw
This module is part of omniclaw-personal-assistant and provides:
- 18 browser automation tools via MCP protocol
- Local headless Chromium support
- Chrome CDP mode for reusing existing Chrome sessions
- Session and tab management

## v1.0.0 (Earlier)
- Initial release with 18 browser automation tools
- Local headless Chromium support
- Session and tab management
