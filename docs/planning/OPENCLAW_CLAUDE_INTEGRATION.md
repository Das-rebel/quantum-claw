# OpenClaw + Claude Code Integration Guide

## 🎯 Purpose

Enable OpenClaw relay to allow Claude Code to:
1. ✅ Autofill cloud platform forms (LinkedIn, Workday, Greenhouse, etc.)
2. ✅ Automate browser workflows (navigate, scroll, click, extract data)
3. ✅ Extract content from web pages dynamically
4. ✅ Respond intelligently based on page context
5. ✅ Execute browser commands on your behalf

---

## 📋 Enable Relay in Extension

### Step 1: Open Extension Updater

```bash
python3 /Users/Subho/update_extension_relay.py
```

### Step 2: Enable Relay & Configure Gateway

**Select: 4 (Update Relay Settings)**

**Enter this configuration:**
```json
{
  "relay_enabled": true,
  "relay_url": "ws://localhost:18789",
  "auto_fill_enabled": true,
  "tracking_enabled": true,
  "claude_integration": {
    "enabled": true,
    "command_endpoint": "/command",
    "autofill_endpoint": "/autofill",
    "extract_endpoint": "/extract"
    "analyze_endpoint": "/analyze"
    "automation_endpoint": "/automation"
  },
  "cloud_platforms": {
    "linkedin": {
      "enabled": true,
      "url_patterns": [
        "*://www.linkedin.com/*",
        "*://linkedin.com/*",
        "*://jobs.linkedin.com/*"
      ],
      "selectors": {
        "name": "input[name*='firstName']",
        "email": "input[name*='email']",
        "phone": "input[name*='phone']",
        "company": "input[name*='company']"
      }
    },
    "workday": {
      "enabled": true,
      "url_patterns": [
        "*://myworkdayjobs.com/*",
        "*://workday.com/*"
      ],
      "selectors": {
        "name": "input[name*='candidateFirstName']",
        "email": "input[name*='email']",
        "phone": "input[name*='phoneNumber']"
      }
    },
    "greenhouse": {
      "enabled": true,
      "url_patterns": [
        "*://boards.greenhouse.io/*",
        "*://my.greenhouse.io/*"
      ]
    },
    "general": {
      "enabled": true,
      "url_patterns": ["*://*"],
      "auto_fill_all": true
    }
  }
}
```

**Select: 9 (Save & Reload)**

---

## 🚀 How Claude Code Helps You

### 1. Cloud Platform Form Autofill

**Supported Platforms:**
- ✅ LinkedIn (49 ATS configs)
- ✅ Workday (ATS configured)
- ✅ Greenhouse (ATS configured)
- ✅ General forms (auto-detect any form)

**How it works:**
1. Extension detects cloud platform URL
2. Matches to configured selectors
3. Claude Code analyzes form structure via extension relay
4. Extension receives autofill data
5. Browser automatically fills detected fields

**Example: LinkedIn Profile Update**
```
You: "Update my LinkedIn profile with new skills"
Claude: "Analyzing LinkedIn profile form... detected 12 fields including skills section"
Extension: Fills profile update form with new skills
Claude: "Found 5 skills to add. Autofilling..."
Extension: ✅ Profile updated successfully
```

---

### 2. Browser Automation

**Available Commands:**
```json
{
  "action": "navigate",
  "url": "https://example.com",
  "target": "div.job-card"
  "wait": 5000
  "scroll_to": "bottom"
}
```

**How it works:**
1. Claude Code analyzes page via extension
2. Determines optimal navigation strategy
3. Extension executes browser commands
4. Reports back results

**Example: Navigate to specific section**
```
You: "Scroll down to the job descriptions section on this page"
Claude: "Analyzing page... found 15 job listings. Scrolling to job-card-123..."
Extension: Scrolls smoothly and highlights job card #123
Extension: ✅ Scrolled to target, waiting for next command
```

---

### 3. Data Extraction

**Extraction Types:**
- Text content extraction
- Image extraction
- Table data extraction
- JSON data parsing
- Form field values

