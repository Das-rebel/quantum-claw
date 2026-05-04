(function() {
  'use strict';

  const API_BASE = window.location.origin;
  let password = sessionStorage.getItem('vault_password');
  let currentTab = 'dashboard';
  let vaultStatus = {};
  let browseOffset = 0;
  let browseTotal = 0;
  let currentBrowseFile = 'vault/twitter_bookmarks_automated.json';

  // DOM Elements
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const refreshBtn = document.getElementById('refresh-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const lastUpdate = document.getElementById('last-update');
  const toast = document.getElementById('toast');

  // Init
  if (password) {
    showDashboard();
  }

  // Auth
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passInput = document.getElementById('password');
    const pass = passInput.value;

    try {
      const res = await fetch(`${API_BASE}/api/vault/status?password=${pass}`);
      if (res.ok) {
        password = pass;
        sessionStorage.setItem('vault_password', pass);
        showDashboard();
      } else {
        loginError.textContent = 'Invalid password';
      }
    } catch (e) {
      loginError.textContent = 'Connection error: ' + e.message;
    }
  });

  logoutBtn.addEventListener('click', () => {
    password = null;
    sessionStorage.removeItem('vault_password');
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
  });

  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadAllData();
    startAutoRefresh();
  }

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
      currentTab = tabId;
    });
  });

  // Refresh button
  refreshBtn.addEventListener('click', loadAllData);

  // Auto refresh
  let autoRefreshInterval;
  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
      if (currentTab === 'dashboard' || currentTab === 'system') {
        loadAllData();
      }
    }, 60000);
  }

  // API helper
  async function api(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}?password=${password}`, options);
    if (res.status === 401) {
      logoutBtn.click();
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Load all data
  async function loadAllData() {
    await Promise.all([
      loadVaultStatus(),
      loadSyncHistory(),
      loadFunctionsStatus(),
      loadSchedulersStatus()
    ]);
    lastUpdate.textContent = 'Updated: ' + new Date().toLocaleTimeString();
  }

  // Vault Status
  async function loadVaultStatus() {
    try {
      vaultStatus = await api('/api/vault/status');
      renderVaultStats();
    } catch (e) {
      showToast('Failed to load vault status: ' + e.message, 'error');
    }
  }

  function renderVaultStats() {
    const container = document.getElementById('vault-stats');
    const sources = [
      { key: 'vault/twitter_bookmarks_automated.json', title: 'Twitter Bookmarks', icon: 'twitter' },
      { key: 'vault/instagram_saved_automated.json', title: 'Instagram Saved', icon: 'instagram' },
      { key: 'vault/bookmarks_automated.json', title: 'Browser Bookmarks', icon: 'bookmarks' },
      { key: 'unified_knowledge_graph.json', title: 'Knowledge Graph', icon: 'kg' }
    ];

    container.innerHTML = sources.map(s => {
      const data = vaultStatus[s.key];
      const hasError = !data || data.error;
      const count = data && data.count !== undefined ? data.count : (hasError ? 'N/A' : '...');
      const updated = data && data.updated ? new Date(data.updated).toLocaleString() : 'N/A';
      const size = data && data.size ? formatBytes(data.size) : 'N/A';

      return '<div class="stat-card ' + (hasError ? 'error' : '') + '">' +
        '<div class="stat-header">' +
          '<div class="stat-icon ' + s.icon + '">' + getIcon(s.icon) + '</div>' +
          '<span class="status-dot ' + (hasError ? 'error' : 'success') + '"></span>' +
        '</div>' +
        '<div class="stat-title">' + s.title + '</div>' +
        '<div class="stat-count">' + (typeof count === 'number' ? count.toLocaleString() : count) + '</div>' +
        '<div class="stat-meta">Updated: ' + updated + '<br>Size: ' + size + '</div>' +
      '</div>';
    }).join('');

    // Sync summary
    if (vaultStatus['vault/latest_sync_summary.json']) {
      const summary = vaultStatus['vault/latest_sync_summary.json'];
      const syncContainer = document.getElementById('sync-history');
      let html = '';
      if (summary.twitter) html += '<div class="history-item"><span class="history-source">Twitter</span><span class="history-count">' + (summary.twitter.count || 0) + ' posts</span></div>';
      if (summary.instagram) html += '<div class="history-item"><span class="history-source">Instagram</span><span class="history-count">' + (summary.instagram.count || 0) + ' posts</span></div>';
      if (html) document.getElementById('sync-history').innerHTML = html;
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getIcon(type) {
    const icons = {
      twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/></svg>',
      bookmarks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>',
      kg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/></svg>'
    };
    return icons[type] || '';
  }

  // Sync History
  async function loadSyncHistory() {
    const container = document.getElementById('sync-history');
    try {
      const history = await api('/api/vault/history');
      if (!history || history.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted)">No sync history available</p>';
        return;
      }
      container.innerHTML = history.slice(0, 5).map(function(h) {
        return '<div class="history-item">' +
          '<span class="history-source">' + (h.source || 'Unknown') + '</span>' +
          '<span class="history-count">' + (h.count || 0) + ' posts</span>' +
          '<span class="history-time">' + (h.timestamp ? new Date(h.timestamp).toLocaleString() : '') + '</span>' +
        '</div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<p style="color: var(--text-muted)">Failed to load history</p>';
    }
  }

  // Sync buttons
  document.querySelectorAll('.btn-sync').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      const syncType = btn.dataset.sync;
      btn.disabled = true;
      const statusContainer = document.getElementById('sync-status');
      statusContainer.innerHTML = '<div class="sync-status-item"><span class="status running">Triggering ' + syncType + '...</span></div>';
      try {
        const res = await api('/api/sync/' + syncType, { method: 'POST' });
        if (res.success) {
          statusContainer.innerHTML = '<div class="sync-status-item"><span class="status success">' + res.message + '</span></div>';
          showToast(res.message, 'success');
        } else {
          statusContainer.innerHTML = '<div class="sync-status-item"><span class="status error">' + (res.error || 'Failed') + '</span></div>';
          showToast('Sync failed: ' + res.error, 'error');
        }
      } catch (e) {
        statusContainer.innerHTML = '<div class="sync-status-item"><span class="status error">' + e.message + '</span></div>';
        showToast('Sync error: ' + e.message, 'error');
      }
      btn.disabled = false;
    });
  });

  // Browse
  document.getElementById('browse-load').addEventListener('click', function() {
    currentBrowseFile = document.getElementById('browse-file').value;
    browseOffset = 0;
    loadBrowseData();
  });

  async function loadBrowseData() {
    const container = document.getElementById('browse-data');
    const info = document.getElementById('browse-info');
    try {
      const data = await api('/api/vault/browse?file=' + encodeURIComponent(currentBrowseFile) + '&limit=5&offset=' + browseOffset);
      browseTotal = data.total;
      info.textContent = 'Showing ' + (data.offset + 1) + '-' + Math.min(data.offset + data.limit, data.total) + ' of ' + data.total + ' items';
      if (!data.data || data.data.length === 0) {
        container.innerHTML = '<div class="browse-item">No data found</div>';
        return;
      }
      container.innerHTML = data.data.slice(0, 5).map(function(item) {
        return '<div class="browse-item"><pre>' + JSON.stringify(item, null, 2) + '</pre></div>';
      }).join('');
      renderPagination();
    } catch (e) {
      container.innerHTML = '<div class="browse-item" style="color: var(--error)">Error: ' + e.message + '</div>';
    }
  }

  function renderPagination() {
    const container = document.getElementById('browse-pagination');
    const totalPages = Math.ceil(browseTotal / 5);
    const currentPage = Math.floor(browseOffset / 5) + 1;
    container.innerHTML = '' +
      '<button onclick="browsePrev()" ' + (currentPage <= 1 ? 'disabled' : '') + '>Previous</button>' +
      '<span>Page ' + currentPage + ' of ' + totalPages + '</span>' +
      '<button onclick="browseNext()" ' + (currentPage >= totalPages ? 'disabled' : '') + '>Next</button>';
  }

  window.browsePrev = function() {
    browseOffset = Math.max(0, browseOffset - 5);
    loadBrowseData();
  };

  window.browseNext = function() {
    browseOffset = Math.min(browseTotal - 5, browseOffset + 5);
    loadBrowseData();
  };

  // Functions status
  async function loadFunctionsStatus() {
    const container = document.getElementById('functions-list');
    try {
      const functions = await api('/api/functions/status');
      if (!functions || functions.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted)">No functions found</p>';
        return;
      }
      container.innerHTML = functions.map(function(f) {
        return '<div class="function-card">' +
          '<div class="function-info">' +
            '<span class="function-name">' + f.name + '</span>' +
            '<span class="function-region">' + (f.region || 'N/A') + '</span>' +
            '<span class="function-url">' + (f.url || 'N/A') + '</span>' +
          '</div>' +
          '<span class="function-state ' + (f.state === 'ACTIVE' ? 'active' : 'error') + '">' + f.state + '</span>' +
        '</div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<p style="color: var(--error)">Error: ' + e.message + '</p>';
    }
  }

  // Schedulers status
  async function loadSchedulersStatus() {
    const container = document.getElementById('schedulers-list');
    try {
      const schedulers = await api('/api/schedulers/status');
      if (!schedulers || schedulers.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted)">No schedulers found</p>';
        return;
      }
      container.innerHTML = schedulers.map(function(s) {
        return '<div class="scheduler-card">' +
          '<div class="scheduler-info">' +
            '<span class="scheduler-name">' + s.name + '</span>' +
            '<span class="scheduler-schedule">' + (s.schedule || 'N/A') + '</span>' +
            '<span class="scheduler-uri">' + (s.uri || 'N/A') + '</span>' +
          '</div>' +
          '<span class="scheduler-state ' + (s.state === 'ENABLED' ? 'active' : 'error') + '">' + s.state + '</span>' +
        '</div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<p style="color: var(--error)">Error: ' + e.message + '</p>';
    }
  }

  // Toast
  function showToast(message, type) {
    type = type || '';
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(function() { toast.className = 'toast'; }, 3000);
  }
})();
