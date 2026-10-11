import { test } from "node:test";
import assert from "node:assert/strict";
import { newNoteChoices, NEW_NOTE_HINT, PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";

test("on a website the + menu offers New note and New note for this page", () => {
  const choices = newNoteChoices({ onWebsite: true });
  assert.deepEqual(
    choices.map((c) => [c.kind, c.label, c.hint]),
    [
      ["blank", "New note", NEW_NOTE_HINT],
      ["page", "New note for this page", PAGE_NOTE_HINT],
    ],
  );
});

test("on a page that is not a website the + menu offers only New note", () => {
  const choices = newNoteChoices({ onWebsite: false });
  assert.deepEqual(choices.map((c) => [c.kind, c.label]), [["blank", "New note"]]);
});

test("the hover texts say the difference in one short sentence each", () => {
  assert.equal(NEW_NOTE_HINT, "A blank note, not tied to any page.");
  assert.equal(PAGE_NOTE_HINT, "A note for the page you're on. It opens again when you visit the page.");
});
