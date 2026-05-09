# FormFiller Pro — Universal Job Application Autofill

A Chrome extension (Manifest V3) and Playwright module that fills any job application form automatically. Pure rule-based matching — **no LLM needed**.

## Features

- ✅ **Works on ANY form** — not limited to pre-mapped ATS platforms
- ✅ **Platform detection** — Greenhouse, Lever, Workday, iCIMS, Jobvite, SmartRecruiters, Google Forms
- ✅ **React Select support** — Full pointer event sequence for custom dropdowns
- ✅ **Portal-aware** — Finds React-Select menus portaled to `<body>`
- ✅ **React-compatible** — Native value setter + `input`/`change`/`blur` events
- ✅ **Profile storage** — Save once, fill everywhere via `chrome.storage`
- ✅ **Standalone mode** — Use without extension via `window.formFillerPro` API
- ✅ **Badge notification** — Shows 📋 badge on ATS pages
- ✅ **Side panel** — Profile management alongside the form

## Installation

### Chrome Extension (Manual Load)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `form-filler-extension/` folder

### Playwright Module (Python)

```python
from form_engine import ResumeParser, FormScanner, FormFiller

# Parse resume
parser = ResumeParser()
profile = await parser.parse(resume_text)

# Scan + fill
scanner = FormScanner()
scan_result = await scanner.scan(page)

filler = FormFiller()
fill_result = await filler.fill(page, scan_result, profile)
```

### Standalone JS (inject into any page)

```javascript
// Inject content.js, then use the API
const fields = window.formFillerPro.scanFields();
const result = await window.formFillerPro.autofill(profileData);
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   popup.js       │────▶│   background.js   │────▶│   content.js     │
│  (Profile UI)    │     │  (Service Worker) │     │  (Scanner+Filler)│
│                  │     │                   │     │                  │
│  - Profile form  │     │  - Badge updates  │     │  - Field detect  │
│  - Scan button   │     │  - Profile store  │     │  - Label match   │
│  - Autofill btn  │     │  - Message route  │     │  - React Select  │
│                  │     │                   │     │  - Value setter  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
         │                       │                        │
         └─────────── chrome.storage.local ───────────────┘
                            (Profile data)
```

## Matching Strategy

Priority order for each field:

1. **CSS Selectors** — 45 semantic types × 179 selectors tried in order
2. **Label matching** — 28 types × text-based label search
3. **ID/name heuristics** — Pattern matching on `id` and `name` attributes
4. **Type-based** — `type="email"` → email, `type="tel"` → phone

## React Select Handling

Custom dropdowns (Greenhouse, etc.) require special handling:

```javascript
// Full pointer event sequence
control.dispatchEvent(new PointerEvent('pointerdown', {...}));
control.dispatchEvent(new MouseEvent('mousedown', {...}));
control.dispatchEvent(new PointerEvent('pointerup', {...}));
control.dispatchEvent(new MouseEvent('mouseup', {...}));
control.dispatchEvent(new MouseEvent('click', {...}));

// Wait for portal menu to open
await sleep(500);

// Search in document.body (React portals)
const options = document.body.querySelectorAll('[role="option"]');
```

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Manifest V3 config |
| `content.js` | Scanner + filler (runs on every page) |
| `background.js` | Service worker (badge, storage, messaging) |
| `popup/index.html` | Popup UI (profile + scan + fill) |
| `popup/popup.js` | Popup logic |
| `popup/sidepanel.html` | Side panel version |

## Test Results

Tested against **live Greenhouse form** (Razorpay job application):

| Metric | Result |
|--------|--------|
| Fields scanned | 28 |
| Fields filled | **22** |
| Fields skipped | 6 |
| Errors | **0** |
| React Select filled | **5/5** ✅ |
| Text fields verified | **16/16** ✅ |

## Related

- `../sota-browser/form_engine.py` — Python equivalent (Playwright-based)
- `../sota-browser/mcp_server.py` — MCP tools for browser automation

## Workday (Visa) — Test Results

### Architecture Discovery

Workday is a **6-step multi-page application** with unique patterns:

| Step | Page | Fields | Status |
|------|------|--------|--------|
| 1 | Create Account | 4 (email, password×2, consent) | ✅ All filled |
| 2 | My Information | ~20 (name, address, phone, etc.) | 🔒 Behind account wall |
| 3 | My Experience | ~15 (resume, work history) | 🔒 Behind account wall |
| 4 | Application Questions | ~10 (custom questions) | 🔒 Behind account wall |
| 5 | Voluntary Disclosures | ~5 (EEO, gender, race) | 🔒 Behind account wall |
| 6 | Review | 0 (summary page) | 🔒 Behind account wall |

### Workday-Specific Patterns

- **`data-automation-id`** attributes on all elements (e.g., `email`, `password`, `createAccountSubmitButton`)
- **Overlay interceptor**: `<div data-automation-id="click_filter">` blocks pointer events on buttons — must use `force: true` or JS click
- **Account creation required**: Cannot advance to Step 2 without valid email verification
- **No CAPTCHA** on Step 1, but server-side email validation blocks automation
- **`beecatcher` hidden input**: Anti-bot honeypot field (should remain empty)

### Step 1 Results

| Field | Selector | Value | Status |
|-------|----------|-------|--------|
| Email | `[data-automation-id="email"]` | rahul.sharma.prog@gmail.com | ✅ |
| Password | `[data-automation-id="password"]` | RahulSharma2026!X | ✅ |
| Verify Password | `[data-automation-id="verifyPassword"]` | RahulSharma2026!X | ✅ |
| Consent | `[data-automation-id="createAccountCheckbox"]` | ☑ | ✅ |
| Honeypot | `[data-automation-id="beecatcher"]` | (empty — correct) | ✅ |

### Why We Can't Test Steps 2-6

Workday requires:
1. Valid email address (sends verification link)
2. Password meeting complexity requirements (alphabetic + numeric + special + 8+ chars)
3. Cookie consent acceptance
4. Server-side account creation before advancing

**For real-world use**, the extension would fill Step 1, user verifies email, then the extension fills Steps 2-6 automatically on subsequent page loads.
