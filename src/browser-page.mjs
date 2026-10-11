// The browser page port for the Opening flow (#40): wraps the tabs and
// permissions APIs of Chrome and Firefox. Plugged in from panel.js; the flow
// itself never touches a browser API (ADR 0002).
import { BESIDE_PERMISSION } from "./panel-place.mjs";

export function createBrowserPage(api) {
  return {
    async currentPage() {
      try {
        const tabs = await api.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        return tab ? { url: tab.url, title: tab.title } : null;
      } catch {
        return null;
      }
    },

    // The panels' "all websites" permission (#21) also lets Glacier read the
    // tab, so with it you are only asked once (ADR 0008 addition).
    async hasPermission() {
      try {
        if (await api.permissions.contains({ permissions: ["tabs"] })) return true;
        return await api.permissions.contains(BESIDE_PERMISSION);
      } catch {
        return false;
      }
    },

    async requestPermission() {
      try {
        return await api.permissions.request({ permissions: ["tabs"] });
      } catch {
        return false;
      }
    },

    onPageChange(callback) {
      if (!api.tabs) return;
      if (api.tabs.onActivated) api.tabs.onActivated.addListener(() => callback());
      if (api.tabs.onUpdated) {
        api.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
          // Only react to the active tab actually navigating to a new address.
          if (changeInfo.url && tab && tab.active) callback();
        });
      }
    },
  };
}
