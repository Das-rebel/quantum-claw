/**
 * vault-control Web Components
 * 
 * Reusable custom elements using Shadow DOM and slots.
 * Design tokens inherit from style.css CSS variables.
 */

// ============================================================================
// Icon SVG Definitions (inline for Shadow DOM encapsulation)
// ============================================================================

const ICONS = {
  twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
  bookmarks: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>`,
  kg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.25 17.292l-4.5-4.5 1.41-1.41 3.09 3.09 7.34-7.34 1.41 1.41-8.75 8.75z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
  openExternal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
};

// ============================================================================
// VaultCard Component
// A stat card displaying title, count, metadata, icon, and status.
// ============================================================================

class VaultCard extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'count', 'updated', 'size', 'status', 'icon'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.render();
    }
  }

  getIconSvg(iconType) {
    return ICONS[iconType] || ICONS.bookmarks;
  }

  render() {
    const title = this.getAttribute('title') || 'Untitled';
    const count = this.getAttribute('count') || '0';
    const updated = this.getAttribute('updated') || '';
    const size = this.getAttribute('size') || '';
    const status = this.getAttribute('status') || 'success';
    const iconType = this.getAttribute('icon') || 'bookmarks';

    const statusClass = status === 'error' ? 'error' : '';
    const iconClass = iconType;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          animation: fadeSlideIn 0.4s ease-out forwards;
        }

        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card {
          background: var(--bg-secondary, #161b22);
          border: 1px solid var(--border, #30363d);
          border-radius: 12px;
          padding: 20px;
          transition: border-color 0.2s, transform 0.2s;
        }

        .card:hover {
          border-color: var(--accent, #58a6ff);
          transform: translateY(-2px);
        }

        .card.error {
          border-color: var(--error, #f85149);
        }

        .stat-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(88, 166, 255, 0.15);
          color: var(--accent, #58a6ff);
        }

        .stat-icon.twitter { background: rgba(29, 161, 242, 0.15); color: #1da1f2; }
        .stat-icon.instagram { background: rgba(228, 64, 95, 0.15); color: #e4405f; }
        .stat-icon.bookmarks { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
        .stat-icon.kg { background: rgba(163, 113, 247, 0.15); color: #a371f7; }

        .stat-icon svg {
          width: 24px;
          height: 24px;
        }

        .stat-status {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
        }

        .stat-status.success {
          background: rgba(63, 185, 80, 0.15);
          color: var(--success, #3fb950);
        }

        .stat-status.error {
          background: rgba(248, 81, 73, 0.15);
          color: var(--error, #f85149);
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .stat-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary, #8b949e);
          margin-bottom: 4px;
        }

        .stat-count {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary, #e6edf3);
          margin-bottom: 8px;
        }

        .stat-count.large { font-size: 40px; }
        .stat-count.small { font-size: 24px; }

        .stat-meta {
          font-size: 12px;
          color: var(--text-muted, #6e7681);
          line-height: 1.6;
        }

        /* Slot styling for composed content */
        ::slotted(*) {
          display: none; /* Slots used for extension points if needed */
        }
      </style>

      <div class="card ${statusClass}">
        <div class="stat-header">
          <div class="stat-icon ${iconClass}">
            ${this.getIconSvg(iconType)}
          </div>
          <div class="stat-status ${statusClass}">
            <span class="status-dot"></span>
            <slot name="status-label">${status}</slot>
          </div>
        </div>
        <div class="stat-title">${title}</div>
        <div class="stat-count ${size}">${count}</div>
        ${updated ? `<div class="stat-meta">${updated}</div>` : ''}
        <slot></slot>
      </div>
    `;
  }
}

// ============================================================================
// SearchBar Component
// Compound search input with filter slot, emits 'search' event on Enter.
// ============================================================================

class SearchBar extends HTMLElement {
  static get observedAttributes() {
    return ['placeholder'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 'Search...';
  }

  bindEvents() {
    const input = this.shadowRoot.querySelector('.search-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.emitSearch();
        }
      });

