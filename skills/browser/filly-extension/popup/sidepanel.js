/**
 * FillY — Side Panel Logic (Chat + Profile + Fill)
 */

const PROFILE_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'linkedin',
  'current_company', 'current_title', 'years_of_experience',
  'country', 'city', 'state', 'salary', 'salary_expectations',
  'notice_period', 'gender', 'school', 'degree', 'graduation_year', 'skills',
];

// ── Tab switching ──
document.querySelectorAll('.filly-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filly-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Profile: section toggles ──
document.querySelectorAll('.section-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const isActive = toggle.classList.contains('active');
    toggle.classList.toggle('active');
    const body = toggle.nextElementSibling;
    body.classList.toggle('active', !isActive);
  });
});

// ── Platform detection on load ──
function detectPlatform() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const url = (tabs[0].url || '').toLowerCase();
    let platform = 'generic', icon = '🌐', name = 'Generic form';

    if (url.includes('greenhouse.io')) { platform = 'greenhouse'; icon = '🌱'; name = 'Greenhouse'; }
    else if (url.includes('jobs.lever.co') || url.includes('lever.co')) { platform = 'lever'; icon = '🍃'; name = 'Lever'; }
    else if (url.includes('workday')) { platform = 'workday'; icon = '📅'; name = 'Workday'; }
    else if (url.includes('reczee.com')) { platform = 'reczee'; icon = '📋'; name = 'Reczee'; }
    else if (url.includes('icims.com')) { platform = 'icims'; icon = '📦'; name = 'iCIMS'; }
    else if (url.includes('smartrecruiters')) { platform = 'smartrecruiters'; icon = '🤖'; name = 'SmartRecruiters'; }
    else if (url.includes('docs.google.com/forms')) { platform = 'google_forms'; icon = '📝'; name = 'Google Forms'; }

    document.getElementById('platform-icon').textContent = icon;
    document.getElementById('platform-name').textContent = name;
    document.getElementById('platform-badge').dataset.platform = platform;
  });
}
detectPlatform();

// ── Load profile from storage ──
chrome.storage.local.get(['filly_profile'], (result) => {
  const profile = result.filly_profile || {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && profile[field]) el.value = profile[field];
  });
});

// ── Save profile ──
document.getElementById('save-profile-btn').addEventListener('click', () => {
  const profile = {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && el.value.trim()) profile[field] = el.value.trim();
  });
  chrome.storage.local.set({ filly_profile: profile }, () => {
    // Show saved confirmation
    const btn = document.getElementById('save-profile-btn');
    const origText = btn.textContent;
    btn.textContent = '✅ Saved!';
    btn.style.background = '#00B894';
    setTimeout(() => {
      btn.textContent = origText;
      btn.style.background = '';
    }, 2000);
  });
});

