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
  columnAfterFormatting,
  breakInsideFormatting,
  pressBackspace,
  pressDelete,
  slashQuery,
  filterCommands,
  applySlashCommand,
  linkQuery,
  filterTitles,
  applyLinkTitle,
  toggleFormat,
  renderedToRaw,
  renderedEdgeToRaw,
  markdownSlice,
  linkAtRendered,
} from "./editor-model.mjs";

export function createEditorSession({
  onChange,
  titles = () => [],
  pause = 800,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
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
  // Empty lines a click on the bare paper added below the note (#35): the index
  // of the first one, or null. They are dropped again when the caret leaves
  // without them having been used; `padEdited` records that typing happened
  // there, so dropping them has to be saved too.
  let padStart = null;
  let padEdited = false;

  // Undo history (#42): snapshots of the whole note and caret, taken before each
  // step. A step is a run of typing until a pause (typingTimer pending) or one
  // structural change. `beforePlus` is the note as it was before the + button
  // dropped its `/`, so picking a command undoes to there. The timer is
  // injected, as the save scheduler's is.
  let undoSteps = [];
  let redoSteps = [];
  let typingTimer = null;
  let beforePlus = null;
  // The selection (block offsets) a formatting shortcut left over the words it
  // formatted, while nothing has touched it since (#78). Enter then steps past
  // the formatting instead of replacing the words.
  let formatSelection = null;

  const snapshot = () => ({
    lines: [...lines],
    focus: { ...focus },
  });

  function endTypingRun() {
    if (typingTimer === null) return;
    clearTimer(typingTimer);
    typingTimer = null;
  }

  // Remember the note as it is now, before a change. Typing joins the open run
  // (only its first keystroke records a step); anything else is its own step.
  function recordStep({ typing = false, before = snapshot() } = {}) {
    if (!typing || typingTimer === null) {
      undoSteps.push(before);
      redoSteps = [];
    }
    endTypingRun();
    if (typing) typingTimer = setTimer(() => (typingTimer = null), pause);
  }

  // Swap the note and caret for a recorded snapshot, saving it like typing.
  function restore(saved) {
    lines = [...saved.lines];
    focus = { ...saved.focus };
    formatSelection = null;
    menu = null;
    plusOrigin = null;
    beforePlus = null;
    padStart = null;
    padEdited = false;
    relayout();
    notifyChange();
  }

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
    endTypingRun();
    formatSelection = null;
    focus = { line, col };
    dropPadding();
    relayout();
  }

  // Drop the trailing empty lines a paper click added, down to (not including)
  // the caret's line, so leaving without typing saves nothing extra (#35).
  function dropPadding() {
    if (padStart === null) return;
    const keep = Math.max(padStart, focus.line + 1);
    const before = lines.length;
    while (lines.length > keep && lines[lines.length - 1] === "") lines.pop();
    if (padEdited && lines.length !== before) notifyChange();
    if (lines.length <= padStart) {
      padStart = null;
      padEdited = false;
    }
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

  // The focused block is a fenced code block: there `/` and `[[` are just code,
  // so no menu must open (#6).
  function inCodeBlock() {
    return isFence(lines[blockStart]);
  }

  // What the caret is typing, or null: a `/` command, or a Link after `[[`
  // (#9) — { kind, query }. Both are null inside a code block. This is the one
  // place the open-the-menu rule is decided.
  function menuQueryAtCaret() {
    if (inCodeBlock()) return null;
    const line = lines[focus.line] ?? "";
    const link = linkQuery(line, focus.col);
    if (link !== null) return { kind: "link", query: link };
    const slash = slashQuery(line, focus.col);
    return slash === null ? null : { kind: "command", query: slash };
  }

  // The rows the menu shows for what is being typed. Link rows carry the exact
  // note title as their label.
  function menuItems({ kind, query }) {
    if (kind === "command") return filterCommands(query);
    return filterTitles(titles(), query).map((title) => ({ label: title }));
  }

  // Recompute the menu for the current caret. The menu opens only when the caret
  // sits on a `/` command or inside a `[[` Link outside a code block; a new
  // query starts the highlight at the top. `allowOpen` false (a plain caret
  // move) only updates or closes a menu that is already open. A `[[` with no
  // matching title shows nothing, so a title that doesn't exist yet types on.
  function syncMenu(allowOpen) {
    const typing = menuQueryAtCaret();
    const commands = typing === null ? [] : menuItems(typing);
    if (commands.length === 0) {
      menu = null;
      return;
    }
    const { kind, query } = typing;
    if (!menu) {
      if (!allowOpen) return;
      menu = { kind, commands, selected: 0, query };
      return;
    }
    // A new query is a new list: start from the top, so the highlight never
    // silently lands on a different command than the one shown before.
    if (query !== menu.query || kind !== menu.kind) menu.selected = 0;
    menu.kind = kind;
    menu.commands = commands;
    menu.query = query;
  }

  // Apply the highlighted command: the `/query` before the caret becomes the
  // command's Markdown and the caret lands where the command points (#6). A
  // picked command is never a stray `/`, so plusOrigin is cleared.
  function pickMenu() {
    if (!menu) return;
    const command = menu.commands[menu.selected];
    recordStep({ before: plusOrigin && beforePlus ? beforePlus : snapshot() });
    plusOrigin = null;
    beforePlus = null;
    const next =
      menu.kind === "link"
        ? applyLinkTitle(lines, focus.line, focus.col, command.label)
        : applySlashCommand(lines, focus.line, focus.col, command);
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
    beforePlus = null;
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

  // A selection edge the sidebar found, as a raw { line, col } (#7). It is a
  // raw line and column in the line being edited, a drawn offset in a drawn
  // line ({ line, rendered }), or an offset in the code of a drawn code block,
  // whose fences are hidden ({ code: first line of the block, offset }). An
  // edge at the very start or end of the code takes in the fence there.
  function rawPoint(point) {
    if ("rendered" in point) {
      return { line: point.line, col: renderedEdgeToRaw(lines[point.line], point.rendered) };
    }
    if (!("code" in point)) return point;
    const range = blockRanges(lines).find((r) => r.start === point.code);
    const closed = range.end - range.start > 1 && isFence(lines[range.end - 1]);
    const code = lines.slice(range.start + 1, closed ? range.end - 1 : range.end).join("\n");
    const last = range.end - 1;
    if (point.offset === 0) return { line: range.start, col: 0 };
    if (point.offset >= code.length) return { line: last, col: lines[last].length };
    const before = code.slice(0, point.offset).split("\n");
    return { line: range.start + before.length, col: before[before.length - 1].length };
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
      padStart = null;
      padEdited = false;
      undoSteps = [];
      redoSteps = [];
      beforePlus = null;
      endTypingRun();
      relayout();
    },

    // Ctrl+Z: step back one recorded change, restoring text and caret. Returns
    // false when there is nothing to undo.
    undo() {
      if (undoSteps.length === 0) return false;
      endTypingRun();
      redoSteps.push(snapshot());
      restore(undoSteps.pop());
      return true;
    },

    // Ctrl+Shift+Z / Ctrl+Y: step forward again. False when nothing to redo.
    redo() {
      if (redoSteps.length === 0) return false;
      endTypingRun();
      undoSteps.push(snapshot());
      restore(redoSteps.pop());
      return true;
    },

    moveTo,

    // A click on the bare paper, `rowsBelow` ruled rows under the last line
    // (0 = the first row below it): add empty lines down to that row and put
    // the caret there, so the text lands where the click did (#35).
    clickPaper(rowsBelow) {
      if (padStart === null) padStart = lines.length;
      for (let i = 0; i <= rowsBelow; i += 1) lines.push("");
      focus = { line: lines.length - 1, col: 0 };
      relayout();
    },

    // A click the sidebar located in a drawn line, as the rendered-text offset
    // the click fell on (#33). The sidebar finds the position; the session
    // decides what it means, reading the one shared line description so the
    // decision matches what was drawn. On a Link it reports the Link clicked and
    // its title, and leaves the caret where it was (the sidebar follows the
    // Link); otherwise it maps the position back to the Markdown column and
    // returns where the caret should go, for the sidebar to place it.
    clickLine(line, renderedOffset) {
      const raw = lines[line] ?? "";
      const title = linkAtRendered(raw, renderedOffset);
      if (title !== null) return { type: "link", title };
      return { type: "caret", line, col: renderedToRaw(raw, renderedOffset) };
    },

    // Set the caret within the current block (its span is unchanged), used when
    // the focused line reports its caret moving without leaving the block.
    setFocus(line, col) {
      focus = { line, col };
    },

    lineColFromOffset,

    // The block-relative offset of the caret, so the sidebar can place it in
    // the focused line.
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
      if (menuQueryAtCaret() === null) {
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
      beforePlus = snapshot();
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

    // The focused line changed to `value`, caret at the block-relative
    // offset `caret` — typing, or the result of a native paste. Splice the
    // block's lines and place the caret. Returns `{ reflow }`: true when a
    // multi-line paste into a one-line block must become real blocks (the
    // sidebar re-renders), false while a code block stays one editable unit.
    edit(value, caret, { paste = false } = {}) {
      recordStep({ typing: !paste });
      beforePlus = null;
      formatSelection = null;
      const wasCode = isFence(lines[blockStart]);
      if (padStart !== null) padEdited = true;
      const newLines = value.split("\n");
      lines.splice(blockStart, blockCount, ...newLines);
      blockCount = newLines.length;
      focus = lineColFromOffset(value, caret);

      // A line that just became an opening ``` fence gets its closing fence at
      // once. Without it, everything below would count as code until a closing
      // fence appears, and no `/` menu would open there.
      if (!wasCode && newLines.length === 1 && isFence(lines[focus.line])) {
        lines.splice(focus.line + 1, 0, "```");
      }

      notifyChange();

      // Did the edit change where blocks begin and end (a fence typed, closed
      // or removed)? Then the sidebar must redraw, so each block is edited and
      // drawn as what it now is: code, or a normal line with the `/` menu.
      const before = { start: blockStart, count: blockCount };
      relayout();
      const changed = blockStart !== before.start || blockCount !== before.count;
      return { reflow: (!wasCode && newLines.length > 1) || changed };
    },

    // Enter at the caret: split the line, continuing a list or ending an empty
    // bullet (editor-model). A selection [selStart, selEnd] is deleted first.
    enter(value, selStart, selEnd) {
      const here = lineColFromOffset(value, selStart);
      const kept = formatSelection;
      formatSelection = null;
      if (
        selStart !== selEnd &&
        kept &&
        kept.start === selStart &&
        kept.end === selEnd
      ) {
        // Right after Ctrl+B / Ctrl+I / Ctrl+E: collapse past the closing
        // marks, then Enter acts as usual from there.
        const end = lineColFromOffset(value, selEnd);
        const col = columnAfterFormatting(lines, end.line, end.col);
        recordStep();
        const next = pressEnter(lines, end.line, typeof col === "number" ? col : end.col);
        lines = next.lines;
        focus = { line: next.line, col: next.col };
        relayout();
        notifyChange();
        return;
      }
      // Inside bold, italic or code, Enter only steps out past the closing
      // marks (#45); a second Enter makes the new line.
      const out = selStart === selEnd && columnAfterFormatting(lines, here.line, here.col);
      if (typeof out === "number") {
        endTypingRun();
        focus = { line: here.line, col: out };
        relayout();
        return;
      }
      recordStep();
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

    // Shift+Enter: a new line in the same note. Inside bold, italic or code
    // (#45) the marks are closed and reopened on the new line; elsewhere the
    // line is just split, with no list continuation (#78). Returns false in a
    // code block, leaving the key to the browser.
    lineBreak(value, selStart, selEnd) {
      if (isFence(lines[blockStart] ?? "")) return false;
      formatSelection = null;
      const here = lineColFromOffset(value, selStart);
      let next = null;
      if (selStart === selEnd) {
        next = breakInsideFormatting(lines, here.line, here.col);
      }
      if (!next) {
        const end = lineColFromOffset(value, selEnd);
        const head = lines[here.line].slice(0, here.col);
        const tail = lines[end.line].slice(end.col);
        const split = lines.slice();
        split.splice(here.line, end.line - here.line + 1, head, tail);
        next = { lines: split, line: here.line + 1, col: 0 };
      }
      recordStep();
      beforePlus = null;
      lines = next.lines;
      focus = { line: next.line, col: next.col };
      relayout();
      notifyChange();
      return true;
    },

    // Ctrl+B / Ctrl+I / Ctrl+E (#44): turn bold, italic or inline code
    // (`kind`) on or off for the selection [selStart, selEnd] of the focused
    // block, or for what is typed next when nothing is selected. One press is
    // one undo step; stepping out of the formatting moves only the caret.
    // Returns the selection over the same words as block offsets, or null when
    // nothing happened (in code), for the sidebar to select again.
    format(kind, value, selStart, selEnd) {
      const from = lineColFromOffset(value, selStart);
      const to = lineColFromOffset(value, selEnd);
      const next = toggleFormat(lines, from, to, kind);
      const changed = next.lines !== lines;
      const moved = next.end.line !== to.line || next.end.col !== to.col;
      if (!changed && !moved) return null;
      formatSelection =
        selStart !== selEnd
          ? {
              start: offsetInBlock(next.start.line, next.start.col),
              end: offsetInBlock(next.end.line, next.end.col),
            }
          : null;
      if (changed) recordStep();
      else endTypingRun();
      beforePlus = null;
      lines = next.lines;
      focus = { ...next.end };
      relayout();
      if (changed) notifyChange();
      return {
        start: offsetInBlock(next.start.line, next.start.col),
        end: offsetInBlock(next.end.line, next.end.col),
      };
    },

    // Backspace at the very start of the focused block: join it with the line
    // above (editor-model also keeps ``` fences intact, #27). Returns true when
    // it handled the key; false (caret not at the block start, or the top of
    // the note) leaves the keystroke to the browser.
    backspaceAtStart() {
      if (blockStart === 0) return false;
      if (!(focus.line === blockStart && focus.col === 0)) return false;
      recordStep();
      const next = pressBackspace(lines, blockStart, 0);
      lines = next.lines;
      focus = { line: next.line, col: next.col };
      relayout();
      notifyChange();
      return true;
    },

    // Delete at the very end of the focused block: pull the next line up (the
    // mirror of backspaceAtStart, fences kept intact too). Returns true when it
    // handled the key; false (caret not at the block end, or the end of the
    // note) leaves the keystroke to the browser.
    deleteAtEnd() {
      const last = blockStart + blockCount - 1;
      if (last >= lines.length - 1) return false;
      if (!(focus.line === last && focus.col === lines[last].length)) return false;
      recordStep();
      const next = pressDelete(lines, last, focus.col);
      lines = next.lines;
      focus = { line: next.line, col: next.col };
      relayout();
      notifyChange();
      return true;
    },

    // ↑ from the top line of the block: move to the end of the line above.
    // Returns true when it crossed a block; false leaves ↑ to the browser
    // (moving within a multi-line block). `value`/`selStart` describe the
    // focused line's caret.
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

    // Copying a selection (#7): the Markdown between two selection edges (see
    // rawPoint), and how many lines it holds, for the confirmation.
    copy(from, to) {
      const text = markdownSlice(lines, rawPoint(from), rawPoint(to));
      return { text, count: splitIntoLines(text).length };
    },

    // Ctrl+A in the focused block [selStart, selEnd] (#7): the first press
    // selects the caret's line, as block offsets; once that line is already
    // selected, the next press selects the whole note ({ type: "note" }).
    selectAll(value, selStart, selEnd) {
      const here = lineColFromOffset(value, selEnd);
      const start = offsetInBlock(here.line, 0);
      const end = start + lines[here.line].length;
      if (selStart === start && selEnd === end) return { type: "note" };
      return { type: "line", start, end };
    },

    relayout,
  };
}
