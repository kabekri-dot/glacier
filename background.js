// Opens the Glacier sidebar from the toolbar button and the keyboard shortcut.
//
// One file serves both browsers (ADR 0001):
// - Chrome runs it as the service worker and opens its side panel.
// - Firefox runs it as a background script and toggles its sidebar.

import { createOpenPanels } from "./src/open-panels.mjs";

const PANEL_PORT_PREFIX = "glacier-panel:";

const api = typeof browser !== "undefined" ? browser : chrome;

// Chrome: clicking the toolbar button opens the side panel. With this set,
// Chrome never fires action.onClicked, so the Firefox handler below is inert
// there.
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.warn("Glacier: could not set the toolbar button behavior", error);
    });
}

// Firefox: an MV3 action with no popup only fires onClicked, so the toolbar
// button needs a handler to toggle the sidebar.
if (
  api.action &&
  api.action.onClicked &&
  api.sidebarAction &&
  api.sidebarAction.toggle
) {
  api.action.onClicked.addListener(() => {
    api.sidebarAction.toggle();
  });
}

// Chrome: each open panel keeps a connection to this worker (see
// sidebar/panel.js). Asking the browser whether a panel is open proved
// unreliable, so the connections are the record. A reconnecting panel after a
// worker restart puts its window back on the list.
const openPanels = createOpenPanels();
const panelPorts = new Map();

if (api.runtime && api.runtime.onConnect) {
  api.runtime.onConnect.addListener((port) => {
    if (!port.name.startsWith(PANEL_PORT_PREFIX)) return;
    const windowId = Number(port.name.slice(PANEL_PORT_PREFIX.length));
    openPanels.connect(windowId, port);
    panelPorts.set(port, windowId);
    port.onDisconnect.addListener(() => {
      openPanels.disconnect(windowId, port);
      panelPorts.delete(port);
    });
  });
}

// Chrome: close the window's panel, or open it. No await before open(): the
// shortcut's user gesture must still be alive when it runs. Closing hides the
// panel, and the panel saves the open note when it hides.
function toggleSidePanel(windowId) {
  if (!openPanels.isOpen(windowId)) {
    api.sidePanel.open({ windowId }).catch((error) => {
      console.warn("Glacier: could not open the side panel", error);
    });
    return;
  }
  for (const [port, portWindowId] of panelPorts) {
    if (portWindowId === windowId) port.postMessage({ type: "close" });
  }
  if (api.sidePanel.close) {
    api.sidePanel.close({ windowId }).catch((error) => {
      console.warn("Glacier: could not close the side panel", error);
    });
  }
}

// Clipping (#100): the sidebar opens, and the clip waits in storage for it.
// The panel takes it when it starts, or when it appears while the panel is
// already open. Nothing is kept once the panel has taken it.
function openPanelFor(tab) {
  if (api.sidePanel && api.sidePanel.open && tab) {
    // No await before open(): the click or shortcut's gesture must be alive.
    api.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
      console.warn("Glacier: could not open the side panel", error);
    });
  } else if (api.sidebarAction && api.sidebarAction.open) {
    api.sidebarAction.open();
  }
}

function handOverClip(text, tab) {
  if (!text || !text.trim() || !tab || !tab.url) return;
  api.storage.local
    .set({ pendingClip: { text, title: tab.title ?? "", url: tab.url, at: Date.now() } })
    .catch((error) => {
      console.warn("Glacier: could not hand over the clip", error);
    });
}

// Right-click on a selection: the click hands over the selected text.
if (api.contextMenus && api.contextMenus.onClicked) {
  api.runtime.onInstalled.addListener(() => {
    api.contextMenus.create({
      id: "clip-to-glacier",
      title: "Clip to Glacier",
      contexts: ["selection"],
    });
  });
  api.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "clip-to-glacier") return;
    openPanelFor(tab);
    handOverClip(info.selectionText, tab);
  });
}

// Keyboard shortcut (Alt+Shift+G by default).
if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command, tab) => {
    if (command === "clip-selection") {
      openPanelFor(tab);
      if (!tab || !api.scripting) return;
      // The shortcut grants activeTab, so the selection can be read here.
      api.scripting
        .executeScript({ target: { tabId: tab.id }, func: () => String(window.getSelection()) })
        .then((results) => handOverClip(results?.[0]?.result, tab))
        .catch((error) => {
          console.warn("Glacier: could not read the selection", error);
        });
      return;
    }
    if (command !== "open-glacier") return;

    if (api.sidePanel && api.sidePanel.open && tab) {
      // Chrome side panel. The command counts as the required user gesture.
      toggleSidePanel(tab.windowId);
    } else if (api.sidebarAction && api.sidebarAction.toggle) {
      // Firefox sidebar.
      api.sidebarAction.toggle();
    }
  });
}
