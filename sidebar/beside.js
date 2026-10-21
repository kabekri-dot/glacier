// Settings beside the sidebar (#21, ADR 0008). This
// page runs in a frame that beside-frames.js draws over the edge of the web
// page; it never sees the page. The choices kept per browser are written to
// extension storage, where the sidebar picks them up at once, so the note
// shows each change live. Anything that needs the Notebook (the Where your
// notes live section) is asked of the sidebar that opened this frame, named by `channel`.
import { readLook, applyLook } from "../src/look.mjs";
import { readTabSettings } from "../src/tab-settings.mjs";
import { readShortcutsPanel } from "../src/shortcuts-panel.mjs";
import { readPanelPlace, BESIDE_PERMISSION } from "../src/panel-place.mjs";
import { createSettingsView } from "./settings-view.js";
import { chosenNotesHome } from "../src/notes-home.mjs";

const api = typeof browser !== "undefined" ? browser : chrome;
const storage = api.storage.local;
const params = new URLSearchParams(location.search);
const channel = params.get("channel");

let look = readLook(undefined);
let tabSettings = readTabSettings(undefined);
let shortcutsPanel = readShortcutsPanel(undefined);
let panelPlace = readPanelPlace(undefined);

// Ask the sidebar. The answer comes wrapped, so no answer at all (the sidebar
// has closed) can be told apart from an empty one.
async function ask(call, ...args) {
  try {
    return await api.runtime.sendMessage({ glacier: "beside", channel, call, args });
  } catch {
    return undefined;
  }
}

async function askValue(call, ...args) {
  return (await ask(call, ...args))?.value;
}

// Only the paper's colours and font: the frame has no note to rule.
function drawLook() {
  applyLook(document.documentElement, look);
}

const prefs = {
  look: () => look,
  saveLook(change) {
    look = readLook({ ...look, ...change });
    drawLook();
    storage.set({ look });
  },
  tabSettings: () => tabSettings,
  saveTabSettings(change) {
    tabSettings = readTabSettings({ ...tabSettings, ...change });
    storage.set({ tabSettings });
  },
  shortcutsPanel: () => shortcutsPanel,
  saveShortcutsPanel(change) {
    shortcutsPanel = readShortcutsPanel({ ...shortcutsPanel, ...change });
    storage.set({ shortcutsPanel });
  },
  panelPlace: () => panelPlace,
  // Already beside, so the browser is only asked if it took the permission back.
  async choosePanelPlace(place) {
    let granted = place === "inside";
    if (place === "beside") granted = await api.permissions.request(BESIDE_PERMISSION).catch(() => false);
    if (granted) {
      panelPlace = place;
      await storage.set({ panelPlace });
    }
    return panelPlace;
  },
  version: () => api.runtime.getManifest().version,
};

// The first sync's steps arrive from the sidebar as it goes.
let onSwitchProgress = () => {};
api.runtime.onMessage.addListener((message) => {
  if (message?.glacier === "progress" && message.channel === channel) onSwitchProgress(message.progress);
});

// Bytes travel as text: Chrome sends messages as JSON.
function toBase64(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const repo = {
  async connection() {
    const { notesRepo, githubToken } = await storage.get(["notesRepo", "githubToken"]);
    const github = { repo: notesRepo ?? "", token: githubToken ?? "" };
    // The choice is kept in the sidebar's Notebook (#94).
    return { home: (await askValue("notesHome")) ?? chosenNotesHome(null, github), ...github };
  },
  status: async () => (await askValue("status")) ?? { state: "off" },
  syncNow: async () => (await askValue("syncNow")) ?? { state: "off" },
  courses: async () => (await askValue("courses")) ?? [],
  // No browser shows its folder picker in a frame on a web page, so the
  // sidebar opens settings inside itself to pick the folder there (#97).
  async pickFolder() {
    await ask("chooseFolderInside");
    return "inside";
  },
  async switchHome(place, repoName, token, onProgress) {
    onSwitchProgress = onProgress;
    return (await askValue("switchHome", place, repoName, token)) ?? { error: "Glacier's sidebar closed. Open it and try again." };
  },
  exportCourse: (course, format) => ask("exportCourse", course, format),
  exportAll: () => ask("exportAll"),
  exportArchive: () => ask("exportArchive"),
  restore: (bytes) => ask("restore", toBase64(bytes)),
  notice: (text, ms) => ask("notice", text, ms),
  hasPasscode: async () => Boolean(await askValue("hasPasscode")),
  changePasscode: async (passcode, next) => (await askValue("changePasscode", passcode, next)) ?? { ok: false },
  openShortcuts: () => ask("openShortcuts"),
  openHelp: () => ask("openHelp"),
};

async function start() {
  const saved = await storage.get(["look", "tabSettings", "shortcutsPanel", "panelPlace"]);
  look = readLook(saved.look);
  tabSettings = readTabSettings(saved.tabSettings);
  shortcutsPanel = readShortcutsPanel(saved.shortcutsPanel);
  panelPlace = readPanelPlace(saved.panelPlace);
  drawLook();

  const view = createSettingsView({ prefs, repo, onClose: () => ask("closeSettings"), place: "beside" });
  document.body.append(view.el);
  view.open(params.get("section"));

  storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.look) {
      look = readLook(changes.look.newValue);
      drawLook();
    }
    if (changes.tabSettings) tabSettings = readTabSettings(changes.tabSettings.newValue);
    if (changes.panelPlace) panelPlace = readPanelPlace(changes.panelPlace.newValue);
    if (changes.shortcutsPanel) shortcutsPanel = readShortcutsPanel(changes.shortcutsPanel.newValue);
  });
}

// When the sidebar that drew this frame has closed, ask the page's Glacier
// script to take the frames away.
setInterval(async () => {
  if (!(await ask("ping"))) parent.postMessage("glacier-beside-gone", "*");
}, 2000);

start();
