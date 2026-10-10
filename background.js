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

// Keyboard shortcut (Alt+Shift+G by default).
if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command, tab) => {
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
