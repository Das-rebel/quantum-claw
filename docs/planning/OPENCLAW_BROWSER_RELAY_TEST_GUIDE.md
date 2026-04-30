# OpenClaw Browser Relay - Complete Testing Guide

## 🔍 Current Status

### What's Working ✅
- **CDP Relay Server**: Running on port 18792 (PID 1377)
  - HTTP endpoint: http://127.0.0.1:18792/ → Returns "OK"
  - WebSocket endpoint: ws://127.0.0.1:18792/extension → Responds with ping/pong
- **TMLPD Service**: Running on port 8765 (http://127.0.0.1:8765)
- **OpenClaw CLI**: Configured with multiple AI agents
- **OpenClaw Extension**: Located at `~/openclaw/browser/chrome-extension/`

### What Needs Testing 🔍
- Extension loading in Brave Browser
- Extension configuration (port setting)
- Extension connection to relay server
- Browser control via OpenClaw CLI

---

## 🚀 Step-by-Step Testing Guide

### Step 1: Load OpenClaw Extension in Brave

1. **Open Brave Browser**
2. **Navigate to:** `brave://extensions`
3. **Enable Developer Mode:**
   - Toggle "Developer mode" switch (top right)
4. **Load Unpacked Extension:**
   - Click "Load unpacked" button (top left)
   - Navigate to: `~/openclaw/browser/chrome-extension/`
   - Click "Select" or "Open"

**Expected Result:**
- Extension appears in list with name: "OpenClaw Browser Relay"
- Extension ID displayed
- Version: 0.1.0

### Step 2: Configure Extension Port

1. **Click "Details" on OpenClaw Browser Relay extension**
2. **Click "Extension options" link** (or click extension icon)
3. **Verify Port Setting:**
   - Should show: `18792` (default)
   - If different, update to: `18792`
4. **Click "Save"** (if available)
5. **Check Status:**
   - Should show: "Relay reachable at http://127.0.0.1:18792/"
   - If shows error, the relay server isn't running

**Expected Result:**
- Green status indicating relay is reachable
- Port is set to 18792

### Step 3: Test Extension Connection

1. **Open a new tab in Brave**
2. **Navigate to any website:** (e.g., https://www.example.com)
3. **Click OpenClaw extension icon** (toolbar button)
4. **Check Badge:**
   - Should show: "ON" (orange color)
   - Badge text: "ON"
5. **Hover over extension icon:**
   - Tooltip should show: "OpenClaw Browser Relay: attached (click to detach)"

**Expected Result:**
- Extension connects successfully
- Badge shows "ON"
- Tab is attached to CDP relay

### Step 4: Verify Relay Connection

1. **Open Developer Console in Brave:**
   - Right-click → Inspect
   - Switch to "Console" tab
2. **Check for connection messages:**
   - Should see WebSocket connection logs
   - No error messages about relay connection

**Expected Result:**
- Console shows successful WebSocket connection
- No "Relay not reachable" errors
- Extension status is "connected"

### Step 5: Test Browser Control via OpenClaw CLI

1. **Open Terminal**
2. **Navigate to OpenClaw directory:**
   ```bash
   cd ~/openclaw
   ```
3. **Check available agents:**
   ```bash
   openclaw
   ```
4. **Test browser control:**
   ```bash
   openclaw --agent treequest
   ```
5. **Ask AI to control browser:**
   ```
   "Navigate to https://www.google.com and search for 'OpenClaw browser relay'"
   ```

**Expected Result:**
- OpenClaw CLI connects to CDP relay
- Browser navigates to Google
- Search query is executed
- Results page loads

---

## 🔧 Troubleshooting

### Extension Not Loading

**Problem:** Extension doesn't appear in brave://extensions

**Solution:**
1. Verify directory path: `~/openclaw/browser/chrome-extension/`
2. Check files exist:
   ```bash
   ls -la ~/openclaw/browser/chrome-extension/
   ```
   Should show: manifest.json, background.js, options.js, options.html

**Files Required:**
- `manifest.json` - Extension manifest
- `background.js` - Service worker
- `options.js` - Options page logic
- `options.html` - Options page UI
- `icons/` - Extension icons

### Extension Shows "Connecting..." Forever

**Problem:** Badge shows "…" (connecting) but never connects

**Solution 1:** Check relay server
```bash
# Verify server is running
lsof -i :18792

# Test HTTP endpoint
curl http://127.0.0.1:18792/

# Test WebSocket
python3 -c "
import asyncio, websockets
asyncio.run(websockets.connect('ws://127.0.0.1:18792/extension'))
"
```

**Solution 2:** Check extension port setting
1. Click extension icon → Options
2. Verify port is `18792`
3. If different, update to `18792` and save

**Solution 3:** Reload extension
1. Navigate to `brave://extensions`
2. Click reload icon (↻) on OpenClaw extension
3. Try connecting again

### Extension Shows "Relay not reachable"

**Problem:** Extension options page shows error about relay

**Solution 1:** Start relay server
```bash
# The relay should be running already (PID 1377)
# Check if it's still running:
ps aux | grep openclaw-gateway

# If not running, start it:
cd ~/openclaw && openclaw-gateway
```

**Solution 2:** Check firewall
```bash
# Verify localhost connections aren't blocked
# macOS: System Preferences → Security → Firewall
# Ensure incoming connections to localhost are allowed
```

### WebSocket Connection Fails

**Problem:** HTTP preflight works but WebSocket fails

**Solution 1:** Check Brave extensions permissions
1. Navigate to `brave://extensions`
2. Click "Details" on OpenClaw
3. Verify permissions:
   - ✅ Debugger
   - ✅ Tabs
   - ✅ Active Tab
   - ✅ Storage
   - ✅ Host permissions: http://127.0.0.1/*, http://localhost/*

**Solution 2:** Check for extension conflicts
```bash
# Disable other extensions that might interfere
# Navigate to brave://extensions
# Toggle off: Simplify Copilot, other dev tools extensions
```

---

## 🧪 Quick Test Script

Save this as `test_browser_relay.py`:

```python
#!/usr/bin/env python3
"""
Quick test script for OpenClaw Browser Relay
"""

import asyncio
import websockets
import json
import requests
import subprocess

async def test_websocket():
    """Test WebSocket connection"""
    print("\n1️⃣ Testing WebSocket Connection...")
    try:
        async with websockets.connect('ws://127.0.0.1:18792/extension') as ws:
            print("   ✅ WebSocket connected")

            # Send ping
            await ws.send(json.dumps({'method': 'test', 'params': {}}))
            print("   📤 Sent test message")

            # Receive response
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f"   📥 Received: {response}")

            return True
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return False

def test_http():
    """Test HTTP endpoint"""
    print("\n2️⃣ Testing HTTP Endpoint...")
    try:
        response = requests.get('http://127.0.0.1:18792/', timeout=2)
        print(f"   ✅ HTTP Status: {response.status_code}")
        print(f"   ✅ Response: {response.text.strip()}")
        return response.status_code == 200
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return False

def test_relay_process():
    """Check if relay process is running"""
    print("\n3️⃣ Checking Relay Process...")
    try:
        result = subprocess.run(
            ['lsof', '-i', ':18792'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("   ✅ Relay server is running on port 18792")
            print(f"   📊 Process info:\n{result.stdout}")
            return True
        else:
            print("   ❌ No process found on port 18792")
            return False
    except Exception as e:
        print(f"   ❌ Failed to check: {e}")
        return False

def test_tmlpd():
    """Test TMLPD service"""
    print("\n4️⃣ Testing TMLPD Service...")
    try:
        response = requests.get('http://127.0.0.1:8765/', timeout=2)
        print(f"   ✅ TMLPD Status: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return False

async def main():
    print("="*70)
    print("🧪 OPENCLAW BROWSER RELAY - COMPREHENSIVE TEST")
    print("="*70)

    results = []

    # Test relay process
    results.append(("Relay Process", test_relay_process()))

    # Test HTTP endpoint
    results.append(("HTTP Endpoint", test_http()))

    # Test WebSocket connection
    results.append(("WebSocket Connection", await test_websocket()))

    # Test TMLPD
    results.append(("TMLPD Service", test_tmlpd()))

    # Summary
    print("\n" + "="*70)
    print("📊 TEST SUMMARY")
    print("="*70)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")

    all_passed = all(result for _, result in results)
    print("\n" + "="*70)
    if all_passed:
        print("🎉 ALL TESTS PASSED! Browser relay is ready to use.")
    else:
        print("⚠️  SOME TESTS FAILED. Check troubleshooting section.")
    print("="*70)

if __name__ == '__main__':
    asyncio.run(main())
```

Run the test:
```bash
python3 test_browser_relay.py
```

---

## 📋 Pre-Flight Checklist

Before using OpenClaw browser relay, ensure:

- [ ] **Relay server running:** `lsof -i :18792` shows process
- [ ] **HTTP endpoint responding:** `curl http://127.0.0.1:18792/` returns "OK"
- [ ] **WebSocket accessible:** Python test script connects successfully
- [ ] **Extension loaded in Brave:** Visible in brave://extensions
- [ ] **Extension port configured:** Set to 18792 in extension options
- [ ] **Extension shows "connected":** Badge shows "ON" when clicked
- [ ] **Brave has debugger permission:** Extension has "debugger" permission

---

## 🎯 Using OpenClaw for Browser Automation

### Cloud Platform Form Filling

```bash
cd ~/openclaw

# Use TreeQuest AI agent
openclaw --agent treequest
```

Then ask TreeQuest:
```
"Help me fill out this cloud platform form. The form is at [URL].
My details are: name, email, phone, company, etc."
```

### Browser Navigation & Control

```bash
# Open OpenClaw with TreeQuest agent
openclaw --agent treequest

# Ask to navigate
"Navigate to https://www.linkedin.com/jobs and search for senior software engineer roles"

# Ask to extract data
"Extract all job listings from this page and show me a summary"

# Ask to interact with page
"Click on the first job posting and extract the job description"
```

### Data Extraction from Any Website

```bash
openclaw --agent treequest

"Extract all product information from this e-commerce page: name, price, rating"
```

### Intelligent Analysis

```bash
openclaw --agent treequest

"Analyze this job posting and tell me if it matches my criteria:
- Senior role (5+ years)
- Remote work
- Salary >$150k
- Python/JavaScript stack
"
```

---

## 🔗 Quick Reference

### OpenClaw Commands

```bash
# Main OpenClaw CLI
openclaw                    # Interactive mode
openclaw --agent treequest   # Use specific agent
openclaw --help              # Show all options

# Start CDP relay manually (if not auto-started)
cd ~/openclaw
openclaw-gateway            # Starts relay on port 18792
```

### Extension Control

- **Click extension icon** → Attach/detach from current tab
- **Badge "ON"** → Connected and ready for control
- **Badge "…"** → Connecting to relay
- **Badge "!"** → Error or not reachable
- **Extension options** → Configure port, test connection

### Debugging

```bash
# Check relay logs
ps aux | grep openclaw-gateway

# Check extension logs
# Open Brave → Right-click → Inspect → Console

# Test WebSocket manually
python3 -c "
import asyncio, websockets
asyncio.run(websockets.connect('ws://127.0.0.1:18792/extension'))
"
```

---

## ✅ Success Indicators

When everything is working:

1. **Relay Server:** ✅ Running on port 18792
2. **HTTP Test:** ✅ `curl http://127.0.0.1:18792/` returns "OK"
3. **WebSocket Test:** ✅ Python script connects and receives ping
4. **Extension Status:** ✅ Badge shows "ON" (orange)
5. **Extension Tooltip:** ✅ "OpenClaw Browser Relay: attached"
6. **Browser Control:** ✅ OpenClaw CLI can navigate, click, extract
7. **AI Integration:** ✅ TreeQuest/other agents respond intelligently

---

## 📚 Next Steps After Testing

Once browser relay is working:

1. **Test with real websites:**
   - LinkedIn job applications
   - Workday forms
   - Cloud platform dashboards

2. **Create automation scripts:**
   - Daily job search and apply
   - Form filling workflows
   - Data extraction routines

3. **Integrate with TMLPD:**
   - Use intelligent routing for complex tasks
   - Leverage multiple AI agents
   - Optimize cost and speed

---

**Created:** 2026-02-18
**Status:** Ready for end-to-end testing
**Next Action:** Load extension in Brave and follow Step-by-Step Testing Guide
