import { test } from "node:test";
import assert from "node:assert/strict";
import { WELCOME_GREETING, WELCOME_LINES, WELCOME_TIP, welcomeShown, saveErrorText } from "../src/guidance.mjs";
import { SHORTCUT_GROUPS } from "../src/shortcuts-panel.mjs";

test("the welcome shows on the first start", () => {
  assert.equal(welcomeShown(undefined), true);
});

test("the welcome is gone for good once it has been dismissed", () => {
  assert.equal(welcomeShown(true), false);
});

test("the welcome says what a note, a website note and a Collection are", () => {
  assert.deepEqual(WELCOME_LINES.map((line) => line.text), [
    "A note is a page you write on.",
    "Notes for a website open by themselves when you come back.",
    "Collections keep notes on one topic together.",
  ]);
});

test("the welcome greets you and ends with a tip", () => {
  assert.equal(WELCOME_GREETING, "Welcome to Glacier");
  assert.equal(WELCOME_TIP, "Tip: open any website and just start writing.");
});

test("each welcome line has its own small picture", () => {
  assert.deepEqual(WELCOME_LINES.map((line) => line.icon), ["page", "globe", "notebooks"]);
});

test("the Shortcuts panel starts with How Glacier works, which shows the welcome page again", () => {
  assert.equal(SHORTCUT_GROUPS[0].title, "How Glacier works");
  assert.equal(SHORTCUT_GROUPS[0].opensWelcome, true);
  assert.equal(SHORTCUT_GROUPS[0].hint, "Show the welcome page again");
  assert.deepEqual(SHORTCUT_GROUPS[0].entries, []);
});

test("a failed save says the text is still here and how to keep it", () => {
  assert.equal(
    saveErrorText(new Error("disk")),
    "Couldn't save your last changes to this browser. Your text is still here. Copy it somewhere safe.",
  );
});

test("a failed save because the storage is full says so", () => {
  const full = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
  assert.equal(
    saveErrorText(full),
    "This browser's storage is full, so your last changes weren't saved. Your text is still here. Copy it somewhere safe.",
  );
});