      // Auto-search on input change after 300ms debounce
      let timeout;
      input.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.emitSearch(), 300);
      });
    }

    const button = this.shadowRoot.querySelector('.search-btn');
    if (button) {
      button.addEventListener('click', () => this.emitSearch());
    }
  }

  emitSearch() {
    const input = this.shadowRoot.querySelector('.search-input');
    const select = this.shadowRoot.querySelector('.search-select');

    if (!input) return;

    const query = input.value.trim();
    const source = select ? select.value : 'all';

    this.dispatchEvent(new CustomEvent('search', {
      bubbles: true,
      composed: true,
      detail: { query, source }
    }));
  }

  /**
   * Public method to set the search value programmatically.
   * @param {string} value - The search query value
   */
  setValue(value) {
    const input = this.shadowRoot.querySelector('.search-input');
    if (input) {
      input.value = value;
    }
  }

  /**
   * Public method to get the current search value.
   * @returns {string} The current search query
   */
  getValue() {
    const input = this.shadowRoot.querySelector('.search-input');
    return input ? input.value : '';
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .search-container {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .search-input {
          flex: 1;
          padding: 12px 16px;
          background: var(--bg-tertiary, #21262d);
          border: 1px solid var(--border, #30363d);
          border-radius: 8px;
          color: var(--text-primary, #e6edf3);
          font-size: 16px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }

        .search-input::placeholder {
          color: var(--text-muted, #6e7681);
        }

        .search-input:focus {
          border-color: var(--accent, #58a6ff);
        }

        .search-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          background: var(--gradient, linear-gradient(135deg, #58a6ff 0%, #a371f7 100%));
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
        }

        .search-btn:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .search-btn svg {
          width: 20px;
          height: 20px;
        }

        /* Filter slot container */
        .filter-container {
          display: flex;
          align-items: center;
        }

        ::slotted(.search-select) {
          width: 200px;
        }
      </style>

      <div class="search-container">
        <input 
          type="text" 
          class="search-input" 
          placeholder="${this.placeholder}"
          autocomplete="off"
        />
        <button type="button" class="search-btn" aria-label="Search">
          ${ICONS.search}
        </button>
      </div>
      <div class="filter-container">
        <slot name="filter"></slot>
      </div>
    `;
  }
}

// ============================================================================
// ResultItem Component
// Displays a single search result with source, author, text, and Open button.
// ============================================================================

class ResultItem extends HTMLElement {
  static get observedAttributes() {
    return ['source', 'author', 'text', 'url'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.render();
    }
  }

  /**
   * Truncates text to a maximum length, adding ellipsis if truncated.
   * @param {string} text - The text to truncate
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength = 120) {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }

  /**
   * Opens the URL in a new browser tab.
   */
  openUrl() {
    const url = this.getAttribute('url');
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Gets the appropriate badge class for a source type.
   * @param {string} source - The source identifier
   * @returns {string} CSS class name for the badge
   */
  getSourceBadgeClass(source) {
    const sourceLower = (source || '').toLowerCase();
    if (sourceLower.includes('twitter') || sourceLower.includes('x')) return 'twitter';
    if (sourceLower.includes('instagram') || sourceLower.includes('insta')) return 'instagram';
    if (sourceLower.includes('browser') || sourceLower.includes('kg')) return 'kg';
    return 'default';
  }

  render() {
    const source = this.getAttribute('source') || 'unknown';
    const author = this.getAttribute('author') || '';
    const text = this.getAttribute('text') || '';
    const url = this.getAttribute('url') || '';
    const truncatedText = this.truncateText(text);
    const badgeClass = this.getSourceBadgeClass(source);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          animation: fadeSlideIn 0.3s ease-out forwards;
        }

        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .result-item {
          padding: 16px;
          border-bottom: 1px solid var(--border, #30363d);
          transition: background 0.15s;
        }

        .result-item:hover {
          background: var(--bg-tertiary, #21262d);
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          gap: 12px;
        }

        .source-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          background: rgba(88, 166, 255, 0.2);
          color: var(--accent, #58a6ff);
        }

        .source-badge.twitter {
          background: rgba(29, 161, 242, 0.2);
          color: #1da1f2;
        }

        .source-badge.instagram {
          background: rgba(228, 64, 95, 0.2);
          color: #e4405f;
        }

        .source-badge.kg {
          background: rgba(63, 185, 80, 0.2);
          color: #3fb950;
        }

        .author {
          font-size: 12px;
          color: var(--text-muted, #6e7681);
          flex-shrink: 0;
        }

        .result-text {
          font-size: 14px;
          color: var(--text-secondary, #8b949e);
          margin-bottom: 8px;
          line-height: 1.5;
        }

        .result-url {
          font-size: 12px;
          color: var(--text-muted, #6e7681);
          font-family: monospace;
          word-break: break-all;
          margin-bottom: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-open {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: var(--accent, #58a6ff);
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-open:hover {
          opacity: 0.85;
        }

        .btn-open svg {
          width: 14px;
          height: 14px;
        }
      </style>

      <div class="result-item">
        <div class="result-header">
          <span class="source-badge ${badgeClass}">${source}</span>
          ${author ? `<span class="author">@${author}</span>` : ''}
        </div>
        <div class="result-text">${truncatedText}</div>
        ${url ? `<div class="result-url">${url}</div>` : ''}
        ${url ? `
          <button type="button" class="btn-open" aria-label="Open in new tab">
            ${ICONS.openExternal}
            Open
          </button>
        ` : ''}
      </div>
    `;
  }
}

// ============================================================================
// StatusBadge Component
// Reusable status indicator with pulse animation for active states.
// ============================================================================

class StatusBadge extends HTMLElement {
  static get observedAttributes() {
    return ['state', 'label'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.render();
    }
  }

  /**
   * Updates the badge state programmatically.
   * @param {string} state - New state: active, success, error, warning
   * @param {string} label - Optional new label
   */
  setState(state, label) {
    if (state) this.setAttribute('state', state);
    if (label !== undefined) this.setAttribute('label', label);
  }

  render() {
    const state = this.getAttribute('state') || 'active';
    const label = this.getAttribute('label') || state;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          background: var(--badge-bg, rgba(88, 166, 255, 0.15));
          color: var(--badge-color, var(--accent, #58a6ff));
          transition: background 0.2s, color 0.2s;
        }

        /* State variants using CSS custom properties */
        .badge.active {
          --badge-bg: rgba(88, 166, 255, 0.15);
          --badge-color: var(--accent, #58a6ff);
          animation: pulse 2s ease-in-out infinite;
        }

        .badge.success {
          --badge-bg: rgba(63, 185, 80, 0.15);
          --badge-color: var(--success, #3fb950);
        }

        .badge.error {
          --badge-bg: rgba(248, 81, 73, 0.15);
          --badge-color: var(--error, #f85149);
        }

        .badge.warning {
          --badge-bg: rgba(210, 153, 34, 0.15);
          --badge-color: var(--warning, #d29922);
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .badge.active .dot {
          animation: dotPulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }

        @keyframes dotPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.6;
          }
        }
      </style>

      <div class="badge ${state}">
        <span class="dot"></span>
        <slot>${label}</slot>
      </div>
    `;
  }
}

// ============================================================================
// Component Registration
// Register all custom elements as ES module exports.
// ============================================================================

// Register VaultCard with tag name 'vault-card'
customElements.define('vault-card', VaultCard);

// Register SearchBar with tag name 'search-bar'
customElements.define('search-bar', SearchBar);

// Register ResultItem with tag name 'result-item'
customElements.define('result-item', ResultItem);

// Register StatusBadge with tag name 'status-badge'
customElements.define('status-badge', StatusBadge);

// ============================================================================
// ES Module Exports
// Export all components for use as modules in other files.
// ============================================================================

export { VaultCard, SearchBar, ResultItem, StatusBadge };

export default {
  VaultCard,
  SearchBar,
  ResultItem,
  StatusBadge
};