**How it works:**
1. Extension captures page content
2. Claude Code analyzes via relay
3. Claude identifies data patterns and structure
4. Extension extracts data based on patterns

**Example: Extract LinkedIn job data**
```
You: "Extract all job listings from this LinkedIn search results page"
Claude: "Analyzing job listings page structure... found 25 jobs in list format"
Extension: Captures all 25 job entries
Claude: "Job #1: Software Engineer at ABC Corp - $150k/year. Job #2: Data Scientist at XYZ Inc -..."
Extension: ✅ Extracted 25 jobs with full details ready for processing"
```

---

### 4. Intelligent Analysis

**Claude Code can:**
- Analyze page content and context
- Extract key information (company, role, salary, location)
- Match job requirements against your preferences
- Provide recommendations (apply, skip, negotiate)
- Summarize findings in natural language

**Example: Job Opportunity Analysis**
```
You: "Tell me about this software engineering role at Google"
Claude: "Analyzing role requirements... found 7 years experience required, prefer Cloud/GCP stack. Salary matches your $150k target but requires relocation to Mountain View."

Extension: Relays analysis to Claude
Claude: "Role: Software Engineer. Experience: 7+ years. Stack: Cloud/GCP. Salary: $150k. Location: Mountain View. Recommendation: Good match but consider relocation costs. Status: HIGH PRIORITY OPPORTUNITY."

Extension: Claude sends: {"type": "analysis", "priority": "high", "recommendation": "..."}
```

---

## 📝 Extension API Endpoints

When relay is enabled, extension provides these endpoints to Claude Code:

### POST /command

**Send commands to OpenClaw:**
```json
{
  "type": "navigate",
  "params": {
    "url": "https://example.com",
    "action": "click",
    "selector": "button.submit"
  }
}
```

**Available Command Types:**
- `navigate` - Navigate to URL or element
- `click` - Click on element
- `scroll` - Scroll page
- `fill` - Fill form field
- `extract` - Extract data from page
- `type` - Type text or select value
- `wait` - Wait for element
- `screenshot` - Take screenshot
- `refresh` - Refresh page

### POST /autofill

**Request form autofill from Claude Code:**
```json
{
  "platform": "linkedin",
  "form_url": "https://www.linkedin.com/jobs/view/12345",
  "field_data": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+1-555-1234",
    "company": "Acme Corp",
    "role": "Software Engineer",
    "experience_years": "7",
    "skills": "Python, JavaScript, AWS, Docker",
    "education": "BS Computer Science",
    "location": "San Francisco, CA",
    "resume_url": "https://drive.google.com/resume.pdf"
  }
}
```

**Response from Extension:**
```json
{
  "status": "success",
  "fields_filled": ["name", "email", "phone", "company", "role", "experience_years", "skills", "education", "location"],
  "message": "Autofilled 7/10 fields successfully"
}
```

### POST /analyze

**Request intelligent analysis:**
```json
{
  "url": "https://example.com/job/123",
  "analysis_type": "opportunity",
  "preferences": {
    "min_salary": "120000",
    "max_salary": "200000",
    "preferred_locations": "Remote",
    "priority_fields": ["role", "salary", "tech_stack"]
  }
}
```

**Response from Extension:**
```json
{
  "status": "success",
  "analysis": {
    "match_score": 85,
    "recommendation": "Apply! Job matches your salary preference and offers remote work. Good tech stack alignment with Python/AWS.",
    "priority": "high"
  }
}
```

### POST /automation

**Request automated browser actions:**
```json
{
  "workflow_id": "extract_linkedin_jobs",
  "steps": [
    {
      "action": "navigate",
      "url": "https://www.linkedin.com/jobs/search?keywords=software",
      "wait": 3000
    },
    {
      "action": "extract",
      "selector": ".job-listing .job-card",
      "max_items": 50
    },
    {
      "action": "scroll",
      "direction": "down",
      "amount": 3,
      "target": "bottom"
    },
    {
      "action": "analyze",
      "analysis_type": "opportunity_score"
    }
  ]
}
```

