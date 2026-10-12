import { test } from "node:test";
import assert from "node:assert/strict";
import { HOW_GLACIER_WORKS, welcomeShown } from "../src/guidance.mjs";
import { SHORTCUT_GROUPS } from "../src/shortcuts-panel.mjs";

test("the welcome shows on the first start", () => {
  assert.equal(welcomeShown(undefined), true);
});

test("the welcome is gone for good once it has been dismissed", () => {
  assert.equal(welcomeShown(true), false);
});

test("How Glacier works says what a note, a website note and a Collection are", () => {
  assert.equal(HOW_GLACIER_WORKS.length, 3);
  assert.match(HOW_GLACIER_WORKS.join(" "), /visit that site again/);
  assert.match(HOW_GLACIER_WORKS.join(" "), /Collections hold notes that belong together/);
});

test("the Shortcuts panel starts with How Glacier works", () => {
  assert.equal(SHORTCUT_GROUPS[0].title, "How Glacier works");
  assert.deepEqual(SHORTCUT_GROUPS[0].paragraphs, HOW_GLACIER_WORKS);
});
