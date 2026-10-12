// Settings (#18) and the Shortcuts panel (#20), drawn the same way inside the
// sidebar (panel.js) and beside it, over the edge of the web page (beside.js,
// #21). The page that draws them plugs in two things:
//
// `prefs`, the choices kept per browser:
//   look(), saveLook(change, { keep }), tabSettings(), saveTabSettings(change),
//   shortcutsPanel(), saveShortcutsPanel(change), panelPlace(),
//   choosePanelPlace("beside" | "inside") -> Promise of the place it got
//
// `repo`, the Notes Home and the Notebook, which only the sidebar holds:
//   connection() -> { home, repo, token }, status(), syncNow() -> sync status,
//   courses(), switchHome(place, repo, token, onProgress) -> { notes } or { error },
//   exportCourse(course, format), exportAll(), restore(bytes) and notice(text, ms)
import { syncStatusText, syncResultText, JUST_SYNCED } from "../src/auto-sync.mjs";
import { notesRepoName } from "../src/notebook.mjs";
import { NOTES_HOMES, notesHomeName, switchQuestion } from "../src/notes-home.mjs";
import { SHORTCUT_GROUPS } from "../src/shortcuts-panel.mjs";
import { PAPERS, paperGroups, FONT_OVERRIDES, TEXT_SIZE } from "../src/look.mjs";

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
  download: '<path d="M12 4v10M8 10l4 4 4-4M5 19h14"/>',
  archive: '<path d="M4 6h16v4H4zM6 10v9h12v-9M10 14h4"/>',
  unarchive: '<path d="M4 6h16v4H4zM6 10v9h12v-9M12 17v-5M9 14l3-3 3 3"/>',
  delete: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  move: '<path d="M4 6h6l2 2h8v11H4zM9 13.5h7M13 10.5l3 3-3 3"/>',
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

// A small line icon button (#71): Download, Archive, Unarchive or Delete.
export function iconButton(kind, hint, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.title = hint;
  button.setAttribute("aria-label", hint);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick(button);
  });
  return button;
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