---

## 🎯 Usage Scenarios

### Scenario 1: Job Application

**Your Goal:** Apply to software engineering role at Google

**Conversation:**
```
You: "I want to apply for the software engineer role at Google"
Claude (via extension): "I'll help you with that. Let me analyze the requirements and prepare autofill data."

Extension: "Analyzing Google Careers application page... Found 12 form fields including experience, education, projects, coding assessment."

Claude: "Extracting your LinkedIn profile... Found your current role: Senior Software Engineer at ABC. I'll update your experience: +1 year, add Google Cloud/AWS to tech stack, and update resume."

Extension: Sends autofill data to Claude
Claude: "Preparing optimized profile data... Adding 8 new projects including: 1) Cloud migration project, 2) ML pipeline, 3) Kubernetes orchestration."

Extension: Receives data from Claude
Extension: "Autofilling all 12 fields including updated experience, new projects, and optimized resume."

Extension: ✅ Application submitted successfully
Claude: "Application submitted! I'll track the status and notify you of any updates."
```

---

### Scenario 2: LinkedIn Job Extraction

**Your Goal:** Extract all SWE job postings from search results

**Conversation:**
```
You: "Find me all software engineering jobs from this LinkedIn search page (max 50)"
Claude: "Scanning the page... Found 25 jobs. Extracting all details including company, role, salary, location, and requirements."

Extension: "Captured 25 jobs. Formatting into structured data..."
Claude: "I've analyzed all 25 jobs. Here's a summary:
- 5 at Google ($180k-220k range)
- 8 at Meta ($150k-$180k)
- 12 fully remote
- 7 require relocation

I'll prioritize the 5 Google roles for you and prepare tailored applications."

Extension: Receives structured job data
Extension: "Data ready. I'll create CSV file and highlight top opportunities."
```

---

### Scenario 3: Daily Job Monitoring

**Your Goal:** Monitor job boards and apply to new postings

**Conversation:**
```
You: "Set up a daily job search for SWE roles. Filter by: salary >$150k, remote allowed, Python/JS required"
Claude: "I'll configure a monitoring workflow. Each morning at 9 AM, I'll search LinkedIn, Indeed, and Glassdoor for new SWE positions. When I find matches, I'll extract details and queue applications."

Extension: "Configuring automated search workflow... Added 5 job boards and 3 search filters."
Claude: "Workflow configured. I'll send you notifications for each new posting and track application status."
```

---

## 🔧 Configuration Options

### OpenClaw Gateway

```json
{
  "gateway_url": "ws://localhost:18789",
  "endpoints": {
    "/command": "Execute Claude Code commands",
    "/autofill": "Fill forms with Claude-provided data",
    "/analyze": "Get intelligent analysis from Claude",
    "/automation": "Execute browser automation workflows"
  }
}
```

### Extension Settings

```json
{
  "claude_integration": {
    "enabled": true,
    "command_endpoint": "/command",
    "autofill_endpoint": "/autofill",
    "extract_endpoint": "/extract",
    "analyze_endpoint": "/analyze",
    "automation_endpoint": "/automation",
    "send_response_timeout": 5000,
    "retry_attempts": 3
  },
  "auto_fill_enabled": true,
  "auto_analyze_enabled": true,
  "auto_apply_enabled": false
}
```

---

## 📚 Quick Start Guide

### 1. Enable Relay

```bash
python3 /Users/Subho/update_extension_relay.py
# Select: 4
# Paste the configuration JSON shown above
# Select: 9
```

### 2. Verify Connection

After saving, check:
```bash
# Test relay is reachable
curl http://127.0.0.1:2204/health
```

Expected response:
```json
{
  "status": "healthy",
  "openclaw_gateway": "ws://localhost:18789"
}
```

### 3. Start Using Extension

1. Open Brave Browser
2. Navigate to target website (LinkedIn, Workday, etc.)
3. Click extension toolbar icon
4. Check console for connection status
5. Say: "Help me fill out this form" or "Extract this data"

---

## ✅ Supported Platforms

