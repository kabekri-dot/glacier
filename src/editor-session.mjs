// The Editor session: the front door for editing one note (#31, ADR 0002).
//
// It owns the note's lines and the caret, and offers named actions that read
// like user actions — type, Enter, Backspace, ↑/↓, paste. Every decision (which
// edit applies, where the caret lands, the cursor maths that turns a position in
// the edited block into a line/column and back) lives here, so it can be tested
// with `node --test` and no browser. The sidebar only forwards what happened and
// draws `editor.state`; it does the saving and the opening of notes itself.
//
// The block logic is the pure functions in editor-model.mjs — this module wires
// them to one caret and reports a text change through `onChange` (a note's body,
// ready to save). The `/` command menu and the + button live here too (#32): the
// session decides when the menu opens, what it shows, which command is
// highlighted, how it is picked and dismissed, and where + drops its `/`. The
// sidebar only draws `editor.menu` and forwards keys and mouse events. The live
// rendering joins the session in the last slice (#33).

import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
  blockRanges,
  isFence,
  pressEnter,
  pressBackspace,
  slashQuery,
  filterCommands,
  applySlashCommand,
} from "./editor-model.mjs";

export function createEditorSession({ onChange } = {}) {
  // The note's lines, the caret (raw line + column), and the span of the block
  // the caret is in — its first line and how many lines it holds right now, so
  // a code block that grows still replaces exactly its own lines on each edit.
  let lines = [""];
  let focus = { line: 0, col: 0 };
  let blockStart = 0;
  let blockCount = 1;

  // The `/` command menu while it is open, or null when closed (#32). It holds
  // the commands it currently shows, which one is highlighted and the query it
  // was filtered by, so a new query can reset the highlight. The sidebar reads
  // this to draw the floating list; it keeps none of this itself.
  let menu = null;
  // Where the + button dropped its `/`, so dismissing the menu can take an
  // untouched one back out again (#28): { line, added }, where `added` means +
  // inserted a whole new line rather than reusing an empty one.
  let plusOrigin = null;

  // Recompute the focused block's span for the current caret line.
  function relayout() {
    const range =
      blockRanges(lines).find(
        (r) => focus.line >= r.start && focus.line < r.end,
      ) || { start: focus.line, end: focus.line + 1 };
    blockStart = range.start;
    blockCount = range.end - range.start;
  }

  // Move the caret to (line, col), possibly a different block (a click, or
  // ↑/↓ crossing a block): the focused block span is recomputed.
  function moveTo(line, col) {
    focus = { line, col };
    relayout();
  }

  // Report a text change as the body the sidebar should save.
  function notifyChange() {
    if (onChange) onChange(editorTextToBody(linesToText(lines)));
  }

  // The block-relative offset of a (line, col): the columns of every earlier
  // in-block line, plus one for each `\n` between them.
  function offsetInBlock(line, col) {
    let offset = col;
    for (let l = blockStart; l < line; l += 1) {
      offset += lines[l].length + 1;
    }
    return offset;
  }

  // The (line, col) for a block-relative offset: split the block text before the
  // offset and count the line breaks.
  function lineColFromOffset(value, offset) {
    const before = value.slice(0, offset).split("\n");
    return {
      line: blockStart + before.length - 1,
      col: before[before.length - 1].length,
    };
  }

  // The focused block is a fenced code block: there `/` is just code, so the
  // command menu must never open (#6).
  function inCodeBlock() {
    return isFence(lines[blockStart]);
  }

  // Recompute the menu for the current caret. The menu opens only when the caret
  // sits on a `/` command (slashQuery) outside a code block; a new query starts
  // the highlight at the top. `allowOpen` false (a plain caret move) only
  // updates or closes a menu that is already open — it never opens a fresh one.
  function syncMenu(allowOpen) {
    const query = inCodeBlock()
      ? null
      : slashQuery(lines[focus.line] ?? "", focus.col);
    const commands = query === null ? [] : filterCommands(query);
    if (commands.length === 0) {
      menu = null;
      return;
    }
    if (!menu) {
      if (!allowOpen) return;
      menu = { commands, selected: 0, query };
      return;
    }
    // A new query is a new list: start from the top, so the highlight never
    // silently lands on a different command than the one shown before.
    if (query !== menu.query) menu.selected = 0;
    menu.commands = commands;
    menu.query = query;
  }

  // Apply the highlighted command: the `/query` before the caret becomes the
  // command's Markdown and the caret lands where the command points (#6). A
  // picked command is never a stray `/`, so plusOrigin is cleared.
  function pickMenu() {
    if (!menu) return;
    const command = menu.commands[menu.selected];
    plusOrigin = null;
    const next = applySlashCommand(lines, focus.line, focus.col, command);
    lines = next.lines;
    focus = { line: next.line, col: next.col };
    menu = null;
    relayout();
    notifyChange();
  }

  // Close the menu without picking (Esc, clicking elsewhere, scrolling out, or
  // any re-render while it is open). A `/` that the + button put there and that
  // is still untouched is removed again, so dismissing leaves the note exactly
  // as it was (#28). Returns the line index that was removed (a + `/` on its own
  // fresh line), or -1, so a caller re-placing the caret can adjust for it.
  function dismissMenu() {
    if (!menu) return -1;
    menu = null;
    const origin = plusOrigin;
    plusOrigin = null;
    if (!(origin && lines[origin.line] === "/")) return -1;
    if (origin.added) {
      lines.splice(origin.line, 1);
      const line = origin.line - 1;
      focus = { line, col: lines[line].length };
      relayout();
      notifyChange();
      return origin.line;
    }
    lines[origin.line] = "";
    focus = { line: origin.line, col: 0 };
    relayout();
    notifyChange();
    return -1;
  }

  return {
    // Everything the sidebar draws reads from here.
    get state() {
      return { lines, focus, blockStart, blockCount };
    },
    get lines() {
      return lines;
    },

    // The note's body, normalized for saving (ADR 0005, issue #24).
    body() {
      return editorTextToBody(linesToText(lines));
    },

    // Open a note's body for editing, caret at the top.
    load(body) {
      lines = splitIntoLines(editorTextToBody(body ?? ""));
      if (lines.length === 0) lines = [""];
      focus = { line: 0, col: 0 };
      relayout();
    },

    moveTo,

    // Set the caret within the current block (its span is unchanged), used when
    // the textarea reports its caret moving without leaving the block.
    setFocus(line, col) {
      focus = { line, col };
    },

    lineColFromOffset,

    // The block-relative offset of the caret, so the sidebar can place it in
    // the focused textarea.
    caretOffset() {
      return offsetInBlock(focus.line, focus.col);
    },

    // The `/` command menu as the sidebar should draw it, or null when closed:
    // the commands shown, the highlighted index and the query (#32).
    get menu() {
      return menu;
    },

    // Open, refilter or close the menu for the caret after typing. Opens a fresh
    // menu when a `/` command is typed; the sidebar draws `editor.menu` after.
    refreshMenu() {
      syncMenu(true);
    },

    // The caret moved without typing (arrow keys, Home/End, a click inside the
    // block): keep an open menu in step with it, or close it when the caret
    // leaves the `/` command. Never opens a menu that was closed.
    followMenu(value, caret) {
      if (!menu) return;
      const here = lineColFromOffset(value, caret);
      focus = { line: here.line, col: here.col };
      syncMenu(false);
    },

    // Highlight the command at `index` (the mouse moving over it), so the mouse
    // and the arrow keys share one highlight.
    menuSelect(index) {
      if (menu) menu.selected = index;
    },

    // A key while the menu is open. Returns what it did so the sidebar can react:
    // "nav" (the highlight moved — redraw the menu), "pick" or "dismiss" (the
    // lines changed — re-render), or "none" (not a menu key — leave it to the
    // editor). The caret is re-read first, because it may have moved (Home, a
    // click) since the menu last refiltered; if it has left the `/` command the
    // menu closes and the key falls through. While an input method is composing,
    // Enter confirms the composed text and must not pick a command (the IME rule).
    menuKey(key, { value, caret, isComposing } = {}) {
      if (!menu) return "none";
      if (isComposing) return "none";
      const here = lineColFromOffset(value, caret);
      focus = { line: here.line, col: here.col };
      if (inCodeBlock() || slashQuery(lines[focus.line] ?? "", focus.col) === null) {
        menu = null;
        return "none";
      }
      if (key === "ArrowDown") {
        menu.selected = (menu.selected + 1) % menu.commands.length;
        return "nav";
      }
      if (key === "ArrowUp") {
        menu.selected =
          (menu.selected - 1 + menu.commands.length) % menu.commands.length;
        return "nav";
      }
      if (key === "Enter" || key === "Tab") {
        pickMenu();
        return "pick";
      }
      if (key === "Escape") {
        dismissMenu();
        return "dismiss";
      }
      return "none";
    },

    pickMenu,

    dismissMenu,

    // The + button on the left of the current line opens the same menu (#6). It
    // drops a `/` where the menu should appear — in place on an empty line, on a
    // fresh line below a line with text, or on a fresh line after a code block
    // (so the code is never touched) — then opens the menu as if `/` were typed.
    // `start` is the first line of the focused block.
    openMenuFromPlus(start) {
      let line = start;
      let added = false;
      if (isFence(lines[start] ?? "")) {
        const range = blockRanges(lines).find((r) => r.start === start);
        line = range ? range.end : start + 1;
        lines.splice(line, 0, "/");
        added = true;
      } else if ((lines[start] ?? "") !== "") {
        lines.splice(start + 1, 0, "/");
        line = start + 1;
        added = true;
      } else {
        lines[start] = "/";
      }
      focus = { line, col: 1 };
      relayout();
      syncMenu(true);
      plusOrigin = menu ? { line, added } : null;
      notifyChange();
    },

    // The focused textarea changed to `value`, caret at the block-relative
    // offset `caret` — typing, or the result of a native paste. Splice the
    // block's lines and place the caret. Returns `{ reflow }`: true when a
    // multi-line paste into a one-line block must become real blocks (the
    // sidebar re-renders), false while a code block stays one editable unit.
    edit(value, caret) {
      const isCode = isFence(lines[blockStart]);
      const newLines = value.split("\n");
      lines.splice(blockStart, blockCount, ...newLines);
      blockCount = newLines.length;
      focus = lineColFromOffset(value, caret);
      notifyChange();
      return { reflow: !isCode && newLines.length > 1 };
    },

    // Enter at the caret: split the line, continuing a list or ending an empty
    // bullet (editor-model). A selection [selStart, selEnd] is deleted first.
    enter(value, selStart, selEnd) {
      const here = lineColFromOffset(value, selStart);
      if (selStart !== selEnd) {
        const end = lineColFromOffset(value, selEnd);
        lines[here.line] =
          lines[here.line].slice(0, here.col) + lines[end.line].slice(end.col);
      }
      const next = pressEnter(lines, here.line, here.col);
      lines = next.lines;
      focus = { line: next.line, col: next.col };
      relayout();
      notifyChange();
    },

    // Backspace at the very start of the focused block: join it with the line
    // above (editor-model also keeps ``` fences intact, #27). Returns true when
    // it handled the key; false (caret not at the block start, or the top of
    // the note) leaves the keystroke to the textarea.
    backspaceAtStart() {
      if (blockStart === 0) return false;
      if (!(focus.line === blockStart && focus.col === 0)) return false;
      const next = pressBackspace(lines, blockStart, 0);
      lines = next.lines;
      focus = { line: next.line, col: next.col };
      relayout();
      notifyChange();
      return true;
    },

    // ↑ from the top line of the block: move to the end of the line above.
    // Returns true when it crossed a block; false leaves ↑ to the textarea
    // (moving within a multi-line block). `value`/`selStart` describe the
    // textarea's caret.
    moveUp(value, selStart) {
      const firstBreak = value.indexOf("\n");
      const atTop = firstBreak === -1 || selStart <= firstBreak;
      if (atTop && blockStart > 0) {
        moveTo(blockStart - 1, lines[blockStart - 1].length);
        return true;
      }
      return false;
    },

    // ↓ from the bottom line of the block: move to the start of the line below.
    moveDown(value, selStart) {
      const lastBreak = value.lastIndexOf("\n");
      const lastLine = blockStart + blockCount - 1;
      if (selStart > lastBreak && lastLine < lines.length - 1) {
        moveTo(lastLine + 1, 0);
        return true;
      }
      return false;
    },

    relayout,
  };
}
