// Tab Unload — Popup Logic

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Get current window and active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWindow = await chrome.windows.getCurrent();

  // Load settings
  const settingsResp = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const settings = settingsResp.settings || { protectPinned: true, showBadge: true };

  // Apply settings to UI
  document.getElementById('chk-protect-pinned').checked = settings.protectPinned;
  document.getElementById('chk-show-badge').checked = settings.showBadge;

  // Load tabs
  await refreshTabs(currentWindow.id, activeTab.id);
  await refreshStats();

  // ─── Action Buttons ───

  document.getElementById('btn-unload-other').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    const resp = await chrome.runtime.sendMessage({
      type: 'DISCARD_OTHER_TABS',
      windowId: currentWindow.id,
      activeTabId: activeTab.id
    });
    btn.classList.remove('is-loading');
    showToast(`Unloaded ${resp.discarded} tab${resp.discarded !== 1 ? 's' : ''}`);
    await refreshAll(currentWindow.id, activeTab.id);
  });

  document.getElementById('btn-unload-left').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    const resp = await chrome.runtime.sendMessage({
      type: 'DISCARD_LEFT',
      windowId: currentWindow.id,
      activeTabId: activeTab.id,
      activeTabIndex: activeTab.index
    });
    btn.classList.remove('is-loading');
    showToast(`Unloaded ${resp.discarded} tab${resp.discarded !== 1 ? 's' : ''}`);
    await refreshAll(currentWindow.id, activeTab.id);
  });

  document.getElementById('btn-unload-right').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    const resp = await chrome.runtime.sendMessage({
      type: 'DISCARD_RIGHT',
      windowId: currentWindow.id,
      activeTabId: activeTab.id,
      activeTabIndex: activeTab.index
    });
    btn.classList.remove('is-loading');
    showToast(`Unloaded ${resp.discarded} tab${resp.discarded !== 1 ? 's' : ''}`);
    await refreshAll(currentWindow.id, activeTab.id);
  });

  document.getElementById('btn-unload-all-windows').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.classList.add('is-loading');
    const resp = await chrome.runtime.sendMessage({
      type: 'DISCARD_ALL_WINDOWS',
      activeTabId: activeTab.id
    });
    btn.classList.remove('is-loading');
    showToast(`Unloaded ${resp.discarded} tab${resp.discarded !== 1 ? 's' : ''} across all windows`);
    await refreshAll(currentWindow.id, activeTab.id);
  });

  // ─── Settings ───

  document.getElementById('settings-toggle').addEventListener('click', () => {
    const panel = document.getElementById('settings-panel');
    const toggle = document.getElementById('settings-toggle');
    const isOpen = panel.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen);
  });

  document.getElementById('chk-protect-pinned').addEventListener('change', saveSettings);
  document.getElementById('chk-show-badge').addEventListener('change', saveSettings);
}

// ─── Tab List ───

async function refreshTabs(windowId, activeTabId) {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_TABS', windowId });
  const tabs = resp.tabs || [];
  const container = document.getElementById('tabs-list');
  const countEl = document.getElementById('tabs-count');

  const discardedInWindow = tabs.filter(t => t.discarded).length;
  countEl.textContent = `${discardedInWindow} unloaded`;

  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = `
      <div class="tabs-empty">
        <div class="tabs-empty-icon">📭</div>
        <div>No tabs found</div>
      </div>
    `;
    return;
  }

  for (const tab of tabs) {
    const el = createTabItem(tab, activeTabId);
    container.appendChild(el);
  }
}

