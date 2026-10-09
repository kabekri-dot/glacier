import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
  splitIntoBlocks,
  blocksToText,
  blockRanges,
  pressEnter,
  pressBackspace,
  insertText,
  renderedToRaw,
  renderLineHtml,
  findLinks,
  SLASH_COMMANDS,
  slashQuery,
  filterCommands,
  applySlashCommand,
} from "../src/editor-model.mjs";

// The editor model is the second test seam: pure functions on one note's
// text, with no DOM — the round trip, Enter/Backspace, paste, raw-offset
// mapping, Links and the `/` command menu.

test("splitting a note into lines and joining back gives the same text", () => {
  const text = "# Title\n\n- one\n- two\nplain line";
  assert.deepEqual(splitIntoLines(text), [
    "# Title",
    "",
    "- one",
    "- two",
    "plain line",
  ]);
  assert.equal(linesToText(splitIntoLines(text)), text);
});

// The panel reads the editable note with innerText (which, unlike textContent,
// reflects the line breaks Enter creates) and saves the result as the body.
// editorTextToBody is that DOM-free seam, so the save path is tested without a
// browser (issue #24).

test("the edited text becomes the saved body with its line breaks intact", () => {
  assert.equal(editorTextToBody("line one\nline two"), "line one\nline two");
});

test("an empty line in the edited text stays an empty line in the body", () => {
  assert.equal(editorTextToBody("# Title\n\nbody"), "# Title\n\nbody");
});

test("platform line breaks are normalized to \\n so the body is the same everywhere", () => {
  assert.equal(editorTextToBody("line one\r\nline two\rline three"), "line one\nline two\nline three");
});

test("the saved body round-trips back through the editor's lines", () => {
  const body = editorTextToBody("# Title\n\n- one\n- two\nplain line");
  assert.equal(linesToText(splitIntoLines(body)), body);
});

// Blocks (ADR 0006): one per line, except a fenced ``` code block, which stays
// together as one block so the whole thing is edited and rendered as a unit.

test("most lines are their own block, and the blocks join back to the text", () => {
  const text = "# Title\n\nplain line";
  assert.deepEqual(splitIntoBlocks(text), ["# Title", "", "plain line"]);
  assert.equal(blocksToText(splitIntoBlocks(text)), text);
});

test("a fenced code block stays one block", () => {
  const text = "before\n```js\nconst a = 1;\nconst b = 2;\n```\nafter";
  assert.deepEqual(splitIntoBlocks(text), [
    "before",
    "```js\nconst a = 1;\nconst b = 2;\n```",
    "after",
  ]);
  assert.equal(blocksToText(splitIntoBlocks(text)), text);
});

test("an unterminated code fence runs to the end as one block", () => {
  const text = "intro\n```\nstill code\nmore code";
  assert.deepEqual(splitIntoBlocks(text), [
    "intro",
    "```\nstill code\nmore code",
  ]);
  assert.equal(blocksToText(splitIntoBlocks(text)), text);
});

test("block ranges give the line span of each block", () => {
  const lines = splitIntoLines("a\n```\ncode\n```\nb");
  assert.deepEqual(blockRanges(lines), [
    { start: 0, end: 1 },
    { start: 1, end: 4 },
    { start: 4, end: 5 },
  ]);
});

// Enter: split the current line, continue a list, end the list on an empty
// bullet. The model returns the new lines and where the caret should land.

test("Enter splits the current line in two, caret at the start of the new line", () => {
  const lines = ["hello world"];
  assert.deepEqual(pressEnter(lines, 0, 5), {
    lines: ["hello", " world"],
    line: 1,
    col: 0,
  });
});

test("Enter in a bullet continues the list with a fresh marker", () => {
  const lines = ["- one"];
  assert.deepEqual(pressEnter(lines, 0, 5), {
    lines: ["- one", "- "],
    line: 1,
    col: 2,
  });
});

