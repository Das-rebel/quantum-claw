/**
 * FillY — Side Panel (Fill + Profile + Chat + Resume Builder)
 */

const PROFILE_FIELDS = [
  'first_name','last_name','email','phone','linkedin','github',
  'current_company','current_title','years_of_experience','salary','salary_expectations',
  'notice_period','gender','city','state','country',
  'school','degree','graduation_year','skills',
  'work_authorization','sponsorship_required','linkedin_url',
];

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── PROFILE SECTION TOGGLES ───────────────────────────────────────────────────
document.querySelectorAll('.section-hdr').forEach(hdr => {
  hdr.addEventListener('click', () => {
    const isOpen = hdr.classList.contains('active');
    hdr.classList.toggle('active');
    const body = hdr.nextElementSibling;
    body.classList.toggle('active', !isOpen);
    hdr.querySelector('.toggle-arrow').textContent = isOpen ? '▶' : '▼';
  });
});

// ─── PLATFORM DETECTION ────────────────────────────────────────────────────────
function detectPlatform() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    const url = (tabs[0].url || '').toLowerCase();
    let p = 'generic', icon = '🌐', name = 'Generic form';
    if (url.includes('greenhouse.io')) { p = 'greenhouse'; icon = '🌱'; name = 'Greenhouse'; }
    else if (url.includes('jobs.lever.co') || url.includes('lever.co')) { p = 'lever'; icon = '🍃'; name = 'Lever'; }
    else if (url.includes('workday')) { p = 'workday'; icon = '📅'; name = 'Workday'; }
    else if (url.includes('reczee.com')) { p = 'reczee'; icon = '📋'; name = 'Reczee'; }
    else if (url.includes('icims.com')) { p = 'icims'; icon = '📦'; name = 'iCIMS'; }
    else if (url.includes('smartrecruiters')) { p = 'smartrecruiters'; icon = '🤖'; name = 'SmartRecruiters'; }
    else if (url.includes('docs.google.com/forms')) { p = 'google_forms'; icon = '📝'; name = 'Google Forms'; }
    document.getElementById('platform-icon').textContent = icon;
    document.getElementById('platform-name').textContent = name;
  });
}
detectPlatform();

// ─── PROFILE STORAGE ──────────────────────────────────────────────────────────
function loadProfile() {
  chrome.storage.local.get(['filly_profile'], r => {
    const p = r.filly_profile || {};
    PROFILE_FIELDS.forEach(f => {
      const el = document.getElementById(`p-${f}`);
      if (el && p[f]) el.value = p[f];
    });
    updateProfileCount();
  });
}
loadProfile();

function saveProfile() {
  const p = {};
  PROFILE_FIELDS.forEach(f => {
    const el = document.getElementById(`p-${f}`);
    if (el && el.value.trim()) p[f] = el.value.trim();
  });
  chrome.storage.local.set({ filly_profile: p }, () => {
    const btn = document.getElementById('btn-save-profile');
    const confirm = document.getElementById('save-confirm');
    btn.innerHTML = '<span>✅</span><span>Saved!</span>';
    btn.style.background = '#00B894';
    confirm.classList.remove('hidden');
    setTimeout(() => {
      btn.innerHTML = '<span>💾</span><span>Save Profile</span>';
      btn.style.background = '';
      confirm.classList.add('hidden');
    }, 2500);
    updateProfileCount();
  });
}

function updateProfileCount() {
  let filled = 0;
  PROFILE_FIELDS.forEach(f => {
    const el = document.getElementById(`p-${f}`);
    if (el && el.value.trim()) filled++;
  });
  // Count per section
  const contact = ['first_name','last_name','email','phone','linkedin','city','state','country'].filter(f => {
    const el = document.getElementById(`p-${f}`);
    return el && el.value.trim();
  }).length;
  const work = ['current_company','current_title','years_of_experience','salary','salary_expectations','notice_period'].filter(f => {
    const el = document.getElementById(`p-${f}`);
    return el && el.value.trim();
  }).length;
  const edu = ['school','degree','graduation_year','skills'].filter(f => {
    const el = document.getElementById(`p-${f}`);
    return el && el.value.trim();
  }).length;
  const extra = ['gender','work_authorization','sponsorship_required','linkedin_url'].filter(f => {
    const el = document.getElementById(`p-${f}`);
    return el && el.value.trim();
  }).length;
  document.getElementById('cnt-contact').textContent = `${contact}/8`;
  document.getElementById('cnt-work').textContent = `${work}/6`;
  document.getElementById('cnt-edu').textContent = `${edu}/4`;
  document.getElementById('cnt-extra').textContent = `${extra}/4`;
}
document.getElementById('btn-save-profile').addEventListener('click', saveProfile);

