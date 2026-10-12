// The Zen panel: a live-preview block editor (ADR 0006). The note is held as
// lines; every block is shown as finished formatting except the one the cursor
// is on, which shows its raw Markdown styled as you type, its marks faded (#37).
// As you type, edits are saved into this browser's own IndexedDB copy of the
// Notebook (ADR 0003) — no save button; the write-through storage keeps every
// keystroke.
//
// The block logic (splitting, list continuation, merging, raw-offset mapping,
// the `/` command list) lives in editor-model.mjs as pure, tested functions,
// and the editing decisions — the caret, typing, Enter/Backspace/↑↓, paste and
// the `/` command menu with the + button — live behind the Editor session
// (#31, #32). This file is only the DOM wiring: it forwards what happened and
// draws editor.state and editor.menu. The pill that switches notes arrives in a
// later slice (#12).

import { createNotebook, importSummary, sourceLabel, syncErrorMessage } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { githubRemote } from "../src/github-remote.mjs";
import { createAutoSync, syncDotText, syncStatusText, syncBox, syncResultText, JUST_SYNCED } from "../src/auto-sync.mjs";
import { printHtml } from "../src/print-layout.mjs";
import { createScreen } from "../src/screen.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { newNoteChoices, NEW_NOTE_HINT, PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";
import { notebookMenu, noteMenu, rowActions, archivedNotice, deleteCollectionQuestion, pageNoteCount, secondVersionBar, noteOrigin, lastNotesBox, pillTitle, BACK_BUTTON_HINT } from "../src/menu-contents.mjs";
import { createOpeningFlow } from "../src/opening-flow.mjs";
import { createBrowserPage } from "../src/browser-page.mjs";
import { createEditorSession } from "../src/editor-session.mjs";
import { readTabSettings } from "../src/tab-settings.mjs";
import { readShortcutsPanel } from "../src/shortcuts-panel.mjs";
import { readLook, lookStyle, wholeRows, applyLook } from "../src/look.mjs";
import { readPanelPlace, createPanelPlacement } from "../src/panel-place.mjs";
import { createBrowserPanels } from "../src/browser-panels.mjs";
import { createSettingsView, createShortcutsView, justSyncedLine, menuButton, iconButton, originIcon, askFormat } from "./settings-view.js";
import { WELCOME_GREETING, WELCOME_LINES, WELCOME_TIP, ADD_TO_COLLECTION_HINT, welcomeShown } from "../src/guidance.mjs";
import { drawBesideFrames } from "./beside-frames.js";
import {
  blockRanges,
  copiedMessage,
  editorTextToBody,
  focusedLineSpans,
  isFence,
  lineMarkLength,
  renderLineHtml,
} from "../src/editor-model.mjs";

// The empty-line hint and the menu that `/` and the + button open (#6). The
// command logic (which commands, filtering, applying one) is tested in the
// editor model; this file only draws the menu and wires its keys.
const EMPTY_LINE_HINT = "Type / for commands, or click + on the left";

// The one quiet line on a fresh page (#61), where the note starts as you type.
const PAGE_DRAFT_HINT = "No note for this page yet. Just start writing.";
const DRAFT_HINT = "Just start writing.";

// The formatting shortcuts (#44): Ctrl (Cmd on a Mac) plus these keys. Ctrl+K
// is kept free for search.
const FORMAT_KEYS = { b: "bold", i: "italic", e: "code" };

const noteEl = document.querySelector(".note");
const saveErrorEl = document.querySelector(".save-error");
const pillEl = document.querySelector(".pill");
const pillTitleEl = document.querySelector(".pill-title");
const pillArchivedEl = document.querySelector(".pill-archived");
const pillCountEl = document.querySelector(".pill-count");
const pillMenuEl = document.querySelector(".pill-menu");
const syncDotEl = document.querySelector(".sync-dot");
const secondVersionBarEl = document.querySelector(".second-version-bar");
const renameHintEl = document.querySelector(".rename-hint");
const backlinksButtonEl = document.querySelector(".backlinks-button");
const backlinksListEl = document.querySelector(".backlinks-list");
const backEl = document.querySelector(".pill-back");
const newButtonEl = document.querySelector(".pill-new");
const newMenuEl = document.querySelector(".new-menu");
const menuPanelEl = document.querySelector(".menu");
const noteMetaEl = document.querySelector(".note-meta");
const glacierButtonEl = document.querySelector(".glacier-button");

// This browser's own extension storage: the Notes Repo connection and the
// chosen look. Neither is ever written into the Notebook (ADR 0003).
const api = typeof browser !== "undefined" ? browser : chrome;
const extensionStorage = api.storage.local;

// The paper, font and text size (#18). Drawn by setting the custom
// properties from src/look.mjs on the page; the stylesheet does the rest.
let look = readLook(undefined);
let lookDrawn = lookStyle(look);

function drawLook() {
  const root = document.documentElement;
  lookDrawn = applyLook(root, look);
  root.dataset.pattern = lookDrawn.pattern;
  // A Nature paper's panorama (#19); the stylesheet picks the picture.
  if (lookDrawn.art) root.dataset.art = lookDrawn.art;
  else delete root.dataset.art;
  // Dark papers show the welcome's scene at night (#90).
  root.toggleAttribute("data-dark", lookDrawn.dark);
  fitRows();
}

// A block that isn't a whole number of rows tall is padded down to the next
// ruled line, so the text after it is still on the lines (#18).
function fitRows() {
  if (!noteEl || !noteEl.querySelector(".block, .line-row, .md-code")) return;
  const blocks = [...noteEl.children];
  for (const block of blocks) block.style.minHeight = "";
  const heights = blocks.map((block) => block.getBoundingClientRect().height);
  blocks.forEach((block, i) => {
    const padded = wholeRows(heights[i], lookDrawn.lineHeight);
    if (padded > heights[i] + 0.5) block.style.minHeight = `${padded}px`;
  });
}

// A write to this browser's copy failed (aborted or threw). Tell the user so
// they don't trust a save that didn't happen (issue #25); their text is still
// on screen to copy out, and Sync is the cross-browser backup.
function reportSaveError(error) {
  console.error("Glacier: could not save", error);
  if (saveErrorEl) {
    saveErrorEl.hidden = false;
  }
}

// How notes follow tabs (#53), kept per browser like the look.
let tabSettings = readTabSettings(undefined);

// The Shortcuts panel (#20): switched on in settings, open or folded until
// you change it.
let shortcutsPanel = readShortcutsPanel(undefined);

// Where settings and the Shortcuts panel open (#21), as saved: "ask" until
// the explanation card has been answered. The Panel placement keeps it after.
let savedPanelPlace = readPanelPlace(undefined);

// Whether the welcome (#85) is still to be shown: until Start writing, once.
let showWelcome = false;

// Hide the welcome and count it as seen: Start writing, a note opening or
// anything typed all do it (#89).
function dismissWelcome() {
  if (!showWelcome) return;
  showWelcome = false;
  const welcomeEl = document.querySelector(".welcome");
  welcomeEl.hidden = true;
  welcomeEl.replaceChildren();
  extensionStorage.set({ welcomeSeen: true }).catch((error) => {
    console.warn("Glacier: could not remember the welcome", error);
  });
}