test("Enter keeps the indent when continuing a nested bullet", () => {
  const lines = ["  - deep"];
  const after = pressEnter(lines, 0, 8);
  assert.deepEqual(after.lines, ["  - deep", "  - "]);
  assert.equal(after.col, 4);
});

test("Enter on an empty bullet ends the list, leaving a blank line", () => {
  const lines = ["- one", "- "];
  assert.deepEqual(pressEnter(lines, 1, 2), {
    lines: ["- one", ""],
    line: 1,
    col: 0,
  });
});

// Backspace: at the start of a line, join it with the line above; otherwise
// delete the character before the caret.

test("Backspace at the start of a line joins it with the line above", () => {
  const lines = ["hello", "world"];
  assert.deepEqual(pressBackspace(lines, 1, 0), {
    lines: ["helloworld"],
    line: 0,
    col: 5,
  });
});

test("Backspace mid-line deletes the character before the caret", () => {
  const lines = ["hello"];
  assert.deepEqual(pressBackspace(lines, 0, 3), {
    lines: ["helo"],
    line: 0,
    col: 2,
  });
});

test("Backspace at the very start of the note does nothing", () => {
  const lines = ["hello"];
  assert.deepEqual(pressBackspace(lines, 0, 0), {
    lines: ["hello"],
    line: 0,
    col: 0,
  });
});

// Pasting: one line stays inline; several lines become several lines.

test("inserting plain text with no break stays on one line", () => {
  assert.deepEqual(insertText(["a c"], 0, 2, "b"), {
    lines: ["a bc"],
    line: 0,
    col: 3,
  });
});

test("pasting several lines splits the current line into several lines", () => {
  assert.deepEqual(insertText(["start end"], 0, 6, "one\ntwo\nthree"), {
    lines: ["start one", "two", "threeend"],
    line: 2,
    col: 5,
  });
});

// Mapping a caret in the rendered text back to the raw Markdown, so a click on
// the formatted line lands on the right spot once the line turns raw.

test("a caret in a rendered heading maps past the # markers", () => {
  // "## Hello": rendered text is "Hello"; caret before "H" -> raw offset 3.
  assert.equal(renderedToRaw("## Hello", 0), 3);
  assert.equal(renderedToRaw("## Hello", 5), 8);
});

test("a caret in a rendered bullet maps past the - marker", () => {
  assert.equal(renderedToRaw("- item", 0), 2);
  assert.equal(renderedToRaw("- item", 4), 6);
});

test("a caret inside bold text maps past the ** markers", () => {
  // "a **b** c": rendered "a b c". Caret before "b" (rendered 2) -> raw 4.
  assert.equal(renderedToRaw("a **b** c", 2), 4);
  // Caret after "b" (rendered 3) -> raw 7 (before the trailing space).
  assert.equal(renderedToRaw("a **b** c", 3), 7);
});

test("a caret inside inline code maps past the backticks", () => {
  // "run `x` now": rendered "run x now". Caret before "x" (rendered 4) -> raw 5.
  assert.equal(renderedToRaw("run `x` now", 4), 5);
});

// Rendering a line to HTML: markers become formatting, text is escaped.

test("a heading renders without its # markers and escapes HTML", () => {
  assert.equal(
    renderLineHtml("# a < b"),
    '<span class="md-h md-h1">a &lt; b</span>',
  );
});

test("bold and inline code render as strong and code", () => {
  assert.equal(
    renderLineHtml("say **hi** and `go`"),
    "say <strong>hi</strong> and <code>go</code>",
  );
});

// Links: [[Title]] references another note. findLinks pulls the titles (and
// their span) out of the raw text; rendering turns them into click targets,
// red when the note doesn't exist yet (a Missing Link, CONTEXT.md).

test("findLinks pulls every [[Title]] out of the text with its span", () => {
  assert.deepEqual(findLinks("see [[Box model]] and [[Flow]]"), [
    { title: "Box model", start: 4, end: 17 },
    { title: "Flow", start: 22, end: 30 },
  ]);
});

