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

test("typing ``` on a line opens a code block and adds its closing fence", () => {
  const editor = createEditorSession();
  editor.load("intro\n\nafter");
  editor.moveTo(1, 0);
  const { reflow } = editor.edit("```", 3);
  assert.deepEqual(editor.state.lines, ["intro", "```", "```", "after"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 3 });
  assert.equal(reflow, true); // the line is now a code block: redraw it as one
  assert.equal(editor.state.blockStart, 1);
  assert.equal(editor.state.blockCount, 2); // "after" stays outside the block
});

test("closing an open code block lets the lines after it become normal lines again", () => {
  const editor = createEditorSession();
  editor.load("```\ncode\nafter");      // no closing fence: everything is code
  editor.moveTo(1, 4);
  assert.equal(editor.state.blockCount, 3);
  const value = "```\ncode\n```\nafter";
  const { reflow } = editor.edit(value, "```\ncode\n```".length);
  assert.deepEqual(editor.state.lines, ["```", "code", "```", "after"]);
  assert.equal(reflow, true);
  assert.equal(editor.state.blockCount, 3); // "after" is its own line again
});

test("typing inside a closed code block keeps it one block", () => {
  const editor = createEditorSession();
  editor.load("```\ncode\n```");
  editor.moveTo(1, 4);
  const { reflow } = editor.edit("```\ncode!\n```", 9);
  assert.equal(reflow, false);
  assert.deepEqual(editor.state.lines, ["```", "code!", "```"]);
});

test("pasting a whole code block adds no extra closing fence", () => {
  const editor = createEditorSession();
  editor.load("intro\n");
  editor.moveTo(1, 0);
  const pasted = "```\ncode\n```";
  editor.edit(pasted, pasted.length);
  assert.deepEqual(editor.state.lines, ["intro", "```", "code", "```"]);
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

// The line display behind the front door (#33): the sidebar locates which drawn
// character a click landed on and passes it to the session, which decides — from
// the one shared line description — where the caret goes, or that a Link was
// clicked. Covered here for every kind of line so the drawn position and the
// Markdown position can never disagree.

test("clicking a heading maps every drawn position past the # marker", () => {
  const editor = createEditorSession();
  editor.load("## Hello");
  // "## Hello" draws as "Hello"; drawn offset 0 -> raw 3 (just after "## ").
  assert.deepEqual(editor.clickLine(0, 0), { type: "caret", line: 0, col: 3 });
  assert.deepEqual(editor.clickLine(0, 5), { type: "caret", line: 0, col: 8 });
});

test("clicking a bullet lands exactly where you clicked (#30)", () => {
  const editor = createEditorSession();
  editor.load("- item");
  // The drawn "•" is counted, so clicking just before "i" lands at content
  // start (raw 2), not one character in — the bug #30 fixes.
  assert.deepEqual(editor.clickLine(0, 1), { type: "caret", line: 0, col: 2 });
  assert.deepEqual(editor.clickLine(0, 5), { type: "caret", line: 0, col: 6 });
});

test("clicking inside bold or inline code maps past the markers", () => {
  const editor = createEditorSession();
  editor.load("a **b** c");
  // Drawn "a b c"; before "b" (drawn 2) -> raw 4, just inside the `**`.
  assert.deepEqual(editor.clickLine(0, 2), { type: "caret", line: 0, col: 4 });
  editor.load("run `x` now");
  // Drawn "run x now"; before "x" (drawn 4) -> raw 5, just inside the backtick.
  assert.deepEqual(editor.clickLine(0, 4), { type: "caret", line: 0, col: 5 });
});

test("clicking a Link reports the Link and its title, not a caret", () => {
  const editor = createEditorSession();
  editor.load("go to [[Box model]] now");
  // Drawn "go to Box model now"; "Box model" is drawn offsets 6..14.
  assert.deepEqual(editor.clickLine(0, 8), { type: "link", title: "Box model" });
  // Clicking off the Link is a caret, mapped past the `[[`.
  assert.equal(editor.clickLine(0, 0).type, "caret");
});

// Clicking the empty paper below the last line (#35): empty lines are added down
// to the clicked ruled row and the caret lands there, ready to type.

test("clicking the paper below the last line adds empty lines down to it", () => {
  const editor = createEditorSession();
  editor.load("one\ntwo");
  editor.clickPaper(2);
  assert.deepEqual(editor.state.lines, ["one", "two", "", "", ""]);
  assert.deepEqual(editor.state.focus, { line: 4, col: 0 });
});

test("clicking the first row below the text adds just one empty line", () => {
  const editor = createEditorSession();
  editor.load("one");
  editor.clickPaper(0);
  assert.deepEqual(editor.state.lines, ["one", ""]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("typing after a paper click lands on the line that was clicked", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (body) => changes.push(body) });
  editor.load("one");
  editor.clickPaper(1);
  editor.edit("hi", 2);
  assert.equal(editor.body(), "one\n\nhi");
  assert.deepEqual(changes, ["one\n\nhi"]);
});

test("clicking the paper and leaving without typing saves no empty lines", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (body) => changes.push(body) });
  editor.load("one\ntwo");
  editor.clickPaper(5);
  editor.moveTo(0, 1);
  assert.deepEqual(editor.state.lines, ["one", "two"]);
  assert.deepEqual(changes, []);
});

