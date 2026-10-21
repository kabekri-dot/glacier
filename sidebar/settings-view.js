// Settings (#18) and the Shortcuts panel (#20), drawn the same way inside the
// sidebar (panel.js) and beside it, over the edge of the web page (beside.js,
// #21). The page that draws them plugs in two things:
//
// `prefs`, the choices kept per browser:
//   look(), saveLook(change, { keep }), tabSettings(), saveTabSettings(change),
//   shortcutsPanel(), saveShortcutsPanel(change), panelPlace(),
//   choosePanelPlace("beside" | "inside") -> Promise of the place it got,
//   version() -> Glacier's version number
//
// `repo`, the Notes Home and the Notebook, which only the sidebar holds:
//   connection() -> { home, repo, token }, status(), syncNow() -> sync status,
//   courses(), switchHome(place, repo, token, onProgress) -> { notes } or { error },
//   pickFolder() -> "picked", "closed" or "inside" (settings moved inside the
//   sidebar to pick it there), called straight from the click,
//   exportCourse(course, format), exportAll(), exportArchive(), restore(bytes)
//   and notice(text, ms), hasPasscode() and changePasscode(passcode, next) ->
//   { ok, locked } (#109), openShortcuts() and openHelp() (#124)
import { syncStatusText, syncResultText, syncBox, JUST_SYNCED } from "../src/auto-sync.mjs";
import { notesRepoName } from "../src/notebook.mjs";
import { notesHomeChoices, notesHomeIcon, switchSteps, nextSwitchStep, switchDoneText, switchQuestion, googleReady, folderReady } from "../src/notes-home.mjs";
import { GOOGLE_CONFIG } from "../src/google-config.mjs";
import { HANDLED_KEYS, SHORTCUT_GROUPS, shortcutRows } from "../src/shortcuts-panel.mjs";
import { PAPERS, paperGroups, FONT_OVERRIDES, TEXT_SIZE, fontPreview } from "../src/look.mjs";
import { NO_RECOVERY } from "./secret-view.js";
import { SETTINGS_PARTS, LABELS, NO_SETTING_MATCHES, partValue, matchingParts, nextOpenPart, homeLabel, settingsLayout, FIRST_RAIL_PART, showsPreview, railMove, paperPreview } from "../src/settings-parts.mjs";

// A labelled control row, for the settings.
export function field(labelText, control) {
  const label = document.createElement("label");
  label.className = "form-field";
  const span = document.createElement("span");
  span.className = "form-label";
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

export function menuButton(text, hint, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-new";
  button.textContent = text;
  button.title = hint;
  button.addEventListener("click", onClick);
  return button;
}

const ICONS = {
  website: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-3 3-3 13 0 16M12 4c3 3 3 13 0 16"/>',
  own: '<path d="M5 19l1-4L16 5l3 3L9 18zM14 7l3 3"/>',
};

// The small line icon before a note's title (#81): a globe for a website, a
// pencil for a note you made yourself. `origin` comes from noteOrigin.
export function originIcon(origin) {
  const icon = document.createElement("span");
  icon.className = "origin-icon";
  icon.title = origin.hint;
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[origin.kind]}</svg>`;
  return icon;
}

// The small choice right where a Download was clicked (#71, #74): Markdown,
// PDF or Print. PDF and Print both open the print window.
// Closes on a pick, on Esc or on a click anywhere else.
export function askFormat(anchor, onPick) {
  document.querySelector(".format-choice")?.remove();
  const box = document.createElement("div");
  box.className = "format-choice";
  const close = () => {
    box.remove();
    document.removeEventListener("click", close, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  const hints = {
    md: "Save as a Markdown file",
    pdf: "Opens the print window. Choose Save as PDF there",
    print: "Opens the print window to print on paper",
  };
  for (const [format, label] of [["md", "Markdown (.md)"], ["pdf", "PDF"], ["print", "Print"]]) {
    box.append(
      menuButton(label, hints[format], () => {
        close();
        onPick(format);
      }),
    );
  }
  const rect = anchor.getBoundingClientRect();
  box.style.top = `${rect.bottom + 2}px`;
  box.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`;
  document.body.append(box);
  setTimeout(() => {
    document.addEventListener("click", close, true);
    document.addEventListener("keydown", onKey, true);
  });
  box.querySelector("button").focus();
}

// A small pixel pencil hops across a line and writes "Just synced" a few
// letters at a time, then flicks off a bit of ink (#85). With `written` the
// words just stand there, as on a redraw while they stay.
export function justSyncedLine(written = false, className = "") {
  const line = document.createElement("p");
  line.className = `${className} sync-box-written`.trim();
  if (written) line.classList.add("is-written");
  const ink = document.createElement("span");
  ink.className = "sync-box-ink";
  const words = document.createElement("span");
  words.className = "sync-box-words";
  words.textContent = JUST_SYNCED;
  const pen = document.createElement("span");
  pen.className = "sync-pen";
  pen.setAttribute("aria-hidden", "true");
  ink.append(words, pen);
  line.append(ink);
  return line;
}

