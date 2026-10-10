import { test } from "node:test";
import assert from "node:assert/strict";
import { newNoteChoices, LESSON_NOTE_HINT, CONCEPT_NOTE_HINT } from "../src/new-note-choices.mjs";

test("on a website the + menu offers a Lesson note for this page and a Concept note", () => {
  const choices = newNoteChoices({ onWebsite: true });
  assert.deepEqual(
    choices.map((c) => [c.kind, c.label, c.hint]),
    [
      ["lesson", "Lesson note for this page", LESSON_NOTE_HINT],
      ["concept", "Concept note", CONCEPT_NOTE_HINT],
    ],
  );
});

test("on a non-website page the + menu offers New note and a Concept note", () => {
  const choices = newNoteChoices({ onWebsite: false });
  assert.deepEqual(
    choices.map((c) => [c.kind, c.label]),
    [
      ["byHand", "New note"],
      ["concept", "Concept note"],
    ],
  );
});

test("the hover explanations say what each kind is", () => {
  assert.equal(LESSON_NOTE_HINT, "Notes for one lesson. Opens by itself when you visit that page.");
  assert.equal(
    CONCEPT_NOTE_HINT,
    "An idea that isn't tied to one page. Link to it from any note with [[ ]].",
  );
});