test("empty lines added for a click are dropped again if the typing is deleted", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (body) => changes.push(body) });
  editor.load("one");
  editor.clickPaper(2);
  editor.edit("x", 1);
  editor.edit("", 0);
  editor.moveTo(0, 0);
  assert.deepEqual(editor.state.lines, ["one"]);
  assert.equal(changes.at(-1), "one");
});

test("empty lines you already had are never dropped by a paper click", () => {
  const editor = createEditorSession();
  editor.load("one\n\n");
  editor.clickPaper(0);
  editor.moveTo(0, 0);
  assert.deepEqual(editor.state.lines, ["one", "", ""]);
});

test("moving to another added line keeps the lines above it", () => {
  const editor = createEditorSession();
  editor.load("one");
  editor.clickPaper(3);
  editor.moveTo(2, 0);
  assert.deepEqual(editor.state.lines, ["one", "", ""]);
  assert.deepEqual(editor.state.focus, { line: 2, col: 0 });
});

// Undo and redo (#42): the session keeps its own history of the whole note, so
// the browser's undo never touches the styled focused line.

function manualTimer() {
  let fn = null;
  return {
    setTimer: (callback) => {
      fn = callback;
      return 1;
    },
    clearTimer: () => {
      fn = null;
    },
    pause: () => {
      const callback = fn;
      fn = null;
      callback?.();
    },
  };
}

