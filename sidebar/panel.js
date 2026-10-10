// The Zen panel: a live-preview block editor (ADR 0006). The note is held as
// lines; every block is shown as finished formatting except the one the cursor
// is on, which becomes a small <textarea> of its raw Markdown. As you type,
// edits are saved into this browser's own IndexedDB copy of the Notebook
// (ADR 0003) — no save button; the write-through storage keeps every keystroke.
//
// The block logic (splitting, list continuation, merging, raw-offset mapping,
// the `/` command list) lives in editor-model.mjs as pure, tested functions,
// and the editing decisions — the caret, typing, Enter/Backspace/↑↓, paste and
// the `/` command menu with the + button — live behind the Editor session
// (#31, #32). This file is only the DOM wiring: it forwards what happened and
// draws editor.state and editor.menu. The pill that switches notes arrives in a
// later slice (#12).

import { createNotebook } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { createSaveScheduler } from "../src/save-scheduler.mjs";
import { decidePageOpen } from "../src/page-open.mjs";
import { createEditorSession } from "../src/editor-session.mjs";
import {
  blockRanges,
  isFence,
  renderLineHtml,
} from "../src/editor-model.mjs";

// The empty-line hint and the menu that `/` and the + button open (#6). The
// command logic (which commands, filtering, applying one) is tested in the
// editor model; this file only draws the menu and wires its keys.
const EMPTY_LINE_HINT = "Type / for commands — or click + on the left";

