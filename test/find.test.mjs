import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatches, firstMatchFrom, stepMatch, findStatus } from "../src/find.mjs";

test("every match of a word is found, ignoring capitals", () => {
  const lines = ["Ice and ice", "nothing", "ICE"];
  const found = findMatches(lines, "ice").map(({ line, from, to }) => [line, from, to]);
  assert.deepEqual(found, [[0, 0, 3], [0, 8, 11], [2, 0, 3]]);
});

test("an empty query finds nothing", () => {
  assert.deepEqual(findMatches(["abc"], ""), []);
});

test("a match inside bold or a heading is found on the text you see, with its place in the Markdown", () => {
  const [bold] = findMatches(["a **big** day"], "big");
  assert.deepEqual([bold.from, bold.to, bold.rawFrom, bold.rawTo], [2, 5, 4, 7]);
  const [heading] = findMatches(["## Plan"], "plan");
  assert.deepEqual([heading.from, heading.to, heading.rawFrom, heading.rawTo], [0, 4, 3, 7]);
});

test("a match can span bold and plain text", () => {
  const [match] = findMatches(["a **big** day"], "big d");
  assert.deepEqual([match.rawFrom, match.rawTo], [4, 11]);
});

test("the marks of a link are not matched, its title is", () => {
  assert.equal(findMatches(["see [[Glacier]]"], "[").length, 0);
  assert.equal(findMatches(["see [[Glacier]]"], "glac").length, 1);
});

test("sketch lines are skipped", () => {
  const lines = ["![[Notes – sketch 1.svg]]", "sketch"];
  assert.deepEqual(findMatches(lines, "sketch").map((m) => m.line), [1]);
});

test("code lines match as written and the fences do not", () => {
  const lines = ["```", "let **x**", "```"];
  assert.deepEqual(findMatches(lines, "**").map((m) => [m.line, m.from]), [[1, 4], [1, 7]]);
  assert.deepEqual(findMatches(lines, "`"), []);
});

test("the first match from the caret is picked, going back to the first past the last", () => {
  const matches = findMatches(["ab ab", "ab"], "ab");
  assert.equal(firstMatchFrom(matches, 0, 3), 1);
  assert.equal(firstMatchFrom(matches, 1, 2), 0);
  assert.equal(firstMatchFrom([], 0, 0), -1);
});

test("next and previous go round at the end", () => {
  assert.equal(stepMatch(3, 2, 1), 0);
  assert.equal(stepMatch(3, 0, -1), 2);
  assert.equal(stepMatch(3, 0, 1), 1);
  assert.equal(stepMatch(0, -1, 1), -1);
});

test("the status reads 2 of 5, or No match", () => {
  assert.equal(findStatus("a", 5, 1), "2 of 5");
  assert.equal(findStatus("zzz", 0, -1), "No match");
  assert.equal(findStatus("", 0, -1), "");
});