// ─── FILL TAB ────────────────────────────────────────────────────────────────
async function runFill() {
  const statusText = document.getElementById('fill-status-text');
  const fillDot = document.getElementById('fill-dot');
  const progress = document.getElementById('fill-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressLabel = document.getElementById('progress-label');
  const resultsEl = document.getElementById('fill-results');

  progress.classList.remove('hidden');
  progressFill.style.width = '10%';
  progressLabel.textContent = 'Getting profile...';

  const profile = await new Promise(r => chrome.storage.local.get(['filly_profile'], r));
  const p = profile.filly_profile || {};

  if (!p.email && !p.first_name) {
    setFillStatus('⚠️ No profile — fill Profile tab first', 'warn');
    progress.classList.add('hidden');
    return;
  }

  setFillStatus('Filling...', 'info');
  progressFill.style.width = '30%';
  progressLabel.textContent = 'Scanning form...';

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'AUTOFILL', profile: p, options: {} }, resp => {
      progressFill.style.width = '90%';
      progressLabel.textContent = 'Done!';

      setTimeout(() => {
        progress.classList.add('hidden');
        progressFill.style.width = '0%';

        if (chrome.runtime.lastError || !resp || !resp.results) {
          setFillStatus('❌ Fill failed: ' + (chrome.runtime.lastError?.message || resp?.error || 'unknown'), 'error');
          return;
        }

        const r = resp.results;
        const total = r.filled + r.skipped + r.errors;

        document.getElementById('cnt-filled').textContent = r.filled;
        document.getElementById('cnt-skipped').textContent = r.skipped;
        document.getElementById('cnt-errors').textContent = r.errors;

        setFillStatus(
          r.errors > 0 ? `⚠️ ${r.filled}/${total} filled (${r.errors} errors)` : `✅ ${r.filled}/${total} filled`,
          r.errors > 0 ? 'warn' : 'ok'
        );

        resultsEl.innerHTML = '';
        r.details.forEach(d => {
          const icon = d.action === 'filled' ? '✅' : d.action === 'error' ? '❌' : '⏭️';
          const label = (d.label || d.semanticType || '?').slice(0, 40);
          const val = d.value || '';
          resultsEl.innerHTML += `
            <div class="fi ${d.action === 'filled' ? 'fi-ok' : d.action === 'error' ? 'fi-err' : 'fi-skip'}">
              <span class="fi-icon">${icon}</span>
              <span class="fi-label">${label}</span>
              ${val ? `<span class="fi-val">${val.slice(0,20)}</span>` : ''}
            </div>`;
        });

        resultsEl.scrollTop = resultsEl.scrollHeight;
      }, 600);
    });
  });
}

function setFillStatus(text, type) {
  const el = document.getElementById('fill-status-text');
  const dot = document.getElementById('fill-dot');
  el.textContent = text;
  dot.className = `status-dot dot-${type}`;
}

document.getElementById('btn-fill-now').addEventListener('click', runFill);

document.getElementById('btn-scan-fields').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, resp => {
      if (chrome.runtime.lastError || !resp) return;
      const { fields } = resp;
      const total = fields.length;
      const filled = fields.filter(f => f.hasValue).length;
      setFillStatus(`🔍 ${total} fields found (${filled} filled)`, 'info');
      document.getElementById('cnt-filled').textContent = filled;
      document.getElementById('cnt-skipped').textContent = total - filled;
      document.getElementById('cnt-errors').textContent = '0';
    });
  });
});

document.getElementById('btn-show-unanswered').addEventListener('click', () => {
  document.querySelector('.tab[data-tab="chat"]').click();
  document.getElementById('chat-input').value = 'show unanswered questions';
  sendChat();
});

document.getElementById('btn-clear-form').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_FORM' }, () => {
      document.getElementById('cnt-filled').textContent = '0';
      document.getElementById('cnt-skipped').textContent = '0';
      document.getElementById('fill-results').innerHTML = '';
      setFillStatus('🗑️ Form cleared', 'info');
    });
  });
});

