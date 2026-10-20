import { test } from "node:test";
import assert from "node:assert/strict";
import { splitIntoLines, SLASH_COMMANDS, applySlashCommand } from "../src/editor-model.mjs";
import { isPageBreak, pagesOf, pageOfLine, removePageBreak, addPage, removePage, lineOfSearch } from "../src/pages.mjs";
import { createEditorSession } from "../src/editor-session.mjs";

const lines = (body) => splitIntoLines(body);

test("a note without page breaks is one page", () => {
  assert.deepEqual(pagesOf(lines("# Title\nSome text")), [{ start: 0, end: 2 }]);
});

test("a body splits into pages at each page break line", () => {
  const body = "one\ntwo\n%%page%%\nthree\n%%page%%\nfour\nfive";
  assert.deepEqual(pagesOf(lines(body)), [
    { start: 0, end: 2 },
    { start: 3, end: 4 },
    { start: 5, end: 7 },
  ]);
});

test("a %%page%% inside a code block is code, not a page break", () => {
  const body = "one\n```\n%%page%%\n```\ntwo";
  assert.deepEqual(pagesOf(lines(body)), [{ start: 0, end: 5 }]);
  assert.equal(isPageBreak(lines(body), 2), false);
  assert.equal(isPageBreak(lines("a\n%%page%%"), 1), true);
});

test("a break with nothing after it, or two breaks in a row, make no empty page", () => {
  assert.deepEqual(pagesOf(lines("%%page%%\none\n%%page%%\n%%page%%\ntwo\n%%page%%")), [
    { start: 1, end: 2 },
    { start: 4, end: 5 },
  ]);
});

test("the page of a line counts from 0, and a break belongs to the page after it", () => {
  const all = lines("one\n%%page%%\ntwo\nthree\n%%page%%\nfour");
  assert.equal(pageOfLine(all, 0), 0);
  assert.equal(pageOfLine(all, 1), 1);
  assert.equal(pageOfLine(all, 3), 1);
  assert.equal(pageOfLine(all, 5), 2);
});

test("a trailing break belongs to the last page", () => {
  assert.equal(pageOfLine(lines("one\n%%page%%"), 1), 0);
});

test("the Page break command in the / menu inserts a break and moves to the new page", () => {
  const command = SLASH_COMMANDS.find((c) => c.id === "page");
  assert.equal(command.markdown, "%%page%%");
  const next = applySlashCommand(["before", "/page"], 1, 5, command);
  assert.deepEqual(next, { lines: ["before", "%%page%%", ""], line: 2, col: 0 });
});

test("removing a break joins its two pages and keeps every line", () => {
  assert.deepEqual(removePageBreak(lines("one\n%%page%%\ntwo"), 1), ["one", "two"]);
});

test("adding a page puts a break and an empty first line at the end", () => {
  assert.deepEqual(addPage(["one"]), { lines: ["one", "%%page%%", ""], line: 2 });
});

test("Backspace at the start of a page's first line removes the break, not joining it", () => {
  const editor = createEditorSession();
  editor.load("one\n%%page%%\ntwo");
  editor.moveTo(2, 0);
  assert.equal(editor.backspaceAtStart(), true);
  assert.deepEqual(editor.state.lines, ["one", "two"]);
  assert.deepEqual(editor.state.focus, { line: 1, col: 0 });
});

test("Delete at the end of a page's last line removes the break after it", () => {
  const editor = createEditorSession();
  editor.load("one\n%%page%%\ntwo");
  editor.moveTo(0, 3);
  assert.equal(editor.deleteAtEnd(), true);
  assert.deepEqual(editor.state.lines, ["one", "two"]);
  assert.deepEqual(editor.state.focus, { line: 0, col: 3 });
});

test("with notes as pages, up from the top of a page goes to the end of the page before", () => {
  const editor = createEditorSession({ pagesOn: () => true });
  editor.load("one\n%%page%%\ntwo");
  editor.moveTo(2, 0);
  assert.equal(editor.moveUp("two", 0), true);
  assert.deepEqual(editor.state.focus, { line: 0, col: 3 });
});

test("with notes as pages, down from the end of a page goes to the start of the next", () => {
  const editor = createEditorSession({ pagesOn: () => true });
  editor.load("one\n%%page%%\ntwo");
  assert.equal(editor.moveDown("one", 3), true);
  assert.deepEqual(editor.state.focus, { line: 2, col: 0 });
});

test("with all pages shown, up and down stop on the break line like any line", () => {
  const editor = createEditorSession();
  editor.load("one\n%%page%%\ntwo");
  editor.moveTo(2, 0);
  editor.moveUp("two", 0);
  assert.deepEqual(editor.state.focus, { line: 1, col: 8 });
});

test("a new page is added at the end, with the caret on its first line, and saved", () => {
  const changes = [];
  const editor = createEditorSession({ onChange: (body) => changes.push(body) });
  editor.load("one");
  editor.newPage();
  assert.deepEqual(editor.state.lines, ["one", "%%page%%", ""]);
  assert.deepEqual(editor.state.focus, { line: 2, col: 0 });
  assert.equal(changes.at(-1), "one\n%%page%%\n");
  assert.equal(editor.undo(), true);
  assert.deepEqual(editor.state.lines, ["one"]);
});

test("a search inside notes opens on the first line holding one of its words", () => {
  const all = lines("Intro\n%%page%%\nThe Box Model\n%%page%%\nflexbox");
  assert.equal(lineOfSearch(all, "//box"), 2);
  assert.equal(lineOfSearch(all, "// model flex"), 2);
  assert.equal(lineOfSearch(all, "//FLEXBOX"), 4);
});

test("a title search, or a word not found, opens at the top", () => {
  const all = lines("Intro\n%%page%%\nbox");
  assert.equal(lineOfSearch(all, "box"), 0);
  assert.equal(lineOfSearch(all, "//grid"), 0);
});

test("deleting a page takes out its lines and the break before it", () => {
  const result = removePage(lines("one\n%%page%%\ntwo\nmore\n%%page%%\nthree"), 1);
  assert.deepEqual(result.lines, ["one", "%%page%%", "three"]);
  assert.equal(result.line, 0);
});

test("deleting the first page takes out the break after it", () => {
  const result = removePage(lines("one\n%%page%%\ntwo"), 0);
  assert.deepEqual(result.lines, ["two"]);
  assert.equal(result.line, 0);
});

test("the only page of a note can't be deleted", () => {
  assert.equal(removePage(lines("one\ntwo"), 0), null);
});

test("deleting a page can be undone", () => {
  const editor = createEditorSession();
  editor.load("one\n%%page%%\ntwo");
  editor.moveTo(2, 0);
  editor.deletePage();
  assert.equal(editor.body(), "one");
  assert.deepEqual(editor.state.focus, { line: 0, col: 0 });
  editor.undo();
  assert.equal(editor.body(), "one\n%%page%%\ntwo");
});

test("deleting the first page leaves no page break at the top", () => {
  const result = removePage(lines("%%page%%\none\n%%page%%\ntwo"), 0);
  assert.deepEqual(result.lines, ["two"]);
});
