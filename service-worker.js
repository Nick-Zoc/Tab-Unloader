// Tab Unload — Service Worker (Background)
// Handles tab discarding, favicon modification, context menus, and badge updates.
// All state is persisted in chrome.storage — no global variables.

// ─── Event Registration (must be synchronous at top level) ───

chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// ─── Installation ───

async function onInstalled(details) {
  // Set default settings
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      settings: {
        protectPinned: true,
        showBadge: true
      }
    });
  }

  // Create context menus (idempotent)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'unload-this-tab',
      title: 'Unload This Tab',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'unload-other-tabs',
      title: 'Unload Other Tabs in Window',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'separator-1',
      type: 'separator',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'unload-tabs-left',
      title: 'Unload Tabs to the Left',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'unload-tabs-right',
      title: 'Unload Tabs to the Right',
      contexts: ['page']
    });
  });

  // Initial badge update
  await updateBadge();
}

// ─── Message Handler ───

function handleMessage(message, sender, sendResponse) {
  (async () => {
    try {
      switch (message.type) {
        case 'DISCARD_TABS': {
          const result = await discardTabs(message.tabIds, message.activeTabId);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'DISCARD_OTHER_TABS': {
          const result = await discardOtherTabs(message.windowId, message.activeTabId);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'DISCARD_LEFT': {
          const result = await discardDirection('left', message.windowId, message.activeTabId, message.activeTabIndex);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'DISCARD_RIGHT': {
          const result = await discardDirection('right', message.windowId, message.activeTabId, message.activeTabIndex);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'DISCARD_ALL_WINDOWS': {
          const result = await discardAllWindows(message.activeTabId);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'GET_TABS': {
          const tabs = await getWindowTabs(message.windowId);
          sendResponse({ success: true, tabs });
          break;
        }
        case 'GET_SETTINGS': {
          const { settings } = await chrome.storage.local.get('settings');
          sendResponse({ success: true, settings: settings || { protectPinned: true, showBadge: true } });
          break;
        }
        case 'SAVE_SETTINGS': {
          await chrome.storage.local.set({ settings: message.settings });
          await updateBadge();
          sendResponse({ success: true });
          break;
        }
        case 'RELOAD_TAB': {
          await chrome.tabs.reload(message.tabId);
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true; // Keep channel open for async response
}

// ─── Tab Event Handlers ───

async function handleTabUpdated(tabId, changeInfo, tab) {
  // When a discarded tab is reactivated (user clicks it), it reloads
  // and the original favicon is restored automatically.
  if (changeInfo.discarded === false) {
    // Tab was just un-discarded — clean up stored favicon data
    const key = `favicon_${tabId}`;
    await chrome.storage.session.remove(key);
  }

  // Update badge when discard state changes
  if (changeInfo.hasOwnProperty('discarded')) {
    await updateBadge();
  }
}

async function handleTabRemoved(tabId) {
  const key = `favicon_${tabId}`;
  await chrome.storage.session.remove(key);
  await updateBadge();
}

async function handleTabActivated(activeInfo) {
  await updateBadge();
}

// ─── Context Menu Handler ───

async function handleContextMenuClick(info, tab) {
  if (!tab) return;

  const { settings } = await chrome.storage.local.get('settings');
  
  switch (info.menuItemId) {
    case 'unload-this-tab': {
      // Can't discard the active tab — need to activate another first
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      if (tabs.length <= 1) break;
      
      // Find the next tab to activate
      const currentIndex = tabs.findIndex(t => t.id === tab.id);
      const nextTab = tabs[currentIndex + 1] || tabs[currentIndex - 1];
      await chrome.tabs.update(nextTab.id, { active: true });
      
      // Small delay then discard
      await sleep(100);
      await discardSingleTab(tab.id);
      break;
    }
    case 'unload-other-tabs':
      await discardOtherTabs(tab.windowId, tab.id);
      break;
    case 'unload-tabs-left':
      await discardDirection('left', tab.windowId, tab.id, tab.index);
      break;
    case 'unload-tabs-right':
      await discardDirection('right', tab.windowId, tab.id, tab.index);
      break;
  }
}

// ─── Core Discard Logic ───

async function discardTabs(tabIds, activeTabId) {
  const { settings } = await chrome.storage.local.get('settings');
  let discarded = 0;
  let skipped = 0;

  for (const tabId of tabIds) {
    if (tabId === activeTabId) {
      skipped++;
      continue;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      
      if (tab.discarded) {
        skipped++;
        continue;
      }

      if (settings?.protectPinned && tab.pinned) {
        skipped++;
        continue;
      }

      if (!canDiscardTab(tab)) {
        skipped++;
        continue;
      }

      await discardSingleTab(tabId);
      discarded++;
    } catch (err) {
      skipped++;
    }
  }

  await updateBadge();
  return { discarded, skipped };
}

async function discardOtherTabs(windowId, activeTabId) {
  const tabs = await chrome.tabs.query({ windowId });
  const tabIds = tabs.map(t => t.id);
  return discardTabs(tabIds, activeTabId);
}

async function discardDirection(direction, windowId, activeTabId, activeTabIndex) {
  const tabs = await chrome.tabs.query({ windowId });
  const filtered = tabs.filter(t => {
    if (direction === 'left') return t.index < activeTabIndex;
    return t.index > activeTabIndex;
  });
  const tabIds = filtered.map(t => t.id);
  return discardTabs(tabIds, activeTabId);
}

async function discardAllWindows(activeTabId) {
  const windows = await chrome.windows.getAll({ populate: true });
  let totalDiscarded = 0;
  let totalSkipped = 0;

  for (const win of windows) {
    if (win.type !== 'normal') continue;
    const tabIds = win.tabs.map(t => t.id);
    const result = await discardTabs(tabIds, activeTabId);
    totalDiscarded += result.discarded;
    totalSkipped += result.skipped;
  }

  return { discarded: totalDiscarded, skipped: totalSkipped };
}

async function discardSingleTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.active || tab.discarded) return false;
    if (!canDiscardTab(tab)) return false;

    // Step 1: Try to modify the favicon BEFORE discarding
    // This is the key workaround for the Chromium kExternal discard issue
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: modifyFaviconWithDottedBorder,
        args: []
      });
      // Give the browser a moment to pick up the new favicon
      await sleep(250);
    } catch (faviconErr) {
      // Some tabs (chrome://, chrome-extension://, etc.) can't have scripts injected
      // That's fine — we still discard, just without the visual indicator
    }

    // Step 2: Discard the tab
    await chrome.tabs.discard(tabId);
    return true;
  } catch (err) {
    return false;
  }
}

// ─── Favicon Modification (injected as content script) ───

function modifyFaviconWithDottedBorder() {
  // This function runs in the context of the web page
  // It modifies the favicon to add a dotted circle border

  function getExistingFavicon() {
    // Check for <link rel="icon"> or <link rel="shortcut icon">
    const selectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]'
    ];

    for (const sel of selectors) {
      const link = document.querySelector(sel);
      if (link && link.href) return link.href;
    }

    // Fallback to /favicon.ico
    return new URL('/favicon.ico', window.location.origin).href;
  }

  function applyDottedFavicon(faviconUrl) {
    const SIZE = 32;
    const ICON_SIZE = 20;
    const OFFSET = (SIZE - ICON_SIZE) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Draw the original favicon centered and slightly smaller
      ctx.drawImage(img, OFFSET, OFFSET, ICON_SIZE, ICON_SIZE);

      // Draw the dotted circle border around it
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = '#9aa0a6'; // Chrome's native gray color
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, (SIZE / 2) - 1.5, 0, 2 * Math.PI);
      ctx.stroke();

      // Update or create the favicon link element
      const dataUrl = canvas.toDataURL('image/png');
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      // Remove old sizes attribute to avoid conflicts
      link.removeAttribute('sizes');
      link.type = 'image/png';
      link.href = dataUrl;

      // Also update shortcut icon if exists
      const shortcutLink = document.querySelector('link[rel="shortcut icon"]');
      if (shortcutLink) {
        shortcutLink.href = dataUrl;
      }
    };

    img.onerror = () => {
      // If the image can't be loaded (CORS, etc.), draw a generic dotted circle
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Draw a placeholder circle
      ctx.fillStyle = '#dadce0';
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, ICON_SIZE / 2 - 1, 0, 2 * Math.PI);
      ctx.fill();

      // Draw the dotted border
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, (SIZE / 2) - 1.5, 0, 2 * Math.PI);
      ctx.stroke();

      const dataUrl = canvas.toDataURL('image/png');
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.removeAttribute('sizes');
      link.type = 'image/png';
      link.href = dataUrl;
    };

    img.src = faviconUrl;
  }

  const faviconUrl = getExistingFavicon();
  applyDottedFavicon(faviconUrl);
}

// ─── Helpers ───

function canDiscardTab(tab) {
  // Can't discard active tabs
  if (tab.active) return false;
  // Can't discard already-discarded tabs
  if (tab.discarded) return false;
  // Skip chrome:// and other internal URLs
  if (!tab.url) return false;
  const url = tab.url;
  if (url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('devtools://') ||
      url.startsWith('edge://') ||
      url.startsWith('brave://') ||
      url.startsWith('about:') ||
      url.startsWith('chrome-search://')) {
    return false;
  }
  return true;
}

async function getWindowTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.map(t => ({
    id: t.id,
    title: t.title || 'Untitled',
    url: t.url || '',
    favIconUrl: t.favIconUrl || '',
    active: t.active,
    discarded: t.discarded,
    pinned: t.pinned,
    index: t.index
  }));
}

async function updateBadge() {
  const { settings } = await chrome.storage.local.get('settings');

  if (!settings?.showBadge) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const allTabs = await chrome.tabs.query({});
  const discardedCount = allTabs.filter(t => t.discarded).length;

  if (discardedCount > 0) {
    await chrome.action.setBadgeText({ text: String(discardedCount) });
    await chrome.action.setBadgeBackgroundColor({ color: '#5f6368' });
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