// ─── CHAT TAB ────────────────────────────────────────────────────────────────
function addMsg(text, type = 'ai') {
  const el = document.createElement('div');
  el.className = `msg msg-${type}`;
  el.innerHTML = type === 'ai' ? `<span class="msg-who">⚡ FillY</span><span class="msg-text">${linkify(text)}</span>`
    : `<span class="msg-text">${escapeHtml(text)}</span>`;
  document.getElementById('chat-messages').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function linkify(s) {
  return escapeHtml(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMsg(text, 'user');

  const lower = text.toLowerCase();

  // ── Scan fields ──
  if (lower.includes('scan') || lower.includes('fields')) {
    addMsg('Scanning form...', 'ai');
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, resp => {
        if (chrome.runtime.lastError || !resp) {
          addMsg("Couldn't scan the page. Make sure you're on a job form.", 'ai');
          return;
        }
        const { fields } = resp;
        const total = fields.length;
        const filled = fields.filter(f => f.hasValue).length;
        const unknown = fields.filter(f => !f.hasValue && f.semanticType === 'unknown').length;
        addMsg(`**Scan complete!**\n\n` +
          `Total: ${total} fields\n` +
          `✅ Filled: ${filled}\n` +
          `⏭️ Empty: ${total - filled}\n` +
          `❓ Unknown: ${unknown}`, 'ai');
      });
    });
    return;
  }

  // ── Show unanswered ──
  if (lower.includes('unanswered') || lower.includes('empty') || lower.includes('skip')) {
    addMsg('Scanning for unanswered...', 'ai');
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, resp => {
        if (chrome.runtime.lastError || !resp) { addMsg("Couldn't scan the page.", 'ai'); return; }
        const unanswered = resp.fields.filter(f => !f.hasValue && f.semanticType === 'unknown');
        if (!unanswered.length) {
          addMsg("All fields are classified. No unknown unanswered fields found.", 'ai');
        } else {
          addMsg(`Found ${unanswered.length} unknown field(s):\n\n` +
            unanswered.slice(0, 8).map((f, i) => `${i+1}. "${f.label || 'Unknown'}" (${f.type})`).join('\n') +
            (unanswered.length > 8 ? `\n\n...and ${unanswered.length - 8} more.` : ''), 'ai');
        }
      });
    });
    return;
  }

  // ── Fill form ──
  if (lower.includes('fill') || lower.includes('start')) {
    addMsg("Starting autofill...", 'ai');
    document.querySelector('.tab[data-tab="fill"]').click();
    runFill();
    return;
  }

  // ── My profile ──
  if (lower.includes('profile') || lower.includes('my info')) {
    addMsg("Opening your profile...", 'ai');
    document.querySelector('.tab[data-tab="profile"]').click();
    return;
  }

  // ── Import resume ──
  if (lower.includes('resume') || lower.includes('import')) {
    addMsg("Opening resume importer...", 'ai');
    document.querySelector('.tab[data-tab="resume"]').click();
    return;
  }

  // ── Help ──
  if (lower.includes('help') || lower === 'hi' || lower === 'hey') {
    addMsg(`Here's what I can do:\n\n` +
      `🔍 **"scan fields"** — Find all form fields\n` +
      `❓ **"show unanswered"** — Empty fields I can't fill\n` +
      `⚡ **"fill form"** — Autofill now\n` +
      `👤 **"my profile"** — Edit your profile\n` +
      `📄 **"import resume"** — Parse resume text or LinkedIn\n\n` +
      `Try "scan fields" to see what I found on this page!`, 'ai');
    return;
  }

  // Default
  addMsg(`Try: "scan fields", "fill form", "show unanswered", or "import resume"`, 'ai');
}

document.getElementById('chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// Chat command chips
document.querySelectorAll('.cmd-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.getElementById('chat-input').value = chip.dataset.cmd;
    sendChat();
  });
});

// ─── RESUME TAB ────────────────────────────────────────────────────────────────
// Resume sub-tabs
document.querySelectorAll('.resume-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.resume-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rtab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`rtab-${tab.dataset.rtab}`).classList.add('active');
  });
});

// File input
document.getElementById('resume-file-input')?.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    parseAndPreview(text);
  };
  reader.readAsText(file);
});

// Paste text + Parse
document.getElementById('btn-parse-resume')?.addEventListener('click', () => {
  const text = document.getElementById('resume-text-input')?.value || '';
  if (text.trim().length < 20) {
    addMsg('Resume text is too short. Paste more content.', 'ai');
    return;
  }
  parseAndPreview(text);
});

// LinkedIn import
document.getElementById('btn-li-import')?.addEventListener('click', () => {
  const url = document.getElementById('li-url-input')?.value?.trim();
  if (!url || !url.includes('linkedin.com/in/')) {
    addMsg('Please enter a valid LinkedIn profile URL.', 'ai');
    return;
  }
  addMsg(`Navigating to LinkedIn profile to import data...\n\n⚠️ Make sure you're logged into LinkedIn in this browser.`, 'ai');
  // Inject the parser and scrape
  injectResumeParser(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'FILLY_RESUME_SCRAPE',
        url: url
      }, resp => {
        if (resp && resp.success && resp.profile) {
          const p = resp.profile;
          addMsg(`✅ LinkedIn profile imported!\n\n` +
            `Name: ${p.basics?.name || '?'}\n` +
            `Title: ${p.basics?.label || '?'}\n` +
            `Email: ${p.basics?.email || '?'}\n` +
            `Experience: ${(p.work || []).length} positions\n` +
            `Education: ${(p.education || []).length} entries\n` +
            `Skills: ${(p.skills || []).length} listed\n\n` +
            `Click "Apply to Profile" to fill your profile with this data.`, 'ai');
          window.__linkedinProfile = p;
          showParsedResults(p);
        } else {
          addMsg(`❌ LinkedIn import failed.\n\n${resp?.error || 'Make sure you are logged into LinkedIn in this browser.'}\n\n` +
            `Alternative: Copy your LinkedIn profile text and paste it in the "Paste Text" tab.`, 'ai');
        }
      });
    });
  });
});

