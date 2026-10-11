// The browser port for the Panel placement (#66): wraps the permissions, tabs
// and scripting APIs of Chrome and Firefox. Plugged in from panel.js; the
// placement itself never touches a browser API (ADR 0002).
//
// `channel` names this sidebar in its frames' messages, so a second window's
// sidebar leaves them alone. `drawBesideFrames` (sidebar/beside-frames.js)
// runs in the web page, `origin` is the extension's own, and `sidebarX()`
// says where Firefox's sidebar starts on screen.
import { BESIDE_PERMISSION } from "./panel-place.mjs";

export function createBrowserPanels(api, { channel, origin, drawBesideFrames, sidebarX = () => undefined }) {
  function frameAddress(panel, section) {
    const params = new URLSearchParams({ panel, channel });
    if (section) params.set("section", section);
    return api.runtime.getURL(`sidebar/beside.html?${params}`);
  }

  return {
    async activeTab() {
      try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        return tab ?? null;
      } catch {
        return null;
      }
    },

    async hasPermission() {
      try {
        return await api.permissions.contains(BESIDE_PERMISSION);
      } catch {
        return false;
      }
    },

    // Must be called straight from a click: both browsers require it.
    requestPermission() {
      return api.permissions.request(BESIDE_PERMISSION).catch(() => false);
    },

    async drawFrames(tabId, { settings, shortcuts }) {
      try {
        await api.scripting.executeScript({
          target: { tabId },
          func: drawBesideFrames,
          args: [
            {
              origin,
              settings: settings ? frameAddress("settings", settings.section) : null,
              shortcuts: shortcuts ? frameAddress("shortcuts") : null,
              folded: Boolean(shortcuts?.folded),
              sidebarX: sidebarX(),
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    },

    // Another tab in this window, or the page loading again.
    onTabChange(callback) {
      api.windows
        .getCurrent()
        .then(({ id: windowId }) => {
          api.tabs.onActivated.addListener((info) => {
            if (info.windowId === windowId) callback();
          });
          api.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
            if (changeInfo.status === "complete" && tab.active && tab.windowId === windowId) callback();
          });
        })
        .catch((error) => console.warn("Glacier: could not follow the tabs", error));
    },
  };
}
