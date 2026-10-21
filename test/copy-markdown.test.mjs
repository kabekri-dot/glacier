import { test } from "node:test";
import assert from "node:assert/strict";

import { createEditorSession } from "../src/editor-session.mjs";
import { copiedMessage } from "../src/editor-model.mjs";

// Selecting and copying as Markdown (#7). The sidebar reports where a selection
// starts and ends in what it drew: a drawn line and the drawn offset in it, a
// drawn code block and the offset in its code, or a raw line and column in the
// line being edited. The session turns those into the Markdown they cover.

const NOTE = [
  "# Box model",
  "",
  "Every box has **padding** and a [[Margin]].",
  "- content",
  "- `border`",
  "```",
  "div { margin: 0 }",
  "```",
  "See [MDN](https://developer.mozilla.org).",
].join("\n");

function noteEditor(body = NOTE) {
  const editor = createEditorSession();
  editor.load(body);
  return editor;
}

test("copying the whole note gives back its exact Markdown", () => {
  const editor = noteEditor();
  const last = editor.lines.length - 1;
  const copied = editor.copy(
    { line: 0, col: 0 },
    { line: last, col: editor.lines[last].length },
  );
  assert.equal(copied.text, NOTE);
  assert.equal(copied.count, 9);
});

test("a selection dragged over every drawn line gives back the exact Markdown", () => {
  const editor = noteEditor();
  // From before the drawn heading to after the drawn "MDN".
  const copied = editor.copy({ line: 0, rendered: 0 }, { line: 8, rendered: 8 });
  assert.equal(copied.text, NOTE);
});

test("a partial selection across lines gives the matching slice of Markdown", () => {
  const editor = noteEditor();
  // Drawn line 2 is "Every box has padding and a Margin."; start at "padding".
  const copied = editor.copy({ line: 2, rendered: 14 }, { line: 4, rendered: 7 });
  assert.equal(copied.text, "**padding** and a [[Margin]].\n- content\n- `border`");
  assert.equal(copied.count, 3);
});

test("a selection ending at the start of a line stops before its Markdown", () => {
  const editor = noteEditor();
  const copied = editor.copy({ line: 2, rendered: 0 }, { line: 3, rendered: 0 });
  assert.equal(copied.text, "Every box has **padding** and a [[Margin]].\n");
});

test("a selection inside bold text copies just the words", () => {
  const editor = noteEditor();
  const copied = editor.copy({ line: 2, rendered: 15 }, { line: 2, rendered: 18 });
  assert.equal(copied.text, "add");
});

test("a selection over a whole drawn code block keeps its fences", () => {
  const editor = noteEditor();
  const code = "div { margin: 0 }";
  const copied = editor.copy({ code: 5, offset: 0 }, { code: 5, offset: code.length });
  assert.equal(copied.text, "```\ndiv { margin: 0 }\n```");
});

test("a selection inside a drawn code block copies just that code", () => {
  const editor = noteEditor();
  const copied = editor.copy({ code: 5, offset: 6 }, { code: 5, offset: 15 });
  assert.equal(copied.text, "margin: 0");
});

test("a selection may end in the line being edited", () => {
  const editor = noteEditor();
  editor.moveTo(3, 0);
  const copied = editor.copy({ line: 0, rendered: 0 }, { line: 3, col: 9 });
  assert.equal(copied.text, "# Box model\n\nEvery box has **padding** and a [[Margin]].\n- content");
});

test("Ctrl+A once selects the line the caret is on", () => {
  const editor = noteEditor();
  editor.moveTo(2, 4);
  const value = editor.lines[2];
  assert.deepEqual(editor.selectAll(value, 4, 4), { type: "line", start: 0, end: value.length });
});

test("Ctrl+A a second time selects the whole note", () => {
  const editor = noteEditor();
  editor.moveTo(2, 4);
  const value = editor.lines[2];
  assert.deepEqual(editor.selectAll(value, 0, value.length), { type: "note" });
});

test("Ctrl+A in a code block selects only the caret's line of code", () => {
  const editor = noteEditor();
  editor.moveTo(6, 2);
  const value = "```\ndiv { margin: 0 }\n```";
  assert.deepEqual(editor.selectAll(value, 6, 6), { type: "line", start: 4, end: 21 });
});

test("the confirmation says how many lines were copied", () => {
  assert.equal(copiedMessage(1), "Copied 1 line.");
  assert.equal(copiedMessage(4), "Copied 4 lines.");
});