const noteEl = document.querySelector(".note");
const saveErrorEl = document.querySelector(".save-error");

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
  // found or a note is created (openForCurrentPage, below); while nothing is
  // open the panel shows a way to make a note rather than a blank, locked page
  // (#3). Following a Link opens another note in place (openLink).
  let current = null;
  // Whether the open note was opened by the page (so a later page change may
  // replace it) or by the user following a Link / creating it (so it stays put
  // when the page behind the sidebar changes — issue #29).
  let openedByPage = false;

  // The editing decisions — the note's lines and caret, typing, Enter,
  // Backspace, ↑/↓, paste, the `/` command menu with the + button and the
  // cursor maths — live behind this front door (#31, #32, ADR 0002). This file
  // only forwards what happened and draws editor.state and editor.menu; it does
  // the saving (a text change reports the body to schedule) and the opening of
  // notes (openNote).
  const scheduler = createSaveScheduler({
    save: (body) => notebook.saveBody(current.title, body),
  });
  const editor = createEditorSession({ onChange: (body) => scheduler.schedule(body) });

  // Open a note in the editor: flush any pending save for the note we're
  // leaving, load the new note's lines and draw it with the caret at the top.
  // `byPage` marks a note opened to follow the current page (see openedByPage).
  function openNote(note, { byPage = false } = {}) {
    // Leaving a note with the menu open is a dismissal, so an untouched + `/`
    // is taken back out before the note we're leaving is saved (#28).
    editor.dismissMenu();
    scheduler.flush();
    current = note;
    openedByPage = byPage;
    editor.load(current.body ?? "");
    render();
  }

  // Does a Link's target note already exist? A Link to a note that doesn't
  // (a Missing Link) renders red (#8).
  const linkExists = (title) => !notebook.isMissingLink(title);

  // Follow a `[[Title]]` Link: save any pending edits to the note we're leaving
  // first, then open the note the Link names in place. A Missing Link creates a
  // Concept Note with that title and opens that instead (#8).
  function openLink(title) {
    openNote(notebook.openLink(title));
  }

  // The rendered-text offset of a click inside a rendered block, walking its
  // text nodes up to the caret the browser reports for the click point.
  function renderedOffsetAt(blockEl, x, y) {
    let node = null;
    let nodeOffset = 0;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        node = range.startContainer;
        nodeOffset = range.startOffset;
      }
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        node = pos.offsetNode;
        nodeOffset = pos.offset;
      }
    }
    if (!node) return 0;
    let offset = 0;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode === node) return offset + nodeOffset;
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
  // The focused line's raw textarea, kept so the menu can be positioned against
  // it after a re-render.
  let focusedTextareaEl = null;

  // Draw editor.menu (or remove the list when the session has closed it). The
  // menu floats just under the focused textarea, which keeps the caret, so
  // typing still filters and ↑/↓/Enter/Tab/Esc drive it.
  function drawMenu() {
    const state = editor.menu;
    if (!state || !focusedTextareaEl) {
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
      md.textContent = command.markdown;
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
      // mousedown (not click) keeps the caret in the textarea as we apply.
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        editor.menuSelect(i);
        editor.pickMenu();
        render();
      });
      menuEl.appendChild(item);
    });
    const rect = focusedTextareaEl.getBoundingClientRect();
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
  // clicking outside the textarea, and scrolling away from the menu (#28).
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

  // Build one rendered (non-focused) block.
  function renderedBlock(range) {
    const blockLines = editor.lines.slice(range.start, range.end);
    const el = document.createElement("div");
    el.className = "block";

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
      el.addEventListener("mousedown", (event) => {
        event.preventDefault();
        moveTo(range.start, blockLines[0].length);
      });
      return el;
    }

    const line = blockLines[0];
    el.innerHTML = renderLineHtml(line, linkExists);
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
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

  // Build the focused block as a raw-Markdown textarea and wire its keys.
  function focusedBlock(range) {
    const start = range.start;
    const isCode = isFence(editor.lines[start]);
    const ta = document.createElement("textarea");
    ta.className = "md-raw";
    ta.rows = 1;
    ta.value = editor.lines.slice(start, range.end).join("\n");

    const sync = () => {
      // The session splices the block and places the caret, and reports the
      // change to save (#31). It tells us when a multi-line paste must reflow
      // into real blocks; typing inside a code block never does.
      const { reflow } = editor.edit(ta.value, ta.selectionStart);
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
      ta.placeholder = ta.value === "" ? EMPTY_LINE_HINT : "";
      if (reflow) {
        // A re-render while the menu is open is a dismissal, so an untouched
        // + `/` goes with it rather than being saved (#28).
        editor.dismissMenu();
        render();
        return;
      }
      // Open, refilter or close the `/` command menu for the new caret (#32).
      // The session knows not to open inside a code block, where `/` is code.
      editor.refreshMenu();
      drawMenu();
    };

    ta.addEventListener("input", sync);

    // The caret can move without typing (arrow keys, Home/End, a click): the
    // session keeps an open menu in step with it, or closes it when the caret
    // leaves the `/` command.
    const followCaret = () => {
      editor.followMenu(ta.value, ta.selectionStart);
      drawMenu();
    };
    ta.addEventListener("keyup", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) followCaret();
    });
    ta.addEventListener("mouseup", followCaret);
    // Clicking somewhere else dismisses the menu (picking an item uses
    // mousedown with preventDefault, so it never blurs the textarea).
    ta.addEventListener("blur", () => dismissAndRedraw());

    ta.addEventListener("keydown", (event) => {
      // While the menu is open the session owns ↑/↓/Enter/Tab/Esc (#32); it
      // tells us what it did so we can redraw the menu or re-render the note.
      const action = editor.menuKey(event.key, {
        value: ta.value,
        caret: ta.selectionStart,
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

      // Each editing key forwards the textarea's caret to the session, which
      // decides what the edit does and where the caret lands (#31).
      if (event.key === "Enter" && !isCode && !event.shiftKey) {
        event.preventDefault();
        editor.enter(ta.value, ta.selectionStart, ta.selectionEnd);
        render();
        return;
      }

      if (
        event.key === "Backspace" &&
        ta.selectionStart === 0 &&
        ta.selectionStart === ta.selectionEnd &&
        start > 0
      ) {
        event.preventDefault();
        editor.setFocus(start, 0);
        editor.backspaceAtStart();
        render();
        return;
      }

      if (event.key === "ArrowUp") {
        if (editor.moveUp(ta.value, ta.selectionStart)) {
          event.preventDefault();
          render();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        if (editor.moveDown(ta.value, ta.selectionStart)) {
          event.preventDefault();
          render();
        }
      }
    });

    return { ta, start };
  }

  // Rebuild the page from the current lines, with the focused block as a raw
  // textarea and every other block rendered. The caret is restored afterwards.
  function render() {
    noteEl.replaceChildren();
    focusedTextareaEl = null;
    // Keep the session's focused-block span in step with the caret before we
    // read it back to place the caret (#31).
    editor.relayout();
    const { lines, focus } = editor.state;
    const ranges = blockRanges(lines);
    let focusedTextarea = null;

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
        row.append(plus, built.ta);
        noteEl.appendChild(row);
        focusedTextarea = built.ta;
      } else {
        noteEl.appendChild(renderedBlock(range));
      }
    }

    if (focusedTextarea) {
      focusedTextareaEl = focusedTextarea;
      const offset = editor.caretOffset();
      focusedTextarea.focus();
      focusedTextarea.setSelectionRange(offset, offset);
      // The empty-line hint reminds beginners the menu exists (#6).
      focusedTextarea.placeholder =
        focusedTextarea.value === "" ? EMPTY_LINE_HINT : "";
      // Grow the raw textarea to fit its content so the paper reads as one note.
      focusedTextarea.style.height = "auto";
      focusedTextarea.style.height = `${focusedTextarea.scrollHeight}px`;
    }

    // Draw the `/` menu against the fresh textarea (the + button opens it just
    // before a render), or remove it when the session has closed it (#32).
    drawMenu();
  }

  // --- Opening the page's note, and the way out of an empty panel (#3) -------
  //
  // Seeing which page you're on needs the `tabs` permission, declared optional
  // and asked for only on the first "+ Lesson note" click, behind Glacier's own
  // explanation card (ADR 0008). Without it Glacier still works: "+ New note"
  // makes a Lesson Note from a typed title and a picked Course, with no Source.

  const api = typeof browser !== "undefined" ? browser : chrome;

  async function hasTabsPermission() {
    try {
      return await api.permissions.contains({ permissions: ["tabs"] });
    } catch {
      return false;
    }
  }

  // Must run straight from a click (both browsers require it). Resolves true if
  // the user allows, false if they decline or the API is missing.
  async function requestTabsPermission() {
    try {
      return await api.permissions.request({ permissions: ["tabs"] });
    } catch {
      return false;
    }
  }

  // The active tab's address and title, or null when it can't be read: no
  // permission, no tabs API, or a browser-internal page (new tab, settings,
  // a PDF) that is never a lesson.
  async function currentPage() {
    try {
      const tabs = await api.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return null;
      return { url: tab.url, title: tab.title || tab.url };
    } catch {
      return null;
    }
  }

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
    // Any edit to the note we're leaving must reach storage before we drop it.
    scheduler.flush();
    current = null;
    openedByPage = false;
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
      openNote(note);
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

  // Follow a page: decide what it should open (decidePageOpen, #29) and carry
  // that out — open the page's Lesson Note, offer a form, or keep what's open
  // so a note the user navigated to isn't thrown away.
  function followPage(page) {
    const decision = decidePageOpen({
      current,
      openedByPage,
      page,
      lessonNoteForSource: (url) => notebook.lessonNoteForSource(url),
    });
    switch (decision.type) {
      case "open":
        openNote(decision.note, { byPage: true });
        break;
      case "lessonForm":
        showLessonForm(decision.page);
        break;
      case "newNoteForm":
        showNewNoteForm();
        break;
      // "keep": leave the open note alone.
    }
  }

  // Read the current page and follow it. Called once the `tabs` permission is
  // in hand (on load or after Allow).
  async function proceedWithPage() {
    followPage(await currentPage());
  }

  // The starting panel when no note is open and the permission hasn't been
  // granted yet: a single "+ Lesson note" button, so there's always a way in
  // (#3). Clicking it either proceeds (already allowed) or shows the card.
  function showStartPrompt() {
    scheduler.flush();
    current = null;
    openedByPage = false;
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
    create.addEventListener("click", async () => {
      if (await hasTabsPermission()) proceedWithPage();
      else showPermissionCard();
    });
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
    allow.addEventListener("click", async () => {
      // The request must start inside this click, so no await comes before it.
      const granted = await requestTabsPermission();
      if (granted) proceedWithPage();
      else showNewNoteForm();
    });

    const notNow = document.createElement("button");
    notNow.type = "button";
    notNow.className = "perm-cancel";
    notNow.textContent = "Not now — new note by hand";
    notNow.addEventListener("click", () => showNewNoteForm());

    buttons.append(allow, notNow);
    card.appendChild(buttons);
    noteEl.appendChild(card);
  }

  // On the sidebar opening: if the permission is already in hand, open the
  // page's note (or offer to create one); otherwise show the starting prompt.
  async function openForCurrentPage() {
    if (await hasTabsPermission()) proceedWithPage();
    else showStartPrompt();
  }

  // The page changes behind the sidebar: follow it only when it should be
  // followed (#29), and only with the permission granted — without it there's
  // nothing to read. Two quick changes can resolve out of order, so each one is
  // stamped and a result is dropped if a newer change has started since: the
  // sidebar always ends on the latest page, never the tab you left.
  let pageChangeSeq = 0;
  async function reactToPageChange() {
    const seq = (pageChangeSeq += 1);
    if (!(await hasTabsPermission())) return;
    const page = await currentPage();
    if (seq !== pageChangeSeq) return;
    followPage(page);
  }

  if (api.tabs) {
    if (api.tabs.onActivated) {
      api.tabs.onActivated.addListener(() => reactToPageChange());
    }
    if (api.tabs.onUpdated) {
      api.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
        // Only react to the active tab actually navigating to a new address.
        if (changeInfo.url && tab && tab.active) reactToPageChange();
      });
    }
  }

  openForCurrentPage();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scheduler.flush();
  });
  window.addEventListener("pagehide", () => scheduler.flush());
}

start();
