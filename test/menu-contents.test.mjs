import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { LESSON_NOTE_HINT, CONCEPT_NOTE_HINT } from "../src/new-note-choices.mjs";
import { notebookMenu, conflictMenu, noteMenu } from "../src/menu-contents.mjs";

// What the ▾ Notebook and ⋯ This note menus list (#67), as plain data the
// sidebar only has to draw.

function notebookWith() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Box model",
    course: "TOP Foundations",
    source: "https://odin.example/foundations/box-model",
  });
  notebook.createLessonNote({ title: "Flexbox", course: "TOP Foundations", source: "https://odin.example/flex" });
  notebook.createLessonNote({ title: "Loose page", source: "https://example.com/loose" });
  notebook.createConceptNote({ title: "Margins" });
  notebook.saveBody("Margins", "Space outside the border of a box.");
  return notebook;
}

test("a search lists notes whose title matches, with the match marked in the title", () => {
  const menu = notebookMenu(notebookWith(), "flex");
  assert.deepEqual(menu, [
    { kind: "result", title: "Flexbox", titleMark: { before: "", match: "Flex", after: "box" }, snippet: null },
  ]);
});

test("a search that matches the text gives a snippet around the match", () => {
  const [result] = notebookMenu(notebookWith(), "outside");
  assert.equal(result.title, "Margins");
  assert.equal(result.titleMark, null);
  assert.deepEqual(result.snippet, { before: "Space ", match: "outside", after: " the border of a box." });
});

test("a search with no match says so", () => {
  assert.deepEqual(notebookMenu(notebookWith(), "zebra"), [{ kind: "empty", text: "No notes match" }]);
});

test("without a search the menu starts with the recent notes", () => {
  const notebook = notebookWith();
  notebook.markOpened("Margins");
  notebook.markOpened("Flexbox");
  const menu = notebookMenu(notebook, " ");
  assert.deepEqual(menu.slice(0, 2), [
    { kind: "heading", text: "Recent", hint: null },
    { kind: "notes", titles: ["Flexbox", "Margins"] },
  ]);
});

test("the Notebook lists Courses with their Lesson notes, then No Course, then Concepts", () => {
  const menu = notebookMenu(notebookWith(), "");
  assert.deepEqual(menu, [
    { kind: "heading", text: "Notebook", hint: null },
    { kind: "group", label: "TOP Foundations", hint: LESSON_NOTE_HINT, open: true, archive: false, titles: ["Box model", "Flexbox"] },
    { kind: "heading", text: "No Course", hint: LESSON_NOTE_HINT },
    { kind: "notes", titles: ["Loose page"] },
    { kind: "heading", text: "Concepts", hint: CONCEPT_NOTE_HINT },
    { kind: "notes", titles: ["Margins"] },
  ]);
});

test("an empty Notebook says there are no notes yet", () => {
  const menu = notebookMenu(createNotebook({ storage: memoryStorage() }), "");
  assert.deepEqual(menu, [
    { kind: "heading", text: "Notebook", hint: null },
    { kind: "empty", text: "No notes yet" },
  ]);
});

test("archived notes are listed only under a folded Archive", () => {
  const notebook = notebookWith();
  notebook.markOpened("Margins");
  notebook.archiveNote("Margins");
  const menu = notebookMenu(notebook, "");
  const archive = menu.at(-1);
  assert.deepEqual(archive, {
    kind: "group",
    label: "Archive (1)",
    hint: "Notes you hid from your lists. Open one to bring it back",
    open: false,
    archive: true,
    titles: ["Margins"],
  });
  const elsewhere = menu.slice(0, -1).flatMap((part) => part.titles ?? []);
  assert.equal(elsewhere.includes("Margins"), false);
  assert.deepEqual(notebookMenu(notebook, "outside"), [{ kind: "empty", text: "No notes match" }]);
});

test("Conflict Copies are listed next to their originals", () => {
  const notebook = notebookWith();
  notebook.createConceptNote({ title: "Margins (conflict 2026-10-02)" });
  notebook.createConceptNote({ title: "Gone (conflict 2026-10-02)" });
  assert.deepEqual(conflictMenu(notebook), [
    { kind: "heading", text: "Changed in two places", hint: null },
    {
      kind: "pair",
      notes: [
        { title: "Margins (conflict 2026-10-02)", label: "Margins (conflict 2026-10-02)" },
        { title: "Margins", label: "Original: Margins" },
      ],
    },
    { kind: "pair", notes: [{ title: "Gone (conflict 2026-10-02)", label: "Gone (conflict 2026-10-02)" }] },
  ]);
});

test("no note open means no This note menu", () => {
  assert.equal(noteMenu(null), null);
});

test("an open note gets its name, Download as a file, Archive and Delete", () => {
  const notebook = notebookWith();
  const menu = noteMenu(notebook.note("Flexbox"));
  assert.equal(menu.heading, "Flexbox");
  assert.deepEqual(
    menu.actions.map((action) => [action.kind, action.label]),
    [
      ["download", "Download as a file"],
      ["archive", "Archive"],
      ["delete", "Delete"],
    ],
  );
  assert.equal(menu.actions.every((action) => action.hint), true);
});

test("an archived note offers Unarchive instead of Archive", () => {
  const notebook = notebookWith();
  notebook.archiveNote("Flexbox");
  const menu = noteMenu(notebook.note("Flexbox"));
  assert.deepEqual(menu.actions.map((action) => action.label), ["Download as a file", "Unarchive", "Delete"]);
});
