import { test } from "node:test";
import assert from "node:assert/strict";
import { newNoteChoices, NEW_NOTE_HINT, PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";

test("on a website + offers a note for the page by its title, picked already, then a blank note", () => {
  const choices = newNoteChoices({ website: { title: "Flexbox, MDN" } });
  assert.deepEqual(
    choices.map((c) => [c.kind, c.label, c.under, c.icon, c.picked]),
    [
      ["page", "Note for “Flexbox, MDN”", "linked to this page", "globe", true],
      ["blank", "Blank note", null, "page", false],
    ],
  );
});

test("a website whose title is not known yet offers a note for this page", () => {
  const [page] = newNoteChoices({ website: { title: null } });
  assert.equal(page.label, "Note for this page");
});

test("where there is no website + offers only a blank note, so it is made at once", () => {
  const choices = newNoteChoices({ website: null });
  assert.deepEqual(choices.map((c) => [c.kind, c.label, c.picked]), [["blank", "Blank note", true]]);
});

test("the hover texts say the difference in one short sentence each", () => {
  assert.equal(NEW_NOTE_HINT, "A blank note, not tied to any page.");
  assert.equal(PAGE_NOTE_HINT, "A note for the page you're on. It opens again when you visit the page.");
  const [page, blank] = newNoteChoices({ website: { title: "A" } });
  assert.equal(page.hint, PAGE_NOTE_HINT);
  assert.equal(blank.hint, NEW_NOTE_HINT);
});
