// Selecting and copying the note as Markdown (#7), and Extract (#99). The
// browser's selection is read as edges the Editor session understands; the
// session decides what was copied or extracted. Ctrl A, Ctrl C and
// Ctrl Shift E are listened for here, and a small "Extract to a new note"
// button shows next to text selected in the note (#122).
//
//   createPaperSelection({ noteEl, editor, focusedEl, dismissMenu, render, showNotice })
//     noteEl          the paper the note is drawn on
//     editor          the Editor session
//     focusedEl()     the element of the line being edited, or null
//     dismissMenu()   close the `/` menu and redraw if it was open
//     render()        draw the paper again
//     showNotice(text, ms)  a short message in the bottom corner
//   .noteShown()        whether a note is drawn on the paper (not a card)
//   .selectWholeNote()  select the note, and only the note
//   .extract()          make the selected text a note of its own
import { copiedMessage } from "../src/editor-model.mjs";
import { isShortcut } from "../src/keys.mjs";
import { textOffset } from "./paper-text.js";

export function createPaperSelection({ noteEl, editor, focusedEl, dismissMenu, render, showNotice }) {
  // Is a note drawn in the page (rather than a form or a card)?
  const noteShown = () => noteEl.querySelector(".line-row") !== null;

  // Select the whole note, and only the note, not the rest of the panel. The
  // line being edited lets go of the focus, so typing can't edit a selection
  // that reaches outside it.
  function selectWholeNote() {
    dismissMenu();
    focusedEl()?.blur();
    const range = document.createRange();
    range.selectNodeContents(noteEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Ctrl+A anywhere else in the panel (after the whole note is selected, the
  // focus is on the page) keeps selecting the note, never the whole panel.
  document.addEventListener("keydown", (event) => {
    const isSelectAll = isShortcut(event, "a");
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
      return editor.lineColFromOffset(focusedEl().textContent, raw);
    }
    const start = Number(blockEl.dataset.start);
    if (blockEl.dataset.code !== undefined) return { code: start, offset: drawn };
    return { line: start, rendered: drawn };
  }

  // The selection's range when it lies in the drawn note, or null.
  function rangeInNote() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!noteShown() || !noteEl.contains(range.commonAncestorContainer)) return null;
    return range;
  }

  // Extract to a new note (#99): the selected text becomes a note and a Link
  // takes its place. The new note does not open.
  function extract() {
    const range = rangeInNote();
    const done =
      range &&
      editor.extract(
        selectionEdge(range.startContainer, range.startOffset),
        selectionEdge(range.endContainer, range.endOffset),
      );
    if (!done) {
      showNotice("Select some text in the note first.");
      return;
    }
    render();
    showNotice(`Made the note '${done.title}'.`);
  }

  // The button next to the selection (#122), under its last line. It waits
  // while the mouse is still selecting, and goes once nothing is selected.
  // mousedown, not click, so the selection stays for the extract.
  const extractButton = document.createElement("button");
  extractButton.type = "button";
  extractButton.className = "extract-button";
  extractButton.textContent = "Extract to a new note";
  extractButton.title = "The selected text becomes a new note and a link takes its place. Ctrl Shift E";
  extractButton.hidden = true;
  extractButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    extractButton.hidden = true;
    extract();
  });
  document.body.append(extractButton);

  let selecting = false;
  function placeExtractButton() {
    const range = selecting ? null : rangeInNote();
    const rects = range ? [...range.getClientRects()].filter((rect) => rect.width > 0) : [];
    const last = rects.at(-1);
    extractButton.hidden = !last;
    if (!last) return;
    const width = extractButton.offsetWidth;
    const left = Math.max(4, Math.min(last.right - width, window.innerWidth - width - 8));
    extractButton.style.left = `${left + window.scrollX}px`;
    extractButton.style.top = `${last.bottom + window.scrollY + 4}px`;
  }
  noteEl.addEventListener("mousedown", () => {
    selecting = true;
    extractButton.hidden = true;
  });
  document.addEventListener("mouseup", () => {
    if (!selecting) return;
    selecting = false;
    placeExtractButton();
  });
  document.addEventListener("selectionchange", placeExtractButton);

  document.addEventListener("keydown", (event) => {
    const isExtract = isShortcut(event, "e", { shift: true });
    if (!isExtract || !noteShown()) return;
    event.preventDefault();
    if (!event.isComposing) extract();
  });

  // Copying a selection in the note puts its Markdown on the clipboard, so it
  // pastes back into a note or Obsidian intact. A short confirmation of how
  // many lines were copied fades on its own.
  document.addEventListener("copy", (event) => {
    const range = rangeInNote();
    if (!range) return;
    const copied = editor.copy(
      selectionEdge(range.startContainer, range.startOffset),
      selectionEdge(range.endContainer, range.endOffset),
    );
    event.preventDefault();
    event.clipboardData.setData("text/plain", copied.text);
    showNotice(copiedMessage(copied.count), 1500);
  });

  return { noteShown, selectWholeNote, extract };
}
