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

import { createNotebook, importSummary } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { createGoogleSignIn } from "./google-sign-in.js";
import { createNotesHomes } from "./notes-homes.js";
import { createFolderAccess } from "./folder-access.js";
import { notesHomeName, syncErrorMessage } from "../src/notes-home.mjs";
import { reminderDue, reminderOpened, reminderNotNow, reminderText } from "../src/cloud-reminder.mjs";
import { createAutoSync, needsFolderOk } from "../src/auto-sync.mjs";
import { createScreen } from "../src/screen.mjs";
import { pageNoteCount, pillTitle, BACK_BUTTON_HINT, pinButton, secretMark } from "../src/menu-contents.mjs";
import { createOpeningFlow } from "../src/opening-flow.mjs";
import { createBrowserPage } from "../src/browser-page.mjs";
import { createEditorSession } from "../src/editor-session.mjs";
import { readTabSettings } from "../src/tab-settings.mjs";
import { readShortcutsPanel } from "../src/shortcuts-panel.mjs";
import { isShortcut } from "../src/keys.mjs";
import { createContents } from "./contents-view.js";
import { createTitleEdit } from "./title-edit.js";
import { createFind } from "./find-view.js";
import { createPaper } from "./paper-view.js";
import { readLook, lookStyle, wholeRows, applyLook } from "../src/look.mjs";
import { readPanelPlace, createPanelPlacement } from "../src/panel-place.mjs";
import { createBrowserPanels } from "../src/browser-panels.mjs";
import { createSettingsView, createShortcutsView, fixLink } from "./settings-view.js";
import { createMenuView } from "./menu-view.js";
import { createDownloads } from "./downloads.js";
import { createSyncBoxView } from "./sync-box-view.js";
import { createBackBox, createNewMenu, createNoteMenu } from "./pill-menus.js";
import { createNoteMetaView } from "./note-meta-view.js";
import { createSketchView } from "./sketch-view.js";
import { createSecrets } from "./secret-view.js";
import { pageCard, panelsCard, startPrompt } from "./cards.js";
import { shortcutNotice } from "../src/shortcuts-panel.mjs";
import { WELCOME_GREETING, WELCOME_LINES, WELCOME_TIP, welcomeShown, saveErrorText } from "../src/guidance.mjs";
import { drawBesideFrames } from "./beside-frames.js";

// The empty-line hint and the menu that `/` and the + button open (#6). The
// command logic (which commands, filtering, applying one) is tested in the
// editor model; this file only draws the menu and wires its keys.
const EMPTY_LINE_HINT = "Type / for commands, or click + on the left";

// The one quiet line on a fresh page (#61), where the note starts as you type.
const PAGE_DRAFT_HINT = "No note for this page yet. Just start writing.";
const DRAFT_HINT = "Just start writing.";

// How many ruled rows high a new sketch starts (#101).
const NEW_SKETCH_ROWS = 5;

const noteEl = document.querySelector(".note");
const saveErrorEl = document.querySelector(".save-error");
const pillEl = document.querySelector(".pill");
const pillTitleEl = document.querySelector(".pill-title");
const pillArchivedEl = document.querySelector(".pill-archived");
const pillLockEl = document.querySelector(".pill-lock");
const pillPinEl = document.querySelector(".pill-pin");
const pillCountEl = document.querySelector(".pill-count");
const pillMenuEl = document.querySelector(".pill-menu");
const syncDotEl = document.querySelector(".sync-dot");
const renameHintEl = document.querySelector(".rename-hint");
const backlinksButtonEl = document.querySelector(".backlinks-button");
const backlinksListEl = document.querySelector(".backlinks-list");
const backEl = document.querySelector(".pill-back");
const newButtonEl = document.querySelector(".pill-new");
const menuPanelEl = document.querySelector(".menu");
const glacierButtonEl = document.querySelector(".glacier-button");

