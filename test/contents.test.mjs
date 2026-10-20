import { test } from "node:test";
import assert from "node:assert/strict";
import { headingsOf } from "../src/contents.mjs";

test("the headings of a note come with their level and line number, in order", () => {
  const body = "# Title\nSome text\n## Part one\n- a bullet\n### Detail";
  assert.deepEqual(headingsOf(body), [
    { level: 1, text: "Title", line: 0 },
    { level: 2, text: "Part one", line: 2 },
    { level: 3, text: "Detail", line: 4 },
  ]);
});

test("a # inside a code block is not a heading", () => {
  const body = "# Real\n```\n# comment\n## not this\n```\n## After";
  assert.deepEqual(headingsOf(body).map((h) => h.text), ["Real", "After"]);
});

test("a # inside a code block that is never closed is not a heading", () => {
  assert.deepEqual(headingsOf("```\n# comment"), []);
});

test("a note without headings has none", () => {
  assert.deepEqual(headingsOf("just text\n#hashtag\n#### too deep"), []);
  assert.deepEqual(headingsOf(""), []);
});

test("a heading with no text yet is left out", () => {
  assert.deepEqual(headingsOf("# \n## Hello"), [{ level: 2, text: "Hello", line: 1 }]);
});