function createTabItem(tab, activeTabId) {
  const div = document.createElement('div');
  div.className = 'tab-item';

  if (tab.active) div.classList.add('tab-item--active');
  if (tab.discarded) div.classList.add('tab-item--discarded');

  // Favicon
  const faviconWrap = document.createElement('div');
  faviconWrap.className = 'tab-favicon-wrap';

  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tab.favIconUrl;
    img.alt = '';
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.className = 'tab-favicon-placeholder';
      placeholder.textContent = getInitial(tab.title);
      faviconWrap.insertBefore(placeholder, faviconWrap.firstChild);
    });
    faviconWrap.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'tab-favicon-placeholder';
    placeholder.textContent = getInitial(tab.title);
    faviconWrap.appendChild(placeholder);
  }

  // Status indicator
  const status = document.createElement('div');
  status.className = `tab-status ${tab.discarded ? 'tab-status--discarded' : 'tab-status--active'}`;
  if (!tab.active && !tab.discarded) status.style.display = 'none';
  faviconWrap.appendChild(status);

  div.appendChild(faviconWrap);

  // Info
  const info = document.createElement('div');
  info.className = 'tab-info';

  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || 'Untitled';
  title.title = tab.title || 'Untitled';
  info.appendChild(title);

  const url = document.createElement('div');
  url.className = 'tab-url';
  try {
    url.textContent = new URL(tab.url).hostname;
  } catch {
    url.textContent = tab.url;
  }
  info.appendChild(url);

  div.appendChild(info);

  // Badges
  const badges = document.createElement('div');
  badges.className = 'tab-badges';

  if (tab.pinned) {
    const badge = document.createElement('span');
    badge.className = 'tab-badge tab-badge--pinned';
    badge.textContent = 'PIN';
    badges.appendChild(badge);
  }

  if (tab.active) {
    const badge = document.createElement('span');
    badge.className = 'tab-badge tab-badge--active-label';
    badge.textContent = 'ACTIVE';
    badges.appendChild(badge);
  } else if (tab.discarded) {
    const badge = document.createElement('span');
    badge.className = 'tab-badge tab-badge--discarded';
    badge.textContent = 'UNLOADED';
    badges.appendChild(badge);
  }

  div.appendChild(badges);

  // Action button (unload or reload)
  if (!tab.active) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'tab-action';
    actionBtn.title = tab.discarded ? 'Reload tab' : 'Unload tab';

    if (tab.discarded) {
      // Reload icon
      actionBtn.innerHTML = `<svg viewBox="0 0 12 12" fill="none"><path d="M1 6a5 5 0 019-3M11 6a5 5 0 01-9 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M10 1v3h-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'RELOAD_TAB', tabId: tab.id });
        showToast('Tab reloaded');
        // Brief delay for reload to start
        setTimeout(async () => {
          const [at] = await chrome.tabs.query({ active: true, currentWindow: true });
          const cw = await chrome.windows.getCurrent();
          await refreshAll(cw.id, at.id);
        }, 500);
      });
    } else {
      // Unload icon (circle with X)
      actionBtn.innerHTML = `<svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/><path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>`;
      actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({
          type: 'DISCARD_TABS',
          tabIds: [tab.id],
          activeTabId: null // Not active, safe to discard
        });
        showToast('Tab unloaded');
        const [at] = await chrome.tabs.query({ active: true, currentWindow: true });
        const cw = await chrome.windows.getCurrent();
        await refreshAll(cw.id, at.id);
      });
    }

    div.appendChild(actionBtn);
  }

  return div;
}

// ─── Stats ───

async function refreshStats() {
  const allTabs = await chrome.tabs.query({});
  const discardedCount = allTabs.filter(t => t.discarded).length;
  document.getElementById('discarded-count').textContent = discardedCount;
  document.getElementById('total-count').textContent = allTabs.length;
}

async function refreshAll(windowId, activeTabId) {
  await refreshTabs(windowId, activeTabId);
  await refreshStats();
}

// ─── Settings ───

async function saveSettings() {
  const settings = {
    protectPinned: document.getElementById('chk-protect-pinned').checked,
    showBadge: document.getElementById('chk-show-badge').checked
  };
  await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
}

// ─── Toast ───

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2000);
}

// ─── Helpers ───

function getInitial(title) {
  if (!title) return '?';
  return title.charAt(0).toUpperCase();
}
