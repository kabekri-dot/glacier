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
import { createNoteSession } from "../src/note-session.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { createNoteHistory } from "../src/note-history.mjs";
import {
  newNoteChoices,
  LESSON_NOTE_HINT,
  CONCEPT_NOTE_HINT,
} from "../src/new-note-choices.mjs";
import { createOpeningFlow } from "../src/opening-flow.mjs";
import { createBrowserPage } from "../src/browser-page.mjs";
import { createEditorSession } from "../src/editor-session.mjs";
import {
  blockRanges,
  copiedMessage,
  editorTextToBody,
  focusedLineSpans,
  isFence,
  renderLineHtml,
} from "../src/editor-model.mjs";

// The empty-line hint and the menu that `/` and the + button open (#6). The
// command logic (which commands, filtering, applying one) is tested in the
// editor model; this file only draws the menu and wires its keys.
const EMPTY_LINE_HINT = "Type / for commands, or click + on the left";

// The formatting shortcuts (#44): Ctrl (Cmd on a Mac) plus these keys. Ctrl+K
// is kept free for search.
const FORMAT_KEYS = { b: "bold", i: "italic", e: "code" };

const noteEl = document.querySelector(".note");
const saveErrorEl = document.querySelector(".save-error");
const pillEl = document.querySelector(".pill");
const pillTitleEl = document.querySelector(".pill-title");
const pillMenuEl = document.querySelector(".pill-menu");
const renameHintEl = document.querySelector(".rename-hint");
const backlinksButtonEl = document.querySelector(".backlinks-button");
const backlinksListEl = document.querySelector(".backlinks-list");
const backEl = document.querySelector(".pill-back");
const newButtonEl = document.querySelector(".pill-new");
const newMenuEl = document.querySelector(".new-menu");
const menuPanelEl = document.querySelector(".menu");
const noteMetaEl = document.querySelector(".note-meta");

// A write to this browser's copy failed (aborted or threw). Tell the user so
// they don't trust a save that didn't happen (issue #25); their text is still
// on screen to copy out, and Sync (a later slice) is the cross-browser backup.
function reportSaveError(error) {
  console.error("Glacier: could not save", error);
  if (saveErrorEl) {
    saveErrorEl.hidden = false;
  }
}

