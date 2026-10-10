import { test } from "node:test";
import assert from "node:assert/strict";

import { createEditorSession } from "../src/editor-session.mjs";

// The Editor session is the front door for editing one note (#31, ADR 0002):
// named actions — type, Enter, Backspace, ↑/↓, paste — change the lines and the
// caret, and everything the sidebar draws reads from `editor.state`. The sidebar
// only forwards what happened and draws the state; every decision lives here, so
// it can be tested with `node --test` and no browser.

test("a fresh session holds one empty line with the caret at the top", () => {
  const editor = createEditorSession();
  assert.deepEqual(editor.state.lines, [""]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 0 });
});

test("loading a note fills the lines and puts the caret at the top", () => {
  const editor = createEditorSession();
  editor.load("# Title\n\n- one");
  assert.deepEqual(editor.state.lines, ["# Title", "", "- one"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 0 });
  assert.equal(editor.body(), "# Title\n\n- one");
});

test("loading normalizes platform line breaks and never leaves zero lines", () => {
  const editor = createEditorSession();
  editor.load("a\r\nb");
  assert.deepEqual(editor.state.lines, ["a", "b"]);
  editor.load("");
  assert.deepEqual(editor.state.lines, [""]);
});

// Typing: the focused block's textarea changed to `value`, caret at `caret`
// (a block-relative offset). The session splices the block and places the caret.

test("typing into a line updates the text and the caret, and reports the change", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (body) => changes.push(body) });
  editor.load("hllo");
  editor.moveTo(0, 1);
  const result = editor.edit("hello", 2);
  assert.deepEqual(editor.state.lines, ["hello"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 2 });
  assert.equal(result.reflow, false);
  assert.deepEqual(changes, ["hello"]);
});

// Enter: split the current line; continue a list; end an empty bullet. The
// caret lands on the new line.

