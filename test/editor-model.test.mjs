import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
  splitIntoBlocks,
  blocksToText,
  blockRanges,
  linesOutsideCode,
  pressEnter,
  pressBackspace,
  insertText,
  renderedToRaw,
  renderLineHtml,
  linkAtRendered,
  findLinks,
  SLASH_COMMANDS,
  slashQuery,
  filterCommands,
  applySlashCommand,
  focusedLineSpans,
  toggleFormat,
  toggleCheckbox,
  listNumbers,
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

// #27: Backspace must never glue a line to a ``` fence. At the start of a code
// block it only moves the caret to the end of the line above; both fences stay.

test("Backspace at the start of a code block leaves the fence intact", () => {
  const lines = ["text", "```", "code", "```"];
  assert.deepEqual(pressBackspace(lines, 1, 0), {
    lines: ["text", "```", "code", "```"],
    line: 0,
    col: 4,
  });
});

test("Backspace on the line after a closing fence doesn't merge into the fence", () => {
  const lines = ["```", "code", "```", "after"];
  assert.deepEqual(pressBackspace(lines, 3, 0), {
    lines: ["```", "code", "```", "after"],
    line: 2,
    col: 3,
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
  // "- item" draws as "•item": the "•" is drawn offset 0, "item" offsets 1..5.
  // Clicking on the dot (0) or just before "i" (1) both land at content start.
  assert.equal(renderedToRaw("- item", 0), 2);
  assert.equal(renderedToRaw("- item", 1), 2);
  // After "m" (drawn offset 5) -> raw 6, the end of the line.
  assert.equal(renderedToRaw("- item", 5), 6);
});

test("a bullet draws the • as one character shared by drawing and mapping", () => {
  // The drawn "•" is a real character in the rendered line, so the same shared
  // description both draws it and counts it when mapping a click back — #30, the
  // bug where the "•" was drawn but not counted, putting the caret one off.
  assert.equal(
    renderLineHtml("- item"),
    '<span class="md-bullet"><span class="md-bullet-dot">•</span>item</span>',
  );
});

test("a bullet carrying a Link renders and maps from the same description", () => {
  // "- see [[Flow]]" draws as "•see Flow": "•"=0, "see "=1..4, "Flow"=5..8.
  assert.equal(linkAtRendered("- see [[Flow]]", 6), "Flow");
  // The space between the dot and "see" is drawn text, so a click there is a
  // caret, not a Link.
  assert.equal(linkAtRendered("- see [[Flow]]", 1), null);
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

test("a quote line renders without its > and escapes HTML", () => {
  assert.equal(
    renderLineHtml("> a < b"),
    '<span class="md-quote">a &lt; b</span>',
  );
});

test("a caret in a rendered quote maps past the > marker", () => {
  assert.equal(renderedToRaw("> Hello", 0), 2);
  assert.equal(renderedToRaw("> Hello", 5), 7);
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

test("linkAtRendered reports the Link under a drawn position, else null", () => {
  // "go [[Box]] end" draws as "go Box end": "go "=0..2, "Box"=3..5, " end"=6..9.
  assert.equal(linkAtRendered("go [[Box]] end", 0), null);
  assert.equal(linkAtRendered("go [[Box]] end", 3), "Box");
  assert.equal(linkAtRendered("go [[Box]] end", 5), "Box");
  // The drawn position just after the title is already the following text.
  assert.equal(linkAtRendered("go [[Box]] end", 6), null);
  // Bold is drawn text, not a Link.
  assert.equal(linkAtRendered("a **b** c", 2), null);
});

// The `/` command menu (#6, ADR 0006). Typing `/` at the start of a line opens
// a menu whose commands each show their Markdown; typing filters it; applying a
// command drops the Markdown in with the caret in the right place.

test('typing "/he" opens the menu filtered to the three headings', () => {
  const query = slashQuery("/head", 5);
  assert.equal(query, "head");
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

test("applying Code block keeps the text after the caret inside the block", () => {
  const code = SLASH_COMMANDS.find((c) => c.label === "Code block");
  assert.deepEqual(applySlashCommand(["/code hello"], 0, 5, code), {
    lines: ["```", " hello", "```"],
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

test("*a* and _a_ render as italic with hidden markers", () => {
  assert.equal(renderLineHtml("*a*"), "<em>a</em>");
  assert.equal(renderLineHtml("say _a_ now"), "say <em>a</em> now");
});

test("***a*** is bold and italic, and bold can hold italic", () => {
  assert.equal(renderLineHtml("***a***"), "<strong><em>a</em></strong>");
  assert.equal(
    renderLineHtml("**bold _and italic_**"),
    "<strong>bold </strong><strong><em>and italic</em></strong>",
  );
});

test("snake_case and 2*3 stay plain text", () => {
  assert.equal(renderLineHtml("snake_case_name"), "snake_case_name");
  assert.equal(renderLineHtml("2*3 and 4*5"), "2*3 and 4*5");
});

test("a caret inside italic text maps past the markers", () => {
  // "a *b* c": drawn "a b c"; before "b" (drawn 2) -> raw 3; after it (3) -> raw 5.
  assert.equal(renderedToRaw("a *b* c", 2), 3);
  assert.equal(renderedToRaw("a *b* c", 3), 5);
  assert.equal(renderedToRaw("***b*** c", 0), 3);
});

test("the / menu lists Italic and applies it with the caret in the middle", () => {
  const italic = SLASH_COMMANDS.find((c) => c.label === "Italic");
  assert.equal(italic.markdown, "*italic*");
  assert.deepEqual(applySlashCommand(["/i rest"], 0, 2, italic), {
    lines: ["** rest"],
    line: 0,
    col: 1,
  });
});

// The line you're on is styled while you type (ADR 0006 addition, #37): its
// marks stay visible but faded, so the drawn text is exactly the raw line and a
// caret offset in it is a raw offset. focusedLineSpans splits the raw line into
// "mark" and "text" parts for drawing.

const joined = (spans) => spans.parts.map((part) => part.text).join("");

test("typing ## makes the line a heading at once, with ## as a faded mark", () => {
  const spans = focusedLineSpans("## ");
  assert.equal(spans.kind, "heading");
  assert.equal(spans.level, 2);
  assert.deepEqual(spans.parts, [{ type: "mark", text: "## " }]);
});

test("a focused heading keeps its text after the mark, joining back to the raw line", () => {
  const spans = focusedLineSpans("# Box **model**");
  assert.equal(spans.level, 1);
  assert.deepEqual(spans.parts, [
    { type: "mark", text: "# " },
    { type: "text", text: "Box " },
    { type: "mark", text: "**" },
    { type: "text", text: "model", bold: true },
    { type: "mark", text: "**" },
  ]);
  assert.equal(joined(spans), "# Box **model**");
});

test("a focused bullet and a numbered item show their marker as a mark", () => {
  assert.deepEqual(focusedLineSpans("  - item"), {
    kind: "list",
    parts: [
      { type: "mark", text: "  - " },
      { type: "text", text: "item" },
    ],
  });
  assert.deepEqual(focusedLineSpans("1. first"), {
    kind: "list",
    parts: [
      { type: "mark", text: "1. " },
      { type: "text", text: "first" },
    ],
  });
});

test("a focused quote shows its > as a mark", () => {
  const spans = focusedLineSpans("> wise words");
  assert.equal(spans.kind, "quote");
  assert.deepEqual(spans.parts, [
    { type: "mark", text: "> " },
    { type: "text", text: "wise words" },
  ]);
});

test("a focused code fence shows its ``` as a mark and keeps the language", () => {
  const spans = focusedLineSpans("```js");
  assert.equal(spans.kind, "fence");
  assert.deepEqual(spans.parts, [
    { type: "mark", text: "```" },
    { type: "text", text: "js" },
  ]);
});

test("a focused plain line is one text part, and an empty line has no parts", () => {
  assert.deepEqual(focusedLineSpans("just #text"), {
    kind: "plain",
    parts: [{ type: "text", text: "just #text" }],
  });
  assert.deepEqual(focusedLineSpans(""), { kind: "plain", parts: [] });
});

test("half-typed marks stay plain until they are complete", () => {
  assert.equal(focusedLineSpans("##").kind, "plain");
  assert.equal(focusedLineSpans("-item").kind, "plain");
  assert.equal(focusedLineSpans(">quote").kind, "plain");
  assert.equal(focusedLineSpans("####### too deep").kind, "plain");
});

test("every focused line's parts join back to exactly the raw line", () => {
  for (const line of ["### a < b", "- ", "	- tabbed", "12. twelve", ">  two spaces", "```", "plain"]) {
    assert.equal(joined(focusedLineSpans(line)), line);
  }
});

// Inline formatting on the line you're on (#38): bold, italic, code and links
// are styled once closed, with every mark faded, by the same rules as the
// rendered lines.

test("closing ** makes the word bold on the focused line, its marks faded", () => {
  assert.deepEqual(focusedLineSpans("a **key** b").parts, [
    { type: "text", text: "a " },
    { type: "mark", text: "**" },
    { type: "text", text: "key", bold: true },
    { type: "mark", text: "**" },
    { type: "text", text: " b" },
  ]);
});

test("*italic* and _italic_ are italic on the focused line", () => {
  assert.deepEqual(focusedLineSpans("*a* _b_").parts, [
    { type: "mark", text: "*" },
    { type: "text", text: "a", italic: true },
    { type: "mark", text: "*" },
    { type: "text", text: " " },
    { type: "mark", text: "_" },
    { type: "text", text: "b", italic: true },
    { type: "mark", text: "_" },
  ]);
});

test("***both*** is bold and italic on the focused line", () => {
  assert.deepEqual(focusedLineSpans("***both***").parts, [
    { type: "mark", text: "***" },
    { type: "text", text: "both", bold: true, italic: true },
    { type: "mark", text: "***" },
  ]);
});

test("`code` is code on the focused line, its backticks faded", () => {
  assert.deepEqual(focusedLineSpans("- run `ls`").parts, [
    { type: "mark", text: "- " },
    { type: "text", text: "run " },
    { type: "mark", text: "`" },
    { type: "text", text: "ls", code: true },
    { type: "mark", text: "`" },
  ]);
});

test("a [text](url) link shows its text as a link and its brackets and address as marks", () => {
  assert.deepEqual(focusedLineSpans("see [MDN](https://mdn.io) now").parts, [
    { type: "text", text: "see " },
    { type: "mark", text: "[" },
    { type: "text", text: "MDN", url: "https://mdn.io" },
    { type: "mark", text: "](https://mdn.io)" },
    { type: "text", text: " now" },
  ]);
});

test("a [[Link]] on the focused line shows its title as a Link", () => {
  assert.deepEqual(focusedLineSpans("[[Flow]]").parts, [
    { type: "mark", text: "[[" },
    { type: "text", text: "Flow", link: true },
    { type: "mark", text: "]]" },
  ]);
});

test("half-typed inline formatting stays plain on the focused line", () => {
  for (const line of ["**word", "*word", "`code", "[text](url", "[text]", "snake_case_name", "2*3 and 4*5"]) {
    assert.deepEqual(focusedLineSpans(line).parts, [{ type: "text", text: line }]);
  }
});

test("focused lines with inline formatting join back to exactly the raw line", () => {
  for (const line of ["# **a** _b_ `c`", "> [x](y) [[Z]]", "- ***q*** **bold _and italic_**", "```js"]) {
    assert.equal(joined(focusedLineSpans(line)), line);
  }
});

test("a [text](url) link renders as its text on other lines", () => {
  assert.equal(
    renderLineHtml("see [MDN](https://mdn.io)"),
    'see <span class="md-url" title="https://mdn.io">MDN</span>',
  );
});

// Formatting shortcuts (#44): Ctrl+B / Ctrl+I / Ctrl+E on a selection, or on
// the caret when nothing is selected. `at` makes a (line, col) position.
const at = (line, col) => ({ line, col });

function format(lines, start, end, kind) {
  return toggleFormat(lines, start, end, kind);
}

test("Ctrl+B wraps the selected words in bold marks", () => {
  const result = format(["the key idea"], at(0, 4), at(0, 7), "bold");
  assert.deepEqual(result.lines, ["the **key** idea"]);
});

test("Ctrl+I and Ctrl+E wrap the selection in italic and code marks", () => {
  assert.deepEqual(format(["a word"], at(0, 2), at(0, 6), "italic").lines, ["a *word*"]);
  assert.deepEqual(format(["run npm now"], at(0, 4), at(0, 7), "code").lines, ["run `npm` now"]);
});

test("the same words stay selected after formatting", () => {
  const result = format(["the key idea"], at(0, 4), at(0, 7), "bold");
  assert.deepEqual(result.start, at(0, 6));
  assert.deepEqual(result.end, at(0, 9));
});

test("Ctrl+B then Ctrl+I on the same words gives bold and italic", () => {
  const bold = format(["both"], at(0, 0), at(0, 4), "bold");
  const both = format(bold.lines, bold.start, bold.end, "italic");
  assert.deepEqual(both.lines, ["***both***"]);
  assert.deepEqual([both.start, both.end], [at(0, 3), at(0, 7)]);
});

test("Ctrl+B on an all-bold selection removes the bold", () => {
  const result = format(["the **key** idea"], at(0, 6), at(0, 9), "bold");
  assert.deepEqual(result.lines, ["the key idea"]);
  assert.deepEqual([result.start, result.end], [at(0, 4), at(0, 7)]);
});

test("removing bold from words inside a bold run keeps the rest bold", () => {
  const result = format(["**the key idea**"], at(0, 6), at(0, 9), "bold");
  assert.deepEqual(result.lines, ["**the** key **idea**"]);
});

test("a partly bold selection becomes all bold with no leftover inner marks", () => {
  const result = format(["the **key** idea"], at(0, 0), at(0, 16), "bold");
  assert.deepEqual(result.lines, ["**the key idea**"]);
});

test("a selection reaching into a bold run joins it", () => {
  const result = format(["the **key** idea"], at(0, 6), at(0, 16), "bold");
  assert.deepEqual(result.lines, ["the **key idea**"]);
});

test("removing bold keeps italic inside it", () => {
  const result = format(["**a *b* c**"], at(0, 2), at(0, 9), "bold");
  assert.deepEqual(result.lines, ["a *b* c"]);
});

test("spaces at the edges of a selection stay outside the marks", () => {
  const result = format(["the key idea"], at(0, 3), at(0, 8), "bold");
  assert.deepEqual(result.lines, ["the **key** idea"]);
});

test("with nothing selected, Ctrl+B inserts an empty pair with the caret inside", () => {
  const result = format(["say "], at(0, 4), at(0, 4), "bold");
  assert.deepEqual(result.lines, ["say ****"]);
  assert.deepEqual([result.start, result.end], [at(0, 6), at(0, 6)]);
});

test("a second Ctrl+B just before the closing marks steps past them", () => {
  const empty = format(["****"], at(0, 2), at(0, 2), "bold");
  assert.deepEqual(empty.lines, ["****"]);
  assert.deepEqual(empty.start, at(0, 4));
  const typed = format(["say **hi**"], at(0, 8), at(0, 8), "bold");
  assert.deepEqual(typed.lines, ["say **hi**"]);
  assert.deepEqual(typed.end, at(0, 10));
});

test("a second Ctrl+I or Ctrl+E steps out of an empty or typed pair", () => {
  assert.deepEqual(format(["**"], at(0, 1), at(0, 1), "italic").start, at(0, 2));
  assert.deepEqual(format(["*hi*"], at(0, 3), at(0, 3), "italic").start, at(0, 4));
  assert.deepEqual(format(["``"], at(0, 1), at(0, 1), "code").start, at(0, 2));
});

test("Ctrl+I inside an empty bold pair turns on italic too", () => {
  const result = format(["****"], at(0, 2), at(0, 2), "italic");
  assert.deepEqual(result.lines, ["******"]);
  assert.deepEqual(result.start, at(0, 3));
});

test("a multi-line selection gets marks on each line, line starts outside", () => {
  const lines = ["- one", "## two", "", "> three", "1. four"];
  const result = format(lines, at(0, 0), at(4, 7), "bold");
  assert.deepEqual(result.lines, [
    "- **one**",
    "## **two**",
    "",
    "> **three**",
    "1. **four**",
  ]);
  assert.deepEqual([result.start, result.end], [at(0, 4), at(4, 9)]);
});

test("a multi-line selection that is all bold loses the bold on every line", () => {
  const result = format(["- **one**", "- **two**"], at(0, 2), at(1, 9), "bold");
  assert.deepEqual(result.lines, ["- one", "- two"]);
});

test("Ctrl+B and Ctrl+I in a code block change nothing", () => {
  const lines = ["```", "let a = 1", "```"];
  assert.deepEqual(format(lines, at(1, 0), at(1, 9), "bold").lines, lines);
  assert.deepEqual(format(lines, at(1, 3), at(1, 3), "italic").lines, lines);
});

test("Ctrl+B inside inline code changes nothing", () => {
  const lines = ["run `npm install` now"];
  assert.deepEqual(format(lines, at(0, 5), at(0, 8), "bold").lines, lines);
  assert.deepEqual(format(lines, at(0, 6), at(0, 6), "bold").lines, lines);
});

test("Ctrl+E on text that is already inline code removes it", () => {
  const result = format(["run `npm` now"], at(0, 5), at(0, 8), "code");
  assert.deepEqual(result.lines, ["run npm now"]);
  assert.deepEqual([result.start, result.end], [at(0, 4), at(0, 7)]);
});

test("a selection that includes code skips the code and formats the rest", () => {
  const result = format(["run `npm` now"], at(0, 0), at(0, 13), "bold");
  assert.deepEqual(result.lines, ["**run** `npm` **now**"]);
});

// Numbered lists and checkboxes (#110)

test("Enter on a numbered item continues the list with the next number", () => {
  const result = pressEnter(["1. one"], 0, 6);
  assert.deepEqual(result.lines, ["1. one", "2. "]);
  assert.deepEqual({ line: result.line, col: result.col }, { line: 1, col: 3 });
  assert.deepEqual(pressEnter(["7. seven"], 0, 8).lines, ["7. seven", "8. "]);
});

test("Enter on an empty numbered item ends the list", () => {
  const result = pressEnter(["1. one", "2. "], 1, 3);
  assert.deepEqual(result.lines, ["1. one", ""]);
  assert.equal(result.col, 0);
});

test("Backspace at the start of a numbered item removes its marker", () => {
  const result = pressBackspace(["12. words"], 0, 4);
  assert.deepEqual(result.lines, ["words"]);
  assert.equal(result.col, 0);
});

test("Enter on a checkbox item starts a new empty unticked one", () => {
  assert.deepEqual(pressEnter(["- [x] done"], 0, 10).lines, ["- [x] done", "- [ ] "]);
  assert.deepEqual(pressEnter(["- [ ] todo"], 0, 10).col, 6);
});

test("Enter on an empty checkbox item ends the list", () => {
  assert.deepEqual(pressEnter(["- [ ] a", "- [ ] "], 1, 6).lines, ["- [ ] a", ""]);
});

test("Backspace at the start of a checkbox item removes the whole marker", () => {
  const result = pressBackspace(["- [x] words"], 0, 6);
  assert.deepEqual(result.lines, ["words"]);
});

test("ticking turns - [ ] into - [x] and back", () => {
  assert.deepEqual(toggleCheckbox(["- [ ] a", "b"], 0), ["- [x] a", "b"]);
  assert.deepEqual(toggleCheckbox(["  - [x] a"], 0), ["  - [ ] a"]);
  assert.deepEqual(toggleCheckbox(["- [X] a"], 0), ["- [ ] a"]);
  assert.deepEqual(toggleCheckbox(["- a"], 0), ["- a"]);
});

test("numbered items are numbered by their order, whatever the file holds", () => {
  const lines = ["1. a", "1. b", "text", "5. c", "   ", "9. d", "- [ ] x", "3. e"];
  assert.deepEqual(listNumbers(lines), [1, 2, null, 1, null, 1, null, 1]);
});

test("a numbered line is drawn with its number, a checkbox with a box", () => {
  assert.match(renderLineHtml("4. hi", undefined, 2), /class="md-number" data-number="2"/);
  assert.match(renderLineHtml("- [ ] hi"), /md-check-box/);
  assert.doesNotMatch(renderLineHtml("- [ ] hi"), /md-check-done/);
  assert.match(renderLineHtml("- [x] hi"), /md-check-done/);
  assert.match(renderLineHtml("- [x] hi"), />hi</);
});

test("the slash menu offers Numbered list and Checkbox list", () => {
  const numbered = SLASH_COMMANDS.find((c) => c.label === "Numbered list");
  assert.equal(applySlashCommand([""], 0, 0, numbered).lines[0], "1. ");
  const check = SLASH_COMMANDS.find((c) => c.label === "Checkbox list");
  const result = applySlashCommand(["/"], 0, 1, check);
  assert.deepEqual(result.lines, ["- [ ] "]);
  assert.equal(result.col, 6);
});

test("clicking a numbered or checkbox marker puts the caret at the text start", () => {
  assert.equal(renderedToRaw("3. hi", 0), 3);
  assert.equal(renderedToRaw("- [ ] hi", 1), 7);
});

test("the lines outside code blocks are every line but a fenced block's", () => {
  const lines = ["# One", "```", "# not a heading", "```", "two", "```", "never closed"];
  assert.deepEqual(linesOutsideCode(lines), [0, 4]);
});