Pre-configured ATS integrations:
- ✅ LinkedIn (49 selectors)
- ✅ Workday (ATS configured)
- ✅ Greenhouse (ATS configured)
- ✅ Amazon ATS (configured)
- ✅ Custom ATS (add your own via extension updater)

Cloud platform support:
- ✅ LinkedIn
- ✅ Indeed
- ✅ Glassdoor
- ✅ Monster
- ✅ AngelList
- ✅ General forms

---

## 📝 What You Can Ask Claude Code to Do

When relay is enabled and connected to Claude Code, you can:

### Cloud Platform Applications
- ✅ "Autofill the LinkedIn application form with my details"
- ✅ "Apply to this Workday job posting - it's a perfect match"
- ✅ "Update my resume with these new Google Cloud projects"
- ✅ "Extract all job listings and rank by my preferences"

### Browser Automation
- ✅ "Navigate to the jobs section on LinkedIn"
- ✅ "Scroll down to find senior SWE roles"
- ✅ "Click apply on the top 3 matches"
- ✅ "Take a screenshot of each job posting for reference"
- ✅ "Extract company names from all job cards and create a spreadsheet"

### Data Extraction
- ✅ "Extract all product details from this e-commerce site"
- ✅ "Extract pricing information and put into comparison table"
- ✅ "Extract review data and sentiment analysis"

### Intelligent Assistance
- ✅ "Analyze this job posting and tell me if it's worth applying to"
- ✅ "Compare 5 job offers and recommend the best one"
- ✅ "Monitor 50+ job boards and notify me of new senior engineer roles that match"

---

## 🔌 Technical Architecture

```
┌─────────────────┐
│                 │
│  Browser Extension  │
│   (Simplify Copilot)   │
│        │                │
│        ▼                │
│  ├─ POST /autofill ◄│
│  ├─ POST /analyze   │
│  ├─ POST /automation │
│  └─ POST /command   │
│        │                │
│        ▼                │
│   WebSocket Relay   │
│        │                │
│   └─ ws://localhost:18789
│        │                │
└────────────────┘
       │
┌─────────────────┐
   OpenClaw CLI
   (claude-code)
       │
└────────────────┘
         ▲
```

**Data Flow:**
1. Browser → Extension → Claude Code (via /command)
2. Claude Code → OpenClaw CLI (via WebSocket gateway)
3. OpenClaw CLI → Browser → Extension (via /autofill response)

---

## ✅ Benefits of Enabling Relay

1. **Intelligent Autofill:** Claude Code understands context and provides optimized data
2. **Browser Automation:** Execute complex workflows (navigate, scroll, multi-click) on your behalf
3. **Data Extraction:** Parse and structure data from any website
4. **Intelligent Analysis:** Get AI-powered insights and recommendations
5. **Real-time Assistance:** Ask questions and get help filling forms
6. **Workflow Management:** Create and execute multi-step automated processes

---

## 📚 File Reference

**Configuration File:** `/Users/Subho/EXTENSION_RELAY_UPDATE_GUIDE.md`
**Integration Guide:** `/Users/Subho/OPENCLAW_CLAUDE_INTEGRATION.md` (this file)

**Extension Updater:** `/Users/Subho/update_extension_relay.py`
**CLI Updater:** `/Users/Subho/update_extension_quick.py`

---

## ✅ Next Steps

1. **Enable Relay Now:**
```bash
python3 /Users/Subho/update_extension_relay.py
# Select: 4
# Paste configuration from above
# Select: 9
```

2. **Test Connection:**
```bash
curl http://127.0.0.1:2204/health
```

3. **Start Using:**
- Navigate to a cloud platform (LinkedIn, Workday, etc.)
- Click extension toolbar icon
- Say: "Help me [do something]"

---

**Claude Code is now your intelligent browser assistant, working through the extension to help you fill forms, extract data, and automate workflows!**

*Integration Guide created at `/Users/Subho/OPENCLAW_CLAUDE_INTEGRATION.md` with detailed scenarios, API documentation, and configuration examples.*
