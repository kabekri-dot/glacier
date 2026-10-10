import { test } from "node:test";
import assert from "node:assert/strict";
import { createNoteHistory } from "../src/note-history.mjs";

test("there is no previous note at the start", () => {
  const history = createNoteHistory();
  assert.equal(history.previous(), null);
  assert.equal(history.back(), null);
  history.visit("A");
  assert.equal(history.previous(), null);
});

test("back steps through earlier notes in order", () => {
  const history = createNoteHistory();
  for (const title of ["A", "B", "C"]) history.visit(title);
  assert.equal(history.previous(), "B");
  assert.equal(history.back(), "B");
  assert.equal(history.back(), "A");
  assert.equal(history.back(), null);
});

test("showing the same note again adds no step", () => {
  const history = createNoteHistory();
  history.visit("A");
  history.visit("A");
  history.visit("B");
  assert.equal(history.back(), "A");
  assert.equal(history.back(), null);
});

test("a new note after going back drops the forward steps", () => {
  const history = createNoteHistory();
  for (const title of ["A", "B", "C"]) history.visit(title);
  history.back();
  history.back();
  history.visit("D");
  assert.equal(history.back(), "A");
  assert.equal(history.back(), null);
});

test("going back and visiting that note again does not add a step", () => {
  const history = createNoteHistory();
  for (const title of ["A", "B"]) history.visit(title);
  history.back();
  history.visit("A");
  assert.equal(history.previous(), null);
});