test("Enter splits the line and the caret starts the new line", () => {
  const editor = createEditorSession();
  editor.load("hello world");
  editor.enter("hello world", 5, 5);
  assert.deepEqual(editor.state.lines, ["hello", " world"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("Enter in a bullet continues the list with a fresh marker", () => {
  const editor = createEditorSession();
  editor.load("- one");
  editor.enter("- one", 5, 5);
  assert.deepEqual(editor.state.lines, ["- one", "- "]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 2 });
});

test("Enter on an empty bullet ends the list, leaving a blank line", () => {
  const editor = createEditorSession();
  editor.load("- one\n- ");
  editor.moveTo(1, 2);
  editor.enter("- ", 2, 2);
  assert.deepEqual(editor.state.lines, ["- one", ""]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("Enter over a selection deletes it before splitting", () => {
  const editor = createEditorSession();
  editor.load("hello world");
  // Select "lo wor" (offsets 3..9) and press Enter.
  editor.enter("hello world", 3, 9);
  assert.deepEqual(editor.state.lines, ["hel", "ld"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

// Backspace at the start of a block joins it with the line above.

test("Backspace at the start of a block joins it with the line above", () => {
  const editor = createEditorSession();
  editor.load("hello\nworld");
  editor.moveTo(1, 0);
  assert.equal(editor.backspaceAtStart(), true);
  assert.deepEqual(editor.state.lines, ["helloworld"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 5 });
});

test("Backspace away from the start of a block is left to the textarea", () => {
  const editor = createEditorSession();
  editor.load("hello\nworld");
  editor.moveTo(1, 3);
  assert.equal(editor.backspaceAtStart(), false);
  assert.deepEqual(editor.state.lines, ["hello", "world"]);
});

test("Backspace at the very start of the note does nothing", () => {
  const editor = createEditorSession();
  editor.load("hello");
  editor.moveTo(0, 0);
  assert.equal(editor.backspaceAtStart(), false);
  assert.deepEqual(editor.state.lines, ["hello"]);
});

// #27: Backspace must never merge a line into a ``` fence. At the start of a
// code block, or on the line after a closing fence, it only moves the caret to
// the end of the line above; both fences stay intact.

test("#27 Backspace at the start of a code block leaves both fences intact", () => {
  const editor = createEditorSession();
  editor.load("intro\n```\ncode\n```\nafter");
  // The code block is one focused block starting at line 1 (the opening fence);
  // the caret sits at its very start.
  editor.moveTo(1, 0);
  assert.equal(editor.backspaceAtStart(), true);
  assert.deepEqual(editor.state.lines, ["intro", "```", "code", "```", "after"]);
  // The caret moved to the end of "intro"; no line merged into a fence.
  assert.deepEqual(editor.state.focus, { line: 0, col: 5 });
});

test("#27 Backspace on the line after a closing fence does not merge into the fence", () => {
  const editor = createEditorSession();
  editor.load("```\ncode\n```\nafter");
  // "after" is its own block at line 3; the line above it is the closing fence.
  editor.moveTo(3, 0);
  assert.equal(editor.backspaceAtStart(), true);
  assert.deepEqual(editor.state.lines, ["```", "code", "```", "after"]);
  assert.deepEqual(editor.state.focus, { line: 2, col: 3 });
});

// ↑/↓ cross between blocks only from the top/bottom line of the focused block.

test("↑ from the top of a block moves to the end of the line above", () => {
  const editor = createEditorSession();
  editor.load("first\nsecond");
  editor.moveTo(1, 2);
  assert.equal(editor.moveUp("second", 2), true);
  assert.deepEqual(editor.state.focus, { line: 0, col: 5 });
});

test("↑ inside a multi-line code block is left to the textarea", () => {
  const editor = createEditorSession();
  editor.load("intro\n```\na\nb\n```");
  editor.moveTo(1, 0);
  // Caret on the second line of the block (after the first newline): not the top.
  assert.equal(editor.moveUp("```\na\nb\n```", 5), false);
});

test("↓ from the bottom of a block moves to the start of the line below", () => {
  const editor = createEditorSession();
  editor.load("first\nsecond");
  editor.moveTo(0, 2);
  assert.equal(editor.moveDown("first", 2), true);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("↓ from the last line of the note does nothing", () => {
  const editor = createEditorSession();
  editor.load("only");
  editor.moveTo(0, 2);
  assert.equal(editor.moveDown("only", 2), false);
});

// Paste: a multi-line paste lands in the textarea as one value and reflows into
// real lines, each pasted line its own line, the caret after the paste.

test("a multi-line paste becomes several lines with the caret after it", () => {
  const editor = createEditorSession();
  editor.load("start end");
  editor.moveTo(0, 6);
  // A native paste sets the textarea to this value, caret at the end of the
  // pasted text; the session reflows it into lines and reports a reflow.
  const result = editor.edit("start one\ntwo\nthreeend", 19);
  assert.equal(result.reflow, true);
  assert.deepEqual(editor.state.lines, ["start one", "two", "threeend"]);
  assert.deepEqual(editor.state.focus, { line: 2, col: 5 });
});

test("pasting several lines inside a code block keeps it one block", () => {
  const editor = createEditorSession();
  editor.load("```\na\n```");
  editor.moveTo(0, 3); // focus the whole code block
  // Paste adds a line inside the fences; a code block never reflows.
  const result = editor.edit("```\na\nb\n```", 7);
  assert.equal(result.reflow, false);
  assert.deepEqual(editor.state.lines, ["```", "a", "b", "```"]);
});

// The caret maths: line/column ↔ offset within the edited block.

test("the caret offset counts earlier lines of a multi-line block", () => {
  const editor = createEditorSession();
  editor.load("```\nabc\ndef\n```");
  editor.moveTo(2, 1); // second code line, column 1
  // Block starts at line 0: "```"(3)+\n + "abc"(3)+\n = 8, plus col 1 = 9.
  assert.equal(editor.caretOffset(), 9);
});

test("line/col is read back from a block-relative offset", () => {
  const editor = createEditorSession();
  editor.load("```\nabc\ndef\n```");
  editor.moveTo(0, 0);
  assert.deepEqual(editor.lineColFromOffset("```\nabc\ndef\n```", 9), {
    line: 2,
    col: 1,
  });
});

// The `/` command menu and the + button live behind the session's front door
// (#32). The sidebar only draws editor.menu and forwards keys and mouse events;
// every decision — opening, filtering, the highlight, picking, dismissing, the
// + placement, the code-block rule and the IME rule — is tested here.

// Typing `/` opens the menu; `/he` filters to the three headings.
test("typing a slash query opens the menu filtered to matching commands", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.edit("/he", 3);
  editor.refreshMenu();
  assert.ok(editor.menu);
  assert.deepEqual(
    editor.menu.commands.map((c) => c.id),
    ["h1", "h2", "h3"],
  );
  assert.equal(editor.menu.selected, 0);
});

test("/he + ↓ + Enter inserts the second heading's Markdown", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (b) => changes.push(b) });
  editor.load("");
  editor.edit("/he", 3);
  editor.refreshMenu();
  assert.equal(editor.menuKey("ArrowDown", { value: "/he", caret: 3 }), "nav");
  assert.equal(editor.menu.selected, 1);
  assert.equal(editor.menuKey("Enter", { value: "/he", caret: 3 }), "pick");
  assert.deepEqual(editor.state.lines, ["## "]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 3 });
  assert.equal(editor.menu, null);
  assert.equal(changes[changes.length - 1], "## ");
});

test("a new query resets the highlight to the top", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.edit("/h", 2);
  editor.refreshMenu();
  editor.menuKey("ArrowDown", { value: "/h", caret: 2 });
  assert.equal(editor.menu.selected, 1);
  // Typing another character is a new query: the highlight starts at the top.
  editor.edit("/he", 3);
  editor.refreshMenu();
  assert.equal(editor.menu.selected, 0);
});

test("the menu never opens inside a code block", () => {
  const editor = createEditorSession();
  editor.load("```\n/he\n```");
  editor.moveTo(1, 3); // caret on the "/he" line, inside the fenced block
  editor.refreshMenu();
  assert.equal(editor.menu, null);
});

test("while an input method is composing, Enter does not pick a command", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.edit("/he", 3);
  editor.refreshMenu();
  assert.equal(
    editor.menuKey("Enter", { value: "/he", caret: 3, isComposing: true }),
    "none",
  );
  assert.ok(editor.menu);
  assert.deepEqual(editor.state.lines, ["/he"]);
});

// Dismissing the menu (Esc, clicking elsewhere, scrolling out) takes an
// untouched `/` that the + button added back out again (#28).
test("Esc dismisses the menu and removes an untouched + / on a fresh line", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (b) => changes.push(b) });
  editor.load("hello");
  editor.moveTo(0, 5);
  editor.openMenuFromPlus(0);
  assert.deepEqual(editor.state.lines, ["hello", "/"]);
  assert.ok(editor.menu);
  assert.equal(editor.menuKey("Escape", { value: "/", caret: 1 }), "dismiss");
  assert.equal(editor.menu, null);
  assert.deepEqual(editor.state.lines, ["hello"]);
  assert.equal(changes[changes.length - 1], "hello");
});

test("dismissing removes an untouched + / that replaced an empty line", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.openMenuFromPlus(0);
  assert.deepEqual(editor.state.lines, ["/"]);
  assert.equal(editor.dismissMenu(), -1);
  assert.deepEqual(editor.state.lines, [""]);
  assert.equal(editor.menu, null);
});

test("dismissing leaves a + / alone once it has been typed into", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.openMenuFromPlus(0);
  editor.edit("/h", 2); // the user typed, so the slash is no longer untouched
  editor.refreshMenu();
  editor.dismissMenu();
  assert.deepEqual(editor.state.lines, ["/h"]);
});