// This browser's own extension storage: the Notes Repo connection and the
// chosen look. Neither is ever written into the Notebook (ADR 0003).
const api = typeof browser !== "undefined" ? browser : chrome;
const extensionStorage = api.storage.local;
// Signing in with Google for the Google Drive Notes Home (#95).
const googleSignIn = createGoogleSignIn({ api, storage: extensionStorage });
// The picked folder for the folder Notes Home (#97).
const folderAccess = createFolderAccess();

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
// ruled line, so the text after it is still on the lines (#18). The paper
// passes only the blocks it has just drawn (#120); otherwise every block.
function fitRows(blocks = noteEl ? [...noteEl.children] : []) {
  if (!noteEl || !noteEl.querySelector(".block, .line-row, .md-code")) return;
  for (const block of blocks) block.style.minHeight = "";
  const heights = blocks.map((block) => block.getBoundingClientRect().height);
  blocks.forEach((block, i) => {
    const padded = wholeRows(heights[i], lookDrawn.lineHeight);
    if (padded > heights[i] + 0.5) block.style.minHeight = `${padded}px`;
  });
}

// A write to this browser's copy failed (aborted or threw). Tell the user so
// they don't trust a save that didn't happen (issue #25); their text is still
// on screen, and Copy note in the banner copies it out (#117). Sync is the
// cross-browser backup.
function reportSaveError(error) {
  console.error("Glacier: could not save", error);
  if (saveErrorEl) {
    saveErrorEl.querySelector(".save-error-text").textContent = saveErrorText(error);
    saveErrorEl.querySelector(".save-error-copied").hidden = true;
    saveErrorEl.hidden = false;
  }
}

// A later save worked, so the warning goes again (#117).
function clearSaveError() {
  if (saveErrorEl) saveErrorEl.hidden = true;
}

// How notes follow tabs (#53), kept per browser like the look.
let tabSettings = readTabSettings(undefined);

// The Shortcuts panel (#20): switched on in settings, open or folded until
// you change it.
let shortcutsPanel = readShortcutsPanel(undefined);

// Where settings and the Shortcuts panel open (#21), as saved: "ask" until
// the explanation card has been answered. The Panel placement keeps it after.
let savedPanelPlace = readPanelPlace(undefined);

// Whether the welcome (#85) was still to be shown when the sidebar started.
// From then on the Screen knows (#89, #91).
let showWelcome = false;