// The sync status line and "Sync now", in the pill menu and in Settings. After
// a good sync the status line is written out as "Just synced" for a moment.
export function syncStatusRow({ status, syncNow, notice }, ...buttons) {
  const row = document.createElement("div");
  row.className = "menu-actions";
  row.append(...buttons);
  const plainLine = (text) => Object.assign(document.createElement("p"), { className: "menu-sync-status", textContent: text });
  let line = plainLine(syncStatusText(status).detail);
  let restore = null;
  const showLine = (next) => {
    line.replaceWith(next);
    line = next;
  };
  if (status.state !== "off") {
    row.append(menuButton("Sync now", "Pull and push your notes right away", async () => {
      const result = await syncNow();
      const detail = syncStatusText(result).detail;
      const written = syncResultText(result) === JUST_SYNCED;
      showLine(written ? justSyncedLine(false, "menu-sync-status") : plainLine(detail));
      if (!written) notice(detail, 4000);
      clearTimeout(restore);
      restore = setTimeout(() => showLine(plainLine(detail)), 4000);
    }));
  }
  return [line, row];
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const SECTIONS = [
  ["paper", "Paper", true],
  ["writing", "Writing", true],
  ["tabs", "Tabs and notes", false],
  ["shortcuts", "Shortcuts panel", false],
  ["panels", "Panels", false],
  ["notes-home", "Where your notes live", false],
];

// The quiet line a panel shows at its top when it opens inside the sidebar
// although "beside the sidebar" is chosen (#60).
export const INSIDE_NOTE = "This page doesn't allow panels beside the sidebar, so it opens here.";

export function createSettingsView({ prefs, repo, onClose }) {
  const el = element("aside", "settings");
  el.id = "settings";
  el.setAttribute("aria-label", "Settings");
  el.hidden = true;

  const header = element("header", "settings-header");
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
  header.append(title, closeButton);
  const insideNote = element("p", "panel-note", INSIDE_NOTE);
  insideNote.hidden = true;
  el.append(header, insideNote);

  const bodies = {};
  for (const [name, summaryText, open] of SECTIONS) {
    const details = element("details", "settings-section");
    details.dataset.section = name;
    details.open = open;
    bodies[name] = element("div", "settings-body");
    details.append(element("summary", "", summaryText), bodies[name]);
    el.append(details);
  }

  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  });

  // The papers in their two groups, Nature and Classics (#19). A Nature
  // paper's swatch shows a corner of its panorama.
  function drawPapers() {
    const groups = paperGroups().map(({ group, papers }) => {
      const list = element("div", "paper-list");
      list.setAttribute("role", "radiogroup");
      list.setAttribute("aria-label", group);
      list.append(element("h2", "settings-subheading", group), ...papers.map(paperChoice));
      return list;
    });
    bodies.paper.replaceChildren(...groups);
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
      drawWriting();
    });
    const swatch = element("span", "paper-swatch");
    swatch.style.backgroundColor = paper.paper;
    if (paper.art) swatch.style.backgroundImage = `url("../art/${paper.art}.svg")`;
    else swatch.style.boxShadow = `inset 0 -0.35rem 0 -0.25rem ${paper.pattern === "none" ? paper.paper : paper.rule}`;
    const name = element("span", "", paper.dark ? `${paper.name} (dark)` : paper.name);
    label.append(radio, swatch, name);
    return label;
  }

  // The Font Override and the text size. "Theme default" names the paper's
  // own font, so it is clear what it gives; a new paper redraws this.
  function drawWriting() {
    const look = prefs.look();
    const themeFont = PAPERS.find((paper) => paper.name === look.paper).font;
    const font = document.createElement("select");
    for (const name of FONT_OVERRIDES) {
      const text = name === "Theme default" ? `Theme default (${themeFont})` : name;
      font.add(new Option(text, name, false, name === look.font));
    }
    font.addEventListener("change", () => prefs.saveLook({ font: font.value }));

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

    bodies.writing.replaceChildren(field("Font", font), field("Text size", sizeRow));
  }

  function choice(labelText, options, value, onChange) {
    const select = document.createElement("select");
    for (const [optionValue, text] of options) {
      select.add(new Option(text, optionValue, false, optionValue === value));
    }
    select.addEventListener("change", () => onChange(select.value, select));
    return field(labelText, select);
  }

  // "Tabs and notes": three choices, each one taking effect at once.
  function drawTabs() {
    const tabSettings = prefs.tabSettings();
    bodies.tabs.replaceChildren(
      choice(
        "When I switch tabs",
        [
          ["follow", "Show the note of the tab I'm on"],
          ["keep", "Keep a note I opened myself"],
        ],
        tabSettings.keepUserOpenedNotes ? "keep" : "follow",
        (value) => prefs.saveTabSettings({ keepUserOpenedNotes: value === "keep" }),
      ),
      choice(
        "On a page that isn't a website",
        [
          ["keep", "Keep the open note"],
          ["newNoteForm", "Show an empty page for a new note"],
        ],
        tabSettings.onNonWebsite,
        (value) => prefs.saveTabSettings({ onNonWebsite: value }),
      ),
      choice(
        "Previous note button",
        [
          ["shown", "Shown"],
          ["hidden", "Hidden"],
        ],
        tabSettings.showPreviousButton ? "shown" : "hidden",
        (value) => prefs.saveTabSettings({ showPreviousButton: value === "shown" }),
      ),
    );
  }

  function drawShortcutsSetting() {
    bodies.shortcuts.replaceChildren(
      choice(
        "Shortcuts panel",
        [
          ["off", "Off"],
          ["on", "On"],
        ],
        prefs.shortcutsPanel().on ? "on" : "off",
        (value) => prefs.saveShortcutsPanel({ on: value === "on" }),
      ),
    );
  }

  // Where settings open (ADR 0008). Choosing beside
  // asks the browser straight from the change, as both browsers require.
  function drawPanels() {
    const place = prefs.panelPlace() === "beside" ? "beside" : "inside";
    const hint = element(
      "p",
      "settings-hint",
      "Beside the sidebar, settings sit over the edge of the page and your note keeps its full width. On browser pages, such as a new tab, they open inside the sidebar. Glacier never reads, saves or sends anything from the pages you visit.",
    );
    bodies.panels.replaceChildren(
      choice(
        "Settings open",
        [
          ["beside", "Beside the sidebar"],
          ["inside", "Inside the sidebar"],
        ],
        place,
        (value, select) => {
          prefs.choosePanelPlace(value).then((got) => {
            select.value = got === "beside" ? "beside" : "inside";
          });
        },
      ),
      hint,
    );
  }

  // Export and Restore (#13, #55), under Where your notes live. The Notebook does the
  // files; this only picks them.
  async function backupControls() {
    const courseList = element("div", "backup-collections");
    courseList.setAttribute("aria-label", "Collections to download");
    for (const course of await repo.courses()) {
      const row = element("div", "backup-collection");
      row.append(
        element("span", "course-name", course),
        iconButton("download", `Download the Collection '${course}'`, (button) =>
          askFormat(button, (format) => repo.exportCourse(course, format)),
        ),
      );
      courseList.append(row);
    }

    const exportAll = menuButton("Export everything", "Download every note, archived ones too, as a zip of Markdown files", () =>
      repo.exportAll(),
    );

    const exportArchive = menuButton("Export archive", "Download only the archived notes as a zip", () =>
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
    const restore = menuButton(
      "Restore from backup file",
      "Bring back notes from an Export zip. Notes you already have are never overwritten",
      () => picker.click(),
    );
    const restoreRow = element("div", "menu-actions");
    restoreRow.append(exportAll, exportArchive, restore, picker);

    return [element("h2", "settings-subheading", "Backup"), courseList, restoreRow];
  }

  // Where your notes live (#14, #94, ADR 0011): one radio per place, each
  // with its pixel icon. GitHub shows the repo and token form right under
  // it. Switching asks first in one line, then combines. The sync status and
  // Backup sit below. The repo name and token stay in this browser's
  // extension storage, never in the Notebook (ADR 0003).
  async function drawNotesHome({ picked, repo: typedRepo, error, ask } = {}) {
    const saved = await repo.connection();
    const shown = picked ?? saved.home;

    const choices = element("div", "home-list");
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", "Where your notes live");
    for (const home of NOTES_HOMES) {
      const label = element("label", "home-choice");
      label.title = home.hint;
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "notes-home";
      radio.value = home.id;
      radio.checked = home.id === shown;
      radio.addEventListener("change", () => {
        if (home.id === "browser" && saved.home !== "browser") drawNotesHome({ picked: "browser", ask: "browser" });
        else drawNotesHome({ picked: home.id });
      });
      const icon = element("img", "home-icon");
      icon.src = `../art/icon-${home.icon}.svg`;
      icon.alt = "";
      label.append(radio, icon, element("span", "", home.name));
      choices.append(label);
    }

    let place = [];
    if (ask) place = [switchCard(ask)];
    else if (shown === "github") place = [githubForm(saved, typedRepo, error)];

    const status = await repo.status();
    const sync = status.state === "off" || ask ? [] : syncStatusRow({ status, syncNow: repo.syncNow, notice: repo.notice });
    bodies["notes-home"].replaceChildren(choices, ...place, ...sync, ...(await backupControls()));
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
    const steps = {};
    for (const [step, text] of [
      ["connecting", `Connecting to ${notesHomeName(place)}`],
      ["downloading", "Downloading notes"],
      ["linking", "Combining notes"],
      ["ready", "Ready"],
    ]) {
      steps[step] = element("li", "", text);
      list.append(steps[step]);
    }
    screen.append(element("h2", "settings-subheading", `Moving to ${notesHomeName(place)}`), list);
    bodies["notes-home"].replaceChildren(screen);

    const order = Object.keys(steps);
    const showStep = (progress) => {
      const at = order.indexOf(progress.step);
      order.forEach((step, i) => {
        steps[step].className = i < at ? "sync-step-done" : i === at ? "sync-step-now" : "";
      });
      if (progress.step === "downloading") {
        steps.downloading.textContent = `Downloading ${progress.done} of ${progress.total} notes`;
      }
      if (progress.step === "ready") steps.ready.className = "sync-step-done";
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

    const notes = result.notes === 1 ? "1 note" : `${result.notes} notes`;
    const done = element("p", "settings-text", `Your notes are here. Brought in ${notes} from ${repoName}.`);
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

    // Draw every section and show them, folded open at `section` if given.
    open(section) {
      drawPapers();
      drawWriting();
      drawTabs();
      drawShortcutsSetting();
      drawPanels();
      el.hidden = false;
      closeButton.focus();
      // A switch still running keeps its progress on screen.
      const repoDrawn = switchRunning ? Promise.resolve() : drawNotesHome();
      const target = section && el.querySelector(`[data-section="${section}"]`);
      if (!target) return;
      target.open = true;
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

// The cheat sheet drawer and its small tab, or nothing when switched off.
// "How Glacier works" at its top shows the welcome page again (#91).
export function createShortcutsView({ onFold, onUnfold, onWelcome }) {
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
    for (const [keys, does] of entries) {
      const term = document.createElement("dt");
      term.append(element("code", "", keys));
      const row = element("div", "shortcuts-row");
      row.append(term, element("dd", "", does));
      list.append(row);
    }
    body.append(element("h2", "settings-subheading", title), list);
  }
  sheet.append(header, body);

  const tab = element("button", "shortcuts-tab", "?");
  tab.type = "button";
  tab.setAttribute("aria-label", "Open the shortcuts");
  tab.title = "Open the shortcuts";
  tab.addEventListener("click", () => (sheet.hidden ? onUnfold() : onFold()));
  sheet.hidden = true;
  tab.hidden = true;

  return {
    sheet,
    tab,

    // `state` is the saved { on, folded }. The tab shows whenever the panel
    // is on; the sheet slides in from the right edge when it is open.
    draw(state) {
      sheet.hidden = !state.on || state.folded;
      tab.hidden = !state.on;
      tab.setAttribute("aria-expanded", String(state.on && !state.folded));
    },
  };
}