function editorWithHistory(body = "") {
  const timer = manualTimer();
  const changes = [];
  const editor = createEditorSession({
    onChange: (text) => changes.push(text),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  editor.load(body);
  return { editor, timer, changes };
}

test("typing, a pause, more typing make two undo steps", () => {
  const { editor, timer } = editorWithHistory();
  editor.edit("h", 1);
  editor.edit("he", 2);
  timer.pause();
  editor.edit("hey", 3);
  editor.edit("hey!", 4);

  editor.undo();
  assert.deepEqual(editor.state.lines, ["he"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 2 });
  editor.undo();
  assert.deepEqual(editor.state.lines, [""]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 0 });
  assert.equal(editor.undo(), false, "nothing left to undo");
});

test("redo steps forward again, restoring text and caret", () => {
  const { editor, timer } = editorWithHistory();
  editor.edit("he", 2);
  timer.pause();
  editor.edit("hey", 3);
  editor.undo();
  editor.undo();
  editor.redo();
  assert.deepEqual(editor.state.lines, ["he"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 2 });
  editor.redo();
  assert.deepEqual(editor.state.lines, ["hey"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 3 });
  assert.equal(editor.redo(), false, "nothing left to redo");
});

test("Enter undoes and redoes as one step that joins the lines back", () => {
  const { editor } = editorWithHistory("hello world");
  editor.moveTo(0, 5);
  editor.enter("hello world", 5, 5);
  assert.deepEqual(editor.state.lines, ["hello", " world"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["hello world"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 5 });
  editor.redo();
  assert.deepEqual(editor.state.lines, ["hello", " world"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("a Backspace that joins lines undoes and redoes as one step", () => {
  const { editor } = editorWithHistory("one\ntwo");
  editor.moveTo(1, 0);
  editor.backspaceAtStart();
  assert.deepEqual(editor.state.lines, ["onetwo"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["one", "two"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
  editor.redo();
  assert.deepEqual(editor.state.lines, ["onetwo"]);
});

test("Enter ends a typing run, so typing before and after are separate steps", () => {
  const { editor } = editorWithHistory();
  editor.edit("ab", 2);
  editor.enter("ab", 2, 2);
  editor.edit("c", 1);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["ab", ""]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["ab"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, [""]);
});

test("a / menu command is its own undo step", () => {
  const { editor } = editorWithHistory();
  editor.edit("/", 1);
  editor.refreshMenu();
  editor.pickMenu();
  const picked = [...editor.state.lines];
  assert.notDeepEqual(picked, ["/"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["/"]);
  editor.redo();
  assert.deepEqual(editor.state.lines, picked);
});

test("a command picked from the + button undoes to the line before the +", () => {
  const { editor } = editorWithHistory("text");
  editor.openMenuFromPlus(0);
  editor.pickMenu();
  editor.undo();
  assert.deepEqual(editor.state.lines, ["text"]);
});

test("a paste is its own step, apart from the typing around it", () => {
  const { editor } = editorWithHistory();
  editor.edit("a", 1);
  editor.edit("a\nb", 3, { paste: true });
  editor.edit("a\nbc", 4);
  editor.undo();
  assert.equal(editor.body(), "a\nb");
  editor.undo();
  assert.equal(editor.body(), "a");
});

test("typing after an undo drops the redo steps", () => {
  const { editor, timer } = editorWithHistory();
  editor.edit("a", 1);
  timer.pause();
  editor.edit("ab", 2);
  editor.undo();
  editor.edit("ax", 2);
  assert.equal(editor.redo(), false);
  assert.deepEqual(editor.state.lines, ["ax"]);
});

test("undoing reports the change like typing does, so it is saved", () => {
  const { editor, changes } = editorWithHistory();
  editor.edit("a", 1);
  editor.undo();
  assert.equal(changes[changes.length - 1], "");
  editor.redo();
  assert.equal(changes[changes.length - 1], "a");
});

test("opening another note starts a fresh history", () => {
  const { editor } = editorWithHistory();
  editor.edit("a", 1);
  editor.load("other");
  assert.equal(editor.undo(), false);
  assert.deepEqual(editor.state.lines, ["other"]);
});

test("undo closes an open / menu", () => {
  const { editor } = editorWithHistory();
  editor.edit("/", 1);
  editor.refreshMenu();
  assert.ok(editor.menu);
  editor.undo();
  assert.equal(editor.menu, null);
});

// Formatting shortcuts (#44): the session applies Ctrl+B / Ctrl+I / Ctrl+E to
// the focused line's selection, keeps the words selected and records one undo
// step per press.

test("Ctrl+B on a selection makes it bold and keeps it selected", () => {
  const { editor, changes } = editorWithHistory("the key idea");
  const selection = editor.format("bold", "the key idea", 4, 7);
  assert.deepEqual(editor.state.lines, ["the **key** idea"]);
  assert.deepEqual(selection, { start: 6, end: 9 });
  assert.equal(changes[changes.length - 1], "the **key** idea");
});

test("one formatting shortcut press is one undo step", () => {
  const { editor } = editorWithHistory("ab");
  editor.edit("abc", 3);
  editor.format("bold", "abc", 0, 3);
  editor.format("italic", "**abc**", 2, 5);
  assert.deepEqual(editor.state.lines, ["***abc***"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["**abc**"]);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["abc"]);
});

test("Ctrl+B with nothing selected, typing, then Ctrl+B again carries on plain", () => {
  const { editor } = editorWithHistory("");
  assert.deepEqual(editor.format("bold", "", 0, 0), { start: 2, end: 2 });
  assert.deepEqual(editor.state.lines, ["****"]);
  editor.edit("**hi**", 4);
  assert.deepEqual(editor.format("bold", "**hi**", 4, 4), { start: 6, end: 6 });
  editor.edit("**hi** there", 12);
  assert.deepEqual(editor.state.lines, ["**hi** there"]);
});

test("stepping out of bold changes no text and records no undo step", () => {
  const { editor, changes } = editorWithHistory("**hi**");
  const before = changes.length;
  editor.format("bold", "**hi**", 4, 4);
  assert.equal(changes.length, before);
  assert.equal(editor.undo(), false);
});

test("Ctrl+B in a code block changes nothing", () => {
  const { editor } = editorWithHistory("```\ncode\n```");
  editor.moveTo(1, 0);
  assert.equal(editor.format("bold", "```\ncode\n```", 4, 8), null);
  assert.deepEqual(editor.state.lines, ["```", "code", "```"]);
  assert.equal(editor.undo(), false);
});

// Enter and Shift+Enter inside bold, italic and code (#45).

function enterAt(body, col, shift = false) {
  const { editor } = editorWithHistory(body);
  editor.moveTo(0, col);
  if (shift) editor.lineBreak(body, col, col);
  else editor.enter(body, col, col);
  return editor;
}

test("Enter at the end of bold jumps past the closing marks without a new line", () => {
  const editor = enterAt("**key**", 5);
  assert.deepEqual(editor.state.lines, ["**key**"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 7 });
});

test("Enter in the middle of bold jumps to the end instead of splitting", () => {
  const editor = enterAt("**key**", 4);
  assert.deepEqual(editor.state.lines, ["**key**"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 7 });
});

test("Enter in bold italic and in nested formatting jumps past the outermost pair", () => {
  assert.deepEqual(enterAt("***both***", 6).state.focus, { line: 0, col: 10 });
  assert.deepEqual(enterAt("**bold _it_** x", 10).state.focus, { line: 0, col: 13 });
});

test("a second Enter after leaving the formatting makes the new line", () => {
  const editor = enterAt("**key**", 5);
  editor.enter("**key**", 7, 7);
  assert.deepEqual(editor.state.lines, ["**key**", ""]);
});

test("Enter outside formatting still splits and continues lists", () => {
  assert.deepEqual(enterAt("**key** more", 12).state.lines, ["**key** more", ""]);
  assert.deepEqual(enterAt("- **key** a", 11).state.lines, ["- **key** a", "- "]);
});

test("Enter inside inline code steps out past the closing backtick", () => {
  assert.deepEqual(enterAt("`code`", 3).state.focus, { line: 0, col: 6 });
});

test("Enter inside a fenced code block still adds a line", () => {
  const { editor } = editorWithHistory("```\n**a**\n```");
  editor.moveTo(1, 3);
  editor.enter("**a**", 3, 3);
  assert.equal(editor.state.lines.length, 4);
});

test("Shift+Enter at the end of bold closes and reopens the marks on the new line", () => {
  const editor = enterAt("**key**", 5, true);
  assert.deepEqual(editor.state.lines, ["**key**", "****"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 2 });
});

test("Shift+Enter in the middle of bold keeps both halves bold", () => {
  const editor = enterAt("**key**", 4, true);
  assert.deepEqual(editor.state.lines, ["**ke**", "**y**"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 2 });
});

test("Shift+Enter in bold italic carries both marks", () => {
  const editor = enterAt("***both***", 7, true);
  assert.deepEqual(editor.state.lines, ["***bo***", "***th***"]);
});

test("Shift+Enter leaves a list item's start alone", () => {
  const editor = enterAt("- **key**", 7, true);
  assert.deepEqual(editor.state.lines, ["- **key**", "****"]);
});

test("Shift+Enter outside formatting is left to the browser", () => {
  const { editor } = editorWithHistory("plain");
  assert.equal(editor.lineBreak("plain", 3, 3), false);
  assert.deepEqual(editor.state.lines, ["plain"]);
});

test("Shift+Enter inside formatting undoes as one step", () => {
  const editor = enterAt("**key**", 4, true);
  editor.undo();
  assert.deepEqual(editor.state.lines, ["**key**"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 4 });
});