test("findLinks returns nothing when there are no Links", () => {
  assert.deepEqual(findLinks("plain text with [brackets] only"), []);
});

test("a Link renders as a click target carrying its exact title", () => {
  assert.equal(
    renderLineHtml("go to [[Box model]] now"),
    'go to <a class="md-link" data-link-title="Box model">Box model</a> now',
  );
});

test("a Missing Link renders red when the note doesn't exist yet", () => {
  const exists = (title) => title === "Flow";
  assert.equal(
    renderLineHtml("[[Flow]] vs [[Nope]]", exists),
    '<a class="md-link" data-link-title="Flow">Flow</a> vs ' +
      '<a class="md-link md-link-missing" data-link-title="Nope">Nope</a>',
  );
});

test("a caret inside a Link maps past the [[ brackets", () => {
  // "go [[Box]] end": rendered "go Box end".
  // Caret before "B" (rendered 3) -> raw 5, just inside past the `[[`.
  assert.equal(renderedToRaw("go [[Box]] end", 3), 5);
  // Caret before "x" (rendered 5) -> raw 7, still inside the title.
  assert.equal(renderedToRaw("go [[Box]] end", 5), 7);
  // Caret before " end" (rendered 6) -> raw 10, past the closing `]]`.
  assert.equal(renderedToRaw("go [[Box]] end", 6), 10);
});

// The `/` command menu (#6, ADR 0006). Typing `/` at the start of a line opens
// a menu whose commands each show their Markdown; typing filters it; applying a
// command drops the Markdown in with the caret in the right place.

test('typing "/he" opens the menu filtered to the three headings', () => {
  const query = slashQuery("/he", 3);
  assert.equal(query, "he");
  assert.deepEqual(
    filterCommands(query).map((c) => c.label),
    ["Heading 1", "Heading 2", "Heading 3"],
  );
});

test("typing / alone opens the full menu", () => {
  assert.equal(slashQuery("/", 1), "");
  assert.equal(filterCommands("").length, SLASH_COMMANDS.length);
});

test("a / in the middle of a line does not open the menu", () => {
  // Caret just after a slash that isn't at the line start.
  assert.equal(slashQuery("note 3/4", 7), null);
  // A caret before the leading slash is not in a command either.
  assert.equal(slashQuery("/he", 0), null);
});

test("filtering matches the command name anywhere, case-insensitively", () => {
  assert.deepEqual(
    filterCommands("code").map((c) => c.label),
    ["Inline code", "Code block"],
  );
});

test("every slash command shows its Markdown", () => {
  for (const command of SLASH_COMMANDS) {
    assert.ok(command.markdown.length > 0, `${command.label} has Markdown`);
  }
});

test("applying Heading 1 replaces the query and puts the caret after the #", () => {
  const h1 = SLASH_COMMANDS.find((c) => c.label === "Heading 1");
  assert.deepEqual(applySlashCommand(["/he"], 0, 3, h1), {
    lines: ["# "],
    line: 0,
    col: 2,
  });
});

test("applying Link to a note leaves the caret inside the brackets", () => {
  const link = SLASH_COMMANDS.find((c) => c.label === "Link to a note");
  assert.deepEqual(applySlashCommand(["/"], 0, 1, link), {
    lines: ["[[]]"],
    line: 0,
    col: 2,
  });
});

test("applying Code block opens a fenced block with the caret on the empty line", () => {
  const code = SLASH_COMMANDS.find((c) => c.label === "Code block");
  assert.deepEqual(applySlashCommand(["/code"], 0, 5, code), {
    lines: ["```", "", "```"],
    line: 1,
    col: 0,
  });
});

test("applying a command keeps any text after the caret on the line", () => {
  const bold = SLASH_COMMANDS.find((c) => c.label === "Bold");
  assert.deepEqual(applySlashCommand(["/b rest"], 0, 2, bold), {
    lines: ["**** rest"],
    line: 0,
    col: 2,
  });
});
