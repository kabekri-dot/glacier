import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";
import { notebookMenu, conflictMenu, noteMenu, pageNoteCount, deleteCollectionQuestion, archivedNotice, secondVersionBar } from "../src/menu-contents.mjs";

// What the ▾ Notebook and ⋯ This note menus list (#67), as plain data the
// sidebar only has to draw.

function notebookWith() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({
    title: "Box model",
    course: "TOP Foundations",
    source: "https://odin.example/foundations/box-model",
  });
  notebook.createNote({
    title: "Flexbox",
    course: "TOP Foundations",
    source: "https://odin.example/flex",
    created: "2026-09-01T09:00:00.000Z",
  });
  notebook.createNote({ title: "Loose page", source: "https://example.com/loose" });
  notebook.createNote({ title: "Margins" });
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
  const [result] = notebookMenu(notebookWith(), "// outside");
  assert.equal(result.title, "Margins");
  assert.equal(result.titleMark, null);
  assert.deepEqual(result.snippet, [
    { text: "Space ", match: false },
    { text: "outside", match: true },
    { text: " the border of a box.", match: false },
  ]);
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

test("the Notebook lists Collections with their notes, then the notes without a Collection", () => {
  const menu = notebookMenu(notebookWith(), "");
  assert.deepEqual(menu, [
    { kind: "heading", text: "Notebook", hint: null },
    { kind: "group", label: "TOP Foundations", hint: "Notes in this Collection", open: true, archive: false, titles: ["Box model", "Flexbox"], course: "TOP Foundations", actions: [
      { kind: "download", hint: "Download 'TOP Foundations', 2 notes" },
      { kind: "archive", hint: "Archive 'TOP Foundations', 2 notes" },
      { kind: "delete", hint: "Delete 'TOP Foundations', 2 notes" },
    ] },
    { kind: "heading", text: "No Collection", hint: "Notes not in any Collection" },
    { kind: "notes", titles: ["Loose page", "Margins"] },
  ]);
});

// Several notes per page (#68): the ▾ menu starts with the notes for the open
// note's page, and the pill counts them.
function threeNotesForOnePage() {
  const notebook = notebookWith();
  const page = "https://odin.example/flex";
  notebook.createNote({ title: "Flex questions", source: page, created: "2026-10-01T09:00:00.000Z" });
  notebook.createNote({ title: "Flex tricks", source: `${page}#gap`, created: "2026-10-02T09:00:00.000Z" });
  notebook.saveBody("Flex questions", "Why does it shrink?");
  return notebook;
}

test("Notes for this page comes first, newest first, with New note for this page under them", () => {
  const notebook = threeNotesForOnePage();
  const menu = notebookMenu(notebook, "", notebook.note("Flex tricks"));
  assert.deepEqual(menu.slice(0, 3), [
    { kind: "heading", text: "Notes for this page", hint: "Every note for this page, the latest first" },
    { kind: "notes", titles: ["Flex questions", "Flex tricks", "Flexbox"], current: "Flex tricks" },
    { kind: "newForPage", label: "+ New note for this page", hint: PAGE_NOTE_HINT },
  ]);
  assert.equal(menu[3].text, "Notebook");
});

test("a note without a page gets no Notes for this page section", () => {
  const notebook = threeNotesForOnePage();
  assert.equal(notebookMenu(notebook, "", notebook.note("Margins"))[0].text, "Notebook");
  assert.equal(notebookMenu(notebook, "")[0].text, "Notebook");
});

test("a search hides the Notes for this page section", () => {
  const notebook = threeNotesForOnePage();
  assert.deepEqual(notebookMenu(notebook, "zebra", notebook.note("Flexbox")), [{ kind: "empty", text: "No notes match" }]);
});

test("the pill counts the open note among the notes for its page, newest first", () => {
  const notebook = threeNotesForOnePage();
  assert.equal(pageNoteCount(notebook, notebook.note("Flex questions")), "1 of 3");
  assert.equal(pageNoteCount(notebook, notebook.note("Flex tricks")), "2 of 3");
  assert.equal(pageNoteCount(notebook, notebook.note("Flexbox")), "3 of 3");
});

test("the pill shows no count for a page with one note, a note without a page or no note", () => {
  const notebook = notebookWith();
  assert.equal(pageNoteCount(notebook, notebook.note("Flexbox")), null);
  assert.equal(pageNoteCount(notebook, notebook.note("Margins")), null);
  assert.equal(pageNoteCount(notebook, null), null);
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
    sections: [],
  });
  const elsewhere = menu.slice(0, -1).flatMap((part) => part.titles ?? []);
  assert.equal(elsewhere.includes("Margins"), false);
  assert.deepEqual(notebookMenu(notebook, "outside"), [{ kind: "empty", text: "No notes match" }]);
});

test("each original is listed with its second version under it", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  notebook.createNote({ title: "Gone (conflict 2026-10-02)" });
  assert.deepEqual(conflictMenu(notebook), [
    { kind: "heading", text: "Notes with two versions", hint: null },
    {
      kind: "pair",
      notes: [
        { title: "Margins", label: "Margins" },
        { title: "Margins (conflict 2026-10-02)", label: "Margins (conflict 2026-10-02)" },
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

test("a second version shows a bar naming the original and the two buttons", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  assert.deepEqual(secondVersionBar(notebook, notebook.note("Margins (conflict 2026-10-02)")), {
    text: "This is a second version of 'Margins'. Copy what you want to keep into 'Margins', then delete this version.",
    original: "Margins",
    openLabel: "Open 'Margins'",
    deleteLabel: "Delete this version",
  });
});

test("a second version whose original is gone has the bar without an Open button", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Gone (conflict 2026-10-02)" });
  const bar = secondVersionBar(notebook, notebook.note("Gone (conflict 2026-10-02)"));
  assert.equal(bar.original, null);
  assert.equal(bar.openLabel, null);
  assert.match(bar.text, /second version of 'Gone'/);
});

test("an ordinary note or no note has no second version bar", () => {
  const notebook = notebookWith();
  assert.equal(secondVersionBar(notebook, notebook.note("Margins")), null);
  assert.equal(secondVersionBar(notebook, null), null);
});

test("a Collection in the Archive offers Unarchive for all its notes", () => {
  const notebook = notebookWith();
  notebook.archiveCollection("TOP Foundations");
  const archive = notebookMenu(notebook, "").at(-1);
  assert.deepEqual(archive.sections, [
    {
      course: "TOP Foundations",
      titles: ["Box model", "Flexbox"],
      actions: [
        { kind: "download", hint: "Download 'TOP Foundations', 2 notes" },
        { kind: "unarchive", hint: "Unarchive 'TOP Foundations', 2 notes" },
      ],
    },
  ]);
});

test("the delete question names the Collection and the count", () => {
  assert.equal(
    deleteCollectionQuestion("Testing", 12),
    "Delete the collection 'Testing' and its 12 notes? They're also removed from your Notes repo.",
  );
  assert.equal(archivedNotice(12), "Archived 12 notes.");
});
