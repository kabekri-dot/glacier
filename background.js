// Opens the Glacier sidebar from the toolbar button and the keyboard shortcut.
//
// One file serves both browsers (ADR 0001):
// - Chrome runs it as the service worker and opens its side panel.
// - Firefox runs it as a background script and toggles its sidebar.

const api = typeof browser !== "undefined" ? browser : chrome;

// Chrome: clicking the toolbar button opens the side panel. With this set,
// Chrome never fires action.onClicked, so the Firefox handler below is inert
// there.
if (api.sidePanel && api.sidePanel.setPanelBehavior) {
  api.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
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

// Keyboard shortcut (Alt+Shift+G by default).
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
