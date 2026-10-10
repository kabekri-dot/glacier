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
// ready to save). The `/` command menu and the live rendering join the session
// in later slices (#32, #33); for now the sidebar still drives those.

import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
  blockRanges,
  isFence,
  pressEnter,
  pressBackspace,
} from "./editor-model.mjs";

export function createEditorSession({ onChange } = {}) {
  // The note's lines, the caret (raw line + column), and the span of the block
  // the caret is in — its first line and how many lines it holds right now, so
  // a code block that grows still replaces exactly its own lines on each edit.
  let lines = [""];
  let focus = { line: 0, col: 0 };
  let blockStart = 0;
  let blockCount = 1;

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

    // Replace all the lines (used by the sidebar's `/` menu until #32 moves it
    // in); the caller moves the caret and saves.
    replaceLines(newLines) {
      lines = newLines;
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