// + placement: an empty line gets the slash in place; a line with text and a
// code block get it on a fresh line that doesn't disturb what's there.
test("+ on an empty line opens the menu in place", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.openMenuFromPlus(0);
  assert.deepEqual(editor.state.lines, ["/"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 1 });
  assert.ok(editor.menu);
});

test("+ on a line with text opens the menu on a fresh line below", () => {
  const editor = createEditorSession();
  editor.load("text");
  editor.moveTo(0, 4);
  editor.openMenuFromPlus(0);
  assert.deepEqual(editor.state.lines, ["text", "/"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 1 });
  assert.ok(editor.menu);
});

test("+ in a code block opens the menu on a fresh line after the block", () => {
  const editor = createEditorSession();
  editor.load("```\ncode\n```");
  editor.moveTo(0, 3); // focus the whole code block
  editor.openMenuFromPlus(0);
  assert.deepEqual(editor.state.lines, ["```", "code", "```", "/"]);
  assert.deepEqual(editor.state.focus, { line: 3, col: 1 });
  assert.ok(editor.menu);
});

test("dismissing a + / after a code block reports the removed line", () => {
  const editor = createEditorSession();
  editor.load("```\ncode\n```");
  editor.moveTo(0, 3);
  editor.openMenuFromPlus(0);
  assert.equal(editor.dismissMenu(), 3); // the fresh "/" line was removed
  assert.deepEqual(editor.state.lines, ["```", "code", "```"]);
});

test("moving the caret before the slash closes the menu", () => {
  const editor = createEditorSession();
  editor.load("/he");
  editor.moveTo(0, 3);
  editor.refreshMenu();
  assert.ok(editor.menu);
  // The caret moves ahead of the "/": followMenu updates the open menu, and
  // here it closes because the caret no longer sits on a slash command.
  editor.followMenu("/he", 0);
  assert.equal(editor.menu, null);
});

test("followMenu never opens a fresh menu when none is open", () => {
  const editor = createEditorSession();
  editor.load("/he");
  editor.moveTo(0, 3);
  // No refreshMenu first, so no menu is open; a caret move must not open one.
  editor.followMenu("/he", 3);
  assert.equal(editor.menu, null);
});

test("the mouse highlight and the arrow highlight are the same one", () => {
  const editor = createEditorSession();
  editor.load("");
  editor.edit("/", 1);
  editor.refreshMenu();
  editor.menuSelect(3);
  assert.equal(editor.menu.selected, 3);
  editor.menuKey("ArrowDown", { value: "/", caret: 1 });
  assert.equal(editor.menu.selected, 4);
});