// The sync status in Settings, on one ruled line: the place's pixel icon,
// a few words ("Last synced just now", "Offline...") and a quiet Sync now at
// the end. After a good sync the pixel pencil writes "Just synced" there for
// a moment (#85).
export function homeStatusLine({ status, syncNow, notice, icon }) {
  const line = element("div", "home-status");
  const picture = element("img", "home-icon");
  picture.src = `../art/icon-${icon}.svg`;
  picture.alt = "";
  const words = (state) => {
    const box = syncBox(state);
    return state.state === "synced" && box.last ? box.last : box.status;
  };
  let text = element("span", "home-status-text", words(status));
  let restore = null;
  const showText = (next) => {
    text.replaceWith(next);
    text = next;
  };
  const sync = element("button", "home-sync", "Sync now");
  sync.type = "button";
  sync.title = "Pull and push your notes right away";
  sync.addEventListener("click", async () => {
    const result = await syncNow();
    const written = syncResultText(result) === JUST_SYNCED;
    if (written) showText(justSyncedLine(false, "home-status-text"));
    else notice(syncStatusText(result).detail, 4000);
    clearTimeout(restore);
    restore = setTimeout(() => showText(element("span", "home-status-text", words(result))), 4000);
  });
  line.append(picture, text, sync);
  return line;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// The quiet line a panel shows at its top when it opens inside the sidebar
// although "beside the sidebar" is chosen (#60).
export const INSIDE_NOTE = "This page doesn't allow panels beside the sidebar, so it opens here.";

// A part opened before #124 by its old name, from the sync box.
const OLD_PART_NAMES = { "notes-home": "saving" };

// `place` is "inside" (Settings cover the paper: the icon rail, #125) or
// "beside" (the parts one under the other, #124).
export function createSettingsView({ prefs, repo, onClose, place = "beside" }) {
  const layout = settingsLayout(place);
  const el = element("aside", "settings");
  el.classList.add(`is-${layout}`);
  el.id = "settings";
  el.setAttribute("aria-label", "Settings");
  el.hidden = true;

  const header = element("header", "settings-header");
  const titleRow = element("div", "settings-title-row");
  const title = element("h1", "settings-title");
  const icon = element("img", "settings-icon");
  icon.src = "../icons/glacier.svg";
  icon.alt = "";
  title.append(icon, "Settings");
  const closeButton = element("button", "settings-close", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close settings");
  closeButton.title = "Close settings";
  closeButton.addEventListener("click", () => onClose());
  titleRow.append(title, closeButton);
  // The search on top (#124): every part that matches shows, opened.
  const search = element("input", "settings-search");
  search.type = "search";
  search.placeholder = LABELS.search;
  search.setAttribute("aria-label", LABELS.search);
  search.autocomplete = "off";
  search.spellcheck = false;
  header.append(titleRow, search);
  const insideNote = element("p", "panel-note", INSIDE_NOTE);
  insideNote.hidden = true;
  const noMatch = element("p", "settings-no-match", NO_SETTING_MATCHES);
  noMatch.setAttribute("role", "status");
  noMatch.hidden = true;
  el.append(header, insideNote, noMatch);

  // Inside, the rail on the left and the picked part on the right (#125).
  const partsBox = element("div", "settings-parts");
  const rail = element("nav", "settings-rail");
  rail.setAttribute("aria-label", "Parts of Settings");
  const railButtons = {};
  if (layout === "rail") {
    const railWrap = element("div", "settings-rail-wrap");
    railWrap.append(rail, partsBox);
    el.append(railWrap);
  } else el.append(partsBox);

  // The parts one under the other (#124). A closed part shows its name and
  // its current value in one line; one part is open at a time.
  const parts = {};
  const bodies = {};
  for (const part of SETTINGS_PARTS) {
    const section = element("section", "settings-part");
    section.dataset.part = part.id;
    const head = element("button", "settings-part-head");
    head.type = "button";
    head.setAttribute("aria-controls", `settings-part-${part.id}`);
    const picture = element("img", "settings-part-icon");
    picture.src = `../art/icon-${part.icon}.svg`;
    picture.alt = "";
    const words = element("span", "settings-part-words");
    const value = element("span", "settings-part-value");
    words.append(element("span", "settings-part-name", part.name), value);
    head.append(picture, words);
    head.addEventListener("click", () => {
      openPart = search.value.trim() ? part.id : nextOpenPart(openPart, part.id);
      search.value = "";
      showParts();
    });
    bodies[part.id] = element("div", "settings-body");
    bodies[part.id].id = `settings-part-${part.id}`;
    // The part's name as a heading, inside where there is no head button.
    const heading = element("h2", "settings-part-title", part.name);
    section.append(head, heading, bodies[part.id]);
    parts[part.id] = { section, head, value };
    partsBox.append(section);
    if (layout === "rail") rail.append(railButton(part));
  }

  function railButton(part) {
    const button = element("button", "settings-rail-button");
    button.type = "button";
    button.title = part.name;
    button.dataset.part = part.id;
    const picture = element("img", "settings-rail-icon");
    picture.src = `../art/icon-${part.icon}.svg`;
    picture.alt = "";
    button.append(picture, element("span", "settings-rail-name", part.short));
    button.addEventListener("click", () => pick(part.id));
    railButtons[part.id] = button;
    return button;
  }

  function pick(id, { focus = false } = {}) {
    railPart = id;
    search.value = "";
    showParts();
    if (focus) railButtons[id].focus();
  }

  // Up and Down move through the rail; only the picked button is in the Tab
  // order, so Tab goes on into the picked part.
  rail.addEventListener("keydown", (event) => {
    const next = railMove(railPart, event.key);
    if (!next) return;
    event.preventDefault();
    pick(next, { focus: true });
  });

  // The small piece of paper on Look, inside only (#125). It follows every
  // pick of paper, font and text size at once.
  const preview = element("div", "paper-preview");
  preview.setAttribute("aria-hidden", "true");
  if (layout === "rail") bodies.look.append(preview);

  function drawPreview() {
    if (layout !== "rail") return;
    const { heading, lines, pattern, vars } = paperPreview(prefs.look());
    preview.dataset.pattern = pattern;
    for (const [name, value] of Object.entries(vars)) preview.style.setProperty(name, value);
    preview.replaceChildren(element("p", "paper-preview-heading", heading), ...lines.map((line) => element("p", "paper-preview-line", line)));
  }

  let openPart = null;
  let railPart = FIRST_RAIL_PART;
  // What the closed parts show that only the Notebook knows.
  const known = { home: "browser", hasPasscode: false };

  function showParts() {
    if (layout === "rail") showRail();
    else showSections();
    showValues();
  }

  // Inside: the picked part, or every part that matches the search one under
  // the other with its name as a heading (the rail hides while searching).
  function showRail() {
    const matching = matchingParts(search.value);
    noMatch.hidden = !matching || matching.length > 0;
    rail.hidden = Boolean(matching);
    for (const part of SETTINGS_PARTS) {
      const shown = matching ? matching.includes(part.id) : railPart === part.id;
      parts[part.id].section.hidden = !shown;
      bodies[part.id].hidden = !shown;
      const button = railButtons[part.id];
      button.setAttribute("aria-current", String(railPart === part.id));
      button.tabIndex = railPart === part.id ? 0 : -1;
    }
    preview.hidden = !showsPreview(place, "look");
  }

  function showSections() {
    const matching = matchingParts(search.value);
    noMatch.hidden = !matching || matching.length > 0;
    for (const part of SETTINGS_PARTS) {
      const { section, head, value } = parts[part.id];
      const open = matching ? matching.includes(part.id) : openPart === part.id;
      section.hidden = Boolean(matching) && !open;
      section.classList.toggle("is-open", open);
      head.setAttribute("aria-expanded", String(open));
      bodies[part.id].hidden = !open;
      value.hidden = open;
    }
  }

  function showValues() {
    const state = { look: prefs.look(), tabSettings: prefs.tabSettings(), ...known };
    for (const part of SETTINGS_PARTS) parts[part.id].value.textContent = partValue(part.id, state);
    drawPreview();
  }

  search.addEventListener("input", showParts);
  // Every change shows in the closed parts' lines at once.
  el.addEventListener("change", showValues);
  el.addEventListener("input", (event) => {
    if (event.target !== search) showValues();
  });

  el.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    // Esc in the search clears it first.
    if (event.target === search && search.value) {
      event.stopPropagation();
      search.value = "";
      showParts();
      return;
    }
    onClose();
  });

  // The papers in their two groups, Nature and Classics (#19). A Nature
  // paper's swatch shows a corner of its panorama.
  const papersBox = element("div", "settings-papers");
  const fontBox = element("div", "settings-fonts");
  bodies.look.append(papersBox, fontBox);

  function drawPapers() {
    const groups = paperGroups().map(({ group, papers }) => {
      const list = element("div", "paper-list");
      list.setAttribute("role", "radiogroup");
      list.setAttribute("aria-label", group);
      list.append(element("h2", "settings-subheading", group), ...papers.map(paperChoice));
      return list;
    });
    papersBox.replaceChildren(...groups);
  }

  function paperChoice(paper) {
    const label = element("label", "paper-choice");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "paper";
    radio.value = paper.name;
    radio.checked = paper.name === prefs.look().paper;
    radio.addEventListener("change", () => {
      prefs.saveLook({ paper: paper.name });
      drawFont();
    });
    const swatch = element("span", "paper-swatch");
    swatch.style.backgroundColor = paper.paper;
    if (paper.art) swatch.style.backgroundImage = `url("../art/${paper.art}.svg")`;
    else swatch.style.boxShadow = `inset 0 -0.35rem 0 -0.25rem ${paper.pattern === "none" ? paper.paper : paper.rule}`;
    const name = element("span", "", paper.dark ? `${paper.name} (dark)` : paper.name);
    label.append(radio, swatch, name);
    return label;
  }

  // The Font Override and the text size. Each font is one line, written in
  // that font, like the papers; "The paper's own font" names it and shows in
  // it. A new paper redraws this.
  function drawFont() {
    const look = prefs.look();
    const themeFont = PAPERS.find((paper) => paper.name === look.paper).font;
    const font = element("div", "font-list");
    font.setAttribute("role", "radiogroup");
    font.setAttribute("aria-label", LABELS.font);
    for (const name of FONT_OVERRIDES) {
      const label = element("label", "font-choice");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "font";
      radio.value = name;
      radio.checked = name === look.font;
      radio.addEventListener("change", () => prefs.saveLook({ font: name }));
      const text = element("span", "font-name", name === "Theme default" ? `${LABELS.themeFont} (${themeFont})` : name);
      const { family, weight } = fontPreview(name, look.paper);
      text.style.fontFamily = family;
      text.style.fontWeight = String(weight);
      label.append(radio, text);
      font.append(label);
    }

    const size = document.createElement("input");
    size.type = "range";
    size.min = String(TEXT_SIZE.min);
    size.max = String(TEXT_SIZE.max);
    size.step = String(TEXT_SIZE.step);
    size.value = String(look.textSize);
    const shown = element("output", "text-size-value", `${look.textSize} %`);
    // Live while dragging; kept when let go.
    size.addEventListener("input", () => {
      prefs.saveLook({ textSize: size.value }, { keep: false });
      shown.textContent = `${prefs.look().textSize} %`;
    });
    size.addEventListener("change", () => prefs.saveLook({ textSize: size.value }));
    const sizeRow = element("div", "text-size-row");
    sizeRow.append(size, shown);

    // Not a <label> like field(): the font choices are labels themselves.
    const fontField = element("div", "form-field");
    fontField.append(element("span", "form-label", LABELS.font), font);
    fontBox.replaceChildren(fontField, field(LABELS.textSize, sizeRow));
  }

  // One setting that is on or off: its label, a line under it and a switch.
  function toggle(labelText, hint, on, onChange) {
    const label = element("label", "settings-switch");
    const words = element("span", "settings-switch-words");
    words.append(element("span", "", labelText), element("span", "settings-hint", hint));
    const box = document.createElement("input");
    box.type = "checkbox";
    box.setAttribute("role", "switch");
    box.checked = on;
    box.addEventListener("change", () => onChange(box.checked, box));
    label.append(words, box);
    return label;
  }

  // Notes as pages (#108) and the New page at the end of a note of one
  // page (#122).
  function drawPages() {
    const look = prefs.look();
    bodies.pages.replaceChildren(
      toggle(LABELS.pages, LABELS.pagesHint, look.pages, (on) => prefs.saveLook({ pages: on })),
      toggle(LABELS.newPage, LABELS.newPageHint, look.newPageAtEnd, (on) => prefs.saveLook({ newPageAtEnd: on })),
    );
  }

  // A sentence finished by one of its choices: "On a new tab, Glacier" then
  // "keeps your note open" or "starts a new note".
  function sentence(name, lead, options, value, onChange) {
    const group = element("fieldset", "settings-sentence");
    group.append(element("legend", "", lead));
    for (const [optionValue, text] of options) {
      const label = element("label", "settings-option");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = name;
      radio.value = optionValue;
      radio.checked = optionValue === value;
      radio.addEventListener("change", () => onChange(optionValue));
      label.append(radio, element("span", "", text));
      group.append(label);
    }
    return group;
  }

  // When you change tabs (#53): each choice takes effect at once.
  function drawTabs() {
    const tabSettings = prefs.tabSettings();
    bodies.tabs.replaceChildren(
      sentence(
        "other-website",
        LABELS.otherWebsite,
        [
          ["follow", LABELS.opensWebsiteNote],
          ["keep", LABELS.keepsNote],
        ],
        tabSettings.keepUserOpenedNotes ? "keep" : "follow",
        (value) => prefs.saveTabSettings({ keepUserOpenedNotes: value === "keep" }),
      ),
      sentence(
        "new-tab",
        LABELS.newTab,
        [
          ["keep", LABELS.keepsNote],
          ["newNoteForm", LABELS.startsNote],
        ],
        tabSettings.onNonWebsite,
        (value) => prefs.saveTabSettings({ onNonWebsite: value }),
      ),
      toggle(LABELS.backButton, LABELS.backButtonHint, tabSettings.showPreviousButton, (on) =>
        prefs.saveTabSettings({ showPreviousButton: on }),
      ),
    );
  }

  // Secret notes (#109, ADR 0012): Change passcode encrypts every secret note
  // again. The current passcode is needed, as there is no recovery.
  async function drawSecret() {
    known.hasPasscode = await repo.hasPasscode();
    showValues();
    if (!known.hasPasscode) {
      bodies.secret.replaceChildren(
        element("p", "settings-text", "No secret notes yet. To make one, open ⋯, choose Note details and click Secret."),
      );
      return;
    }
    const form = element("form", "settings-form");
    const passcode = (label) => {
      const input = document.createElement("input");
      input.type = "password";
      input.className = "form-input";
      input.autocomplete = "off";
      return field(label, input);
    };
    const current = passcode("Current passcode");
    const next = passcode("New passcode");
    const again = passcode("New passcode again");
    const [currentInput, nextInput, againInput] = [current, next, again].map((row) => row.querySelector("input"));
    const said = element("p", "settings-text");
    said.setAttribute("role", "status");
    said.hidden = true;
    const submit = element("button", "card-button", LABELS.changePasscode);
    submit.type = "submit";
    const say = (text) => {
      said.textContent = text;
      said.hidden = false;
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentInput.value || !nextInput.value) return say("Type your current passcode and a new one.");
      if (nextInput.value !== againInput.value) return say("The two new passcodes are not the same. Type them again.");
      submit.disabled = true;
      const result = await repo.changePasscode(currentInput.value, nextInput.value);
      submit.disabled = false;
      for (const input of [currentInput, nextInput, againInput]) input.value = "";
      if (!result?.ok) return say("That isn't your current passcode.");
      const kept = result.locked === 1 ? " One secret note didn't open with it and keeps its old passcode." : result.locked > 1 ? ` ${result.locked} secret notes didn't open with it and keep their old passcode.` : "";
      say(`Done. Your secret notes now open with the new passcode.${kept}`);
    });
    form.append(
      element("p", "settings-text", "One Glacier passcode opens all your secret notes. Changing it encrypts every secret note again."),
      element("p", "settings-hint", NO_RECOVERY),
      current,
      next,
      again,
      submit,
      said,
    );
    bodies.secret.replaceChildren(form);
  }

  // Help and shortcuts: where Settings opens (ADR 0008), the Shortcuts
  // panel, Keyboard shortcuts, Help and Glacier's version. Turning on Next
  // to the sidebar asks the browser straight from the click, as both
  // browsers require.
  function drawHelp() {
    const nextTo = toggle(LABELS.nextToSidebar, LABELS.nextToSidebarHint, prefs.panelPlace() === "beside", (on, box) => {
      prefs.choosePanelPlace(on ? "beside" : "inside").then((got) => {
        box.checked = got === "beside";
      });
    });
    const shortcuts = toggle(LABELS.shortcutsPanel, LABELS.shortcutsPanelHint, prefs.shortcutsPanel().on, (on) =>
      prefs.saveShortcutsPanel({ on }),
    );
    const keys = actionRow(LABELS.keyboardShortcuts, "keyboard", "Every key and Markdown mark Glacier knows", () => repo.openShortcuts());
    const help = actionRow(LABELS.help, "help", LABELS.helpHint, () => repo.openHelp());
    const actions = element("div", "settings-actions");
    actions.append(keys, help);
    const version = element("p", "settings-hint", `Glacier ${prefs.version()}`);
    bodies.help.replaceChildren(nextTo, shortcuts, actions, version);
  }

  // One thing to do per line: what it is on the left, its pixel picture on
  // the right, the whole line clickable, like a note row in the menu.
  function actionRow(label, picture, hint, onClick) {
    const row = element("button", "backup-row");
    row.type = "button";
    row.title = hint;
    const icon = element("img", "backup-icon");
    icon.src = `../art/icon-${picture}.svg`;
    icon.alt = "";
    row.append(element("span", "", label), icon);
    row.addEventListener("click", () => onClick(row));
    return row;
  }

  // Back up and restore (#13, #55): the Notebook does the files; this only
  // picks them.
  async function drawBackup() {
    const courses = await repo.courses();
    const courseList = element("div", "backup-collections");
    courseList.setAttribute("aria-label", "Collections to download");
    for (const course of courses) {
      courseList.append(
        actionRow(course, "download", `Download the collection '${course}'`, (row) =>
          askFormat(row, (format) => repo.exportCourse(course, format)),
        ),
      );
    }

    const exportAll = actionRow(LABELS.downloadAll, "download", "Every note, archived ones too, as a zip of Markdown files", () =>
      repo.exportAll(),
    );

    const exportArchive = actionRow(LABELS.downloadArchive, "archive", "Only the archived notes, as a zip", () =>
      repo.exportArchive(),
    );

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".zip,application/zip";
    picker.hidden = true;
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      await repo.restore(new Uint8Array(await file.arrayBuffer()));
      picker.value = "";
    });
    const restore = actionRow(
      LABELS.restore,
      "folder",
      "Bring back notes from a zip Glacier made. Notes you already have are never overwritten",
      () => picker.click(),
    );

    const collections = courses.length > 0 ? [element("p", "backup-label", LABELS.collections), courseList] : [];
    bodies.backup.replaceChildren(exportAll, exportArchive, ...collections, restore, picker);
  }

  // Where your notes are saved (#14, #94, #95, #97, ADR 0011): one radio per
  // place, each with its pixel icon. Google Drive shows its sign-in under it
  // (or "Not set up yet" beside it), a folder its Choose a folder button (or
  // "Only in Chrome and Edge"), GitHub the repo and token form. Switching
  // asks first in one line, then combines. The sync status sits below.
  // The repo name and token stay in this browser's
  // extension storage, never in the Notebook (ADR 0003).
  async function drawNotesHome({ picked, repo: typedRepo, error, ask } = {}) {
    const saved = await repo.connection();
    known.home = saved.home;
    showValues();
    const shown = picked ?? saved.home;

    const choices = element("div", "home-list");
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", "Where your notes are saved");
    for (const home of notesHomeChoices({ googleReady: googleReady(GOOGLE_CONFIG), folderReady: folderReady(globalThis) })) {
      const label = element("label", "home-choice");
      label.title = home.hint;
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "notes-home";
      radio.value = home.id;
      radio.checked = home.id === shown;
      radio.disabled = home.disabled;
      radio.addEventListener("change", () => {
        if (home.id === "browser" && saved.home !== "browser") drawNotesHome({ picked: "browser", ask: "browser" });
        else drawNotesHome({ picked: home.id });
      });
      const icon = element("img", "home-icon");
      icon.src = `../art/icon-${home.icon}.svg`;
      icon.alt = "";
      label.append(radio, icon, element("span", "", homeLabel(home.id)));
      if (home.note) label.append(element("span", "home-note", home.note));
      choices.append(label);
    }

    let place = [];
    if (ask) place = [switchCard(ask)];
    else if (shown === "github") place = [githubForm(saved, typedRepo, error)];
    else if (shown === "google-drive") place = [googleCard(saved, error)];
    else if (shown === "folder") place = [folderCard(saved, error)];

    const status = await repo.status();
    const icon = notesHomeIcon(saved.home);
    const connected = status.state !== "off" && !ask && shown === saved.home;
    const sync = connected ? [homeStatusLine({ status, syncNow: repo.syncNow, notice: repo.notice, icon })] : [];
    bodies.saving.replaceChildren(choices, ...sync, ...place);
  }

  // The one line asked before switching, with Switch and Keep.
  function switchCard(place, connect = {}) {
    const card = element("div", "perm-card home-switch");
    card.setAttribute("role", "alert");
    const row = element("div", "perm-buttons");
    const yes = element("button", "card-button", "Switch");
    yes.type = "button";
    yes.addEventListener("click", () => showSwitch(place, connect.repo, connect.token));
    const keep = element("button", "perm-cancel", "Keep");
    keep.type = "button";
    keep.addEventListener("click", () => drawNotesHome());
    row.append(yes, keep);
    card.append(element("p", "settings-text", switchQuestion(place)), row);
    setTimeout(() => yes.focus());
    return card;
  }

  // Google Drive: one button to sign in, then the switch asks first. Glacier
  // keeps the notes in a folder named Glacier and sees only its own files.
  function googleCard(saved, error) {
    const card = element("div", "settings-form");
    const connected = saved.home === "google-drive";
    card.append(
      connected
        ? element("p", "settings-hint", "In the Glacier folder of your Drive. Glacier only sees its own files.")
        : element("p", "settings-text", "Your notes go into a folder named Glacier in your Google Drive, so every browser where you sign in shares them."),
    );
    if (!connected) card.append(element("p", "settings-hint", "Glacier only sees the files it makes, nothing else in your Drive."));
    if (error) {
      const errorEl = element("p", "settings-error", error);
      errorEl.setAttribute("role", "alert");
      card.append(errorEl);
    }
    if (!connected) {
      const signIn = element("button", "card-button", "Sign in with Google");
      signIn.type = "button";
      signIn.addEventListener("click", () => card.replaceWith(switchCard("google-drive")));
      card.append(signIn);
    }
    return card;
  }

  // A folder on this computer: one button opens the browser's folder picker,
  // straight from the click, then the switch asks first.
  function folderCard(saved, error) {
    const card = element("div", "settings-form");
    const connected = saved.home === "folder";
    card.append(
      connected
        ? element("p", "settings-hint", "One Markdown file per note. Obsidian can open the same folder.")
        : element("p", "settings-text", "Your notes go into a folder you pick on this computer, one Markdown file per note."),
    );
    if (!connected) card.append(element("p", "settings-hint", "Obsidian and other editors can open the same folder. Changes made there come in here."));
    if (error) {
      const errorEl = element("p", "settings-error", error);
      errorEl.setAttribute("role", "alert");
      card.append(errorEl);
    }
    const choose = element("button", connected ? "home-sync" : "card-button", connected ? "Choose another folder" : "Choose a folder");
    choose.type = "button";
    choose.addEventListener("click", async () => {
      let picked;
      try {
        picked = await repo.pickFolder();
      } catch (problem) {
        console.error("Glacier: the folder picker failed", problem);
        drawNotesHome({ picked: "folder", error: "Couldn't open the folder picker. Please try again." });
        return;
      }
      if (picked === "picked") card.replaceWith(switchCard("folder"));
    });
    card.append(choose);
    return card;
  }

  // GitHub's repo and token, as in v1.
  function githubForm(saved, typedRepo, error) {
    const form = element("form", "settings-form");
    const about = element(
      "p",
      "settings-text",
      saved.home === "github" && saved.repo
        ? `Connected to ${saved.repo}. Change the repo or paste a new token, then sync again.`
        : "Sync your notes through a private GitHub repo, so Chrome and Firefox share them.",
    );

    const repoInput = document.createElement("input");
    repoInput.type = "text";
    repoInput.className = "form-input repo-input";
    repoInput.placeholder = "yourname/notes";
    repoInput.value = typedRepo ?? saved.repo;

    const tokenInput = document.createElement("input");
    tokenInput.type = "password";
    tokenInput.className = "form-input";
    tokenInput.autocomplete = "off";
    tokenInput.placeholder = saved.token ? "Saved. Paste a new one to change it" : "Paste your token";

    const tokenHelp = element(
      "p",
      "settings-hint",
      "Make a fine grained token on GitHub for this one repo, with Contents access set to read and write. It stays in this browser and never goes into your notes.",
    );

    const errorEl = element("p", "settings-error", error ?? "");
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = !error;

    const submit = element("button", "card-button", "Connect and sync");
    submit.type = "submit";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = notesRepoName(repoInput.value);
      const token = tokenInput.value.trim() || saved.token;
      let problem = null;
      if (!name) problem = "Type the repo as owner and name with a slash between, for example yourname/notes.";
      else if (!token) problem = "Paste your token from GitHub.";
      if (problem) {
        errorEl.textContent = problem;
        errorEl.hidden = false;
        return;
      }
      // A new token for the same repo is no switch; another place is.
      if (saved.home === "github" && name === saved.repo) showSwitch("github", name, token);
      else form.replaceWith(switchCard("github", { repo: name, token }));
    });

    form.append(about, field("Repo", repoInput), field("Token", tokenInput), tokenHelp, errorEl, submit);
    return form;
  }

  // Switching's progress, in place of the section: connecting, downloading
  // n of N notes, linking, ready, then a confirmation. A wrong repo or token
  // goes back to the form with a clear message. Only in this browser needs
  // no steps.
  let switchRunning = false;

  async function showSwitch(place, repoName, token) {
    if (place === "browser") {
      await repo.switchHome("browser");
      drawNotesHome();
      return;
    }
    const screen = element("div", "perm-card");
    const list = element("ol", "sync-steps");
    let shown = switchSteps(place);
    const items = shown.steps.map(({ text }) => element("li", "", text));
    list.append(...items);
    screen.append(element("h2", "settings-subheading", shown.heading), list);
    bodies.saving.replaceChildren(screen);

    const showStep = (progress) => {
      shown = nextSwitchStep(shown, progress);
      shown.steps.forEach(({ text, state }, i) => {
        items[i].textContent = text;
        items[i].className = state && `sync-step-${state}`;
      });
    };

    switchRunning = true;
    const result = await repo.switchHome(place, repoName, token, showStep);
    switchRunning = false;
    if (result.error) {
      drawNotesHome({ picked: place, repo: repoName, error: result.error });
      return;
    }
    if (el.hidden) {
      drawNotesHome();
      return;
    }

    const done = element("p", "settings-text", switchDoneText(place, { repo: repoName, notes: result.notes }));
    const ok = element("button", "card-button", "Start writing");
    ok.type = "button";
    ok.addEventListener("click", () => {
      onClose();
      drawNotesHome();
    });
    screen.append(done, ok);
    ok.focus();
  }

  return {
    el,

    isOpen() {
      return !el.hidden;
    },

    // Draw every part and show them, with the part `section` open if given
    // (else all closed, each with its value) and `picked` shown chosen
    // under Where your notes are saved.
    open(section, picked) {
      drawPapers();
      drawFont();
      drawPages();
      drawTabs();
      drawHelp();
      drawSecret();
      drawBackup();
      const id = OLD_PART_NAMES[section] ?? section;
      openPart = parts[id] ? id : null;
      // Inside, Look is picked unless a part was asked for.
      railPart = openPart ?? FIRST_RAIL_PART;
      search.value = "";
      showParts();
      el.hidden = false;
      search.focus();
      // A switch still running keeps its progress on screen.
      const repoDrawn = switchRunning ? Promise.resolve() : drawNotesHome({ picked: picked ?? undefined });
      if (!openPart) return;
      if (layout === "rail") {
        repoDrawn.then(() => parts[openPart].section.querySelector(".repo-input")?.focus());
        return;
      }
      const target = parts[openPart].section;
      repoDrawn.then(() => {
        el.scrollTop = target.offsetTop - header.offsetHeight;
        target.querySelector(".repo-input")?.focus();
      });
    },

    close() {
      el.hidden = true;
    },

    showInsideNote(shown) {
      insideNote.hidden = !shown;
    },
  };
}