// Take the welcome off the paper once the Screen says it went.
function clearWelcome() {
  const welcomeEl = document.querySelector(".welcome");
  if (welcomeEl.hidden) return;
  welcomeEl.hidden = true;
  welcomeEl.replaceChildren();
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
  document.fonts?.addEventListener("loadingdone", () => fitRows());

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
    notebook = createNotebook({ storage, onSaveError: reportSaveError });
  } catch (error) {
    // Without storage there is nowhere to save, so the page stays read-only
    // rather than inviting text that can't be kept.
    console.error("Glacier: could not open storage", error);
    return;
  }

  // Where the notes live and how each place connects (sidebar/notes-homes.js).
  const notesHomes = createNotesHomes({ notebook, extensionStorage, googleSignIn, folderAccess });

  // What's on screen (the note, the fresh page of #61, the note before it,
  // the ← history and saving) is the Screen's (#65). Nothing is open until the
  // page's note is found or a note is made (the Opening flow, below);
  // while nothing is open the panel shows a way to make a note rather than a
  // blank, locked page (#3). Each action returns what to draw next.
  const screen = createScreen({
    notebook,
    onSaveError: reportSaveError,
    onSaved: clearSaveError,
    // Leaving a note with the menu open is a dismissal, so an untouched + `/`
    // is taken back out before the note we're leaving is saved (#28).
    beforeLeave: () => editor.dismissMenu(),
    welcomeSeen: !showWelcome,
    onWelcomeSeen: () =>
      extensionStorage.set({ welcomeSeen: true }).catch((error) => {
        console.warn("Glacier: could not remember the welcome", error);
      }),
  });

  // The editing decisions — the note's lines and caret, typing, Enter,
  // Backspace, ↑/↓, paste, the `/` command menu with the + button and the
  // cursor maths — live behind this front door (#31, #32, ADR 0002). This file
  // only forwards what happened and draws editor.state and editor.menu; a text
  // change is forwarded to the Screen, which owns saving the open note.
  // Sync with the Notes Home runs by itself (#15): a pull when the sidebar
  // opens and a push a few seconds after typing stops. When to sync is
  // auto-sync's; this connects it to the place chosen (#94) and draws the
  // status.
  const autoSync = createAutoSync({
    notebook,
    connect: () => notesHomes.connect(),
    beforeSync: () => screen.flush(),
    onStatus: drawSyncStatus,
    onPulled: (titles) => {
      menuView.close();
      draw(screen.pulled(titles));
    },
  });
  const editor = createEditorSession({
    onChange: (body) => {
      draw(screen.edit(body));
      autoSync.changed();
      secrets.keepUnlocked();
    },
    titles: () => notebook.notes().map((note) => note.title),
    extractNote: (text) => screen.extract(text),
    newSketch,
    pagesOn: () => look.pages,
  });

  // Sketch blocks (#101): the drawing area for an embed line, drawn by
  // sidebar/sketch-view.js. A drawing is saved into the note at once, and
  // sync sends its svg file.
  const sketchView = createSketchView({
    notebook,
    rowHeight: () => lookDrawn.lineHeight,
    onSaved: () => autoSync.changed(),
  });

  // The paper (sidebar/paper-view.js): the open note drawn, its line being
  // edited, selecting and copying, and notes as pages.
  const paper = createPaper({
    noteEl,
    editor,
    screen,
    notebook,
    sketchView,
    pagesOn: () => look.pages,
    settingsOpen: () => panels.settingsOpen(),
    showIfLocked: () => secrets.showIfLocked(),
    openLink,
    hint: lineHint,
    onEdited: () => contents.update(),
    onTyped: () => {
      if (!screen.welcome()) clearWelcome();
    },
    showNotice,
    fitRows,
    afterDraw: (locked) => {
      contents.update();
      if (!locked) findInNote.refresh();
    },
  });

  // The Sketch command in the + and / menu: a new, empty sketch as wide as
  // the text and a few rows high. The title stops following the first line,
  // so the new embed line keeps naming this note.
  function newSketch() {
    const note = screen.note();
    if (!note) return null;
    screen.leaveFirstLine();
    const width = Math.round((paper.focusedEl() ?? noteEl).clientWidth);
    return notebook.addSketch(note.title, { width, height: NEW_SKETCH_ROWS * lookDrawn.lineHeight })?.line ?? null;
  }

  const downloads = createDownloads({
    notebook,
    screen,
    notice: showNotice,
    unlockFirst: (title) => (notebook.isLocked(title) ? secrets.askPasscode("Type your Glacier passcode to print or download it") : Promise.resolve(true)),
  });

  // The ▾ menu (#12), drawn by sidebar/menu-view.js, and the actions on notes,
  // Collections and Page groups that its hover icons and ⋯ share.
  const menuView = createMenuView({
    notebook,
    screen,
    el: menuPanelEl,
    button: pillMenuEl,
    noteEl,
    draw,
    render: () => paper.render(),
    openNote,
    showSearchMatch: (query) => paper.showSearchMatch(query),
    startNoteForPage,
    moveNote: () => noteMeta.pickCollection(),
    changed: () => autoSync.changed(),
    notice: showNotice,
    notesHome: async () => (await notesHomes.load()).home,
    downloads,
    beforeOpen: () => {
      closeSettings({ redraw: false });
      closeOverlays();
    },
  });

  // Open a note the user picked. `byPage` is for a note with a page.
  function openNote(note, options) {
    draw(screen.open(note, options));
  }

  // Draw what a Screen action returned (see src/screen.mjs for the views).
  function draw(view) {
    if (!view) return;
    if (view.changed) autoSync.changed();
    if (!screen.welcome()) clearWelcome();
    switch (view.type) {
      case "note":
        if (view.reload) {
          // The note's lines in the editor, with the caret at the top.
          sketchView.unpick();
          findInNote.close();
          editor.load(view.note.body ?? "");
          paper.open();
          menuView.close();
        } else {
          // The text stays as typed; a fresh page that became a note loses its
          // hint and gets its + back.
          if (paper.focusedEl()) paper.focusedEl().dataset.placeholder = EMPTY_LINE_HINT;
          noteEl.querySelector(".line-plus")?.removeAttribute("hidden");
        }
        updatePill();
        updateBacklinks();
        noteMeta.update();
        break;
      case "freshPage":
        findInNote.close();
        editor.load("");
        menuView.close();
        updatePill();
        updateBacklinks();
        noteMeta.update();
        paper.open();
        if (view.editTitle) titleEdit.start();
        break;
      case "startPrompt":
        showStartPrompt();
        break;
      case "permissionCard":
        showPermissionCard();
        break;
      case "followPage":
        updatePill();
        noteMeta.update();
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
  // The "Collection · site ↗" line above the text and the bar above a second
  // version, drawn by sidebar/note-meta-view.js.
  const noteMeta = createNoteMetaView({
    el: document.querySelector(".note-meta"),
    barEl: document.querySelector(".second-version-bar"),
    noteEl,
    notebook,
    screen,
    draw,
    render: () => paper.render(),
    openNote,
    openSource: (source) => browserPage.openSource(source),
    askDelete: () => menuView.askDeleteNote(),
  });

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

  // --- Secret notes (#109, ADR 0012): sidebar/secret-view.js --------------
  const secrets = createSecrets({
    notebook,
    screen,
    noteEl,
    draw,
    render: () => paper.render(),
    showNotice,
    settingsOpen: () => panels.settingsOpen(),
    // A card is no page: the ‹ 1 of 3 › bar goes while it shows.
    onCard: () => paper.updatePageBar(),
    onChanged: () => autoSync.changed(),
  });

  // --- The pill and its menu (#12) -------------------------------------------
  //
  // The pill shows the open note's title, "1 of 3", ⋯ and the sync dot.
  // Clicking it, or Ctrl+K, opens the ▾ menu (menuView, above). Esc closes it.

  function updatePill() {
    titleEdit.stop();
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
    const secret = note && secretMark(notebook, note.title);
    pillLockEl.hidden = !secret;
    pillLockEl.title = secret?.hint ?? "";
    const pin = pinButton(screen.pinned());
    pillPinEl.hidden = !note;
    pillPinEl.classList.toggle("is-pinned", pin.pinned);
    pillPinEl.setAttribute("aria-pressed", String(pin.pinned));
    pillPinEl.setAttribute("aria-label", pin.label);
    pillPinEl.title = pin.hint;
    // "1 of 3": the page has more notes (#68). Like the rest of the pill, a
    // click opens the ▾ menu, which starts with Notes for this page.
    const count = pageNoteCount(notebook, note);
    pillCountEl.hidden = count === null;
    pillCountEl.textContent = count ?? "";
    noteMenu.update();
    const previous = screen.previous();
    backEl.hidden = previous === null || !tabSettings.showPreviousButton;
    if (previous === null) backBox.close();
  }

  // ←, + and ⋯ open their small menus (sidebar/pill-menus.js).
  backEl.title = BACK_BUTTON_HINT;
  const backBox = createBackBox({
    button: backEl,
    box: document.querySelector(".back-box"),
    screen,
    notebook,
    openNote,
    onBack: () => draw(screen.back()),
    beforeOpen: () => closeOverlays(),
  });

  // A pinned note stays when the page changes; unpinning catches up with the
  // tab you are on.
  function setPinned(pin) {
    if (pin) screen.pin();
    else screen.unpin();
    updatePill();
    if (!pin) openingFlow.pageChanged();
  }
  // The pin sits in the pill, where a click opens the ▾ menu; not this one.
  pillPinEl.addEventListener("click", (event) => {
    event.stopPropagation();
    setPinned(!screen.pinned());
  });

  function startNoteForPage() {
    draw(screen.startNoteForPage());
  }

  const newMenu = createNewMenu({
    button: newButtonEl,
    box: document.querySelector(".new-menu"),
    onWebsite: () => openingFlow.onWebsite(),
    onPick: (kind) => {
      if (kind === "page") startNoteForPage();
      else draw(screen.startFreshPage({ editTitle: true }));
    },
    beforeOpen: () => closeOverlays(),
  });

  const noteMenuButtonEl = document.querySelector(".pill-note-menu");
  const noteMenu = createNoteMenu({
    button: noteMenuButtonEl,
    box: document.querySelector(".note-menu"),
    screen,
    onAction: (kind) => {
      if (kind === "extract") paper.extract();
      else if (kind === "secret") secrets.makeSecret();
      else if (kind === "notSecret") secrets.makeNotSecret();
      else if (kind === "pin" || kind === "unpin") setPinned(kind === "pin");
      else menuView.act("note", kind, { title: screen.note().title }, noteMenuButtonEl);
    },
    beforeOpen: () => closeOverlays(),
  });

  // Only one of the ▾ menu, the ⋯ menu, the + menu, the ← box, the sync box
  // and the Shortcuts panel is open at a time (#83).
  function closeOverlays({ keepShortcuts = false } = {}) {
    menuView.close();
    newMenu.close();
    noteMenu.close();
    backBox.close();
    syncBoxView.close();
    contents.close();
    findInNote.close();
    if (!keepShortcuts && shortcutsPanel.on && !shortcutsPanel.folded) prefs.saveShortcutsPanel({ folded: true });
  }

  // --- Where your notes live: the Notes Home (#14, #94) --------------------
  //
  // The choice lives in Settings, under Where your notes live; each place
  // and how it connects is sidebar/notes-homes.js.

  // When Google's quiet renewal failed, the sync box's one button signs in
  // again and syncs.
  async function signInAgain() {
    try {
      await googleSignIn.signIn();
    } catch (error) {
      console.warn("Glacier: signing in with Google failed", error);
    }
    return autoSync.syncNow();
  }

  // After a restart Chrome forgets the notes folder's permission (#97). The
  // first click or key anywhere in Glacier asks for it again, quietly, and
  // syncs; if that doesn't do, Reconnect in the sync box asks again.
  let folderAskedQuietly = false;

  async function reconnectFolder() {
    if (await folderAccess.askAgain()) folderAskedQuietly = false;
    return autoSync.syncNow();
  }

  function askForFolderQuietly() {
    if (folderAskedQuietly || !needsFolderOk(autoSync.status())) return;
    folderAskedQuietly = true;
    folderAccess.askAgain().then((granted) => {
      if (granted) autoSync.syncNow();
    });
  }
  document.addEventListener("click", askForFolderQuietly, true);
  document.addEventListener("keydown", askForFolderQuietly, true);

  // The sync dot and its box (#75), drawn by sidebar/sync-box-view.js.
  const syncBoxView = createSyncBoxView({
    dotEl: syncDotEl,
    boxEl: document.querySelector(".sync-box"),
    autoSync,
    signInAgain,
    reconnectFolder,
    openSettings,
    // Check them: the ▾ menu, which lists Several versions at the top.
    showConflicts: () => {
      menuView.open();
      menuView.scrollToTop();
    },
    beforeOpen: () => closeOverlays(),
    onNotNow: async () => {
      const { cloudReminder } = await extensionStorage.get("cloudReminder");
      await extensionStorage.set({ cloudReminder: reminderNotNow(cloudReminder) });
    },
  });

  // The pixel cloud reminder (#98): after the 3rd note, while the notes live
  // only in this browser, the sync box opens once by itself, and once more
  // two weeks later. What was shown is kept per browser, not synced.
  let reminderChecking = false;
  async function remindAboutHome() {
    if (reminderChecking) return;
    reminderChecking = true;
    try {
      const { home } = await notesHomes.load();
      const { cloudReminder } = await extensionStorage.get("cloudReminder");
      const now = new Date();
      if (!reminderDue({ home, noteCount: notebook.notes().length, saved: cloudReminder, now })) return;
      if (syncBoxView.showReminder(reminderText(googleSignIn.ready))) {
        await extensionStorage.set({ cloudReminder: reminderOpened(cloudReminder, now) });
      }
    } finally {
      reminderChecking = false;
    }
  }

  function drawSyncStatus(status) {
    syncBoxView.drawStatus(status);
    noteMeta.updateBar();
    if (status.state === "off") remindAboutHome().catch((error) => console.warn("Glacier: reminder failed", error));
  }

  // What the Where your notes live section of Settings asks of the Notebook,
  // wherever settings are drawn (see settings-view.js). The switch itself is
  // sidebar/notes-homes.js'; with settings closed meanwhile, a notice says
  // how it went.
  const repoActions = {
    connection: () => notesHomes.load(),
    status: async () => autoSync.status(),
    syncNow: () => autoSync.syncNow(),
    courses: async () => notebook.courses(),
    // Opens the folder picker straight from the click (#97).
    pickFolder: async () => ((await folderAccess.pick()) ? "picked" : "closed"),

    async switchHome(place, repo, token, onProgress) {
      screen.flush();
      if (place === "browser") {
        await notesHomes.switchTo("browser");
        await autoSync.syncNow();
        return { notes: 0 };
      }
      const name = notesHomeName(place, { repo });
      let result;
      try {
        result = await notesHomes.switchTo(place, { repo, token, onProgress });
      } catch (error) {
        console.error("Glacier: switching where the notes live failed", error);
        const message = syncErrorMessage(error, { home: place, repo });
        if (!panels.settingsOpen()) showNotice(message, 8000);
        return { error: message };
      }
      autoSync.syncNow();
      if (!screen.note()) openingFlow.start();
      else updateBacklinks();
      if (!panels.settingsOpen()) showNotice(`Your notes from ${name} are here.`);
      return { notes: result.notes };
    },

    exportCourse: (course, format) => downloads.downloadCourse(course, format),
    exportAll: () => downloads.exportAll(),
    exportArchive: () => downloads.exportArchive(),

    async restore(bytes) {
      screen.flush();
      try {
        const result = await notebook.importZip(bytes);
        showNotice(importSummary(result));
        autoSync.changed();
        updateBacklinks();
      } catch (error) {
        console.error("Glacier: could not import", error);
        showNotice("Couldn't read that file. Nothing was changed. Pick a zip made with Export.", 8000);
      }
    },

    notice: (text, ms) => showNotice(text, ms),

    // Secret notes (#109): Change passcode in settings encrypts every secret
    // note again, and opens them.
    hasPasscode: async () => notebook.hasPasscode(),
    changePasscode: (passcode, next) => secrets.changePasscode(passcode, next),
  };

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
      const pagesBefore = look.pages;
      look = readLook({ ...look, ...change });
      drawLook();
      if (look.pages !== pagesBefore) paper.redrawPages();
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
  const openShortcutsPage = (url) => api.tabs.create({ url }).catch(() => {});
  const shortcutsView = createShortcutsView({
    openShortcutsPage,
    onFold: () => prefs.saveShortcutsPanel({ folded: true }),
    onUnfold: () => {
      closeOverlays({ keepShortcuts: true });
      prefs.saveShortcutsPanel({ folded: false });
    },
    onWelcome: () => {
      closeOverlays();
      closeSettings({ redraw: false });
      screen.showWelcome();
      drawWelcome({ again: true });
    },
  });
  // The tab sits in the pill bar next to +, the drawer on the sidebar's right
  // edge (#76).
  newButtonEl.after(shortcutsView.tab);
  glacierButtonEl.before(shortcutsView.sheet, settingsView.el);
  shortcutsView.draw(shortcutsPanel);

  // What Chrome or Firefox really has set for Glacier's two shortcuts (#115).
  // Empty means the browser left it unset; only the user can set it.
  const browserName = api.runtime.getBrowserInfo ? "firefox" : "chrome";
  let shortcutCommands;
  async function readShortcuts() {
    if (!api.commands?.getAll) return;
    try {
      shortcutCommands = await api.commands.getAll();
    } catch (error) {
      console.warn("Glacier: could not read the shortcuts", error);
      return;
    }
    shortcutsView.showCommands(shortcutCommands, browserName);
    if (typeof drawWelcome === "function") drawWelcome({ keepScroll: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") readShortcuts();
  });
  readShortcuts();

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

  // The place to show picked when settings next open inside (#97).
  let settingsPicked = null;

  function drawPanels(view) {
    if (view.card) showPanelsCard();
    else closePanelsCard();
    glacierButtonEl.setAttribute("aria-expanded", String(view.open));
    settingsView.showInsideNote(view.explain);
    if (view.settings === "inside") {
      if (!settingsView.isOpen()) settingsView.open(view.section, settingsPicked);
      settingsPicked = null;
    } else settingsView.close();
  }

  function openSettings(section) {
    menuView.close();
    newMenu.close();
    closeBacklinks();
    screen.flush();
    panels.openSettings(section);
  }

  // Closing puts the caret back in the note, unless a click on the note is
  // about to place it there itself.
  function closeSettings({ redraw = true } = {}) {
    if (!panels.closeSettings()) return;
    if (redraw && (screen.note() || screen.freshPage())) paper.render();
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

  // Glacier's own card before the browser's prompt (ADR 0008). Then settings
  // open, beside the sidebar or inside it.
  let panelsCardEl = null;

  function closePanelsCard() {
    panelsCardEl?.remove();
    panelsCardEl = null;
  }

  function showPanelsCard() {
    if (panelsCardEl) return;
    const { sheet, allow } = panelsCard({ onAnswer: (allowed) => panels.answerCard(allowed), onEscape: () => closeSettings() });
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
    // No browser shows its folder picker in a frame on a web page, so
    // settings move inside the sidebar to pick the folder there (#97).
    chooseFolderInside: () => {
      settingsPicked = "folder";
      panels.openSettings("notes-home", { inside: true });
    },
    notesHome: async () => (await notesHomes.load()).home,
    switchHome: (place, repo, token) =>
      repoActions.switchHome(place, repo, token, (progress) => {
        api.runtime.sendMessage({ glacier: "progress", channel: besideChannel, progress }).catch(() => {});
      }),
    exportCourse: repoActions.exportCourse,
    exportAll: repoActions.exportAll,
    restore: (text) => repoActions.restore(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))),
    hasPasscode: repoActions.hasPasscode,
    changePasscode: repoActions.changePasscode,
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

  // Clipping (#100): the background leaves the clip in storage. Taking it
  // out first means it lands once, whichever way it arrived.
  async function takePendingClip() {
    const { pendingClip } = await api.storage.local.get("pendingClip");
    if (!pendingClip) return;
    await api.storage.local.remove("pendingClip");
    const view = screen.clip(pendingClip);
    if (!view) return;
    if (view.type === "locked") {
      showNotice("This note is secret and locked. Type your passcode, then clip again.", 6000);
      return;
    }
    draw(view);
    showNotice("Clipped.");
  }

  // A choice made beside the sidebar, or in another window, arrives here.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.pendingClip?.newValue) takePendingClip();
    if (changes.look) {
      const pagesBefore = look.pages;
      look = readLook(changes.look.newValue);
      drawLook();
      if (look.pages !== pagesBefore) paper.redrawPages();
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

  // Rename by clicking the title (#54): sidebar/title-edit.js.
  const titleEdit = createTitleEdit({
    titleEl: pillTitleEl,
    hintEl: renameHintEl,
    screen,
    draw,
    render: () => paper.render(),
    askPasscode: (heading) => secrets.askPasscode(heading),
    beforeStart: () => menuView.close(),
  });

  // The ▾ and any bare part of the pill open the menu; the title renames and
  // the sync dot does nothing.
  pillEl.addEventListener("click", (event) => {
    if (event.target.closest(".pill-title, .pill-title-input, .sync-dot, .pill-note-menu")) return;
    if (menuView.isOpen()) menuView.dismiss();
    else menuView.open();
  });

  // Capture phase, so Ctrl+K reaches us before the page or the browser's own
  // use of it (Firefox focuses its search bar) once the sidebar has focus.
  document.addEventListener(
    "keydown",
    (event) => {
      if (isShortcut(event, "k")) {
        event.preventDefault();
        event.stopPropagation();
        menuView.open();
      } else if (event.key === "Escape" && menuView.isOpen()) {
        event.preventDefault();
        event.stopPropagation();
        menuView.dismiss();
      }
    },
    true,
  );

  // Follow a `[[Title]]` Link: save any pending edits to the note we're leaving
  // first, then open the note the Link names in place. A Missing Link creates a
  // note with that title, without a page or Collection, and opens that (#8, #68).
  // Left completely empty, that note goes again (#119).
  function openLink(title) {
    draw(screen.openLink(title));
  }

  const copiedEl = document.querySelector(".copied");
  let copiedTimer = null;

  // Copy note in the save error banner (#117): the open note's text as it
  // stands on screen, then a quiet "Copied." beside the button.
  saveErrorEl?.querySelector(".save-error-copy").addEventListener("click", async () => {
    const copiedNote = saveErrorEl.querySelector(".save-error-copied");
    try {
      await navigator.clipboard.writeText(editor.lines.join("\n"));
      copiedNote.textContent = "Copied.";
    } catch (error) {
      console.error("Glacier: could not copy the note", error);
      copiedNote.textContent = "Couldn't copy. Select the text and press Ctrl C.";
    }
    copiedNote.hidden = false;
  });
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

  // --- The table of contents (#107): sidebar/contents-view.js ---------------
  const contents = createContents({
    noteEl,
    editor,
    canOpen: paper.noteShown,
    beforeOpen: () => closeOverlays(),
    jumpToLine: (line) => paper.jumpToLine(line),
  });

  // --- Find in the open note (#111): sidebar/find-view.js --------------------
  const findInNote = createFind({
    el: document.querySelector(".find-box"),
    noteEl,
    editor,
    focusedEl: () => paper.focusedEl(),
    moveTo: (line, col) => paper.moveTo(line, col),
    shownPageSpan: () => paper.shownPageSpan(),
    canOpen: paper.noteShown,
    beforeOpen: () => closeOverlays(),
    render: () => paper.render(),
  });

  // --- Opening the page's note, and the way out of an empty panel (#3) -------
  //
  // Seeing which page you're on needs the `tabs` permission, declared optional
  // and asked for only on the first "New note for this page" click, behind
  // Glacier's own explanation card (ADR 0008). Without it Glacier still works:
  // a note is made on a fresh page, with no Source.

  const browserPage = createBrowserPage(api);
  const openingFlow = createOpeningFlow({
    page: browserPage,
    getOpenNote: () => ({ ...screen.onScreen(), pinned: screen.pinned() }),
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
    if (event.key !== "Escape" || event.defaultPrevented || !screen.freshPage() || titleEdit.isEditing()) return;
    event.preventDefault();
    draw(screen.cancel());
  });

  // The start prompt and the card before the browser's prompt (sidebar/cards.js).
  function showStartPrompt() {
    updatePill();
    noteMeta.update();
    noteEl.replaceChildren(startPrompt({ onNew: () => openingFlow.newNoteForPage() }));
    contents.update();
    paper.updatePageBar();
  }

  function showPermissionCard() {
    noteEl.replaceChildren(pageCard({ onAllow: () => openingFlow.allow(), onDecline: () => openingFlow.decline() }));
    contents.update();
    paper.updatePageBar();
  }

  // The welcome (#85, #90): a pixel-art scene, the greeting, three lines with
  // their pictures, one soft button and a tip, each on its own ruled row.
  // Start writing hides it for good (kept in this browser's storage, not
  // synced) and puts the caret on the paper, back in the open note when it
  // was shown again from the Shortcuts panel (#91). Esc does the same.
  const welcomeEl = document.querySelector(".welcome");
  function drawWelcome({ again = false, keepScroll = false } = {}) {
    if (!screen.welcome()) return;
    if (keepScroll && welcomeEl.hidden) return;
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
      const view = screen.startWriting();
      clearWelcome();
      if (view.type === "welcomeGone") paper.focusedEl()?.focus();
      else draw(view);
    });
    const startRow = Object.assign(document.createElement("p"), { className: "welcome-start-row" });
    startRow.appendChild(start);
    const tip = Object.assign(document.createElement("p"), { className: "welcome-tip", textContent: WELCOME_TIP });
    const notice = shortcutNotice(shortcutCommands, browserName);
    const shortcutLine = notice && Object.assign(document.createElement("p"), { className: "welcome-tip welcome-shortcut", textContent: `${notice.text} ` });
    shortcutLine?.append(fixLink(notice.fix, openShortcutsPage));
    welcomeEl.replaceChildren(scene, greeting, ...lines, startRow, tip, ...(shortcutLine ? [shortcutLine] : []));
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
  // A clip waiting from before the sidebar was open lands once the page's
  // note is on screen (#100).
  openingFlow.start().finally(takePendingClip);
  autoSync.syncNow();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      screen.flush();
      autoSync.flush();
    } else autoSync.syncNow();
  });
  window.addEventListener("pagehide", () => {
    if (screen.closing()) autoSync.changed();
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
          screen.closing();
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