// ── Chat: send message ──
function addChatMessage(text, type = 'ai', label = 'FillY') {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-msg msg-${type}`;
  
  if (type === 'ai') {
    msg.innerHTML = `<div class="msg-label">${label}</div><div class="msg-text">${escapeHtml(text)}</div>`;
  } else {
    msg.textContent = text;
  }
  
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addSuggestions(suggestions) {
  const container = document.getElementById('chat-messages');
  const lastMsg = container.lastElementChild;
  if (!lastMsg || !lastMsg.classList.contains('msg-ai')) return;
  
  const suggDiv = document.createElement('div');
  suggDiv.className = 'msg-suggestions';
  suggestions.forEach(s => {
    const chip = document.createElement('button');
    chip.className = 'suggestion-chip';
    chip.textContent = s;
    chip.addEventListener('click', () => {
      document.getElementById('chat-input').value = s;
      sendChatMessage();
    });
    suggDiv.appendChild(chip);
  });
  lastMsg.appendChild(suggDiv);
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');
  el.textContent = text;
  indicator.className = `status-indicator status-${type}`;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addChatMessage(text, 'user');

  // Simulate AI response (rule-based for now, can integrate LLM later)
  const lower = text.toLowerCase();

  if (lower.includes('unanswered') || lower.includes('empty') || lower.includes('skip')) {
    // Scan for unanswered fields
    setStatus('Scanning...', 'info');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          addChatMessage("I couldn't scan the page. Make sure you're on a job application form.", 'ai');
          setStatus('Scan failed', 'error');
          return;
        }
        const unanswered = resp.fields.filter(f => !f.hasValue && f.semanticType === 'unknown');
        if (unanswered.length === 0) {
          addChatMessage("All fields have been classified. No unanswered unknown fields found.", 'ai');
        } else {
          addChatMessage(`I found ${unanswered.length} unanswered field(s) on this page:\n\n` +
            unanswered.slice(0, 10).map((f, i) => `${i+1}. "${f.label || 'Unknown field'}" (${f.type})`).join('\n') +
            (unanswered.length > 10 ? `\n\n...and ${unanswered.length - 10} more.` : ''),
            'ai', 'FillY');
        }
        setStatus('Ready', 'success');
      });
    });

  } else if (lower.includes('how many') || lower.includes('fields')) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
        if (chrome.runtime.lastError || !resp) {
          addChatMessage("Couldn't scan the page.", 'ai');
          return;
        }
        const total = resp.fields.length;
        const filled = resp.fields.filter(f => f.hasValue).length;
        const unanswered = total - filled;
        addChatMessage(`This form has **${total} fields** total:\n- ✅ ${filled} filled\n- ⏭️ ${unanswered} empty`, 'ai');
      });
    });

  } else if (lower.includes('fill') || lower.includes('start')) {
    addChatMessage("I'll autofill the form now!", 'ai');
    document.querySelector('.filly-tabs .tab[data-tab="fill"]').click();
    document.getElementById('btn-fill-now').click();

  } else if (lower.includes('profile') || lower.includes('my info')) {
    document.querySelector('.filly-tabs .tab[data-tab="profile"]').click();
    addChatMessage("Opening your profile. Update any fields and click Save.", 'ai');

  } else if (lower.includes('help') || lower.includes('what can you')) {
    addChatMessage(`I can help you fill job application forms. Here's what I can do:\n\n` +
      `⚡ **Autofill** — Fill all matched fields from your profile\n` +
      `🔍 **Scan** — Find all form fields on the page\n` +
      `💬 **Chat** — Answer questions about the form\n` +
      `❓ **Unanswered** — Show empty fields I couldn't classify\n\n` +
      `Try saying "scan fields" or "show unanswered"!`, 'ai');

  } else {
    addChatMessage(`I can help you fill forms! Try:\n- "Scan fields" — see all form fields\n- "Show unanswered" — find empty fields\n- "Fill form" — start autofilling\n- "My profile" — open your profile`, 'ai', 'FillY');
  }
}

