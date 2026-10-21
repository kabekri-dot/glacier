import { test } from "node:test";
import assert from "node:assert/strict";
import { isShortcut, lessonStep } from "../src/keys.mjs";

// Glacier's shortcuts are Ctrl (Cmd on a Mac) plus a key, with or without
// Shift, never with Alt.
const press = (key, more = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...more });

test("Ctrl or Cmd with the key is the shortcut, whatever the capitals", () => {
  assert.equal(isShortcut(press("f", { ctrlKey: true }), "f"), true);
  assert.equal(isShortcut(press("F", { metaKey: true }), "f"), true);
  assert.equal(isShortcut(press("f"), "f"), false);
  assert.equal(isShortcut(press("g", { ctrlKey: true }), "f"), false);
});

test("Shift must match, and Alt is never part of a shortcut", () => {
  assert.equal(isShortcut(press("E", { ctrlKey: true, shiftKey: true }), "e", { shift: true }), true);
  assert.equal(isShortcut(press("e", { ctrlKey: true }), "e", { shift: true }), false);
  assert.equal(isShortcut(press("E", { ctrlKey: true, shiftKey: true }), "e"), false);
  assert.equal(isShortcut(press("f", { ctrlKey: true, altKey: true }), "f"), false);
});

test("a named key like PageUp is matched as it is", () => {
  assert.equal(isShortcut(press("PageUp", { ctrlKey: true }), "PageUp"), true);
});

test("Alt PageDown and Alt PageUp step to the next and the previous lesson", () => {
  assert.equal(lessonStep(press("PageDown", { altKey: true })), 1);
  assert.equal(lessonStep(press("PageUp", { altKey: true })), -1);
  assert.equal(lessonStep(press("PageDown")), 0);
  assert.equal(lessonStep(press("PageDown", { altKey: true, ctrlKey: true })), 0);
  assert.equal(lessonStep(press("PageUp", { altKey: true, shiftKey: true })), 0);
});
