// Settings in plain names (#124): the seven parts, in order, each with its
// pixel picture (art/icon-<icon>.svg) and a short name for the icon rail; the
// one line a closed part shows; and what the search on top finds. Pure, so it
// can be tested with node --test; sidebar/settings-view.js draws it, with the
// words from LABELS so the search finds what is on screen.
import { PAPERS, FONT_OVERRIDES, lookStyle } from "./look.mjs";

export const LABELS = {
  search: "Search settings",
  paper: "Paper",
  font: "Font",
  themeFont: "The paper's own font",
  textSize: "Text size",
  pages: "Split long notes into pages",
  pagesHint: "Turn them like a notebook",
  newPage: "Show the New page button",
  newPageHint: "At the end of a note that has one page",
  otherWebsite: "When you go to another website, Glacier",
  opensWebsiteNote: "opens the note for that website",
  keepsNote: "keeps your note open",
  newTab: "On a new tab, Glacier",
  startsNote: "starts a new note",
  backButton: "Show the back button",
  backButtonHint: "← at the top left, when there is a note to go back to",
  syncNow: "Sync now",
  downloadAll: "Download all notes",
  downloadArchive: "Download the archive",
  collections: "Collections",
  restore: "Restore notes from a download",
  changePasscode: "Change passcode",
  nextToSidebar: "Next to the sidebar",
  nextToSidebarHint: "When the page has room. Otherwise it opens inside.",
  shortcutsPanel: "Shortcuts panel",
  shortcutsPanelHint: "A small tab on the right edge with every key",
  keyboardShortcuts: "Keyboard shortcuts",
  help: "Help",
  helpHint: "Common questions, in a new tab",
};

// Where the notes are saved, as the end of "Your notes are saved …".
const HOME_LABELS = {
  browser: "Only in this browser",
  folder: "In a folder on this computer",
  "google-drive": "In Google Drive",
  github: "On GitHub",
};

export function homeLabel(home) {
  return HOME_LABELS[home] ?? HOME_LABELS.browser;
}

// `labels` is every word a part shows, for the search.
export const SETTINGS_PARTS = [
  {
    id: "look",
    name: "How your notes look",
    short: "Look",
    icon: "palette",
    labels: [LABELS.paper, ...PAPERS.map((paper) => paper.name), LABELS.font, LABELS.themeFont, ...FONT_OVERRIDES.slice(1), LABELS.textSize],
  },
  {
    id: "pages",
    name: "Pages",
    short: "Pages",
    icon: "page",
    labels: [LABELS.pages, LABELS.pagesHint, LABELS.newPage, LABELS.newPageHint],
  },
  {
    id: "tabs",
    name: "When you change tabs",
    short: "Tabs",
    icon: "tabs",
    labels: [LABELS.otherWebsite, LABELS.opensWebsiteNote, LABELS.keepsNote, LABELS.newTab, LABELS.startsNote, LABELS.backButton, LABELS.backButtonHint],
  },
  {
    id: "saving",
    name: "Where your notes are saved",
    short: "Saving",
    icon: "folder",
    labels: [...Object.values(HOME_LABELS), LABELS.syncNow],
  },
  {
    id: "backup",
    name: "Back up and restore",
    short: "Backup",
    icon: "download",
    labels: [LABELS.downloadAll, LABELS.downloadArchive, LABELS.collections, LABELS.restore],
  },
  {
    id: "secret",
    name: "Secret notes",
    short: "Secret",
    icon: "lock",
    labels: [LABELS.changePasscode, "Current passcode", "New passcode"],
  },
  {
    id: "help",
    name: "Help and shortcuts",
    short: "Help",
    icon: "help",
    labels: [LABELS.nextToSidebar, LABELS.nextToSidebarHint, LABELS.shortcutsPanel, LABELS.shortcutsPanelHint, LABELS.keyboardShortcuts, LABELS.help, LABELS.helpHint],
  },
];

// The one line a closed part shows. `state` is { look, tabSettings, home,
// hasPasscode }.
const VALUES = {
  look: ({ look }) => `${look.paper} paper, ${look.font === "Theme default" ? "its own font" : look.font}, text ${look.textSize} %`,
  pages: ({ look }) => (look.pages ? "Long notes split into pages" : "Each note on one long page"),
  tabs: ({ tabSettings }) => (tabSettings.keepUserOpenedNotes ? "Keeps your note open" : "Opens the note for each website"),
  saving: ({ home }) => homeLabel(home),
  backup: () => "Download all notes or restore them",
  secret: ({ hasPasscode }) => (hasPasscode ? "Change your passcode" : "No secret notes yet"),
  help: () => "Keyboard shortcuts and common questions",
};

export function partValue(id, state) {
  return VALUES[id](state);
}

// One part open at a time: opening one closes the other, and the open one
// closes again on a second click.
export function nextOpenPart(open, clicked) {
  return open === clicked ? null : clicked;
}

export const NO_SETTING_MATCHES = "No setting matches.";

// The parts whose name or labels hold what was typed, ignoring capitals, or
// null when nothing was typed (every part shows as usual).
export function matchingParts(query) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return null;
  return SETTINGS_PARTS.filter((part) =>
    [part.name, part.short, ...part.labels].some((text) => text.toLowerCase().includes(wanted)),
  ).map((part) => part.id);
}

// Part 2 (#125): inside the sidebar Settings cover the paper, so the parts
// sit in an icon rail on the left with the picked one on the right; beside
// the sidebar they stay one under the other. `place` is "inside" or "beside".
export function settingsLayout(place) {
  return place === "inside" ? "rail" : "sections";
}

export const FIRST_RAIL_PART = SETTINGS_PARTS[0].id;

// The small paper on Look only helps when the real paper is covered.
export function showsPreview(place, partId) {
  return settingsLayout(place) === "rail" && partId === "look";
}

// The part Up or Down moves to from `current`, stopping at the ends, or null
// for any other key.
const RAIL_STEPS = { ArrowUp: -1, ArrowDown: 1 };

export function railMove(current, key) {
  const step = RAIL_STEPS[key];
  if (!step) return null;
  const at = SETTINGS_PARTS.findIndex((part) => part.id === current);
  const next = Math.min(SETTINGS_PARTS.length - 1, Math.max(0, at + step));
  return SETTINGS_PARTS[next].id;
}

// The preview's text is a little smaller than the real paper's, so a heading
// and two lines fit in a narrow sidebar.
const PREVIEW_SCALE = 0.8;

// A heading and two lines in the chosen paper, font and text size, as CSS
// custom properties for the small piece of paper on Look.
export function paperPreview(look) {
  const style = lookStyle(look);
  const paper = PAPERS.find((p) => p.name === look.paper);
  return {
    heading: "Flexbox basics",
    lines: ["justify-content moves items along the row.", "align-items moves them across it."],
    pattern: style.pattern,
    vars: {
      "--preview-paper": paper.paper,
      "--preview-ink": paper.ink,
      "--preview-rule": paper.rule,
      "--preview-margin": paper.margin ?? paper.rule,
      "--preview-font": style.vars["--font-family"],
      "--preview-weight": style.vars["--font-weight"],
      "--preview-text-size": `${Math.round(style.textSize * PREVIEW_SCALE * 10) / 10}px`,
      "--preview-line-height": `${Math.round(style.lineHeight * PREVIEW_SCALE)}px`,
    },
  };
}