async function start() {
  if (!noteEl) return;

  try {
    look = readLook((await extensionStorage.get("look")).look);
  } catch (error) {
    console.warn("Glacier: could not read the chosen look", error);
  }
  try {
    tabSettings = readTabSettings((await extensionStorage.get("tabSettings")).tabSettings);
  } catch (error) {
    console.warn("Glacier: could not read the tab settings", error);
  }
  try {
    shortcutsPanel = readShortcutsPanel((await extensionStorage.get("shortcutsPanel")).shortcutsPanel);
  } catch (error) {
    console.warn("Glacier: could not read the shortcuts panel", error);
  }
  try {
    savedPanelPlace = readPanelPlace((await extensionStorage.get("panelPlace")).panelPlace);
  } catch (error) {
    console.warn("Glacier: could not read where the panels open", error);
  }
  try {
    showWelcome = welcomeShown((await extensionStorage.get("welcomeSeen")).welcomeSeen);
  } catch (error) {
    console.warn("Glacier: could not read whether the welcome was seen", error);
  }
  drawLook();
  document.fonts?.addEventListener("loadingdone", fitRows);

  // Keep the page read-only until the Notebook has loaded (issue #23). Making
  // it editable first lost text two ways: keystrokes typed before the load
  // finished were overwritten when the stored body arrived, and typing on a
  // fresh install — where no note exists and no save listener is attached —
  // went nowhere. So we open storage first, then decide.
  let notebook;
  try {
    const storage = await openIndexedDbStorage({
      onPersistError: reportSaveError,
    });
    notebook = createNotebook({ storage });
  } catch (error) {
    // Without storage there is nowhere to save, so the page stays read-only
    // rather than inviting text that can't be kept.
    console.error("Glacier: could not open storage", error);
    return;
  }

  // What's on screen (the note, the fresh page of #61, the note before it,
  // the ← history and saving) is the Screen's (#65). Nothing is open until the
  // page's note is found or a note is made (the Opening flow, below);
  // while nothing is open the panel shows a way to make a note rather than a
  // blank, locked page (#3). Each action returns what to draw next.
  const screen = createScreen({
    notebook,
    onSaveError: reportSaveError,
    // Leaving a note with the menu open is a dismissal, so an untouched + `/`
    // is taken back out before the note we're leaving is saved (#28).
    beforeLeave: () => editor.dismissMenu(),
  });

  // The editing decisions — the note's lines and caret, typing, Enter,
  // Backspace, ↑/↓, paste, the `/` command menu with the + button and the
  // cursor maths — live behind this front door (#31, #32, ADR 0002). This file
  // only forwards what happened and draws editor.state and editor.menu; a text
  // change is forwarded to the Screen, which owns saving the open note.
  // Sync with the Notes Repo runs by itself (#15): a pull when the sidebar
  // opens and a push a few seconds after typing stops. When to sync is
  // auto-sync's; this connects it to GitHub and draws the status.
  const autoSync = createAutoSync({
    notebook,
    connect: async () => {
      const { repo, token } = await loadConnection();
      return repo && token ? { remote: githubRemote({ repo, token }), repo } : null;
    },
    beforeSync: () => screen.flush(),
    onStatus: drawSyncStatus,
    onPulled: (titles) => {
      if (menuIsOpen()) closeMenu();
      draw(screen.pulled(titles));
    },
  });
  const editor = createEditorSession({
    onChange: (body) => {
      draw(screen.edit(body));
      autoSync.changed();
    },
    titles: () => notebook.notes().map((note) => note.title),
  });

  // Open a note the user picked. `byPage` is for a note with a page.
  function openNote(note, options) {
    draw(screen.open(note, options));
  }

  // Draw what a Screen action returned (see src/screen.mjs for the views).
  function draw(view) {
    if (!view) return;
    if (view.changed) autoSync.changed();
    switch (view.type) {
      case "note":
        dismissWelcome();
        if (view.reload) {
          // The note's lines in the editor, with the caret at the top.
          editor.load(view.note.body ?? "");
          render();
          closeMenu();
        } else {
          // The text stays as typed; a fresh page that became a note loses its
          // hint and gets its + back.
          if (focusedEl) focusedEl.dataset.placeholder = EMPTY_LINE_HINT;
          noteEl.querySelector(".line-plus")?.removeAttribute("hidden");
        }
        updatePill();
        updateBacklinks();
        updateNoteMeta();
        break;
      case "freshPage":
        editor.load("");
        closeMenu();
        updatePill();
        updateBacklinks();
        updateNoteMeta();
        render();
        if (view.editTitle) startTitleEdit();
        break;
      case "startPrompt":
        showStartPrompt();
        break;
      case "permissionCard":
        showPermissionCard();
        break;
      case "followPage":
        updatePill();
        updateNoteMeta();
        updateBacklinks();
        if (view.newForPage) openingFlow.newNoteForPage();
        else openingFlow.start();
        break;
      case "pageChanged":
        openingFlow.pageChanged();
        break;
      case "backlinks":
        updateBacklinks();
        break;
    }
  }

  // --- The note's header (#13, #61) ----------------------------------------
  //
  // The note's file keeps its Collection and Source in a frontmatter (ADR 0005),
  // but the editor never shows that YAML: every note gets a small
  // "Collection · site ↗" line above its text instead, without the site when the
  // note has no page (#68). Clicking the Collection opens a small list right there
  // to move the note; the site switches to the page's tab, or opens it in a
  // new one.

  function updateNoteMeta() {
    noteMetaEl.replaceChildren();
    noteMetaEl.classList.remove("is-picking");
    const note = screen.note();
    if (note) noteMetaEl.append(courseButton(note));
    if (note?.source) noteMetaEl.append(" · ", originIcon(noteOrigin(notebook, note.title)), sourceLink(note.source));
    noteMetaEl.hidden = !note;
    noteEl.classList.toggle("has-meta", Boolean(note));
    updateSecondVersionBar();
  }

  // The bar above a second version's text (#70): where the original is, and
  // a way to delete this version (which asks first, #57).
  function updateSecondVersionBar() {
    const bar = secondVersionBar(notebook, screen.note());
    secondVersionBarEl.hidden = !bar;
    secondVersionBarEl.replaceChildren();
    noteEl.classList.toggle("has-bar", Boolean(bar));
    if (!bar) return;
    const text = document.createElement("p");
    text.textContent = bar.text;
    const buttons = document.createElement("div");
    buttons.className = "second-version-buttons";
    if (bar.original) {
      buttons.append(barButton(bar.openLabel, () => {
        const original = notebook.note(bar.original);
        if (original) openNote(original, { byPage: isOpenedByPage(original) });
      }));
    }
    if (bar.deleteLabel) buttons.append(barButton(bar.deleteLabel, showDeleteQuestion));
    secondVersionBarEl.append(text, buttons);
    noteEl.style.setProperty("--bar-height", `${secondVersionBarEl.offsetHeight}px`);
  }

  function barButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function courseButton(note) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-meta-course";
    button.classList.toggle("is-empty", !note.course);
    button.textContent = note.course || "Add to a collection";
    button.title = note.course ? "Click to choose a collection" : ADD_TO_COLLECTION_HINT;
    button.addEventListener("click", () => {
      if (noteMetaEl.querySelector(".course-list")) updateNoteMeta();
      else openCourseList();
    });
    return button;
  }

  // The Collections, the last used one first, and "+ New collection" at the bottom.
  function openCourseList() {
    const list = document.createElement("div");
    list.className = "course-list";
    if (screen.note()?.course) {
      const none = document.createElement("button");
      none.type = "button";
      none.className = "course-choice";
      none.textContent = "No collection";
      none.addEventListener("click", () => {
        draw(screen.removeFromCourse());
        render();
      });
      list.appendChild(none);
    }
    for (const course of notebook.courseChoices()) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "course-choice";
      choice.textContent = course;
      choice.addEventListener("click", () => moveCurrentNote(course));
      list.appendChild(choice);
    }
    const fresh = document.createElement("button");
    fresh.type = "button";
    fresh.className = "course-choice is-new";
    fresh.textContent = "+ New collection";
    fresh.addEventListener("click", showCourseInput);
    list.appendChild(fresh);
    noteMetaEl.classList.add("is-picking");
    noteMetaEl.appendChild(list);
    list.querySelector("button").focus();
  }

  // "+ New collection" turns the Collection into a text field on the same line.
  // Enter or clicking away moves the note (a name that matches a Collection in
  // other capitals picks that one, #73); Esc or an empty field changes nothing.
  function showCourseInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "course-input";
    input.placeholder = "New collection";
    input.setAttribute("aria-label", "New collection");
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (keep && input.value.trim()) moveCurrentNote(input.value);
      else {
        updateNoteMeta();
        render();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    noteMetaEl.querySelector(".course-list")?.remove();
    noteMetaEl.classList.remove("is-picking");
    noteMetaEl.querySelector(".note-meta-course").replaceWith(input);
    input.focus();
  }

  function moveCurrentNote(course) {
    draw(screen.moveToCourse(course));
    render();
  }

  // A click anywhere else, or Esc, closes the Collection list.
  document.addEventListener("mousedown", (event) => {
    if (!noteMetaEl.querySelector(".course-list")) return;
    if (event.target.closest(".course-list, .note-meta-course")) return;
    updateNoteMeta();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !noteMetaEl.querySelector(".course-list")) return;
      event.preventDefault();
      event.stopPropagation();
      updateNoteMeta();
      if (screen.note()) render();
    },
    true,
  );

  // The site, e.g. "youtube.com ↗"; hovering shows the full address. A plain
  // click goes through the browser page port, which picks the lesson's tab.
  function sourceLink(source) {
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = source;
    link.textContent = `${sourceLabel(source)} ↗`;
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      browserPage.openSource(source);
    });
    return link;
  }

  // --- Backlinks (#10) ---------------------------------------------------------
  //
  // A small button at the bottom left counts the notes that link to the open
  // note; clicking it lists them and clicking one opens it. Which notes those
  // are is the Notebook's (backlinks); this only draws them.

  function closeBacklinks() {
    backlinksListEl.hidden = true;
    backlinksButtonEl.setAttribute("aria-expanded", "false");
  }

  function updateBacklinks() {
    closeBacklinks();
    backlinksListEl.replaceChildren();
    const note = screen.note();
    const linking = note ? notebook.backlinks(note.title) : [];
    backlinksButtonEl.hidden = linking.length === 0;
    backlinksButtonEl.textContent =
      linking.length === 1 ? "1 backlink" : `${linking.length} backlinks`;
    for (const note of linking) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "backlinks-item";
      item.textContent = note.title;
      item.addEventListener("click", () => openNote(note));
      backlinksListEl.appendChild(item);
    }
  }

  backlinksButtonEl.addEventListener("click", () => {
    const opening = backlinksListEl.hidden;
    backlinksListEl.hidden = !opening;
    backlinksButtonEl.setAttribute("aria-expanded", String(opening));
  });

  // --- The pill and its menu (#12) -------------------------------------------
  //
  // The pill shows the open note's title and the sync dot. Clicking it, or
  // Ctrl+K, opens the menu: search, recent notes, the Notebook and the two
  // "+" buttons. What to list and what a search matches is the Notebook's
  // (search, recentNotes, outline); this only draws it. Esc closes it.

  function updatePill() {
    stopTitleEdit();
    const note = screen.note();
    const freshPage = screen.freshPage();
    const title = pillTitle({ note, freshPage });
    pillTitleEl.textContent = title.text;
    pillTitleEl.classList.toggle("is-draft", title.draft);
    pillTitleEl.classList.toggle("is-quiet", !title.renamable);
    pillTitleEl.title = title.hint;
    if (title.renamable) {
      pillTitleEl.setAttribute("role", "button");
      pillTitleEl.tabIndex = 0;
    } else {
      pillTitleEl.removeAttribute("role");
      pillTitleEl.removeAttribute("tabindex");
    }
    pillArchivedEl.hidden = !note?.archived;
    // "1 of 3": the page has more notes (#68). Like the rest of the pill, a
    // click opens the ▾ menu, which starts with Notes for this page.
    const count = pageNoteCount(notebook, note);
    pillCountEl.hidden = count === null;
    pillCountEl.textContent = count ?? "";
    updateNoteMenuButton();
    const previous = screen.previous();
    backEl.hidden = previous === null || !tabSettings.showPreviousButton;
    if (previous === null) closeBackBox();
  }

  // ← opens a small box with the last notes you were on, newest first (#81).
  // A click on one opens it. Esc or a click outside closes the box, and
  // ↑/↓ and Enter work too.
  const backBoxEl = document.querySelector(".back-box");
  backEl.title = BACK_BUTTON_HINT;

  function closeBackBox() {
    backBoxEl.hidden = true;
    backBoxEl.replaceChildren();
    backEl.setAttribute("aria-expanded", "false");
  }

  function openBackBox() {
    backBoxEl.replaceChildren();
    for (const { title, origin } of lastNotesBox(screen, notebook)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.append(originIcon(origin), title);
      button.addEventListener("click", () => {
        closeBackBox();
        const found = notebook.note(title);
        if (found) openNote(found, { byPage: isOpenedByPage(found) });
      });
      backBoxEl.append(button);
    }
    backBoxEl.hidden = false;
    backEl.setAttribute("aria-expanded", "true");
    backBoxEl.querySelector("button")?.focus();
  }

  backEl.addEventListener("click", () => {
    if (backBoxEl.hidden) {
      closeOverlays();
      openBackBox();
    } else closeBackBox();
  });
  document.addEventListener("click", (event) => {
    if (!backBoxEl.hidden && !event.target.closest(".back-box, .pill-back")) closeBackBox();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (backBoxEl.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeBackBox();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const buttons = [...backBoxEl.querySelectorAll("button")];
      const at = buttons.indexOf(document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(at + step + buttons.length) % buttons.length]?.focus();
    },
    true,
  );

  // + opens a small menu: New note (blank) always, and on a website New note
  // for this page (#68).
  function closeNewMenu() {
    newMenuEl.hidden = true;
    newMenuEl.replaceChildren();
    newButtonEl.setAttribute("aria-expanded", "false");
  }

  function startNoteForPage() {
    draw(screen.startNoteForPage());
  }

  async function openNewMenu() {
    const choices = newNoteChoices({ onWebsite: await openingFlow.onWebsite() });
    newMenuEl.replaceChildren();
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-new";
      button.textContent = choice.label;
      button.title = choice.hint;
      button.addEventListener("click", () => {
        closeNewMenu();
        if (choice.kind === "page") startNoteForPage();
        else draw(screen.startFreshPage({ editTitle: true }));
      });
      newMenuEl.appendChild(button);
    }
    newMenuEl.hidden = false;
    newButtonEl.setAttribute("aria-expanded", "true");
    newMenuEl.querySelector("button").focus();
  }

  newButtonEl.addEventListener("click", () => {
    if (!newMenuEl.hidden) closeNewMenu();
    else {
      closeOverlays();
      openNewMenu();
    }
  });

  function menuIsOpen() {
    return !menuPanelEl.hidden;
  }

  function closeMenu() {
    if (!menuIsOpen()) return;
    menuPanelEl.hidden = true;
    menuPanelEl.replaceChildren();
    pillMenuEl.setAttribute("aria-expanded", "false");
  }

  // Close the menu and put the caret back in the note.
  function dismissMenuPanel() {
    if (!menuIsOpen()) return;
    closeMenu();
    if (screen.note() || screen.freshPage()) render();
  }

  function noteButton(title, className = "menu-item") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.addEventListener("click", () => {
      const note = notebook.note(title);
      if (note) openNote(note, { byPage: isOpenedByPage(note) });
    });
    return button;
  }

  function menuHeading(text, hint) {
    const heading = document.createElement("h2");
    heading.className = "menu-heading";
    if (hint) heading.title = hint;
    heading.textContent = text;
    return heading;
  }

  // A note button with the hover icons on its right (#71).
  function noteRow(button, title, archived = false) {
    const row = document.createElement("div");
    row.className = "menu-row";
    const icons = document.createElement("span");
    icons.className = "row-icons";
    for (const action of rowActions(title, archived)) {
      icons.append(iconButton(action.kind, action.hint, (clicked) => rowAction(action.kind, title, clicked)));
    }
    row.append(button, icons);
    return row;
  }

  function rowAction(kind, title, anchor) {
    if (kind === "download") askFormat(anchor, (format) => downloadNote(title, format));
    else if (kind === "archive") archiveFromMenu(title);
    else if (kind === "unarchive") unarchiveFromMenu(title);
    else {
      closeMenu();
      const note = notebook.note(title);
      if (screen.note()?.title !== title) openNote(note, { byPage: isOpenedByPage(note) });
      showDeleteQuestion();
    }
  }

  function unarchiveFromMenu(title) {
    notebook.unarchiveNote(title);
    autoSync.changed();
    refreshMenu();
  }

  // Archive at once, with a short notice that puts the note back.
  function archiveFromMenu(title) {
    if (screen.note()?.title === title) draw(screen.archive());
    else {
      notebook.archiveNote(title);
      autoSync.changed();
    }
    refreshMenu();
    showNotice("Archived.", 6000, {
      label: "Undo",
      run: () => undoArchive([title]),
    });
  }

  function titleList(titles, current = null, archived = false) {
    const list = document.createElement("div");
    for (const title of titles) {
      const button = noteButton(title);
      button.textContent = title;
      button.prepend(originIcon(noteOrigin(notebook, title)));
      if (title === current) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "true");
      }
      list.appendChild(noteRow(button, title, archived));
    }
    return list;
  }

  // A highlighted match: { before, match, after } as text with a <mark>.
  function marked(element, { before, match, after }) {
    const mark = document.createElement("mark");
    mark.textContent = match;
    element.append(before, mark, after);
    return element;
  }

  function snippetPieces(element, pieces) {
    for (const { text, match } of pieces) {
      if (match) {
        const mark = document.createElement("mark");
        mark.textContent = text;
        element.append(mark);
      } else {
        element.append(text);
      }
    }
    return element;
  }

  function searchResult({ title, titleMark, snippet }) {
    const button = noteButton(title, "menu-item menu-result");
    const titleEl = document.createElement("span");
    titleEl.className = "menu-result-title";
    button.append(originIcon(noteOrigin(notebook, title)));
    if (titleMark) {
      button.append(marked(titleEl, titleMark));
      return noteRow(button, title);
    }
    titleEl.textContent = title;
    const snippetEl = document.createElement("span");
    snippetEl.className = "menu-snippet";
    button.append(titleEl, snippetPieces(snippetEl, snippet));
    return noteRow(button, title);
  }

  // A Collection heading with its hover icons (#74).
  function collectionSummary(course, actions, parent, tag = "summary") {
    const summary = document.createElement(tag);
    summary.textContent = course;
    const icons = document.createElement("span");
    icons.className = "collection-icons";
    for (const action of actions) {
      icons.append(iconButton(action.kind, action.hint, (button) => collectionAction(action.kind, course, button, parent)));
    }
    summary.append(icons);
    return summary;
  }

  function collectionAction(kind, course, anchor, details) {
    if (kind === "download") askFormat(anchor, (format) => downloadCourse(course, format, { archived: Boolean(details.closest(".menu-archive")) }));
    else if (kind === "archive") archiveCollectionFromMenu(course);
    else if (kind === "unarchive") unarchiveCollectionFromMenu(course);
    else askDeleteCollection(course, details);
  }

  function archiveCollectionFromMenu(course) {
    const { titles, view } = screen.archiveCollection(course);
    draw(view);
    refreshMenu();
    showNotice(archivedNotice(titles.length), 6000, {
      label: "Undo",
      run: () => undoArchive(titles),
    });
  }

  // Undo an archive: the notes come back, and the open note if it was closed.
  function undoArchive(titles) {
    draw(screen.undoArchive(titles));
    refreshMenu();
  }

  function unarchiveCollectionFromMenu(course) {
    notebook.unarchiveCollection(course);
    autoSync.changed();
    refreshMenu();
  }

  // Delete a whole Collection (#74): the question replaces the group's notes
  // right in the menu, with Delete and Keep. Esc is Keep.
  function askDeleteCollection(course, details) {
    details.querySelector(".delete-question")?.remove();
    const count = notebook.outline().courses.find((entry) => entry.course === course)?.titles.length ?? 0;
    const card = document.createElement("div");
    card.className = "perm-card delete-question";
    const question = document.createElement("p");
    question.textContent = deleteCollectionQuestion(course, count);
    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";
    const confirm = barButton("Delete", () => {
      stop();
      const openTitle = screen.note()?.title;
      const gone = notebook.outline().courses.find((entry) => entry.course === course)?.titles ?? [];
      screen.flush();
      notebook.deleteCollection(course);
      autoSync.changed();
      if (openTitle && gone.includes(openTitle)) draw(screen.pulled(gone));
      refreshMenu();
    });
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "perm-cancel";
    keep.textContent = "Keep";
    function stop() {
      document.removeEventListener("keydown", onKey, true);
      card.remove();
    }
    function onKey(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
    keep.addEventListener("click", stop);
    document.addEventListener("keydown", onKey, true);
    buttons.append(confirm, keep);
    card.append(question, buttons);
    details.querySelector("summary").after(card);
    keep.focus();
  }

  // A website's own group under No collection (#92): a globe, the page's
  // title and one hover icon that moves all its notes to a Collection.
  function pageSummary({ label, page, titles, actions }) {
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "page-group-name";
    name.append(originIcon({ kind: "website", hint: "From a website" }), label);
    const icons = document.createElement("span");
    icons.className = "collection-icons";
    for (const action of actions) {
      icons.append(iconButton(action.kind, action.hint, (button) => pickCollection(button, (course) => movePage(page, titles, course))));
    }
    summary.append(name, icons);
    return summary;
  }

  // The Collections to pick from, right where the move icon was clicked, and
  // "+ New collection", which turns into a text field. Esc or a click
  // anywhere else closes it.
  function pickCollection(anchor, onPick) {
    document.querySelector(".collection-choice")?.remove();
    const box = document.createElement("div");
    box.className = "format-choice collection-choice";
    const close = () => {
      box.remove();
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOutside = (event) => {
      if (!box.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const pick = (course) => {
      close();
      onPick(course);
    };
    for (const course of notebook.courseChoices()) {
      box.append(menuButton(course, `Move to '${course}'`, () => pick(course)));
    }
    const fresh = menuButton("+ New collection", "Make a collection and move the notes there", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "menu-new-collection-input";
      input.placeholder = "New collection";
      input.setAttribute("aria-label", "New collection");
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (input.value.trim()) pick(input.value);
      });
      fresh.replaceWith(input);
      input.focus();
    });
    box.append(fresh);
    const rect = anchor.getBoundingClientRect();
    box.style.top = `${rect.bottom + 2}px`;
    box.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`;
    document.body.append(box);
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    box.querySelector("button").focus();
  }

  // Move every note of a page to a Collection; the open note goes through the
  // Screen so it stays on screen as it is.
  function movePage(page, titles, course) {
    if (titles.includes(screen.note()?.title)) draw(screen.moveToCourse(course));
    notebook.movePageToCollection(page, course);
    autoSync.changed();
    if (screen.note()) render();
    refreshMenu();
  }

  function menuGroup({ label, hint, open, archive, titles, actions, sections, page }) {
    const details = document.createElement("details");
    details.className = archive ? "menu-archive" : "menu-course";
    details.open = open;
    if (page) {
      const summary = pageSummary({ label, page, titles, actions });
      summary.title = hint;
      details.classList.add("page-group");
      details.append(summary, titleList(titles));
      return details;
    }
    if (sections) {
      const summary = document.createElement("summary");
      summary.textContent = label;
      summary.title = hint;
      details.append(summary);
      for (const section of sections) {
        const inner = document.createElement("div");
        inner.className = "menu-course";
        const heading = collectionSummary(section.course, section.actions, inner, "div");
        heading.className = "menu-course-heading";
        heading.title = "Notes in this collection";
        inner.append(heading, titleList(section.titles, null, true));
        details.append(inner);
      }
      const loose = titles.filter((title) => !sections.some((section) => section.titles.includes(title)));
      details.append(titleList(loose, null, true));
      return details;
    }
    const summary = actions ? collectionSummary(label, actions, details) : document.createElement("summary");
    if (!actions) summary.textContent = label;
    summary.title = hint;
    details.append(summary, titleList(titles, null, archive));
    return details;
  }

  // "+ New collection" under the Notebook heading turns into a text field.
  // Enter makes an empty Collection; Esc or an empty field changes nothing.
  function newCollectionButton({ label, hint }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-new menu-new-collection";
    button.textContent = label;
    button.title = hint;
    button.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "menu-new-collection-input";
      input.placeholder = "New collection";
      input.setAttribute("aria-label", "New collection");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          notebook.newCollection(input.value);
          refreshMenu();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          refreshMenu();
        }
      });
      button.replaceWith(input);
      input.focus();
    });
    return button;
  }

  function conflictPair({ notes }) {
    const row = document.createElement("div");
    row.className = "conflict-pair";
    for (const { title, label } of notes) {
      const button = noteButton(title);
      button.textContent = label;
      button.prepend(originIcon(noteOrigin(notebook, title)));
      row.append(noteRow(button, title));
    }
    return row;
  }

  function newForPageButton({ label, hint }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-new menu-new-for-page";
    button.textContent = label;
    button.title = hint;
    button.addEventListener("click", () => {
      closeMenu();
      startNoteForPage();
    });
    return button;
  }

  // Draw the parts src/menu-contents.mjs lists for the ▾ menu.
  function drawMenuParts(container, parts) {
    container.replaceChildren();
    for (const part of parts) {
      if (part.kind === "heading") container.append(menuHeading(part.text, part.hint));
      else if (part.kind === "notes") container.append(titleList(part.titles, part.current));
      else if (part.kind === "newForPage") container.append(newForPageButton(part));
      else if (part.kind === "newCollection") container.append(newCollectionButton(part));
      else if (part.kind === "group") container.append(menuGroup(part));
      else if (part.kind === "result") container.append(searchResult(part));
      else if (part.kind === "pair") container.append(conflictPair(part));
      else {
        const none = document.createElement("p");
        none.className = "menu-empty";
        none.textContent = part.text;
        container.append(none);
      }
    }
  }

  let refreshMenu = () => {};

  // Only one of the ▾ menu, the ⋯ menu, the + menu, the ← box, the sync box
  // and the Shortcuts panel is open at a time (#83).
  function closeOverlays({ keepShortcuts = false } = {}) {
    closeMenu();
    closeNewMenu();
    closeNoteMenu();
    closeBackBox();
    closeSyncBox();
    if (!keepShortcuts && shortcutsPanel.on && !shortcutsPanel.folded) prefs.saveShortcutsPanel({ folded: true });
  }

  function openMenu() {
    closeSettings({ redraw: false });
    if (menuIsOpen()) {
      menuPanelEl.querySelector(".menu-search").focus();
      return;
    }
    closeOverlays();
    // Flush the line being edited so the menu sees its latest text.
    screen.flush();
    menuPanelEl.replaceChildren();

    const search = document.createElement("input");
    search.type = "search";
    search.className = "menu-search";
    search.placeholder = "Search titles, or // to search inside notes";
    search.title = "Search titles, or // to search inside notes";
    search.setAttribute("aria-label", "Search notes");

    const body = document.createElement("div");
    body.className = "menu-body";
    const refresh = () => drawMenuParts(body, notebookMenu(notebook, search.value, screen.note()));
    refreshMenu = refresh;
    search.addEventListener("input", refresh);
    refresh();

    const actions = document.createElement("div");
    actions.className = "menu-actions";
    const newNote = document.createElement("button");
    newNote.type = "button";
    newNote.className = "menu-new";
    newNote.textContent = "+ New note";
    newNote.title = NEW_NOTE_HINT;
    newNote.addEventListener("click", () => {
      draw(screen.startFreshPage({ title: search.value.trim(), editTitle: true }));
    });
    actions.append(newNote);

    menuPanelEl.append(search, actions, body);
    menuPanelEl.hidden = false;
    pillMenuEl.setAttribute("aria-expanded", "true");
    search.focus();
  }

  // Export and Restore (#13, #55). The file format lives in the Notebook
  // core; this only downloads. "Download as a file" is in the ⋯ menu;
  // the rest live in Settings, under Notes repo (#18). The sidebar always does
  // the download, also for settings beside it (#21).
  function download(data, type, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  // Download a note or a Collection in the chosen format (#71). Markdown gives
  // the file or a zip; PDF opens the browser's print window with the notes
  // laid out on their own, where the user picks Save as PDF.
  function printWindow(notes) {
    const win = window.open("", "_blank");
    if (!win) {
      showNotice("Your browser blocked the print window");
      return;
    }
    win.document.write(printHtml(notes));
    win.document.close();
    win.focus();
    win.print();
  }

  function downloadNote(title, format) {
    screen.flush();
    if (format !== "md") return printWindow(notebook.notesToPrint(title));
    const file = notebook.exportNote(title);
    download(file.text, "text/markdown", file.path.split("/").pop());
  }

  // `archived` is for a Collection's Download icon in the Archive section.
  function downloadCourse(course, format, { archived = false } = {}) {
    screen.flush();
    if (format !== "md") return printWindow(notebook.notesOfCourse(course, { archived }));
    download(notebook.exportCourseZip(course, { archived }), "application/zip", `${course} ${today()}.zip`);
  }

  // The ⋯ "This note" menu (#63): the actions for the open note only, under
  // the note's name. What it offers is decided by noteMenu.
  const noteMenuButtonEl = document.querySelector(".pill-note-menu");
  const noteMenuEl = document.querySelector(".note-menu");

  function closeNoteMenu() {
    noteMenuEl.hidden = true;
    noteMenuEl.replaceChildren();
    noteMenuButtonEl.setAttribute("aria-expanded", "false");
  }

  function updateNoteMenuButton() {
    noteMenuButtonEl.hidden = !screen.note();
    if (!screen.note()) closeNoteMenu();
  }

  function openNoteMenu() {
    const menu = noteMenu(screen.note());
    if (!menu) return;
    closeOverlays();
    screen.flush();
    noteMenuEl.replaceChildren();
    const heading = document.createElement("p");
    heading.className = "note-menu-heading";
    heading.textContent = menu.heading;
    noteMenuEl.appendChild(heading);
    for (const action of menu.actions) {
      noteMenuEl.appendChild(
        menuButton(action.label, action.hint, () => {
          closeNoteMenu();
          if (action.kind === "move") {
            if (!noteMetaEl.querySelector(".course-list")) openCourseList();
          } else if (action.kind === "download") {
            askFormat(noteMenuButtonEl, (format) => downloadNote(screen.note().title, format));
          } else if (action.kind === "archive") archiveFromMenu(screen.note().title);
          else if (action.kind === "unarchive") draw(screen.unarchive());
          else showDeleteQuestion();
        }),
      );
    }
    noteMenuEl.hidden = false;
    noteMenuButtonEl.setAttribute("aria-expanded", "true");
    noteMenuEl.querySelector("button").focus();
  }

  noteMenuButtonEl.addEventListener("click", () => {
    if (!noteMenuEl.hidden) closeNoteMenu();
    else openNoteMenu();
  });

  // Delete this note (#57): a short question in the sidebar, not a browser
  // dialog. Keep or Esc puts the note back as it was. Delete removes it, and
  // the Opening flow decides what the sidebar shows next.
  function showDeleteQuestion() {
    const doomed = screen.note();
    screen.flush();
    noteEl.replaceChildren();

    const card = document.createElement("div");
    card.className = "perm-card delete-question";

    const question = document.createElement("p");
    question.textContent = `Delete “${doomed.title}”? It is also removed from your Notes repo.`;
    card.appendChild(question);

    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "card-button";
    confirm.textContent = "Delete";

    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "perm-cancel";
    keep.textContent = "Keep";

    function keepNote() {
      document.removeEventListener("keydown", onKey, true);
      draw(screen.reopen());
    }
    function onKey(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      keepNote();
    }
    confirm.addEventListener("click", () => {
      document.removeEventListener("keydown", onKey, true);
      draw(screen.delete());
    });
    keep.addEventListener("click", keepNote);
    document.addEventListener("keydown", onKey, true);

    buttons.append(confirm, keep);
    card.appendChild(buttons);
    noteEl.appendChild(card);
    keep.focus();
  }

  // --- The Notes Repo: connecting GitHub and the first sync (#14) -----------
  //
  // The connection lives in Settings, under Notes repo (#18). The repo name
  // and token are kept only in this browser's extension storage, never in the
  // Notebook or the Notes Repo (ADR 0003).
  async function loadConnection() {
    const { notesRepo, githubToken } = await extensionStorage.get(["notesRepo", "githubToken"]);
    return { repo: notesRepo ?? "", token: githubToken ?? "" };
  }

  // The sync dot in the pill shows the state by its colour; hovering it says
  // what the state means (#70).
  function drawSyncStatus(status) {
    if (!syncBoxEl.hidden) drawSyncBox();
    const { label } = syncStatusText(status);
    syncDotEl.dataset.state = status.state;
    syncDotEl.title = syncDotText(status);
    syncDotEl.setAttribute("aria-label", label);
    updateSecondVersionBar();
  }

  // Check them: the ▾ menu, which lists Two versions at the top.
  function showConflictCopies() {
    closeSyncBox();
    openMenu();
    menuPanelEl.querySelector(".menu-body").scrollTop = 0;
  }

  // The box under the sync dot (#75). What it says comes from syncBox and
  // syncResultText; this draws it, keeps "last synced" fresh while open and
  // shows the Sync now result in the button for a few seconds.
  const syncBoxEl = document.querySelector(".sync-box");
  let syncBoxTimer = null;
  let syncResultShown = null;
  let justSynced = false;
  let justSyncedWritten = false;
  let syncResultTimer = null;
  let syncing = false;

  function closeSyncBox() {
    syncBoxEl.hidden = true;
    syncBoxEl.replaceChildren();
    syncDotEl.setAttribute("aria-expanded", "false");
    clearInterval(syncBoxTimer);
    syncBoxTimer = null;
  }

  function drawSyncBox() {
    const status = autoSync.status();
    const box = syncBox(status);
    const lines = [];
    const addLine = (className, text) => {
      const line = document.createElement("p");
      line.className = className;
      line.textContent = text;
      lines.push(line);
    };
    if (justSynced) lines.push(justSyncedLine(justSyncedWritten, "sync-box-status"));
    else addLine("sync-box-status", box.status);
    if (box.last) addLine("sync-box-last", box.last);

    const button = menuButton(
      syncing ? "Syncing…" : (justSynced ? box.action : (syncResultShown ?? box.action)),
      status.state === "off" ? "Connect your GitHub repo" : "Pull and push your notes right away",
      async () => {
        if (status.state === "off") {
          closeSyncBox();
          openSettings("notes-repo");
          return;
        }
        if (syncing) return;
        syncing = true;
        drawSyncBox();
        const result = await autoSync.syncNow();
        syncing = false;
        syncResultShown = syncResultText(result);
        justSynced = syncResultShown === JUST_SYNCED;
        justSyncedWritten = false;
        clearTimeout(syncResultTimer);
        syncResultTimer = setTimeout(() => {
          syncResultShown = null;
          justSynced = false;
          if (!syncBoxEl.hidden) drawSyncBox();
        }, 4000);
        if (!syncBoxEl.hidden) drawSyncBox();
      },
    );
    justSyncedWritten = justSynced;
    const parts = [...lines, button];
    if (box.conflicts) {
      const check = menuButton(box.conflicts, "See each note next to its second version", showConflictCopies);
      parts.push(check);
    }
    if (status.state !== "off") {
      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "sync-box-link";
      settings.textContent = "Notes repo settings";
      settings.title = "Change the repo or token";
      settings.addEventListener("click", () => {
        closeSyncBox();
        openSettings("notes-repo");
      });
      parts.push(settings);
    }
    syncBoxEl.replaceChildren(...parts);
  }

  function openSyncBox() {
    closeOverlays();
    drawSyncBox();
    syncBoxEl.hidden = false;
    syncDotEl.setAttribute("aria-expanded", "true");
    syncBoxTimer = setInterval(drawSyncBox, 15000);
  }

  syncDotEl.addEventListener("click", () => {
    if (syncBoxEl.hidden) openSyncBox();
    else closeSyncBox();
  });
  document.addEventListener("click", (event) => {
    // A button the box redrew is no longer in the page; that click was inside the box.
    if (!syncBoxEl.hidden && event.target.isConnected && !event.target.closest(".sync-box, .sync-dot")) closeSyncBox();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || syncBoxEl.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      closeSyncBox();
    },
    true,
  );

  // What the Notes repo section of Settings asks of the Notebook, wherever
  // settings are drawn (see settings-view.js). The first sync goes through the
  // GitHub remote; the repo and token are saved only once GitHub has accepted
  // them. With settings closed meanwhile, a notice says how it went.
  const repoActions = {
    connection: loadConnection,
    status: async () => autoSync.status(),
    syncNow: () => autoSync.syncNow(),
    courses: async () => notebook.courses(),

    async firstSync(repo, token, onProgress) {
      let result;
      try {
        result = await notebook.firstSync(githubRemote({ repo, token }), onProgress);
      } catch (error) {
        console.error("Glacier: first sync failed", error);
        if (!panels.settingsOpen()) showNotice(syncErrorMessage(error, repo), 8000);
        return { error: syncErrorMessage(error, repo) };
      }
      await extensionStorage.set({ notesRepo: repo, githubToken: token });
      autoSync.syncNow();
      if (!screen.note()) openingFlow.start();
      else updateBacklinks();
      if (!panels.settingsOpen()) showNotice(`Your notes from ${repo} are here.`);
      return { notes: result.notes };
    },

    exportCourse(course, format) {
      downloadCourse(course, format);
    },

    exportAll() {
      screen.flush();
      download(notebook.exportZip(), "application/zip", `Glacier notes ${today()}.zip`);
    },

    exportArchive() {
      screen.flush();
      download(notebook.exportArchiveZip(), "application/zip", `Glacier archive ${today()}.zip`);
    },

    async restore(bytes) {
      screen.flush();
      try {
        const result = await notebook.importZip(bytes);
        showNotice(importSummary(result));
        autoSync.changed();
        updateBacklinks();
      } catch (error) {
        console.error("Glacier: could not import", error);
        showNotice("Couldn't read that zip file");
      }
    },

    notice: (text, ms) => showNotice(text, ms),
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // --- Settings (#18) and the Shortcuts panel (#20) -------------------------
  //
  // The round glacier button opens and closes settings. They open beside the
  // sidebar, over the edge of the web page, when the "all websites"
  // permission allows it, and inside the sidebar otherwise (#21, ADR 0008):
  // over the lower part of the note, so the note above shows each change live.
  // The Shortcuts panel stays inside the sidebar (#76). The choices are kept per
  // browser, and a change made beside the sidebar arrives through storage.

  const prefs = {
    look: () => look,
    // Live while dragging the text size; kept when let go.
    saveLook(change, { keep = true } = {}) {
      look = readLook({ ...look, ...change });
      drawLook();
      if (!keep) return;
      extensionStorage.set({ look }).catch((error) => {
        console.warn("Glacier: could not keep the chosen look", error);
      });
    },
    tabSettings: () => tabSettings,
    saveTabSettings(change) {
      tabSettings = readTabSettings({ ...tabSettings, ...change });
      updatePill();
      extensionStorage.set({ tabSettings }).catch((error) => {
        console.warn("Glacier: could not keep the tab settings", error);
      });
    },
    shortcutsPanel: () => shortcutsPanel,
    saveShortcutsPanel(change) {
      shortcutsPanel = readShortcutsPanel({ ...shortcutsPanel, ...change });
      shortcutsView.draw(shortcutsPanel);
      extensionStorage.set({ shortcutsPanel }).catch((error) => {
        console.warn("Glacier: could not keep the shortcuts panel", error);
      });
    },
    panelPlace: () => panels.choice(),
    choosePanelPlace: (place) => panels.choosePlace(place),
  };

  const settingsView = createSettingsView({ prefs, repo: repoActions, onClose: () => closeSettings() });
  const shortcutsView = createShortcutsView({
    onFold: () => prefs.saveShortcutsPanel({ folded: true }),
    onUnfold: () => {
      closeOverlays({ keepShortcuts: true });
      prefs.saveShortcutsPanel({ folded: false });
    },
    onWelcome: () => {
      closeOverlays();
      closeSettings({ redraw: false });
      showWelcome = true;
      drawWelcome({ again: true });
    },
  });
  // The tab sits in the pill bar next to +, the drawer on the sidebar's right
  // edge (#76).
  newButtonEl.after(shortcutsView.tab);
  glacierButtonEl.before(shortcutsView.sheet, settingsView.el);
  shortcutsView.draw(shortcutsPanel);

  // --- Panels beside the sidebar (#21, ADR 0008) -----------------------------
  //
  // Where settings and the Shortcuts panel open, the explanation card before
  // the browser's prompt and the frames on the page are all decided by the
  // Panel placement (src/panel-place.mjs). This only draws what it shows
  // inside the sidebar; sidebar/beside-frames.js draws the frames.

  // This sidebar's name in its frames' messages, so a second window's
  // sidebar leaves them alone.
  const besideChannel = crypto.randomUUID();

  const panels = createPanelPlacement({
    browser: createBrowserPanels(api, {
      channel: besideChannel,
      origin: location.origin,
      drawBesideFrames,
      sidebarX: () => window.mozInnerScreenX,
    }),
    show: drawPanels,
    keepChoice(panelPlace) {
      extensionStorage.set({ panelPlace }).catch((error) => {
        console.warn("Glacier: could not keep where the panels open", error);
      });
    },
    choice: savedPanelPlace,
  });

  function drawPanels(view) {
    if (view.card) showPanelsCard();
    else closePanelsCard();
    glacierButtonEl.setAttribute("aria-expanded", String(view.open));
    settingsView.showInsideNote(view.explain);
    if (view.settings === "inside") {
      if (!settingsView.isOpen()) settingsView.open(view.section);
    } else settingsView.close();
  }

  function openSettings(section) {
    closeMenu();
    closeNewMenu();
    closeBacklinks();
    screen.flush();
    panels.openSettings(section);
  }

  // Closing puts the caret back in the note, unless a click on the note is
  // about to place it there itself.
  function closeSettings({ redraw = true } = {}) {
    if (!panels.closeSettings()) return;
    if (redraw && (screen.note() || screen.freshPage())) render();
  }

  // Writing again, or opening the menus, closes settings.
  noteEl.addEventListener("mousedown", () => closeSettings({ redraw: false }), true);
  noteEl.addEventListener("mousedown", () => {
    if (shortcutsPanel.on && !shortcutsPanel.folded) prefs.saveShortcutsPanel({ folded: true });
  }, true);
  pillEl.addEventListener("click", () => closeSettings({ redraw: false }), true);
  newButtonEl.addEventListener("click", () => closeSettings({ redraw: false }), true);

  glacierButtonEl.addEventListener("click", () => {
    if (panels.isOpen()) closeSettings();
    else openSettings();
  });

  // Glacier's own card before the browser's prompt (ADR 0008): what drawing
  // on the page is for, and what it is never used for. Then settings open,
  // beside the sidebar or inside it.
  let panelsCardEl = null;

  function closePanelsCard() {
    if (!panelsCardEl) return;
    panelsCardEl.remove();
    panelsCardEl = null;
  }

  function showPanelsCard() {
    if (panelsCardEl) return;
    const sheet = document.createElement("aside");
    sheet.className = "panels-card";
    sheet.setAttribute("aria-label", "Where settings open");
    const card = document.createElement("div");
    card.className = "perm-card";

    const title = document.createElement("h1");
    title.className = "card-heading";
    title.textContent = "Open settings beside the sidebar";

    const why = document.createElement("p");
    why.textContent =
      "Settings can open next to the sidebar, over the edge of the page you're on. Your note keeps its full width and shows each change as you make it. For that, Glacier needs to draw on the pages you visit.";

    const never = document.createElement("p");
    never.className = "perm-never";
    never.textContent = "Glacier never reads, saves or sends anything from the pages you visit.";

    const next = document.createElement("p");
    next.className = "perm-next";
    next.textContent =
      "Your browser will ask to confirm, in its own words about your data on all websites. If you decline, settings open inside the sidebar. You can change this later in settings, under Panels.";

    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";
    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "card-button";
    allow.textContent = "Allow";
    allow.addEventListener("click", () => panels.answerCard(true));
    const notNow = document.createElement("button");
    notNow.type = "button";
    notNow.className = "perm-cancel";
    notNow.textContent = "Not now, open it inside";
    notNow.addEventListener("click", () => panels.answerCard(false));
    buttons.append(allow, notNow);

    card.append(title, why, never, next, buttons);
    sheet.append(card);
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
      }
    });
    glacierButtonEl.before(sheet);
    panelsCardEl = sheet;
    allow.focus();
  }

  // A frame beside the sidebar asks the sidebar that drew it. The answer is
  // wrapped in { value }, so the frame can tell "no sidebar" from "nothing".
  const besideCalls = {
    ping: () => true,
    closeSettings: () => closeSettings(),
    notice: repoActions.notice,
    status: repoActions.status,
    syncNow: repoActions.syncNow,
    courses: repoActions.courses,
    firstSync: (repo, token) =>
      repoActions.firstSync(repo, token, (progress) => {
        api.runtime.sendMessage({ glacier: "progress", channel: besideChannel, progress }).catch(() => {});
      }),
    exportCourse: repoActions.exportCourse,
    exportAll: repoActions.exportAll,
    restore: (text) => repoActions.restore(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))),
  };

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.glacier !== "beside" || message.channel !== besideChannel) return false;
    const call = besideCalls[message.call];
    if (!call) return false;
    Promise.resolve()
      .then(() => call(...(message.args ?? [])))
      .then(
        (value) => sendResponse({ value: value ?? null }),
        (error) => {
          console.error("Glacier: a panel beside the sidebar failed", error);
          sendResponse({ value: null });
        },
      );
    return true;
  });

  // A choice made beside the sidebar, or in another window, arrives here.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.look) {
      look = readLook(changes.look.newValue);
      drawLook();
    }
    if (changes.tabSettings) {
      tabSettings = readTabSettings(changes.tabSettings.newValue);
      updatePill();
    }
    if (changes.shortcutsPanel) {
      shortcutsPanel = readShortcutsPanel(changes.shortcutsPanel.newValue);
      shortcutsView.draw(shortcutsPanel);
    }
    if (changes.panelPlace) panels.setChoice(changes.panelPlace.newValue);
  });

  // The frames follow you to another tab, and come back after the page
  // loads again.
  panels.start();

  // Rename by clicking the title (#54): the title becomes a text field in
  // the pill. Enter or clicking away saves, Esc puts the old title back. A
  // refused title keeps the field open with a hint under the pill. The
  // Notebook does the renaming and rewrites the Links (#11).
  let titleEdit = null;

  function stopTitleEdit() {
    if (!titleEdit) return;
    const { input } = titleEdit;
    titleEdit = null;
    input.remove();
    pillTitleEl.hidden = false;
    renameHintEl.hidden = true;
    renameHintEl.replaceChildren();
  }

  function showRenameHint(input, result) {
    renameHintEl.replaceChildren();
    if (!result.suggestion) {
      renameHintEl.textContent = "Type a name for this note.";
    } else {
      renameHintEl.append("That name is taken. Use ");
      const use = document.createElement("button");
      use.type = "button";
      use.className = "rename-suggestion";
      use.textContent = result.suggestion;
      // Keep the focus in the field, or the click away would save first.
      use.addEventListener("mousedown", (event) => event.preventDefault());
      use.addEventListener("click", () => {
        input.value = result.suggestion;
        saveTitleEdit();
      });
      renameHintEl.append(use, "?");
    }
    renameHintEl.hidden = false;
  }

  function saveTitleEdit() {
    if (!titleEdit) return;
    const { input } = titleEdit;
    // On a fresh page a confirmed title makes the note (#61), and the caret
    // drops onto the first line of the paper.
    const freshPage = screen.freshPage();
    const view = freshPage ? screen.confirmTitle(input.value) : screen.rename(input.value);
    if (view.type === "titleRefused") return showRenameHint(input, view);
    draw(view);
    if (freshPage) render();
  }

  function startTitleEdit() {
    const note = screen.note();
    if (titleEdit || !(note || screen.freshPage())) return;
    closeMenu();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pill-title-input";
    input.value = note ? note.title : screen.freshPage().title;
    input.placeholder = "Title";
    input.setAttribute("aria-label", "Note title");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveTitleEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stopTitleEdit();
        if (screen.freshPage()) draw(screen.cancel());
        else if (screen.note()) render();
      }
    });
    // Clicking away from an empty title on a fresh page just leaves it unnamed.
    input.addEventListener("blur", () => {
      if (screen.freshPage() && !input.value.trim()) stopTitleEdit();
      else saveTitleEdit();
    });
    titleEdit = { input };
    pillTitleEl.hidden = true;
    pillTitleEl.after(input);
    input.focus();
    input.select();
  }

  pillTitleEl.addEventListener("click", startTitleEdit);
  pillTitleEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startTitleEdit();
    }
  });

  // The ▾ and any bare part of the pill open the menu; the title renames and
  // the sync dot does nothing.
  pillEl.addEventListener("click", (event) => {
    if (event.target.closest(".pill-title, .pill-title-input, .sync-dot, .pill-note-menu")) return;
    if (menuIsOpen()) dismissMenuPanel();
    else openMenu();
  });

  // Capture phase, so Ctrl+K reaches us before the page or the browser's own
  // use of it (Firefox focuses its search bar) once the sidebar has focus.
  document.addEventListener(
    "keydown",
    (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        openMenu();
      } else if (event.key === "Escape" && !newMenuEl.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeNewMenu();
      } else if (event.key === "Escape" && !noteMenuEl.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeNoteMenu();
      } else if (event.key === "Escape" && menuIsOpen()) {
        event.preventDefault();
        event.stopPropagation();
        dismissMenuPanel();
      }
    },
    true,
  );

  // Does a Link's target note already exist? A Link to a note that doesn't
  // (a Missing Link) renders red (#8).
  const linkExists = (title) => !notebook.isMissingLink(title);

  // Follow a `[[Title]]` Link: save any pending edits to the note we're leaving
  // first, then open the note the Link names in place. A Missing Link creates a
  // note with that title, without a page or Collection, and opens that (#8, #68).
  function openLink(title) {
    if (notebook.isMissingLink(title)) autoSync.changed();
    openNote(notebook.openLink(title));
  }

  // The text node and offset the browser puts the caret at for a point.
  function caretAtPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) return { node: pos.offsetNode, offset: pos.offset };
    }
    return null;
  }

  // The rendered-text offset of a click inside a rendered block, walking its
  // text nodes up to the caret the browser reports for the click point.
  function renderedOffsetAt(blockEl, x, y) {
    const at = caretAtPoint(x, y);
    if (!at) return 0;
    let offset = 0;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode === at.node) return offset + at.offset;
      offset += textNode.textContent.length;
      textNode = walker.nextNode();
    }
    return offset;
  }

  // Move the caret and redraw. The placement decision is the session's; this
  // only draws the result. Moving the caret is clicking elsewhere, so it
  // dismisses an open menu first; if that took out a `/` on its own line above
  // the target, the target shifts up by one line (#28).
  function moveTo(line, col) {
    const removed = editor.dismissMenu();
    if (removed !== -1 && removed < line) line -= 1;
    editor.moveTo(line, col);
    render();
  }

  // A click on the bare paper below the last line: the session adds empty lines
  // down to the ruled row that was clicked and puts the caret there (#35). Clicks
  // on a line itself are handled by that line, so only the paper itself counts.
  noteEl.addEventListener("mousedown", (event) => {
    if (event.target !== noteEl || !noteEl.lastElementChild) return;
    // On a fresh page a click only puts the caret on the first line: adding
    // lines down to the click would already make the note (#61).
    if (screen.freshPage()) {
      event.preventDefault();
      render();
      return;
    }
    if (!screen.note()) return;
    const below = event.clientY - noteEl.lastElementChild.getBoundingClientRect().bottom;
    if (below < 0) return;
    event.preventDefault();
    const rowHeight = parseFloat(getComputedStyle(noteEl).lineHeight);
    editor.dismissMenu();
    editor.clickPaper(Math.floor(below / rowHeight));
    render();
  });

  // The `/` command menu's list element while it is open, or null. All the menu
  // decisions — when it opens, what it shows, the highlight, picking, dismissing
  // and the + placement — live in the Editor session (#32); this element just
  // draws editor.menu, floating over the page near the current line.
  let menuEl = null;
  // The focused line's editing surface, kept so the menu can be positioned
  // against it after a re-render.
  let focusedEl = null;

  // Draw editor.menu (or remove the list when the session has closed it). The
  // menu floats just under the focused line, which keeps the caret, so
  // typing still filters and ↑/↓/Enter/Tab/Esc drive it.
  function drawMenu() {
    const state = editor.menu;
    if (!state || !focusedEl) {
      if (menuEl) {
        menuEl.remove();
        menuEl = null;
      }
      return;
    }
    if (!menuEl) {
      menuEl = document.createElement("ul");
      menuEl.className = "slash-menu";
      document.body.appendChild(menuEl);
    }
    menuEl.replaceChildren();
    state.commands.forEach((command, i) => {
      const item = document.createElement("li");
      item.className = i === state.selected ? "slash-item is-selected" : "slash-item";
      const label = document.createElement("span");
      label.className = "slash-label";
      label.textContent = command.label;
      // Each command shows the Markdown it inserts, so the syntax is learned by
      // using it (ADR 0006).
      const md = document.createElement("span");
      md.className = "slash-md";
      md.textContent = command.markdown ?? "";
      item.append(label, md);
      // Moving the mouse over a command selects it, so mouse and ↑/↓ share one
      // highlight. (mousemove, not hover: a menu that opens under a resting
      // pointer must not show a second highlight, which Firefox otherwise does.)
      item.addEventListener("mousemove", () => {
        if (!editor.menu || editor.menu.selected === i) return;
        editor.menuSelect(i);
        // A lightweight highlight move: don't rebuild the list (which would
        // reset its scroll and fight the resting pointer), just move the class.
        menuEl.querySelector(".is-selected")?.classList.remove("is-selected");
        item.classList.add("is-selected");
      });
      // mousedown (not click) keeps the caret in the line as we apply.
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        editor.menuSelect(i);
        editor.pickMenu();
        render();
      });
      menuEl.appendChild(item);
    });
    const rect = focusedEl.getBoundingClientRect();
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.top = `${rect.bottom}px`;
    // Keep the highlighted command in view when ↑/↓ move past the visible part
    // of the list. Scrolling only the menu itself never moves the page.
    const item = menuEl.children[state.selected];
    if (item) {
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      if (top < menuEl.scrollTop) menuEl.scrollTop = top;
      else if (bottom > menuEl.scrollTop + menuEl.clientHeight) {
        menuEl.scrollTop = bottom - menuEl.clientHeight;
      }
    }
  }

  // Dismiss the menu without picking (the session removes an untouched + `/`),
  // then redraw so the removal shows. Used by the terminal dismissals: Esc,
  // clicking outside the line, and scrolling away from the menu (#28).
  function dismissAndRedraw() {
    if (redrawing || !editor.menu) return;
    editor.dismissMenu();
    render();
  }

  // A floating menu would drift away from its line, so scrolling closes it.
  // Scrolling *inside* the menu (mouse wheel, or keeping the highlight in view)
  // is just browsing the list, so only scrolling anything else closes it.
  window.addEventListener(
    "scroll",
    (event) => {
      if (menuEl && menuEl.contains(event.target)) return;
      dismissAndRedraw();
    },
    true,
  );

  // A rendered block reacts to a plain click, not to the press, so a press
  // that drags selects across lines instead (#7). While the `/` menu is open
  // the press still acts at once and keeps the caret in its line: letting the
  // line lose focus would dismiss the menu and redraw the note mid-click.
  function onPlainClick(el, act) {
    el.addEventListener("mousedown", (event) => {
      if (!editor.menu) return;
      event.preventDefault();
      act(event);
    });
    el.addEventListener("click", (event) => {
      if (window.getSelection().isCollapsed) act(event);
    });
  }

  // Build one rendered (non-focused) block.
  function renderedBlock(range) {
    const blockLines = editor.lines.slice(range.start, range.end);
    const el = document.createElement("div");
    el.className = "block";
    el.dataset.start = range.start;

    if (isFence(blockLines[0])) {
      // A code block: show the code, fences hidden. Clicking drops the caret in
      // just after the opening fence so the raw block opens for editing.
      const closed =
        blockLines.length > 1 && isFence(blockLines[blockLines.length - 1]);
      const inner = blockLines.slice(1, closed ? -1 : undefined);
      const pre = document.createElement("pre");
      pre.className = "md-code";
      const code = document.createElement("span");
      code.textContent = inner.join("\n");
      pre.appendChild(code);
      el.appendChild(pre);
      el.dataset.code = "";
      onPlainClick(el, () => moveTo(range.start, blockLines[0].length));
      return el;
    }

    const line = blockLines[0];
    el.innerHTML = renderLineHtml(line, linkExists);
    onPlainClick(el, (event) => {
      // The sidebar finds which drawn character the click landed on; the Editor
      // session decides what it means from the one shared line description (#33).
      const rendered = renderedOffsetAt(el, event.clientX, event.clientY);
      const hit = editor.clickLine(range.start, rendered);
      // A plain click on a Link follows it instead of dropping the caret: it
      // opens the linked note, or creates and opens a note for a Missing Link
      // (#8).
      if (hit.type === "link") {
        openLink(hit.title);
        return;
      }
      moveTo(hit.line, hit.col);
    });
    return el;
  }

  // The text offset of (node, nodeOffset) inside `root`: the length of all the
  // text before it. A `<br>` the browser leaves behind counts as nothing, so
  // this is always an offset into the raw Markdown.
  function textOffset(root, node, nodeOffset) {
    if (!root.contains(node)) return root.textContent.length;
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, nodeOffset);
    return range.toString().length;
  }

  // The selection inside the focused line as raw offsets { start, end }.
  function selectionIn(root) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
    const range = selection.getRangeAt(0);
    return {
      start: textOffset(root, range.startContainer, range.startOffset),
      end: textOffset(root, range.endContainer, range.endOffset),
    };
  }

  // The text node and offset for a raw offset inside the focused line. At the
  // edge between two spans it is in the later one, so text typed right after
  // `## ` lands in the heading text, not in the faded mark.
  function pointAt(root, offset) {
    let point = { node: root, offset: 0 };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent.length;
      if (remaining < length) return { node, offset: remaining };
      // Past every character so far: the end of this node, unless a later
      // node takes it.
      point = { node, offset: length };
      remaining -= length;
    }
    return point;
  }

  // Select the raw offsets [start, end] inside the focused line; with start
  // equal to end this places the caret.
  function placeSelection(root, start, end) {
    const range = document.createRange();
    const from = pointAt(root, start);
    range.setStart(from.node, from.offset);
    if (end !== start) {
      const to = pointAt(root, end);
      range.setEnd(to.node, to.offset);
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaret(root, offset) {
    placeSelection(root, offset, offset);
  }

  // One part of the focused line: a faded mark, or text in its inline style
  // (#38) — bold, italic, code, a Link or a web link.
  function styledPart(part) {
    let node = document.createElement(part.code ? "code" : "span");
    if (part.type === "mark") node.className = "md-mark";
    if (part.link) node.className = "md-link";
    if (part.url) node.className = "md-url";
    node.textContent = part.text;
    if (part.italic) {
      const em = document.createElement("em");
      em.appendChild(node);
      node = em;
    }
    if (part.bold) {
      const strong = document.createElement("strong");
      strong.appendChild(node);
      node = strong;
    }
    return node;
  }

  // One line of the focused block as styled spans, its marks faded (#37). The
  // parts join back to the raw line, so the element's text stays the Markdown.
  function styledLine(line) {
    const spans = focusedLineSpans(line);
    const wrap = document.createElement("span");
    wrap.className =
      spans.kind === "heading" ? `md-h md-h${spans.level}` : `md-${spans.kind}`;
    for (const part of spans.parts) wrap.appendChild(styledPart(part));
    return wrap;
  }

  // Re-draw the focused block's spans from its raw lines. In a code block only
  // the fences are read as Markdown; the lines between them are code. Lines are
  // joined by real "\n" characters (shown by `white-space: pre-wrap`).
  function drawFocused(el, blockLines) {
    const isCode = isFence(blockLines[0]);
    el.replaceChildren();
    blockLines.forEach((line, i) => {
      if (i > 0) el.appendChild(document.createTextNode("\n"));
      const fenceLine = i === 0 || (i === blockLines.length - 1 && isFence(line));
      if (isCode && !fenceLine) {
        if (line !== "") {
          const code = document.createElement("span");
          code.textContent = line;
          el.appendChild(code);
        }
      } else {
        el.appendChild(styledLine(line));
      }
    });
    // A trailing empty line only shows (and takes the caret) with a <br>.
    if (blockLines.length > 1 && blockLines[blockLines.length - 1] === "") {
      el.appendChild(document.createElement("br"));
    }
    // The empty-line hint reminds beginners the menu exists (#6).
    el.classList.toggle("is-empty", el.textContent === "");
  }

  // Build the focused block as a styled, plain-text editing surface and wire
  // its keys (#37, ADR 0006). It is re-drawn after each edit, and its text is
  // always exactly the raw Markdown, so its caret offsets are raw offsets.
  function focusedBlock(range) {
    const start = range.start;
    const isCode = isFence(editor.lines[start]);
    const el = document.createElement("div");
    el.className = isCode ? "md-edit md-code" : "md-edit";
    el.contentEditable = "true";
    el.setAttribute("role", "textbox");
    el.dataset.placeholder = lineHint();
    drawFocused(el, editor.lines.slice(start, range.end));

    // Hand the new text and caret to the session, which splices the block and
    // reports the change to save (#31), then re-draw this line's spans. It
    // tells us when a multi-line paste must reflow into real blocks; typing
    // inside a code block never does. While an input method is composing, the
    // spans are left alone (re-drawing would break the composition).
    const applyEdit = (value, caret, composing = false, paste = false) => {
      const { reflow } = editor.edit(value, caret, { paste });
      if (reflow) {
        // A re-render while the menu is open is a dismissal, so an untouched
        // + `/` goes with it rather than being saved (#28).
        editor.dismissMenu();
        render();
        return;
      }
      if (!composing) {
        drawFocused(el, editor.lines.slice(start, start + editor.state.blockCount));
        placeCaret(el, caret);
      }
      // Open, refilter or close the `/` command menu for the new caret (#32).
      // The session knows not to open inside a code block, where `/` is code.
      editor.refreshMenu();
      drawMenu();
    };

    // Insert plain text over the selection (paste, drop, a line break), so no
    // HTML or formatting from the clipboard ever gets into the note.
    const insertPlain = (text, from, to, paste = false) => {
      const clean = editorTextToBody(text);
      const value = el.textContent;
      applyEdit(
        value.slice(0, from) + clean + value.slice(to),
        from + clean.length,
        false,
        paste,
      );
    };

    el.addEventListener("input", (event) => {
      dismissWelcome();
      applyEdit(el.textContent, selectionIn(el).start, event.isComposing);
    });
    el.addEventListener("compositionend", () => {
      applyEdit(el.textContent, selectionIn(el).start);
    });

    // The browser's own rich-text edits are replaced by plain ones: a line
    // break becomes a "\n" in the text (Enter in a code block, Shift+Enter),
    // and the browser's own rich-text formatting never applies (Ctrl+B and
    // friends write Markdown marks instead, in the keydown handler, #44).
    el.addEventListener("beforeinput", (event) => {
      if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
        event.preventDefault();
        const { start: from, end: to } = selectionIn(el);
        insertPlain("\n", from, to);
      } else if (
        event.inputType.startsWith("format") ||
        event.inputType.startsWith("history")
      ) {
        event.preventDefault();
      }
    });

    el.addEventListener("paste", (event) => {
      event.preventDefault();
      const { start: from, end: to } = selectionIn(el);
      insertPlain(event.clipboardData.getData("text/plain"), from, to, true);
    });

    // A drop lands where it was dropped, as plain text.
    el.addEventListener("drop", (event) => {
      event.preventDefault();
      const text = event.dataTransfer.getData("text/plain");
      if (!text) return;
      const at = caretAtPoint(event.clientX, event.clientY);
      const offset = at ? textOffset(el, at.node, at.offset) : el.textContent.length;
      insertPlain(text, offset, offset, true);
    });

    // The caret can move without typing (arrow keys, Home/End, a click): the
    // session keeps an open menu in step with it, or closes it when the caret
    // leaves the `/` command.
    const followCaret = () => {
      editor.followMenu(el.textContent, selectionIn(el).start);
      drawMenu();
    };
    el.addEventListener("keyup", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) followCaret();
    });
    el.addEventListener("mouseup", followCaret);
    // Clicking somewhere else dismisses the menu (picking an item uses
    // mousedown with preventDefault, so it never blurs the line).
    el.addEventListener("blur", () => dismissAndRedraw());

    el.addEventListener("keydown", (event) => {
      // Undo and redo are the session's own (#42): the browser's would scramble
      // the styled spans.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        const isUndo = key === "z" && !event.shiftKey;
        const isRedo = (key === "z" && event.shiftKey) || key === "y";
        if (isUndo || isRedo) {
          event.preventDefault();
          if (isUndo ? editor.undo() : editor.redo()) render();
          return;
        }
        // Ctrl+A selects the line, and a second Ctrl+A the whole note (#7).
        if (key === "a" && !event.shiftKey) {
          event.preventDefault();
          const { start: from, end: to } = selectionIn(el);
          const selected = editor.selectAll(el.textContent, from, to);
          if (selected.type === "note") selectWholeNote();
          else placeSelection(el, selected.start, selected.end);
          return;
        }
        // Ctrl+B / Ctrl+I / Ctrl+E format the selection (#44). The key is
        // always caught, so the browser's own action never fires (Firefox's
        // bookmarks sidebar, the search bar).
        const kind = FORMAT_KEYS[key];
        if (kind && !event.shiftKey) {
          event.preventDefault();
          if (editor.menu || event.isComposing) return;
          const { start: from, end: to } = selectionIn(el);
          const selected = editor.format(kind, el.textContent, from, to);
          if (!selected) return;
          render();
          placeSelection(focusedEl, selected.start, selected.end);
          return;
        }
      }
      const value = el.textContent;
      const selection = selectionIn(el);
      // While the menu is open the session owns ↑/↓/Enter/Tab/Esc (#32); it
      // tells us what it did so we can redraw the menu or re-render the note.
      const action = editor.menuKey(event.key, {
        value,
        caret: selection.start,
        isComposing: event.isComposing,
      });
      if (action === "nav") {
        event.preventDefault();
        drawMenu();
        return;
      }
      if (action === "pick" || action === "dismiss") {
        event.preventDefault();
        render();
        return;
      }
      // Not a menu key: the session may have closed the menu (the caret left the
      // `/` command), so keep the drawn list in step before the editor keys run.
      if (!editor.menu) drawMenu();

      // Each editing key forwards the line's caret to the session, which
      // decides what the edit does and where the caret lands (#31).
      if (event.key === "Enter" && !isCode && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        editor.enter(value, selection.start, selection.end);
        render();
        return;
      }

      if (event.key === "Enter" && !isCode && event.shiftKey && !event.isComposing) {
        if (editor.lineBreak(value, selection.start, selection.end)) {
          event.preventDefault();
          render();
          return;
        }
      }

      if (
        event.key === "Backspace" &&
        selection.start === selection.end &&
        (selection.start === 0
          ? start > 0 || lineMarkLength(value) > 0
          : selection.start === lineMarkLength(value.split("\n")[0]))
      ) {
        event.preventDefault();
        editor.setFocus(start, selection.start);
        editor.backspaceAtStart();
        render();
        return;
      }

      if (
        event.key === "Delete" &&
        selection.start === value.length &&
        selection.start === selection.end
      ) {
        const lastLine = start + value.split("\n").length - 1;
        editor.setFocus(lastLine, value.length - value.lastIndexOf("\n") - 1);
        if (editor.deleteAtEnd()) {
          event.preventDefault();
          render();
          return;
        }
      }

      if (event.key === "ArrowUp") {
        if (editor.moveUp(value, selection.start)) {
          event.preventDefault();
          render();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        if (editor.moveDown(value, selection.start)) {
          event.preventDefault();
          render();
        }
      }
    });

    return { el, start };
  }

  // --- Selecting and copying as Markdown (#7) -------------------------------

  // Is a note drawn in the page (rather than a form or a card)?
  const noteShown = () => noteEl.querySelector(".line-row") !== null;

  // Select the whole note, and only the note, not the rest of the panel. The
  // line being edited lets go of the focus, so typing can't edit a selection
  // that reaches outside it.
  function selectWholeNote() {
    dismissAndRedraw();
    focusedEl?.blur();
    const range = document.createRange();
    range.selectNodeContents(noteEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Ctrl+A anywhere else in the panel (after the whole note is selected, the
  // focus is on the page) keeps selecting the note, never the whole panel.
  document.addEventListener("keydown", (event) => {
    const isSelectAll =
      (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey &&
      event.key.toLowerCase() === "a";
    if (!isSelectAll || event.defaultPrevented || !noteShown()) return;
    if (event.target.closest?.("input, textarea, [contenteditable='true']")) return;
    event.preventDefault();
    selectWholeNote();
  });

  // One edge of the page's selection, as the Editor session reads it: a raw
  // line and column in the line being edited, a drawn offset in a drawn line,
  // or an offset in the code of a drawn code block. An edge between two blocks
  // is the start of the later one, or the end of the last.
  function selectionEdge(node, offset) {
    if (node === noteEl) {
      const blocks = noteEl.children;
      if (offset < blocks.length) return selectionEdge(blocks[offset], 0);
      const last = noteEl.lastElementChild;
      return selectionEdge(last, last.childNodes.length);
    }
    let blockEl = node;
    while (blockEl.parentNode !== noteEl) blockEl = blockEl.parentNode;
    const drawn = textOffset(blockEl, node, offset);
    if (blockEl.dataset.start === undefined) {
      // The row of the line being edited: its + button comes before the line.
      const plus = blockEl.querySelector(".line-plus").textContent.length;
      const raw = Math.max(0, drawn - plus);
      return editor.lineColFromOffset(focusedEl.textContent, raw);
    }
    const start = Number(blockEl.dataset.start);
    if (blockEl.dataset.code !== undefined) return { code: start, offset: drawn };
    return { line: start, rendered: drawn };
  }

  const copiedEl = document.querySelector(".copied");
  let copiedTimer = null;

  // A short confirmation of how many lines were copied, that fades on its own.
  function showCopied(count) {
    showNotice(copiedMessage(count), 1500);
  }

  // A short message in the bottom corner, gone after a moment.
  // With `action` ({ label, run }) the notice has a button, like Undo.
  function showNotice(text, ms = 4000, action = null) {
    copiedEl.textContent = text;
    copiedEl.classList.toggle("has-action", Boolean(action));
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "notice-action";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        copiedEl.hidden = true;
        action.run();
      });
      copiedEl.append(" ", button);
    }
    copiedEl.hidden = false;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copiedEl.hidden = true), ms);
  }

  // Copying a selection in the note puts its Markdown on the clipboard, so it
  // pastes back into a note or Obsidian intact.
  document.addEventListener("copy", (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!noteShown() || !noteEl.contains(range.commonAncestorContainer)) return;
    const copied = editor.copy(
      selectionEdge(range.startContainer, range.startOffset),
      selectionEdge(range.endContainer, range.endOffset),
    );
    event.preventDefault();
    event.clipboardData.setData("text/plain", copied.text);
    showCopied(copied.count);
  });

  // Rebuild the page from the current lines, with the focused block as the
  // styled editing surface and every other block rendered. The caret is
  // restored afterwards.
  // Taking the old focused line out of the page fires its blur, which would
  // dismiss a menu the + has just opened (the real click is lost, #88).
  let redrawing = false;
  function render() {
    redrawing = true;
    noteEl.replaceChildren();
    redrawing = false;
    focusedEl = null;
    // Keep the session's focused-block span in step with the caret before we
    // read it back to place the caret (#31).
    editor.relayout();
    const { lines, focus } = editor.state;
    const ranges = blockRanges(lines);
    let focused = null;
    // A new note's title follows its first line until the caret leaves it (#80).
    if (focus.line > 0) screen.leaveFirstLine();

    for (const range of ranges) {
      if (focus.line >= range.start && focus.line < range.end) {
        const built = focusedBlock(range);
        // The + button opens the command menu from the left of the current
        // line; the session drops the `/` and opens the menu (#32).
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "line-plus";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Open the command menu");
        // On a fresh page the + would already make the note, so it waits.
        plus.hidden = Boolean(screen.freshPage());
        plus.addEventListener("mousedown", (event) => {
          event.preventDefault();
          editor.openMenuFromPlus(built.start);
          render();
        });
        const row = document.createElement("div");
        row.className = "line-row";
        row.append(plus, built.el);
        noteEl.appendChild(row);
        focused = built.el;
      } else {
        noteEl.appendChild(renderedBlock(range));
      }
    }

    fitRows();
    // With settings open the focus stays in them; closing puts it back here.
    if (focused) {
      focusedEl = focused;
      if (!panels.settingsOpen()) {
        focused.focus();
        placeCaret(focused, editor.caretOffset());
      }
    }

    // Draw the `/` menu against the fresh line (the + button opens it just
    // before a render), or remove it when the session has closed it (#32).
    drawMenu();
  }

  // --- Opening the page's note, and the way out of an empty panel (#3) -------
  //
  // Seeing which page you're on needs the `tabs` permission, declared optional
  // and asked for only on the first "New note for this page" click, behind
  // Glacier's own explanation card (ADR 0008). Without it Glacier still works:
  // a note is made on a fresh page, with no Source.

  const browserPage = createBrowserPage(api);
  const openingFlow = createOpeningFlow({
    page: browserPage,
    getOpenNote: () => screen.onScreen(),
    noteForPage: (url) => notebook.noteForPage(url),
    getLastNote: () => notebook.recentNotes(1)[0] ?? null,
    show: (view) => draw(screen.show(view)),
    getTabSettings: () => tabSettings,
  });

  // --- A fresh page for a new note (#61) -------------------------------------
  //
  // No create form: a new note is an empty page you write on at once. The
  // Screen makes the note at the first character or when the title in the
  // pill is confirmed; until then a click or leaving makes nothing.

  // The quiet line on an empty line: on a fresh page it says where the note
  // starts, with the page's own line when it is for a website.
  function lineHint() {
    const freshPage = screen.freshPage();
    if (!freshPage) return EMPTY_LINE_HINT;
    return freshPage.source ? PAGE_DRAFT_HINT : DRAFT_HINT;
  }

  // Esc on the paper of a fresh page: back to the note from before, and
  // nothing is made. The title field, menus and cards handle their own Esc.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || !screen.freshPage() || titleEdit) return;
    event.preventDefault();
    draw(screen.cancel());
  });

  // The starting panel when no note is open and the permission hasn't been
  // granted yet: one handwritten line and a quiet "+ New note for this page",
  // so there's always a way in (#3). Clicking it either proceeds (already allowed) or
  // shows the card.
  function showStartPrompt() {
    updatePill();
    updateNoteMeta();
    noteEl.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "start-prompt";

    const line = document.createElement("p");
    line.textContent = "No note for this page yet.";
    wrap.appendChild(line);

    const create = document.createElement("button");
    create.type = "button";
    create.className = "start-link";
    create.textContent = "+ New note for this page";
    create.title = PAGE_NOTE_HINT;
    create.addEventListener("click", () => openingFlow.newNoteForPage());
    wrap.appendChild(create);

    noteEl.appendChild(wrap);
  }

  // Glacier's own explanation before the browser's prompt (ADR 0008): what the
  // permission is for and what it is never used for. The browser's prompt only
  // appears after Allow, straight from that click.
  function showPermissionCard() {
    noteEl.replaceChildren();

    const card = document.createElement("div");
    card.className = "perm-card";

    const title = document.createElement("h1");
    title.className = "card-heading";
    title.textContent = "Let Glacier see the page you're on";
    card.appendChild(title);

    const why = document.createElement("p");
    why.textContent =
      "So your notes open with the page, and “New note for this page” can use the page's title and address.";
    card.appendChild(why);

    const never = document.createElement("p");
    never.className = "perm-never";
    never.textContent =
      "Glacier never reads, saves or sends anything from the pages you visit.";
    card.appendChild(never);

    const next = document.createElement("p");
    next.className = "perm-next";
    next.textContent =
      "Your browser will ask to confirm. If you decline, you can still make notes by hand.";
    card.appendChild(next);

    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";

    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "card-button";
    allow.textContent = "Allow";
    allow.addEventListener("click", () => openingFlow.allow());

    const notNow = document.createElement("button");
    notNow.type = "button";
    notNow.className = "perm-cancel";
    notNow.textContent = "Not now, new note by hand";
    notNow.addEventListener("click", () => openingFlow.decline());

    buttons.append(allow, notNow);
    card.appendChild(buttons);
    noteEl.appendChild(card);
  }

  // The welcome (#85, #90): a pixel-art scene, the greeting, three lines with
  // their pictures, one soft button and a tip, each on its own ruled row.
  // Start writing hides it for good (kept in this browser's storage, not
  // synced) and puts the caret on the paper, back in the open note when it
  // was shown again from the Shortcuts panel (#91). Esc does the same.
  const welcomeEl = document.querySelector(".welcome");
  function drawWelcome({ again = false } = {}) {
    if (!showWelcome) return;
    const scene = document.createElement("div");
    scene.className = "welcome-scene";
    const greeting = Object.assign(document.createElement("h1"), { className: "welcome-greeting", textContent: WELCOME_GREETING });
    const lines = WELCOME_LINES.map(({ icon, text }) => {
      const line = document.createElement("p");
      const picture = Object.assign(document.createElement("img"), { className: "welcome-icon", src: `../art/icon-${icon}.svg`, alt: "" });
      line.append(picture, text);
      return line;
    });
    const start = document.createElement("button");
    start.type = "button";
    start.className = "welcome-start";
    start.textContent = "Start writing";
    start.addEventListener("click", () => {
      dismissWelcome();
      if (!screen.note() && !screen.freshPage()) draw(screen.startFreshPage({}));
      else focusedEl?.focus();
    });
    const startRow = Object.assign(document.createElement("p"), { className: "welcome-start-row" });
    startRow.appendChild(start);
    const tip = Object.assign(document.createElement("p"), { className: "welcome-tip", textContent: WELCOME_TIP });
    welcomeEl.replaceChildren(scene, greeting, ...lines, startRow, tip);
    welcomeEl.hidden = false;
    if (again) welcomeEl.scrollIntoView({ block: "start" });
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || welcomeEl.hidden) return;
    event.preventDefault();
    welcomeEl.querySelector(".welcome-start")?.click();
  });
  drawWelcome();

  openingFlow.listen();
  openingFlow.start();
  autoSync.syncNow();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      screen.flush();
      autoSync.flush();
    } else autoSync.syncNow();
  });
  window.addEventListener("pagehide", () => {
    screen.flush();
    autoSync.flush();
  });
  window.addEventListener("online", () => autoSync.syncNow());

  keepBackgroundInformed(screen);
}

// Chrome: tells the background this window's panel is open, so the shortcut
// knows to close it (it is closed when this connection drops). The background
// can ask the panel to close itself. Reconnects if the service worker
// restarted. Firefox toggles its sidebar without this.
async function keepBackgroundInformed(screen) {
  if (!api.sidePanel || !api.windows) return;
  try {
    const { id: windowId } = await api.windows.getCurrent();
    const connect = () => {
      const port = api.runtime.connect({ name: `glacier-panel:${windowId}` });
      port.onMessage.addListener((message) => {
        if (message && message.type === "close") {
          screen.flush();
          window.close();
        }
      });
      port.onDisconnect.addListener(() => setTimeout(connect, 500));
    };
    connect();
  } catch (error) {
    console.warn("Glacier: could not connect to the background", error);
  }
}

start();
