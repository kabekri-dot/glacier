// Text positions on the paper: between the browser's DOM points (a text node
// and an offset) and plain offsets into a block's text. They keep no state,
// so the paper, its focused line and its selection share them.
//
//   caretAtPoint(x, y)              the node and offset the browser puts the caret at
//   renderedOffsetAt(blockEl, x, y) the drawn-text offset of a click in a block
//   textOffset(root, node, offset)  the text length before a DOM point
//   selectionIn(root)               the selection as { start, end } offsets
//   placeSelection(root, start, end), placeCaret(root, offset)

// The text node and offset the browser puts the caret at for a point.
export function caretAtPoint(x, y) {
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
export function renderedOffsetAt(blockEl, x, y) {
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

// The text offset of (node, nodeOffset) inside `root`: the length of all the
// text before it. A `<br>` the browser leaves behind counts as nothing, so
// this is always an offset into the raw Markdown.
export function textOffset(root, node, nodeOffset) {
  if (!root.contains(node)) return root.textContent.length;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, nodeOffset);
  return range.toString().length;
}

// The selection inside the focused line as raw offsets { start, end }.
export function selectionIn(root) {
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
export function placeSelection(root, start, end) {
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

export function placeCaret(root, offset) {
  placeSelection(root, offset, offset);
}
