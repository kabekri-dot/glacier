// Find in the open note (#111): Ctrl F while the focus is in Glacier opens
// one quiet line under the pill with the text field, "2 of 5" and small ↑ ↓
// buttons; on the web page the key stays the browser's own. The matches come
// from src/find.mjs. They are marked with the CSS highlight API, which paints
// ranges over the drawn text without touching it, so a redraw only needs the
// ranges made again. The whole note is searched; with notes as pages, going
// to a match on another page turns to it.
//
//   createFind({ el, noteEl, editor, focusedEl, moveTo, shownPageSpan,
//                canOpen, beforeOpen, render })
//     el             the .find-box element, empty
//     noteEl         the paper the note is drawn on
//     editor         the Editor session (its lines and caret)
//     focusedEl()    the element of the block being edited, or null
//     moveTo(l, c)   put the caret there and draw (which shows its page)
//     shownPageSpan() the lines of the page on screen, or null for all
//     canOpen()      whether a note is on the paper
//     beforeOpen()   close the other boxes and menus
//     render()       draw the paper again
//   .close()     hide the box and the marks, leaving the caret where it is
//   .refresh()   after any redraw of the paper: find and mark again
import { blockRanges } from "../src/editor-model.mjs";
import { findMatches, firstMatchFrom, stepMatch, findStatus } from "../src/find.mjs";
import { isShortcut } from "../src/keys.mjs";

// The box: the field, the status and the two step buttons. Tells what was
// typed or pressed.
function findBox(el, { onQuery, onStep, onClose }) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "find-input";
  input.placeholder = "Find in this note";
  input.setAttribute("aria-label", "Find in this note");
  input.autocomplete = "off";
  input.spellcheck = false;

  const status = document.createElement("span");
  status.className = "find-status";
  status.setAttribute("role", "status");

  const button = (label, text, step) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "find-step";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.title = label;
    // Keep the focus in the field, so Enter keeps walking the matches.
    b.addEventListener("mousedown", (event) => event.preventDefault());
    b.addEventListener("click", () => onStep(step));
    return b;
  };

  el.append(input, status, button("Previous match", "↑", -1), button("Next match", "↓", 1));

  input.addEventListener("input", () => onQuery(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(event.key === "ArrowDown" ? 1 : -1);
    }
  });

  return {
    // Show the box and select its text.
    open() {
      el.hidden = false;
      input.focus();
      input.select();
    },
    // The caret back in the field, keeping its text.
    focus() {
      input.focus();
    },
    close() {
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
    query: () => input.value,
    setStatus(text) {
      status.textContent = text;
    },
  };
}

// The drawn text of a block as a walk over its text nodes, leaving out the
// bullet's dot, which is drawn but is no text of the line.
function domRange(root, from, to) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".md-bullet-dot") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const end = seen + node.nodeValue.length;
    if (!started && from < end) {
      range.setStart(node, from - seen);
      started = true;
    }
    if (started && to <= end) {
      range.setEnd(node, to - seen);
      return range;
    }
    seen = end;
  }
  return null;
}

function clearMarks() {
  if (typeof CSS === "undefined" || !CSS.highlights) return;
  CSS.highlights.delete("find-match");
  CSS.highlights.delete("find-current");
}

export function createFind({ el, noteEl, editor, focusedEl, moveTo, shownPageSpan, canOpen, beforeOpen, render }) {
  const box = findBox(el, {
    onQuery: () => start(),
    onStep: (step) => goTo(stepMatch(matches.length, current, step)),
    onClose: () => end(),
  });
  let matches = [];
  let current = -1;

  // A new query: every match, starting on the first one at or after the caret.
  function start() {
    matches = findMatches(editor.lines, box.query());
    const { line, col } = editor.state.focus;
    goTo(firstMatchFrom(matches, line, col));
  }

  function goTo(index) {
    current = index;
    showPageOf(matches[current]);
    mark({ scroll: true });
  }

  // With notes as pages, the current match's page is the one drawn: the
  // caret goes to the match, and back into the find box to keep typing.
  function showPageOf(match) {
    const page = shownPageSpan();
    if (!match || !page || (match.line >= page.start && match.line < page.end)) return;
    moveTo(match.line, match.rawFrom);
    box.focus();
  }

  function open() {
    if (!canOpen()) return;
    if (box.isOpen()) return box.open();
    beforeOpen();
    box.open();
    start();
  }

  function close() {
    if (!box.isOpen()) return;
    box.close();
    matches = [];
    current = -1;
    clearMarks();
  }

  // Esc: the caret goes to the current match, or stays where it was.
  function end() {
    const match = matches[current];
    close();
    if (match) moveTo(match.line, match.rawFrom);
    else render();
  }

  // The range on screen for one match, or null when its line is not drawn.
  function rangeFor(match) {
    const block = blockRanges(editor.lines).find((r) => match.line >= r.start && match.line < r.end);
    if (!block) return null;
    const lengthBefore = (first) =>
      editor.lines.slice(first, match.line).reduce((sum, text) => sum + text.length + 1, 0);
    const caretLine = editor.state.focus.line;
    const focused = focusedEl();
    // The line with the caret shows its Markdown, so its offsets are raw ones.
    if (focused && caretLine >= block.start && caretLine < block.end) {
      return domRange(focused, lengthBefore(block.start) + match.rawFrom, lengthBefore(block.start) + match.rawTo);
    }
    const blockEl = noteEl.querySelector(`[data-start="${block.start}"]`);
    if (!blockEl) return null;
    if (blockEl.dataset.code !== undefined) {
      const code = blockEl.querySelector(".md-code span");
      return code ? domRange(code, lengthBefore(block.start + 1) + match.from, lengthBefore(block.start + 1) + match.to) : null;
    }
    return domRange(blockEl, match.from, match.to);
  }

  // Draw the status and the marks, after typing in the box, stepping, or any
  // redraw of the paper while the box is open (which may have changed the
  // text, so the matches are found again).
  function mark({ scroll = false } = {}) {
    if (!box.isOpen()) return;
    if (!scroll) {
      matches = findMatches(editor.lines, box.query());
      current = Math.max(Math.min(current, matches.length - 1), matches.length > 0 ? 0 : -1);
    }
    box.setStatus(findStatus(box.query(), matches.length, current));
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;
    const others = [];
    let currentRange = null;
    matches.forEach((match, index) => {
      const range = rangeFor(match);
      if (!range) return;
      if (index === current) currentRange = range;
      else others.push(range);
    });
    CSS.highlights.set("find-match", new Highlight(...others));
    CSS.highlights.set("find-current", currentRange ? new Highlight(currentRange) : new Highlight());
    if (scroll && currentRange) currentRange.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }

  document.addEventListener("keydown", (event) => {
    if (!isShortcut(event, "f") || !canOpen()) return;
    event.preventDefault();
    open();
  });

  return { close, refresh: () => mark() };
}