async function start() {
  if (!noteEl) return;

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
    // rather than inviting text that can't be kept. Sync (a later slice) is
    // the cross-browser backup.
    console.error("Glacier: could not open storage", error);
    return;
  }

  // The note currently shown. Nothing is open until the page's Lesson Note is
  // found or a note is created (the Opening flow, below); while nothing is
  // open the panel shows a way to make a note rather than a blank, locked page
  // (#3). Following a Link opens another note in place (openLink).
  let current = null;
  // Whether the open note was opened by the page (so a later page change may
  // replace it) or by the user following a Link / creating it (so it stays put
  // when the page behind the sidebar changes — issue #29).
  let openedByPage = false;
  // The notes that have been on screen, for the pill's ← button (#52).
  const history = createNoteHistory();

  // The editing decisions — the note's lines and caret, typing, Enter,
  // Backspace, ↑/↓, paste, the `/` command menu with the + button and the
  // cursor maths — live behind this front door (#31, #32, ADR 0002). This file
  // only forwards what happened and draws editor.state and editor.menu; it does
  // the opening of notes (openNote); a text change is forwarded to the Note
  // session, which owns saving the open note.
  const session = createNoteSession({ notebook, onSaveError: reportSaveError });
  const editor = createEditorSession({
    onChange: (body) => session.edit(body),
    titles: () => notebook.notes().map((note) => note.title),
  });

  // Open a note in the editor: flush any pending save for the note we're
  // leaving, load the new note's lines and draw it with the caret at the top.
  // `byPage` marks a note opened to follow the current page (see openedByPage).
  function openNote(note, { byPage = false, fromHistory = false } = {}) {
    // Leaving a note with the menu open is a dismissal, so an untouched + `/`
    // is taken back out before the note we're leaving is saved (#28).
    editor.dismissMenu();
    session.open(note);
    notebook.markOpened(note.title);
    current = note;
    openedByPage = byPage;
    if (!fromHistory) history.visit(note.title);
    editor.load(current.body ?? "");
    render();
    closeMenu();
    updatePill();
    updateBacklinks();
    updateNoteMeta();
  }

  // --- The note's header (#13) ------------------------------------------------
  //
  // The note's file keeps its Course and Source in a frontmatter (ADR 0005),
  // but the editor never shows that YAML: a Lesson Note gets a small
  // "Course · source ↗" line above its text instead, the link opening the
  // lesson in a new tab.

  function updateNoteMeta() {
    noteMetaEl.replaceChildren();
    const course = current?.type === "lesson" ? current.course : undefined;
    const source = current?.type === "lesson" ? current.source : undefined;
    if (course) {
      const name = document.createElement("span");
      name.className = "note-meta-course";
      name.textContent = course;
      noteMetaEl.append(name);
    }
    if (course && source) noteMetaEl.append(" · ");
    if (source) {
      const link = document.createElement("a");
      link.href = source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = source;
      link.textContent = "source ↗";
      noteMetaEl.append(link);
    }
    const shown = Boolean(course || source);
    noteMetaEl.hidden = !shown;
    noteEl.classList.toggle("has-meta", shown);
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
    const linking = current ? notebook.backlinks(current.title) : [];
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
    pillTitleEl.textContent = current ? current.title : "Glacier";
    const previous = history.previous();
    backEl.hidden = previous === null;
    backEl.title = previous === null ? "" : `Back to: ${previous}`;
  }

  // ← opens the note that was on screen before. A note that has since gone
  // is skipped, so the button never lands nowhere.
  backEl.addEventListener("click", () => {
    for (let title = history.back(); title !== null; title = history.back()) {
      const note = notebook.note(title);
      if (note) {
        openNote(note, { byPage: isOpenedByPage(note), fromHistory: true });
        return;
      }
    }
    updatePill();
  });

  // + opens a small menu of the kinds of note to make. On a website the Lesson
  // note belongs to the page; elsewhere it is made by hand.
  function closeNewMenu() {
    newMenuEl.hidden = true;
    newMenuEl.replaceChildren();
    newButtonEl.setAttribute("aria-expanded", "false");
  }

  function startLessonNote() {
    session.close();
    current = null;
    openedByPage = false;
    updatePill();
    updateNoteMeta();
    openingFlow.clickLessonNote();
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
        if (choice.kind === "lesson") startLessonNote();
        else if (choice.kind === "byHand") {
          session.close();
          showNewNoteForm();
        } else openNote(notebook.createConceptNote({ title: "Untitled" }));
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
      closeMenu();
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
    if (current) render();
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

  function titleList(titles) {
    const list = document.createElement("div");
    for (const title of titles) {
      const button = noteButton(title);
      button.textContent = title;
      list.appendChild(button);
    }
    return list;
  }

  // Search results: the title, with the match highlighted in a snippet of the
  // text (or in the title itself when the title matched).
  function drawResults(container, query) {
    container.replaceChildren();
    const results = notebook.search(query);
    if (results.length === 0) {
      const none = document.createElement("p");
      none.className = "menu-empty";
      none.textContent = "No notes match";
      container.appendChild(none);
      return;
    }
    for (const result of results) {
      const button = noteButton(result.title, "menu-item menu-result");
      const title = document.createElement("span");
      title.className = "menu-result-title";
      if (result.snippet) {
        title.textContent = result.title;
        const snippet = document.createElement("span");
        snippet.className = "menu-snippet";
        const mark = document.createElement("mark");
        mark.textContent = result.snippet.match;
        snippet.append(result.snippet.before, mark, result.snippet.after);
        button.append(title, snippet);
      } else {
        const at = result.title.toLowerCase().indexOf(query.trim().toLowerCase());
        const end = at + query.trim().length;
        const mark = document.createElement("mark");
        mark.textContent = result.title.slice(at, end);
        title.append(result.title.slice(0, at), mark, result.title.slice(end));
        button.append(title);
      }
      container.appendChild(button);
    }
  }

  // Recent notes, then the Notebook: Courses → Lesson Notes, then Concepts.
  function drawBrowse(container) {
    container.replaceChildren();
    const recent = notebook.recentNotes();
    if (recent.length > 0) {
      container.append(
        menuHeading("Recent"),
        titleList(recent.map((note) => note.title)),
      );
    }
    const outline = notebook.outline();
    container.appendChild(menuHeading("Notebook"));
    if (outline.courses.length + outline.uncategorised.length + outline.concepts.length === 0) {
      const none = document.createElement("p");
      none.className = "menu-empty";
      none.textContent = "No notes yet";
      container.appendChild(none);
    }
    for (const { course, titles } of outline.courses) {
      const details = document.createElement("details");
      details.className = "menu-course";
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = course;
      summary.title = LESSON_NOTE_HINT;
      details.append(summary, titleList(titles));
      container.appendChild(details);
    }
    if (outline.uncategorised.length > 0) {
      container.append(menuHeading("No Course", LESSON_NOTE_HINT), titleList(outline.uncategorised));
    }
    if (outline.concepts.length > 0) {
      container.append(menuHeading("Concepts", CONCEPT_NOTE_HINT), titleList(outline.concepts));
    }
  }

  function openMenu() {
    if (menuIsOpen()) {
      menuPanelEl.querySelector(".menu-search").focus();
      return;
    }
    // Flush the line being edited so the menu sees its latest text.
    session.flush();
    menuPanelEl.replaceChildren();

    const search = document.createElement("input");
    search.type = "search";
    search.className = "menu-search";
    search.placeholder = "Search titles and text";
    search.setAttribute("aria-label", "Search notes");

    const body = document.createElement("div");
    body.className = "menu-body";
    const refresh = () => {
      if (search.value.trim()) drawResults(body, search.value);
      else drawBrowse(body);
    };
    search.addEventListener("input", refresh);
    refresh();

    const actions = document.createElement("div");
    actions.className = "menu-actions";
    const newLesson = document.createElement("button");
    newLesson.type = "button";
    newLesson.className = "menu-new";
    newLesson.textContent = "+ Lesson note";
    newLesson.title = LESSON_NOTE_HINT;
    newLesson.addEventListener("click", () => {
      closeMenu();
      startLessonNote();
    });
    const newConcept = document.createElement("button");
    newConcept.type = "button";
    newConcept.className = "menu-new";
    newConcept.textContent = "+ Concept";
    newConcept.title = CONCEPT_NOTE_HINT;
    newConcept.addEventListener("click", () => {
      const typed = search.value.trim();
      openNote(notebook.createConceptNote({ title: typed || "Untitled" }));
    });
    actions.append(newLesson, newConcept);

    menuPanelEl.append(search, actions, body, backupSection(refresh));
    menuPanelEl.hidden = false;
    pillMenuEl.setAttribute("aria-expanded", "true");
    search.focus();
  }

  // Export and Restore (#13, #55). The file format lives in the Notebook
  // core; this only downloads and picks files. "Download this note" stays in
  // the pill menu. The rest sit under "Backup" until settings exist (#18).
  function download(data, type, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  function menuButton(text, hint, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-new";
    button.textContent = text;
    button.title = hint;
    button.addEventListener("click", onClick);
    return button;
  }

  function backupSection(refresh) {
    const today = new Date().toISOString().slice(0, 10);
    const section = document.createElement("div");
    section.className = "menu-files";

    const downloadNote = menuButton("Download this note", "Save this note as a Markdown file", () => {
      if (!current) return;
      session.flush();
      const file = notebook.exportNote(current.title);
      download(file.text, "text/markdown", file.path.split("/").pop());
    });
    const noteRow = document.createElement("div");
    noteRow.className = "menu-actions";
    noteRow.append(downloadNote);

    const heading = menuHeading("Backup");

    const courseSelect = document.createElement("select");
    courseSelect.className = "menu-course-pick";
    courseSelect.setAttribute("aria-label", "Course to export");
    for (const course of notebook.courses()) courseSelect.add(new Option(course, course));
    const exportCourse = menuButton("Export a course", "Download the Lesson notes of the chosen Course as a zip", () => {
      if (!courseSelect.value) return;
      session.flush();
      download(notebook.exportCourseZip(courseSelect.value), "application/zip", `${courseSelect.value} ${today}.zip`);
    });
    exportCourse.disabled = !courseSelect.options.length;

    const exportAll = menuButton("Export everything", "Download every note as a zip of Markdown files", () => {
      session.flush();
      download(notebook.exportZip(), "application/zip", `Glacier notes ${today}.zip`);
    });

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".zip,application/zip";
    picker.hidden = true;
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      session.flush();
      try {
        const result = await notebook.importZip(new Uint8Array(await file.arrayBuffer()));
        showNotice(importSummary(result));
        if (menuIsOpen()) refresh();
      } catch (error) {
        console.error("Glacier: could not import", error);
        showNotice("Couldn't read that zip file");
      }
      picker.value = "";
    });
    const restore = menuButton(
      "Restore from backup file",
      "Bring back notes from an Export zip. Notes you already have are never overwritten",
      () => picker.click(),
    );

    const backupRow = document.createElement("div");
    backupRow.className = "menu-actions";
    backupRow.append(courseSelect, exportCourse, exportAll, restore, picker);
    section.append(noteRow, heading, backupRow);
    return section;
  }

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
    session.flush();
    const result = notebook.renameNote(current.title, input.value);
    if (result.ok) openNote(result.note, { byPage: openedByPage });
    else showRenameHint(input, result);
  }

  function startTitleEdit() {
    if (titleEdit || !current) return;
    closeMenu();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "pill-title-input";
    input.value = current.title;
    input.setAttribute("aria-label", "Note title");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveTitleEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stopTitleEdit();
        if (current) render();
      }
    });
    input.addEventListener("blur", saveTitleEdit);
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
    if (event.target.closest(".pill-title, .pill-title-input, .sync-dot")) return;
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
  // Concept Note with that title and opens that instead (#8).
  function openLink(title) {
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
    if (!editor.menu) return;
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
      pre.textContent = inner.join("\n");
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
      // opens the linked note, or creates and opens a Concept Note for a
      // Missing Link (#8).
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
        if (line !== "") el.appendChild(document.createTextNode(line));
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
    el.dataset.placeholder = EMPTY_LINE_HINT;
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
        selection.start === 0 &&
        selection.start === selection.end &&
        start > 0
      ) {
        event.preventDefault();
        editor.setFocus(start, 0);
        editor.backspaceAtStart();
        render();
        return;
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
  function showNotice(text, ms = 4000) {
    copiedEl.textContent = text;
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
  function render() {
    noteEl.replaceChildren();
    focusedEl = null;
    // Keep the session's focused-block span in step with the caret before we
    // read it back to place the caret (#31).
    editor.relayout();
    const { lines, focus } = editor.state;
    const ranges = blockRanges(lines);
    let focused = null;

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

    if (focused) {
      focusedEl = focused;
      focused.focus();
      placeCaret(focused, editor.caretOffset());
    }

    // Draw the `/` menu against the fresh line (the + button opens it just
    // before a render), or remove it when the session has closed it (#32).
    drawMenu();
  }

  // --- Opening the page's note, and the way out of an empty panel (#3) -------
  //
  // Seeing which page you're on needs the `tabs` permission, declared optional
  // and asked for only on the first "+ Lesson note" click, behind Glacier's own
  // explanation card (ADR 0008). Without it Glacier still works: "+ New note"
  // makes a Lesson Note from a typed title and a picked Course, with no Source.

  const openingFlow = createOpeningFlow({
    page: createBrowserPage(
      typeof browser !== "undefined" ? browser : chrome,
    ),
    getOpenNote: () => ({ current, openedByPage }),
    lessonNoteForSource: (url) => notebook.lessonNoteForSource(url),
    show: showOpeningView,
  });

  // Build a labelled control row for the create form.
  function field(labelText, control) {
    const label = document.createElement("label");
    label.className = "create-field";
    const span = document.createElement("span");
    span.className = "create-label";
    span.textContent = labelText;
    label.append(span, control);
    return label;
  }

  // The Course picker: a text box with the existing Courses as suggestions
  // (so one is joined by a click) and the last-used Course filled in, while
  // still letting a new Course be typed (#3).
  function coursePicker() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "create-input";
    input.setAttribute("list", "course-options");
    input.placeholder = "Course";
    const last = notebook.lastCourse();
    if (last) input.value = last;
    const list = document.createElement("datalist");
    list.id = "course-options";
    for (const course of notebook.courses()) {
      const option = document.createElement("option");
      option.value = course;
      list.appendChild(option);
    }
    return { input, list };
  }

  // The create form, shared by "+ Lesson note" (with a Source from the page)
  // and "+ New note" (by hand, no Source). Creating opens the new note so you
  // can type in it straight away — never a dead end (#3).
  function showCreateForm({ heading, titleValue, source, buttonText }) {
    session.close();
    current = null;
    openedByPage = false;
    updatePill();
    updateNoteMeta();
    noteEl.replaceChildren();

    const form = document.createElement("form");
    form.className = "create-form";

    const title = document.createElement("h1");
    title.className = "create-heading";
    title.textContent = heading;
    form.appendChild(title);

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "create-input";
    titleInput.value = titleValue ?? "";
    titleInput.placeholder = "Note title";
    form.appendChild(field("Title", titleInput));

    const course = coursePicker();
    form.append(field("Course", course.input), course.list);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "create-submit";
    submit.textContent = buttonText;
    form.appendChild(submit);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const noteTitle = titleInput.value.trim() || "Untitled";
      const note = notebook.createLessonNote({
        title: noteTitle,
        source,
        course: course.input.value.trim() || undefined,
      });
      openNote(note, { byPage: isOpenedByPage(note) });
    });

    noteEl.appendChild(form);
    titleInput.focus();
    titleInput.select();
  }

  // Create a Lesson Note for the page you're on, its title and Source filled
  // in from the page (both editable).
  function showLessonForm(page) {
    showCreateForm({
      heading: "New Lesson Note for this page",
      titleValue: page.title,
      source: page.url,
      buttonText: "Create Lesson note",
    });
  }

  // Create a note by hand when the page can't be read (permission declined, or
  // a browser-internal page): a typed title and a picked Course, no Source.
  function showNewNoteForm() {
    showCreateForm({
      heading: "New note",
      titleValue: "",
      source: undefined,
      buttonText: "Create note",
    });
  }

  // Draw what the Opening flow decided.
  function showOpeningView(view) {
    switch (view.type) {
      case "startPrompt":
        showStartPrompt();
        break;
      case "permissionCard":
        showPermissionCard();
        break;
      case "open":
        openNote(view.note, { byPage: true });
        break;
      case "lessonForm":
        showLessonForm(view.page);
        break;
      case "newNoteForm":
        showNewNoteForm();
        break;
    }
  }

  // The starting panel when no note is open and the permission hasn't been
  // granted yet: a single "+ Lesson note" button, so there's always a way in
  // (#3). Clicking it either proceeds (already allowed) or shows the card.
  function showStartPrompt() {
    session.close();
    current = null;
    openedByPage = false;
    updatePill();
    updateNoteMeta();
    noteEl.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "empty-state";

    const line = document.createElement("p");
    line.className = "empty-text";
    line.textContent = "No note for this page yet";
    wrap.appendChild(line);

    const create = document.createElement("button");
    create.type = "button";
    create.className = "create-submit";
    create.textContent = "+ Lesson note";
    create.addEventListener("click", () => openingFlow.clickLessonNote());
    wrap.appendChild(create);

    noteEl.appendChild(wrap);
  }

  // Glacier's own explanation before the browser's prompt (ADR 0008): what the
  // permission is for and what it is never used for. The browser's prompt only
  // appears after Allow, straight from that click.
  function showPermissionCard() {
    session.close();
    noteEl.replaceChildren();

    const card = document.createElement("div");
    card.className = "perm-card";

    const title = document.createElement("h1");
    title.className = "create-heading";
    title.textContent = "Let Glacier see the page you're on";
    card.appendChild(title);

    const why = document.createElement("p");
    why.textContent =
      "So your note opens with the page, and “+ Lesson note” can use the page's title and address as the note's Source.";
    card.appendChild(why);

    const never = document.createElement("p");
    never.className = "perm-never";
    never.textContent =
      "Glacier never reads, saves or sends anything from the pages you visit.";
    card.appendChild(never);

    const next = document.createElement("p");
    next.className = "perm-next";
    next.textContent =
      "Your browser will ask to confirm. If you decline, “+ New note” still lets you make a note by hand.";
    card.appendChild(next);

    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";

    const allow = document.createElement("button");
    allow.type = "button";
    allow.className = "create-submit";
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

  openingFlow.listen();
  openingFlow.start();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") session.flush();
  });
  window.addEventListener("pagehide", () => session.flush());

  keepBackgroundInformed(session);
}

// Chrome: tells the background this window's panel is open, so the shortcut
// knows to close it (it is closed when this connection drops). The background
// can ask the panel to close itself. Reconnects if the service worker
// restarted. Firefox toggles its sidebar without this.
async function keepBackgroundInformed(session) {
  const api = typeof browser !== "undefined" ? browser : chrome;
  if (!api.sidePanel || !api.windows) return;
  try {
    const { id: windowId } = await api.windows.getCurrent();
    const connect = () => {
      const port = api.runtime.connect({ name: `glacier-panel:${windowId}` });
      port.onMessage.addListener((message) => {
        if (message && message.type === "close") {
          session.flush();
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
