// The Zen panel: a live-preview block editor (ADR 0006). The note is held as
// lines; every block is shown as finished formatting except the one the cursor
// is on, which becomes a small <textarea> of its raw Markdown. As you type,
// edits are saved into this browser's own IndexedDB copy of the Notebook
// (ADR 0003) — no save button; the write-through storage keeps every keystroke.
//
// The block logic (splitting, list continuation, merging, raw-offset mapping)
// lives in editor-model.mjs as pure, tested functions; this file is only the
// DOM wiring. The pill that switches notes and the `/` menu arrive in later
// slices (#6, #12).

import { createNotebook } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { createSaveScheduler } from "../src/save-scheduler.mjs";
import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
  blockRanges,
  pressEnter,
  pressBackspace,
  renderedToRaw,
  renderLineHtml,
} from "../src/editor-model.mjs";

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

function isFence(line) {
  return /^```/.test(line);
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

  // The note currently shown. Until the note-opening UI exists (#12) this is
  // the most recently created one, so edits land on a real note and persist.
  const openNote = notebook
    .notes()
    .slice()
    .sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""))
    .pop();

  // A fresh install has no note yet, and the panel has no note-creating UI
  // until the Lesson Note flow is wired in (#12). Leaving the page read-only
  // means nothing typed can be silently dropped for lack of somewhere to save
  // it (issue #23).
  if (!openNote) return;

  // Debounce writes so a burst of typing opens one transaction, not one per
  // keystroke, and flush any pending write before the sidebar goes away so the
  // last keystrokes aren't lost (issue #25).
  const scheduler = createSaveScheduler({
    save: (body) => notebook.saveBody(openNote.title, body),
  });

  // The whole note as lines, and where the caret sits (raw line + column). The
  // cursor lands in the note as soon as it opens (ADR 0006).
  let lines = splitIntoLines(editorTextToBody(openNote.body ?? ""));
  let focus = { line: 0, col: 0 };

  const scheduleSave = () =>
    scheduler.schedule(editorTextToBody(linesToText(lines)));

  // Where in a block's text the caret sits, given its first line and the
  // caret's (line, col): the columns of every earlier in-block line, plus one
  // for each `\n` between them.
  function offsetInBlock(start, line, col) {
    let offset = col;
    for (let l = start; l < line; l += 1) {
      offset += lines[l].length + 1;
    }
    return offset;
  }

  // The caret's (line, col) from a textarea caret offset, given the block's
  // first line: split the text before the caret and count the line breaks.
  function lineColFromOffset(start, value, offset) {
    const before = value.slice(0, offset).split("\n");
    return {
      line: start + before.length - 1,
      col: before[before.length - 1].length,
    };
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

  function moveTo(line, col) {
    focus = { line, col };
    render();
  }

  // Build one rendered (non-focused) block.
  function renderedBlock(range) {
    const blockLines = lines.slice(range.start, range.end);
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
    el.innerHTML = renderLineHtml(line);
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const rendered = renderedOffsetAt(el, event.clientX, event.clientY);
      moveTo(range.start, renderedToRaw(line, rendered));
    });
    return el;
  }

  // Build the focused block as a raw-Markdown textarea and wire its keys.
  function focusedBlock(range) {
    const start = range.start;
    const count = range.end - start;
    const isCode = isFence(lines[start]);
    const ta = document.createElement("textarea");
    ta.className = "md-raw";
    ta.rows = 1;
    ta.value = lines.slice(start, range.end).join("\n");

    // How many lines this block holds right now. It grows as a code block gains
    // lines, so each sync replaces exactly the block's current span.
    let blockCount = count;

    const sync = () => {
      const newLines = ta.value.split("\n");
      lines.splice(start, blockCount, ...newLines);
      blockCount = newLines.length;
      focus = lineColFromOffset(start, ta.value, ta.selectionStart);
      scheduleSave();
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
      // A multi-line paste into a one-line block must reflow into real blocks;
      // typing inside a code block need not (it stays one block).
      if (!isCode && newLines.length > 1) render();
    };

    ta.addEventListener("input", sync);

    ta.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !isCode && !event.shiftKey) {
        event.preventDefault();
        const here = lineColFromOffset(start, ta.value, ta.selectionStart);
        if (ta.selectionStart !== ta.selectionEnd) {
          const selEnd = lineColFromOffset(start, ta.value, ta.selectionEnd);
          lines[here.line] =
            lines[here.line].slice(0, here.col) +
            lines[selEnd.line].slice(selEnd.col);
        }
        const next = pressEnter(lines, here.line, here.col);
        lines = next.lines;
        moveTo(next.line, next.col);
        scheduleSave();
        return;
      }

      if (
        event.key === "Backspace" &&
        ta.selectionStart === 0 &&
        ta.selectionStart === ta.selectionEnd &&
        start > 0
      ) {
        event.preventDefault();
        const next = pressBackspace(lines, start, 0);
        lines = next.lines;
        moveTo(next.line, next.col);
        scheduleSave();
        return;
      }

      if (event.key === "ArrowUp") {
        const firstBreak = ta.value.indexOf("\n");
        const atTop = firstBreak === -1 || ta.selectionStart <= firstBreak;
        if (atTop && start > 0) {
          event.preventDefault();
          moveTo(start - 1, lines[start - 1].length);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        const lastBreak = ta.value.lastIndexOf("\n");
        const lastLine = start + count - 1;
        if (ta.selectionStart > lastBreak && lastLine < lines.length - 1) {
          event.preventDefault();
          moveTo(lastLine + 1, 0);
        }
      }
    });

    return { ta, start };
  }

  // Rebuild the page from the current lines, with the focused block as a raw
  // textarea and every other block rendered. The caret is restored afterwards.
  function render() {
    noteEl.replaceChildren();
    const ranges = blockRanges(lines);
    let focusedTextarea = null;
    let focusedStart = 0;

    for (const range of ranges) {
      if (focus.line >= range.start && focus.line < range.end) {
        const built = focusedBlock(range);
        noteEl.appendChild(built.ta);
        focusedTextarea = built.ta;
        focusedStart = built.start;
      } else {
        noteEl.appendChild(renderedBlock(range));
      }
    }

    if (focusedTextarea) {
      const offset = offsetInBlock(focusedStart, focus.line, focus.col);
      focusedTextarea.focus();
      focusedTextarea.setSelectionRange(offset, offset);
      // Grow the raw textarea to fit its content so the paper reads as one note.
      focusedTextarea.style.height = "auto";
      focusedTextarea.style.height = `${focusedTextarea.scrollHeight}px`;
    }
  }

  render();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scheduler.flush();
  });
  window.addEventListener("pagehide", () => scheduler.flush());
}

start();
