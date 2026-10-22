import { test } from "node:test";
import assert from "node:assert/strict";

import { createEditorSession } from "../src/editor-session.mjs";

// The hidden game (#128): `/break` alone on a line, then Enter, starts it.
// The typed `/break` goes again and the note is as it was, with no undo step.

function typedOnNewLine(body, typed) {
  const changes = [];
  const editor = createEditorSession({ onChange: (text) => changes.push(text) });
  editor.load(body);
  const line = editor.state.lines.length - 1;
  editor.moveTo(line, 0);
  editor.edit(typed, typed.length);
  return { editor, changes };
}

test("/break on an empty line starts the game and leaves the note as it was", () => {
  const { editor, changes } = typedOnNewLine("# Flexbox\n", "/break");
  assert.equal(editor.startsBreak("/break", 6), true);
  assert.equal(editor.body(), "# Flexbox\n");
  assert.equal(changes.at(-1), "# Flexbox\n");
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("starting the game leaves no undo step behind", () => {
  const { editor } = typedOnNewLine("# Flexbox\n", "/break");
  editor.startsBreak("/break", 6);
  assert.equal(editor.undo(), false);
});

test("/break after other text on the line is just text", () => {
  const { editor } = typedOnNewLine("# Flexbox\n", "see /break");
  assert.equal(editor.startsBreak("see /break", 10), false);
  assert.equal(editor.body(), "# Flexbox\nsee /break");
});

test("/break with more after it is just text", () => {
  const { editor } = typedOnNewLine("# Flexbox\n", "/breakfast");
  assert.equal(editor.startsBreak("/breakfast", 10), false);
});

test("/break inside a code block is just code", () => {
  const editor = createEditorSession();
  editor.load("```\n/break\n```");
  editor.moveTo(0, 0);
  assert.equal(editor.startsBreak("```\n/break\n```", 10), false);
  assert.equal(editor.body(), "```\n/break\n```");
});

test("/break opens no / menu, so the game stays hidden", () => {
  const { editor } = typedOnNewLine("", "/break");
  editor.refreshMenu();
  assert.equal(editor.menu, null);
});

test("starting the game leaves no undo step even when /break was typed slowly", () => {
  let fire = null;
  const editor = createEditorSession({ setTimer: (fn) => (fire = fn), clearTimer: () => {} });
  editor.load("# Flexbox\n");
  editor.moveTo(1, 0);
  editor.edit("/br", 3);
  fire();
  editor.edit("/break", 6);
  editor.startsBreak("/break", 6);
  assert.equal(editor.undo(), false);
  assert.equal(editor.body(), "# Flexbox\n");
});
