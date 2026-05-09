/**
 * FormFiller Pro — Background Service Worker
 * 
 * Handles: side panel, badge updates, message routing, profile storage
 */

const DEBUG = true;
const log = (...args) => { if (DEBUG) console.log('[FormFiller BG]', ...args); };

// ATS URL patterns for badge detection
const ATS_PATTERNS = [
  { pattern: /greenhouse\.io/i, label: 'Greenhouse' },
  { pattern: /jobs\.lever\.co/i, label: 'Lever' },
  { pattern: /myworkday|workday\.com/i, label: 'Workday' },
  { pattern: /icims\.com/i, label: 'iCIMS' },
  { pattern: /jobvite\.com/i, label: 'Jobvite' },
  { pattern: /smartrecruiters/i, label: 'SmartRecruiters' },
  { pattern: /docs\.google\.com\/forms/i, label: 'Google Forms' },
];

function detectATS(url) {
  for (const { pattern, label } of ATS_PATTERNS) {
    if (pattern.test(url)) return label;
  }
  return null;
}

// Update badge when tab changes
async function updateBadge(tabId, url) {
  const ats = detectATS(url || '');
  if (ats) {
    await chrome.action.setBadgeText({ tabId, text: '📋' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
    await chrome.action.setTitle({ tabId, title: `FormFiller Pro — ${ats} detected!` });
  } else {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: 'FormFiller Pro' });
  }
}

// Tab update listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await updateBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) await updateBadge(activeInfo.tabId, tab.url);
  } catch (e) { /* tab may not exist */ }
});

// Open side panel on action click
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Side panel config
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    // ---- Profile Management ----
    case 'GET_PROFILE':
      chrome.storage.local.get(['profile'], (result) => {
        sendResponse({ profile: result.profile || null });
      });
      return true;

    case 'SAVE_PROFILE':
      chrome.storage.local.set({ profile: message.profile }, () => {
        sendResponse({ success: true });
      });
      return true;

    // ---- Form Detection & Scanning ----
    case 'DETECT_FORM':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return sendResponse({ detected: false });
        chrome.tabs.sendMessage(tabs[0].id, { type: 'DETECT_FORM' }, (resp) => {
          if (chrome.runtime.lastError) {
            sendResponse({ detected: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(resp);
          }
        });
      });
      return true;

    case 'SCAN_FIELDS':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_FIELDS' }, (resp) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(resp);
          }
        });
      });
      return true;

    // ---- Autofill ----
    case 'AUTOFILL':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return sendResponse({ error: 'No active tab' });

        // Get profile from storage if not provided
        if (message.profile) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'AUTOFILL',
            profile: message.profile,
            options: message.options || {},
          }, (resp) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
            } else {
              sendResponse(resp);
            }
          });
        } else {
          chrome.storage.local.get(['profile'], (result) => {
            if (!result.profile) {
              sendResponse({ error: 'No profile saved. Please set up your profile first.' });
              return;
            }
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'AUTOFILL',
              profile: result.profile,
              options: message.options || {},
            }, (resp) => {
              if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
              } else {
                sendResponse(resp);
              }
            });
          });
        }
      });
      return true;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
});

log('FormFiller Pro background service worker loaded');