function parseAndPreview(text) {
  injectResumeParser(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'FILLY_RESUME_PARSE',
        text: text
      }, resp => {
        if (resp && resp.success && resp.profile) {
          const p = resp.profile;
          window.__parsedResume = p;
          addMsg(`✅ Resume parsed!\n\n` +
            `Name: ${p.basics?.name || '?'}\n` +
            `Email: ${p.basics?.email || '?'}\n` +
            `Phone: ${p.basics?.phone || '?'}\n` +
            `Experience: ${(p.work || []).length} positions\n` +
            `Education: ${(p.education || []).length} entries\n` +
            `Skills: ${(p.skills?.length || 0)} groups`, 'ai');
          showParsedResults(p);
        } else {
          addMsg(`❌ Couldn't parse resume. Try a different format or paste more text.`, 'ai');
        }
      });
    });
  });
}

function showParsedResults(profile) {
  const el = document.getElementById('parsed-results');
  const preview = document.getElementById('pr-preview');
  el.classList.remove('hidden');

  const basics = profile.basics || {};
  const work = profile.work || [];
  const edu = profile.education || [];

  preview.innerHTML = `
    <div class="pr-name">${basics.name || '?'}</div>
    <div class="pr-title">${basics.label || ''}</div>
    <div class="pr-contact">${basics.email || ''} ${basics.phone || ''}</div>
    ${work.length ? `<div class="pr-section">Experience (${work.length})</div>` + work.slice(0,2).map(w =>
      `<div class="pr-item">${w.position || ''} @ ${w.company || ''} (${w.startDate || ''} – ${w.current ? 'Present' : w.endDate || ''})</div>`
    ).join('') : ''}
    ${edu.length ? `<div class="pr-section">Education</div>` + edu.slice(0,1).map(e =>
      `<div class="pr-item">${e.studyType || ''} @ ${e.institution || ''} (${e.endDate || ''})</div>`
    ).join('') : ''}
  `;
}

document.getElementById('btn-apply-parsed')?.addEventListener('click', () => {
  const profile = window.__parsedResume || window.__linkedinProfile;
  if (!profile) { addMsg('No parsed resume to apply.', 'ai'); return; }

  // Convert JSON Resume → FillY fill profile
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, {
      type: 'FILLY_RESUME_TO_FILL',
      profile: profile
    }, resp => {
      if (resp && resp.success) {
        const fp = resp.fillProfile;
        // Populate profile fields
        Object.entries(fp).forEach(([key, val]) => {
          if (key === 'skill_list') return;
          const el = document.getElementById(`p-${key}`);
          if (el && val) el.value = val;
        });
        // Save
        chrome.storage.local.set({ filly_profile: fp }, () => {
          addMsg(`✅ Profile updated from resume!\n\n${resp.applied} fields populated.\n\n` +
            `Go to Profile tab to review and save.`, 'ai');
          updateProfileCount();
        });
      } else {
        addMsg('Failed to apply resume to profile.', 'ai');
      }
    });
  });
});

function injectResumeParser(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    // Check if already injected
    chrome.tabs.sendMessage(tabs[0].id, { type: 'FILLY_PING' }, resp => {
      if (resp && resp.pong) {
        callback();
      } else {
        // Inject resume parser script
        fetch(chrome.runtime.getURL('resume_parser.js'))
          .then(r => r.text())
          .then(js => chrome.tabs.executeScript(tabs[0].id, { code: js }))
          .then(() => { window.__parserInjected = true; callback(); })
          .catch(err => { addMsg(`Parser injection failed: ${err.message}`, 'ai'); });
      }
    });
  });
}

// ─── CLOSE ────────────────────────────────────────────────────────────────────
document.getElementById('close-btn')?.addEventListener('click', () => window.close());

// ─── IMPORT RESUME BUTTON ────────────────────────────────────────────────────
document.getElementById('btn-import-resume')?.addEventListener('click', () => {
  document.querySelector('.tab[data-tab="resume"]').click();
});

// ─── WELCOME MESSAGE ─────────────────────────────────────────────────────────
setTimeout(() => {
  const msgs = document.getElementById('chat-messages');
  if (msgs && msgs.children.length <= 1) {
    addMsg("Hey! I'm FillY. 👋\n\n" +
      "I'll autofill any job application form for you.\n\n" +
      "Start by saving your profile, or import from a resume text.", 'ai');
  }
}, 1200);
