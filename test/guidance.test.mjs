import { test } from "node:test";
import assert from "node:assert/strict";
import { HOW_GLACIER_WORKS, WELCOME_GREETING, WELCOME_LINES, WELCOME_TIP, welcomeShown } from "../src/guidance.mjs";
import { SHORTCUT_GROUPS } from "../src/shortcuts-panel.mjs";

test("the welcome shows on the first start", () => {
  assert.equal(welcomeShown(undefined), true);
});

test("the welcome is gone for good once it has been dismissed", () => {
  assert.equal(welcomeShown(true), false);
});

test("How Glacier works says what a note, a website note and a Collection are", () => {
  assert.equal(HOW_GLACIER_WORKS.length, 3);
  assert.deepEqual(HOW_GLACIER_WORKS, [
    "A note is a page you write on.",
    "Notes for a website open by themselves when you come back.",
    "Collections keep notes on one topic together.",
  ]);
});

test("the welcome greets you, shows the same three lines and ends with a tip", () => {
  assert.equal(WELCOME_GREETING, "Welcome to Glacier");
  assert.deepEqual(WELCOME_LINES.map((line) => line.text), HOW_GLACIER_WORKS);
  assert.equal(WELCOME_TIP, "Tip: open any website and just start writing.");
});

test("each welcome line has its own small picture", () => {
  assert.deepEqual(WELCOME_LINES.map((line) => line.icon), ["page", "globe", "notebooks"]);
});

test("the Shortcuts panel starts with How Glacier works", () => {
  assert.equal(SHORTCUT_GROUPS[0].title, "How Glacier works");
  assert.deepEqual(SHORTCUT_GROUPS[0].paragraphs, HOW_GLACIER_WORKS);
});
