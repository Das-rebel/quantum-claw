/**
 * FormFiller Pro — Popup Script
 * 
 * Handles profile editing, form scanning, and autofill triggering.
 */

const PROFILE_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'linkedin',
  'current_company', 'current_title', 'years_of_experience',
  'country', 'salary', 'salary_expectations', 'notice_period', 'gender',
];

// ---- Tab Switching ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ---- Load Profile ----
chrome.storage.local.get(['profile'], (result) => {
  const profile = result.profile || {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && profile[field]) el.value = profile[field];
  });
});

// ---- Save Profile ----
document.getElementById('save-profile').addEventListener('click', () => {
  const profile = {};
  PROFILE_FIELDS.forEach(field => {
    const el = document.getElementById(field);
    if (el && el.value.trim()) profile[field] = el.value.trim();
  });

  chrome.storage.local.set({ profile }, () => {
    showStatus('save-status', `✅ Profile saved! ${Object.keys(profile).length} fields.`, 'success');
  });
});

// ---- Scan Page ----
document.getElementById('scan-btn').addEventListener('click', () => {
  const statusEl = document.getElementById('scan-status');
  showStatus('scan-status', '🔍 Scanning...', 'info');

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      showStatus('scan-status', '❌ No active tab found', 'error');
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
      if (chrome.runtime.lastError) {
        showStatus('scan-status', `❌ ${chrome.runtime.lastError.message}`, 'error');
        return;
      }

      if (!resp || resp.error) {
        showStatus('scan-status', `❌ ${resp?.error || 'Scan failed'}`, 'error');
        return;
      }

      const { fields, platform } = resp;
      showStatus('scan-status',
        `✅ Found ${fields.length} fields on ${platform || 'unknown'} page`,
        'success'
      );

      // Render field list
      const container = document.getElementById('scan-results');
      container.innerHTML = '';
      fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'scan-field';
        const icon = f.semanticType !== 'unknown' ? '✅' : '❓';
        div.innerHTML = `
          <span class="status-icon">${icon}</span>
          <span class="label" style="flex:1">${f.label}</span>
          <span class="type">${f.semanticType}</span>
        `;
        container.appendChild(div);
      });
    });
  });
});

// ---- Autofill ----
document.getElementById('autofill-btn').addEventListener('click', () => {
  showStatus('fill-status', '⚡ Autofilling...', 'info');

  chrome.runtime.sendMessage({ type: 'AUTOFILL' }, (resp) => {
    if (chrome.runtime.lastError) {
      showStatus('fill-status', `❌ ${chrome.runtime.lastError.message}`, 'error');
      return;
    }

    if (!resp || resp.error) {
      showStatus('fill-status', `❌ ${resp?.error || 'Autofill failed'}`, 'error');
      return;
    }

    const { results } = resp;
    showStatus('fill-status',
      `✅ Filled ${results.filled} / ${results.filled + results.skipped + results.errors} fields (${results.errors} errors)`,
      results.errors > 0 ? 'error' : 'success'
    );

    // Render details
    const container = document.getElementById('fill-results');
    container.innerHTML = '';
    results.details.forEach(d => {
      const div = document.createElement('div');
      div.className = 'scan-field';
      const icon = d.action === 'filled' ? '✅' : d.action === 'error' ? '❌' : '⏭️';
      const value = d.value ? ` ← ${d.value}` : '';
      const reason = d.reason ? ` (${d.reason})` : '';
      div.innerHTML = `
        <span class="status-icon">${icon}</span>
        <span class="label" style="flex:1">${d.label || d.semanticType}${reason}${value}</span>
      `;
      container.appendChild(div);
    });
  });
});

// ---- Helpers ----
function showStatus(elementId, text, type) {
  const el = document.getElementById(elementId);
  el.className = `status status-${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
}