document.getElementById('chat-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Welcome buttons
document.getElementById('btn-scan-questions').addEventListener('click', () => {
  document.querySelector('.filly-tabs .tab[data-tab="chat"]').click();
  document.getElementById('chat-input').value = 'show unanswered questions';
  sendChatMessage();
});
document.getElementById('btn-show-profile').addEventListener('click', () => {
  document.querySelector('.filly-tabs .tab[data-tab="profile"]').click();
});

// ── Fill Tab ──
async function runFill() {
  const statusIndicator = document.getElementById('status-indicator');
  const progressEl = document.getElementById('fill-progress');
  const progressBar = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const resultsEl = document.getElementById('fill-results');

  // Get profile
  const profile = await new Promise(r => chrome.storage.local.get(['filly_profile'], r));
  const p = profile.filly_profile || {};

  if (!p.email && !p.first_name) {
    setStatus('No profile — go to Profile tab first', 'error');
    return;
  }

  // Update UI
  setStatus('Filling form...', 'info');
  progressEl.classList.add('active');
  progressBar.style.width = '20%';
  progressText.textContent = 'Triggering autofill...';
  resultsEl.innerHTML = '';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'AUTOFILL', profile: p, options: {} }, (resp) => {
      progressBar.style.width = '80%';
      progressText.textContent = 'Processing results...';

      setTimeout(() => {
        progressBar.style.width = '100%';
        progressEl.classList.remove('active');

        if (chrome.runtime.lastError || !resp || !resp.results) {
          setStatus('Fill failed', 'error');
          progressText.textContent = '';
          return;
        }

        const r = resp.results;
        const total = r.filled + r.skipped + r.errors;

        // Update status
        if (r.errors > 0) {
          setStatus(`${r.filled} filled, ${r.errors} errors`, 'warning');
        } else {
          setStatus(`${r.filled}/${total} filled!`, 'success');
        }

        // Update counters
        document.getElementById('filled-count').textContent = r.filled;
        document.getElementById('skipped-count').textContent = r.skipped;
        document.getElementById('error-count').textContent = r.errors;

        // Show result items
        resultsEl.innerHTML = '';
        r.details.forEach(d => {
          const icon = d.action === 'filled' ? '✅' : d.action === 'error' ? '❌' : '⏭️';
          const label = (d.label || d.semanticType || '?').substring(0, 35);
          const type = d.semanticType || '';
          const value = d.value || '';
          const item = document.createElement('div');
          item.className = 'fill-result-item';
          item.innerHTML = `
            <span class="result-icon">${icon}</span>
            <span class="result-label">${label}</span>
            <span class="result-type">${type}</span>
            ${value ? `<span class="result-value">${value.substring(0, 15)}</span>` : ''}`;
          resultsEl.appendChild(item);
        });

        progressText.textContent = `${r.filled} filled, ${r.skipped} skipped`;
      }, 800);
    });
  });
}

document.getElementById('btn-fill-now').addEventListener('click', runFill);

// ── Quick actions ──
document.getElementById('btn-scan-fields').addEventListener('click', async () => {
  const btn = document.getElementById('btn-scan-fields');
  btn.classList.add('spinning');
  btn.textContent = '🔍 Scanning...';

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
      btn.classList.remove('spinning');
      btn.textContent = '🔍 Scan All Fields';

      if (chrome.runtime.lastError || !resp) return;

      const { fields } = resp;
      const filled = fields.filter(f => f.hasValue).length;
      const total = fields.length;
      const react = fields.filter(f => f.isReactSelect || f.isMuiAutocomplete).length;

      addChatMessage(
        `🔍 **Scan complete!**\n\n` +
        `Total fields: ${total}\n` +
        `✅ Filled: ${filled}\n` +
        `⏭️ Empty: ${total - filled}\n` +
        `🔽 Custom dropdowns: ${react}`,
        'ai'
      );

      // Switch to chat tab to show results
      document.querySelector('.filly-tabs .tab[data-tab="chat"]').click();
    });
  });
});

document.getElementById('btn-show-unanswered').addEventListener('click', () => {
  document.querySelector('.filly-tabs .tab[data-tab="chat"]').click();
  document.getElementById('chat-input').value = 'show unanswered';
  sendChatMessage();
});

document.getElementById('btn-clear-form').addEventListener('click', async () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_FORM' }, (resp) => {
      if (resp?.success) {
        addChatMessage('🗑️ Form cleared! All fields are now empty.', 'ai');
        document.getElementById('filled-count').textContent = '0';
        document.getElementById('skipped-count').textContent = '0';
        document.getElementById('error-count').textContent = '0';
        setStatus('Form cleared', 'info');
        document.getElementById('fill-results').innerHTML = '';
      }
    });
  });
});

// ── Close button ──
document.getElementById('close-btn').addEventListener('click', () => {
  // Side panel closes automatically — no explicit API needed
  window.close();
});

// ── Initial welcome message (delayed) ──
setTimeout(() => {
  const msgs = document.getElementById('chat-messages');
  if (msgs.children.length === 1) {
    addChatMessage("I'm ready! Go to any job form and I'll help you fill it automatically. Type \"scan fields\" or click ⚡ Autofill.", 'ai');
  }
}, 1500);