// The line being edited (#37, ADR 0006): the focused block drawn as a styled,
// plain-text editing surface, its marks faded, and its keys wired. Its text
// is always exactly the raw Markdown, so its caret offsets are raw offsets.
// What each key does is the Editor session's; this forwards the key and the
// caret and draws the result.
//
//   createFocusedLine({ editor, render, drawMenu, dismissMenu, selectWholeNote,
//                       focusedEl, hint, onEdited, onTyped, pickSketch })
//     editor            the Editor session
//     render()          draw the paper again
//     drawMenu()        draw the `/` menu for the session's menu state
//     dismissMenu()     close the `/` menu and redraw if it was open
//     selectWholeNote() the second Ctrl A
//     focusedEl()       the line being edited after a redraw
//     hint()            the quiet text on an empty line
//     onEdited()        after each edit drawn in place (no full redraw)
//     onTyped()         after a key typed into the line
//     pickSketch(yes)   whether the next redraw shows a sketch as picked
//   returns build(range) -> { el, start }: the element for a block's line range
import {
  editorTextToBody,
  focusedLineSpans,
  isFence,
  lineMarkLength,
} from "../src/editor-model.mjs";
import { isSketchLine } from "../src/sketch-file.mjs";
import { caretAtPoint, textOffset, selectionIn, placeSelection, placeCaret } from "./paper-text.js";


// The formatting shortcuts (#44): Ctrl (Cmd on a Mac) plus these keys. Ctrl+K
// is kept free for search.
const FORMAT_KEYS = { b: "bold", i: "italic", e: "code" };

export function createFocusedLine({ editor, render, drawMenu, dismissMenu, selectWholeNote, focusedEl, hint, onEdited, onTyped, pickSketch }) {
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
    el.dataset.placeholder = hint();
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
      onEdited();
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
      onTyped();
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
    el.addEventListener("blur", () => dismissMenu());

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
          placeSelection(focusedEl(), selected.start, selected.end);
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
        pickSketch(isSketchLine(editor.lines[editor.state.focus.line]));
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

  return focusedBlock;
}
