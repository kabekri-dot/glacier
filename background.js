// Opens the Glacier sidebar from the toolbar button and the keyboard shortcut.
//
// One file serves both browsers (ADR 0001):
// - Chrome runs it as the service worker and opens its side panel.
// - Firefox runs it as a background script; its sidebar is opened by the
//   toolbar button automatically, so here we only handle the shortcut.

const api = typeof browser !== "undefined" ? browser : chrome;

// Chrome: clicking the toolbar button opens the side panel.
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}

// Keyboard shortcut (Ctrl+Shift+Y by default).
if (api.commands && api.commands.onCommand) {
  api.commands.onCommand.addListener((command, tab) => {
    if (command !== "open-glacier") return;

    if (api.sidePanel && api.sidePanel.open && tab) {
      // Chrome side panel. The command counts as the required user gesture.
      api.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    } else if (api.sidebarAction && api.sidebarAction.toggle) {
      // Firefox sidebar.
      api.sidebarAction.toggle();
    }
  });
}