// The quiet link of an empty shortcut: a button that opens the browser's page,
// or plain text where the page cannot be opened.
export function fixLink(fix, open) {
  if (!fix.url) return element("span", "shortcuts-fix-text", fix.label);
  const link = element("button", "shortcuts-fix", fix.label);
  link.type = "button";
  link.addEventListener("click", () => open(fix.url));
  return link;
}

// The cheat sheet drawer and its small tab, or nothing when switched off.
// "How Glacier works" at its top shows the welcome page again (#91).
export function createShortcutsView({ onFold, onWelcome, openShortcutsPage }) {
  const sheet = element("aside", "shortcuts");
  sheet.setAttribute("aria-label", "Shortcuts");
  const header = element("header", "shortcuts-header");
  const fold = element("button", "shortcuts-fold", "›");
  fold.type = "button";
  fold.setAttribute("aria-label", "Fold the shortcuts");
  fold.title = "Fold the shortcuts";
  fold.addEventListener("click", () => onFold());
  header.append(element("h1", "shortcuts-title", "Shortcuts"), fold);

  const body = element("div", "shortcuts-body");
  let keysList;
  for (const { title, entries, opensWelcome, hint } of SHORTCUT_GROUPS) {
    if (opensWelcome) {
      const link = element("button", "shortcuts-welcome", title);
      link.type = "button";
      link.title = hint;
      link.addEventListener("click", () => onWelcome());
      const heading = element("h2", "settings-subheading");
      heading.append(link);
      body.append(heading);
      continue;
    }
    const list = element("dl", "shortcuts-list");
    body.append(element("h2", "settings-subheading", title), list);
    if (title === "Keys") keysList = list;
    else drawRows(list, entries.map(([keys, does]) => ({ keys, does })));
  }
  // The Keys group shows what the browser really has set (#115).
  function drawRows(list, rows) {
    list.replaceChildren();
    for (const { keys, does, notSet, fix } of rows) {
      const term = document.createElement("dt");
      term.append(element("code", "", keys));
      const row = element("div", "shortcuts-row");
      const meaning = element("dd", "", does);
      if (fix) meaning.append(" ", fixLink(fix, openShortcutsPage));
      row.append(term, meaning);
      if (notSet) row.classList.add("shortcuts-not-set");
      list.append(row);
    }
  }
  drawRows(keysList, shortcutRows(undefined, HANDLED_KEYS));
  sheet.append(header, body);

  sheet.hidden = true;

  return {
    sheet,

    // `commands` is what commands.getAll() gave, `browser` is "chrome" or "firefox".
    showCommands(commands, browser) {
      drawRows(keysList, shortcutRows(commands, HANDLED_KEYS, browser));
    },

    // `state` is the saved { on, folded }. The sheet slides in from the
    // right edge while it is on and open.
    draw(state) {
      sheet.hidden = !state.on || state.folded;
    },
  };
}
