// The Zen panel: a live-preview block editor (ADR 0006). The note is held as
// lines; every block is shown as finished formatting except the one the cursor
// is on, which becomes a small <textarea> of its raw Markdown. As you type,
// edits are saved into this browser's own IndexedDB copy of the Notebook
// (ADR 0003) — no save button; the write-through storage keeps every keystroke.
//
// The block logic (splitting, list continuation, merging, raw-offset mapping,
// the `/` command list) lives in editor-model.mjs as pure, tested functions;
// this file is only the DOM wiring. The pill that switches notes arrives in a
// later slice (#12).

import { createNotebook } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { createSaveScheduler } from "../src/save-scheduler.mjs";
import { decidePageOpen } from "../src/page-open.mjs";
import { createEditorSession } from "../src/editor-session.mjs";
import {
  blockRanges,
  isFence,
  renderedToRaw,
  renderLineHtml,
  slashQuery,
  filterCommands,
  applySlashCommand,
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
  // Backspace, ↑/↓, paste and the cursor maths — live behind this front door
  // (#31, ADR 0002). This file only forwards what happened and draws
  // editor.state; it still does the saving (scheduleSave) and the opening of
  // notes (openNote). A text change reports the body to save.
  const scheduler = createSaveScheduler({
    save: (body) => notebook.saveBody(current.title, body),
  });
  const scheduleSave = () => scheduler.schedule(editor.body());
  const editor = createEditorSession({ onChange: (body) => scheduler.schedule(body) });

  // Open a note in the editor: flush any pending save for the note we're
  // leaving, load the new note's lines and draw it with the caret at the top.
  // `byPage` marks a note opened to follow the current page (see openedByPage).
  function openNote(note, { byPage = false } = {}) {
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
  // only draws the result.
  function moveTo(line, col) {
    editor.moveTo(line, col);
    render();
  }

  // The `/` command menu while it is open: its list element, the commands it
  // currently shows and which one is highlighted. Null when closed. The menu
  // floats over the page near the current line and the focused textarea keeps
  // the caret, so typing still filters and ↑/↓/Enter/Tab/Esc drive the menu.
  let menu = null;
  // The focused line's raw textarea, kept so the + button can open the menu on
  // it after a re-render.
  let focusedTextareaEl = null;

  // Where the + button dropped its `/`, so dismissing the menu can take it back
  // out again: { line, added } where `added` means + inserted a whole new line.
  let plusOrigin = null;

  function closeMenu() {
    if (menu) {
      menu.el.remove();
      menu = null;
    }
  }

  // Close the menu without picking (Esc, clicking elsewhere, scrolling). A `/`
  // that the + button put there and that is still untouched is removed again,
  // so dismissing leaves the note exactly as it was.
  function dismissMenu() {
    if (!menu) return;
    closeMenu();
    const origin = plusOrigin;
    plusOrigin = null;
    const ls = editor.lines;
    if (origin && ls[origin.line] === "/") {
      if (origin.added) ls.splice(origin.line, 1);
      else ls[origin.line] = "";
      const line = origin.added ? origin.line - 1 : origin.line;
      const col = origin.added ? ls[line].length : 0;
      editor.moveTo(line, col);
      scheduleSave();
      render();
    }
  }

  // A floating menu would drift away from its line, so scrolling closes it.
  // Scrolling *inside* the menu (mouse wheel, or keeping the highlight in view)
  // is just browsing the list, so only scrolling anything else closes it.
  window.addEventListener(
    "scroll",
    (event) => {
      if (menu && menu.el.contains(event.target)) return;
      dismissMenu();
    },
    true,
  );

  // Apply the highlighted command: the `/query` before the caret is replaced by
  // the command's Markdown and the caret lands where the command points (#6).
  function pickCommand(command) {
    plusOrigin = null;
    const { focus } = editor.state;
    const next = applySlashCommand(editor.lines, focus.line, focus.col, command);
    editor.replaceLines(next.lines);
    closeMenu();
    moveTo(next.line, next.col);
    scheduleSave();
  }

  function renderMenu() {
    menu.el.replaceChildren();
    menu.commands.forEach((command, i) => {
      const item = document.createElement("li");
      item.className = i === menu.selected ? "slash-item is-selected" : "slash-item";
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
        if (!menu || menu.selected === i) return;
        menu.el.children[menu.selected]?.classList.remove("is-selected");
        menu.selected = i;
        item.classList.add("is-selected");
      });
      // mousedown (not click) keeps the caret in the textarea as we apply.
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        pickCommand(command);
      });
      menu.el.appendChild(item);
    });
    // Keep the highlighted command in view when ↑/↓ move past the visible part
    // of the list. Scrolling only the menu itself never moves the page.
    const item = menu.el.children[menu.selected];
    if (item) {
      const top = item.offsetTop;
      const bottom = top + item.offsetHeight;
      if (top < menu.el.scrollTop) menu.el.scrollTop = top;
      else if (bottom > menu.el.scrollTop + menu.el.clientHeight) {
        menu.el.scrollTop = bottom - menu.el.clientHeight;
      }
    }
  }

  // Show (or refilter) the menu for the focused line. It opens only when the
  // line is a `/` command (slashQuery); any other caret closes it.
  function openOrUpdateMenu(ta) {
    const { lines, focus } = editor.state;
    const query = slashQuery(lines[focus.line] ?? "", focus.col);
    const commands = query === null ? [] : filterCommands(query);
    if (commands.length === 0) {
      closeMenu();
      return;
    }
    if (!menu) {
      const el = document.createElement("ul");
      el.className = "slash-menu";
      document.body.appendChild(el);
      menu = { el, commands, selected: 0, query };
    } else {
      // A new query is a new list: start from the top, so the highlight never
      // silently lands on a different command than the one shown before.
      if (query !== menu.query) menu.selected = 0;
      menu.commands = commands;
      menu.query = query;
    }
    const rect = ta.getBoundingClientRect();
    menu.el.style.left = `${rect.left}px`;
    menu.el.style.top = `${rect.bottom}px`;
    renderMenu();
  }

  // The + button on the left of the current line opens the same menu. It works
  // by dropping a `/` where the menu should appear — on a fresh line below when
  // the current line already has text — so filtering and applying behave
  // exactly as if the `/` had been typed (#6).
  function openMenuFromPlus(start) {
    const next = editor.lines.slice();
    let line = start;
    let added = false;
    if (isFence(next[start] ?? "")) {
      // In a code block the menu must not touch the code: open it on a fresh
      // line right after the block instead.
      const range = blockRanges(next).find((r) => r.start === start);
      line = range ? range.end : start + 1;
      next.splice(line, 0, "/");
      added = true;
    } else if ((next[start] ?? "") !== "") {
      next.splice(start + 1, 0, "/");
      line = start + 1;
      added = true;
    } else {
      next[start] = "/";
    }
    editor.replaceLines(next);
    editor.moveTo(line, 1);
    scheduleSave();
    render();
    if (focusedTextareaEl) {
      openOrUpdateMenu(focusedTextareaEl);
      plusOrigin = menu ? { line, added } : null;
    }
  }

  // Let the menu steal the navigation keys while it is open; returns true when
  // it handled the key so the editor leaves it alone. The caret is re-read
  // first, because it may have moved (Home, a click) since the menu last
  // refiltered; if it's no longer on a `/` command, the menu closes instead.
  function menuHandledKey(event, ta, start) {
    if (!menu) return false;
    // While an input method (e.g. Chinese or Japanese) is composing, Enter
    // confirms the composed text and must not apply a command.
    if (event.isComposing) return false;
    const here = editor.lineColFromOffset(ta.value, ta.selectionStart);
    editor.setFocus(here.line, here.col);
    if (slashQuery(editor.lines[here.line] ?? "", here.col) === null) {
      closeMenu();
      return false;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      menu.selected = (menu.selected + 1) % menu.commands.length;
      renderMenu();
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      menu.selected =
        (menu.selected - 1 + menu.commands.length) % menu.commands.length;
      renderMenu();
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pickCommand(menu.commands[menu.selected]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismissMenu();
      return true;
    }
    return false;
  }

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
      // A plain click on a Link follows it instead of dropping the caret: it
      // opens the linked note, or creates and opens a Concept Note for a
      // Missing Link (#8).
      const linkEl = event.target.closest && event.target.closest(".md-link");
      if (linkEl) {
        openLink(linkEl.dataset.linkTitle);
        return;
      }
      const rendered = renderedOffsetAt(el, event.clientX, event.clientY);
      moveTo(range.start, renderedToRaw(line, rendered));
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
        render();
        return;
      }
      // Open, refilter or close the `/` command menu for the new caret (#6).
      // Never inside a code block: there `/` is just code, and Enter/Tab must
      // insert a newline or a tab.
      if (isCode) closeMenu();
      else openOrUpdateMenu(ta);
    };

    ta.addEventListener("input", sync);

    // The caret can move without typing (arrow keys, Home/End, a click): keep
    // an open menu in step with it, or close it when it leaves the `/` command.
    const followCaret = () => {
      if (!menu) return;
      const here = editor.lineColFromOffset(ta.value, ta.selectionStart);
      editor.setFocus(here.line, here.col);
      if (isCode) closeMenu();
      else openOrUpdateMenu(ta);
    };
    ta.addEventListener("keyup", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) followCaret();
    });
    ta.addEventListener("mouseup", followCaret);
    // Clicking somewhere else dismisses the menu (picking an item uses
    // mousedown with preventDefault, so it never blurs the textarea).
    ta.addEventListener("blur", () => dismissMenu());

    ta.addEventListener("keydown", (event) => {
      // While the menu is open it owns ↑/↓/Enter/Tab/Esc (#6).
      if (menuHandledKey(event, ta, start)) return;

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
    // Any open menu belongs to the line we're leaving; a re-render is always a
    // move away from it (nav, pick, link follow), so close it first (#6).
    closeMenu();
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
        // line, without needing to know about `/` (#6).
        const plus = document.createElement("button");
        plus.type = "button";
        plus.className = "line-plus";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Open the command menu");
        plus.addEventListener("mousedown", (event) => {
          event.preventDefault();
          openMenuFromPlus(built.start);
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
