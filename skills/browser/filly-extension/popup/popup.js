/**
 * FillY — Popup Logic
 */

const PROFILE_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'linkedin',
  'current_company', 'current_title', 'years_of_experience',
  'country', 'salary', 'salary_expectations', 'notice_period', 'gender',
];

// ── Tab switching ──
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Load profile from storage ──
chrome.storage.local.get(['filly_profile'], (result) => {
  const profile = result.filly_profile || {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && profile[field]) el.value = profile[field];
  });
});

// ── Save profile ──
document.getElementById('save-profile').addEventListener('click', () => {
  const profile = {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && el.value.trim()) profile[field] = el.value.trim();
  });
  chrome.storage.local.set({ filly_profile: profile }, () => {
    showStatus('save-status', `✅ Saved! ${Object.keys(profile).length} fields ready.`, 'success');
  });
});

// ── Auto-detect page on open ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const tab = tabs[0];

  // URL-based detection
  const url = (tab.url || '').toLowerCase();
  let platform = 'unknown';
  if (url.includes('greenhouse.io')) platform = 'greenhouse';
  else if (url.includes('jobs.lever.co') || url.includes('lever.co')) platform = 'lever';
  else if (url.includes('myworkday') || url.includes('workday')) platform = 'workday';
  else if (url.includes('icims.com')) platform = 'icims';
  else if (url.includes('reczee.com')) platform = 'reczee';
  else if (url.includes('docs.google.com/forms')) platform = 'google_forms';
  else if (url.includes('jobvite.com')) platform = 'jobvite';
  else if (url.includes('smartrecruiters')) platform = 'smartrecruiters';

  const detectEl = document.getElementById('detect-text');
  if (platform !== 'unknown') {
    detectEl.textContent = `${platform.charAt(0).toUpperCase() + platform.slice(1)} form detected!`;
    detectEl.parentElement.parentElement.style.background = '#E6FFF0';
    detectEl.parentElement.style.color = '#00B894';
    document.querySelector('.detect-icon').textContent = '✅';
  } else {
    // Ask content script to scan
    chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM' }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        detectEl.textContent = 'No form detected on this page';
      } else if (resp.detected) {
        detectEl.textContent = `Form detected (${resp.fieldCount || '?'} fields)`;
      } else {
        detectEl.textContent = 'No form detected';
      }
    });
  }
});

// ── Scan page ──
document.getElementById('scan-btn').addEventListener('click', () => {
  showStatus('scan-status', '🔍 Scanning...', 'info');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return showStatus('scan-status', '❌ No active tab', 'error');
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
      if (chrome.runtime.lastError)
        return showStatus('scan-status', '❌ ' + chrome.runtime.lastError.message, 'error');
      if (!resp || resp.error)
        return showStatus('scan-status', '❌ ' + (resp?.error || 'Scan failed'), 'error');
      
      const { fields, platform } = resp;
      showStatus('scan-status',
        `✅ ${fields.length} fields found (${platform || 'unknown'})`, 'success');
      
      const container = document.getElementById('scan-results');
      container.innerHTML = '';
      fields.forEach(f => {
        const icon = f.semanticType !== 'unknown' ? '✅' : '❓';
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
          <span class="result-icon">${icon}</span>
          <span class="result-label">${f.label || f.semanticType}</span>
          <span class="result-type">${f.semanticType}</span>`;
        container.appendChild(div);
      });
    });
  });
});

// ── Autofill ──
document.getElementById('fill-btn').addEventListener('click', () => {
  showStatus('fill-status', '⚡ Filling...', 'info');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return showStatus('fill-status', '❌ No active tab', 'error');

    chrome.storage.local.get(['filly_profile'], (result) => {
      const profile = result.filly_profile;
      if (!profile || Object.keys(profile).length === 0) {
        showStatus('fill-status', '❌ No profile saved. Go to Profile tab first.', 'error');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'AUTOFILL',
        profile,
        options: {},
      }, (resp) => {
        if (chrome.runtime.lastError)
          return showStatus('fill-status', '❌ ' + chrome.runtime.lastError.message, 'error');
        if (!resp || resp.error)
          return showStatus('fill-status', '❌ ' + (resp?.error || 'Fill failed'), 'error');
        
        const { results } = resp;
        const total = results.filled + results.skipped + results.errors;
        showStatus('fill-status',
          `✅ Filled ${results.filled}/${total} fields` + (results.errors ? ` (${results.errors} errors)` : ''),
          results.errors > 0 ? 'error' : 'success');

        const container = document.getElementById('fill-results');
        container.innerHTML = '';
        results.details.forEach(d => {
          const icon = d.action === 'filled' ? '✅' : d.action === 'error' ? '❌' : '⏭️';
          const div = document.createElement('div');
          div.className = 'result-item';
          div.innerHTML = `
            <span class="result-icon">${icon}</span>
            <span class="result-label">${d.label || d.semantic_type || '?'}</span>
            ${d.value ? `<span class="result-value">${d.value}</span>` : ''}`;
          container.appendChild(div);
        });
      });
    });
  });
});

// ── Helpers ──
function showStatus(id, text, type) {
  const el = document.getElementById(id);
  el.className = `status status-${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
}
