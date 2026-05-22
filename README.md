# Tab Unload ── v1.0.0

A lightweight, professional Chrome & Chromium-based browser extension (Manifest V3) that unloads inactive tabs to free up system memory. It introduces a **custom, parallelized visual indicator workaround** to restore the dotted tab indicator that recent Chromium versions omit for extension-triggered discards.

---

## 🚀 Key Features

* **Manual Tab Discarding**: Instantly unload inactive tabs to reclaim hundreds of megabytes (or gigabytes) of RAM.
* **Smart Indicator Restoration**: Automatically adds a dotted circle border around the tab's favicon when it's unloaded, matching the native Chrome style.
* **Parallel Execution Engine**: Unloads batches of tabs (10–20+ tabs) concurrently, completing the entire operation in under **300ms** (a 10–20x speedup over sequential unloads).
* **CORS-Resilient Fallback**: Uses a taint-resistant canvas fallback mechanism to ensure that 100% of tabs receive a visual indicator, even if their favicons are hosted on domains with strict CORS policies.
* **Granular Bulk Actions**:
  * **Unload Other Tabs**: Discard all tabs in the current window except the active one.
  * **Unload Tabs to the Left / Right**: Clear clutter in a specific direction from your active tab.
  * **Unload All Windows**: Unload tabs across all open browser windows at once.
* **Context Menu Integration**: Right-click anywhere on a webpage to unload tabs directly.
* **Privacy-First Design**: **Zero telemetry, zero network requests, and zero tracking**. All settings are stored locally in your browser.

---

## 🛠 How It Works (The Chromium Fix)

In recent Chromium builds, Chrome's internal engine distinguishes between how a tab is discarded:
1. **`kProactive`** (Chrome's auto-Memory Saver): Shows the native dotted favicon indicator.
2. **`kExternal`** (Extensions calling `chrome.tabs.discard()`): Does **not** show the indicator.

Since extensions cannot force Chromium to apply the native indicator, **Tab Unload** solves this from the extension side:
1. When you trigger an unload, the extension injects a script into the page.
2. It draws the current favicon on a 32x32 `<canvas>` with a dotted circle border.
3. It replaces the page's favicon with this modified image as a base64 Data URL.
4. The service worker waits briefly for the browser process to receive the update, then discards the tab.
5. The browser caches the modified favicon in the tab strip. When you click the tab, it reloads and the original favicon is naturally restored.

---

## 📦 Installation

To load the extension in developer mode:

1. Clone or download this repository to a folder on your computer (e.g., `/Users/nick/Dev/Projects/tabUnload`).
2. Open Brave, Google Chrome, or Microsoft Edge.
3. Navigate to the extensions page (`chrome://extensions` or `brave://extensions`).
4. Toggle **Developer mode** on in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the folder containing this extension (`tabUnload`).

---

## ⚙ Settings & Customization

The extension features a clean, professional, non-intrusive Settings panel:

* **Protect Pinned Tabs**: Toggle this to prevent pinned tabs from being unloaded during bulk operations.
* **Show Badge Count**: Shows a clean badge count of currently unloaded tabs on the extension's toolbar icon.

---

## 🔒 Security & Privacy

This extension has been designed with strict adherence to security best practices:
* **No External Resources**: It runs 100% offline. It loads no remote scripts, tracker libraries, or styles.
* **Isolated Environment**: Favicon modifications are performed in the tab's page context. If a site restricts canvas image manipulation (CORS), the script catches the failure and immediately switches to a locally-drawn fallback vector circle to prevent data leaks.
* **Permissions Scope**: Declares only the minimum required Manifest V3 permissions:
  * `tabs` — Reading tab metadata (URLs, titles, and icons) to display in the list.
  * `scripting` — Injecting the favicon editor script.
  * `storage` — Saving user settings.
  * `contextMenus` — Registering right-click context menu options.
  * `<all_urls>` — Injecting the favicon modifier across active webpages.

---

## 📂 Project Structure

```
tabUnload/
├── manifest.json         # Extension manifest (MV3 configuration)
├── service-worker.js     # Background scripts (discards, parallel task dispatch, context menus)
├── README.md             # Product documentation
├── generate_icons.py     # Local icon utility script
├── icons/                # Extension logos (16px, 48px, 128px)
└── popup/
    ├── popup.html        # Clean, modern control panel UI
    ├── popup.css         # Styling with elegant layout tokens
    └── popup.js          # Tab list rendering and button handlers
```

---

## 📄 Developer Analysis

For details regarding the Chromium engine root cause analysis, IPC delays, and performance benchmarks comparing sequential vs. parallel tab unloading, refer to [developer_report.md](file:///Users/nick/.gemini/antigravity/brain/ad44f7fd-5d1f-4429-9e43-69a0a3f3f9a7/developer_report.md).
