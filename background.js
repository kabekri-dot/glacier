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

// Chrome: close the panel if this window has one open, otherwise open it.
// Asking the browser (instead of remembering open windows) stays right when
// the service worker restarts. Closing hides the panel, and the panel saves
// the open note when it hides.
async function toggleSidePanel(windowId) {
  try {
    let isOpen = false;
    if (api.runtime.getContexts) {
      const panels = await api.runtime.getContexts({
        contextTypes: ["SIDE_PANEL"],
        windowIds: [windowId],
      });
      isOpen = panels.length > 0;
    }
    if (isOpen && api.sidePanel.close) {
      await api.sidePanel.close({ windowId });
    } else {
      await api.sidePanel.open({ windowId });
    }
  } catch (error) {
    // The browser refused (no gesture, window gone): nothing to recover.
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
