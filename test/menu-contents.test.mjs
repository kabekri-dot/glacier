import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";
import { notebookMenu, noteMenu, pageNoteCount, deleteCollectionQuestion, archivedNotice, secondVersionBar, rowActions, noteOrigin, lastNotesBox, pillTitle } from "../src/menu-contents.mjs";

// What the ▾ Notebook and ⋯ This note menus list (#67), as plain data the
// sidebar only has to draw.

const SEVERAL = "These notes were changed in two places before they synced, so Glacier kept every version. Open one, copy what you want to keep into the original, then delete or archive the others.";

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
    { kind: "newCollection", label: "+ New collection", hint: "Make an empty collection to fill later" },
    { kind: "group", label: "TOP Foundations", hint: "Notes in this Collection", open: true, archive: false, titles: ["Box model", "Flexbox"], course: "TOP Foundations", actions: [
      { kind: "download", hint: "Download 'TOP Foundations', 2 notes" },
      { kind: "archive", hint: "Archive 'TOP Foundations', 2 notes" },
      { kind: "delete", hint: "Delete 'TOP Foundations', 2 notes" },
    ] },
    { kind: "heading", text: "No collection", hint: "Notes not in any Collection" },
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
    { kind: "empty", text: "Collections hold notes that belong together. Make one with + New collection." },
    { kind: "newCollection", label: "+ New collection", hint: "Make an empty collection to fill later" },
    { kind: "empty", text: "No notes yet" },
  ]);
});

test("the Collections hint goes away once there is a Collection", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.newCollection("Biology");
  const texts = notebookMenu(notebook, "").filter((part) => part.kind === "empty").map((part) => part.text);
  assert.ok(!texts.some((text) => text.startsWith("Collections hold")));
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

test("Several versions tops the menu with each original and its second version", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  notebook.createNote({ title: "Gone (conflict 2026-10-02)" });
  assert.deepEqual(notebookMenu(notebook, "").slice(0, 3), [
    { kind: "heading", text: "Several versions (2)", hint: SEVERAL },
    {
      kind: "pair",
      notes: [
        { title: "Margins", label: "Margins", actions: rowActions("Margins") },
        { title: "Margins (conflict 2026-10-02)", label: "Margins (conflict 2026-10-02)", actions: rowActions("Margins (conflict 2026-10-02)") },
      ],
    },
    { kind: "pair", notes: [{ title: "Gone (conflict 2026-10-02)", label: "Gone (conflict 2026-10-02)", actions: rowActions("Gone (conflict 2026-10-02)") }] },
  ]);
});

test("Several versions comes before the notes for this page", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  const headings = notebookMenu(notebook, "", notebook.note("Flexbox"))
    .filter((part) => part.kind === "heading")
    .map((part) => part.text);
  assert.deepEqual(headings.slice(0, 2), ["Several versions (1)", "Notes for this page"]);
});

test("without notes that have two versions the menu has no Several versions", () => {
  const texts = notebookMenu(notebookWith(), "").map((part) => part.text);
  assert.equal(texts.some((text) => text?.startsWith("Several versions")), false);
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
      ["move", "Move to collection…"],
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
  assert.deepEqual(menu.actions.map((action) => action.label), ["Move to collection…", "Download as a file", "Unarchive", "Delete"]);
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

test("an original with a second version shows a bar with an Open button and no delete", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  const bar = secondVersionBar(notebook, notebook.note("Margins"));
  assert.match(bar.text, /second version, 'Margins \(conflict 2026-10-02\)'/);
  assert.equal(bar.openLabel, "Open 'Margins (conflict 2026-10-02)'");
  assert.equal(bar.original, "Margins (conflict 2026-10-02)");
  assert.equal(bar.deleteLabel, null);
});

test("an ordinary note or no note has no second version bar", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  notebook.createNote({ title: "Unrelated" });
  assert.equal(secondVersionBar(notebook, notebook.note("Unrelated")), null);
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

test("a note with a page is from a website and one without is your own", () => {
  const notebook = notebookWith();
  assert.deepEqual(noteOrigin(notebook, "Flexbox"), { kind: "website", hint: "From a website" });
  assert.deepEqual(noteOrigin(notebook, "Margins"), { kind: "own", hint: "Your own note" });
});

test("the Notebook part offers + New collection, and an empty Collection only Delete", () => {
  const notebook = notebookWith();
  notebook.newCollection("Biology");
  const parts = notebookMenu(notebook, "");
  assert.equal(parts.find((part) => part.kind === "newCollection").label, "+ New collection");
  const group = parts.find((part) => part.kind === "group" && part.course === "Biology");
  assert.deepEqual(group.actions.map((action) => action.kind), ["delete"]);
  assert.equal(deleteCollectionQuestion("Biology", 0), "Delete the empty collection 'Biology'?");
});

test("with no note open the pill says Glacier quietly and cannot be renamed", () => {
  assert.deepEqual(pillTitle({ note: null, freshPage: null }), { text: "Glacier", hint: "", renamable: false, draft: false });
});

test("the pill of an open note shows its title and offers to rename it, the hover showing the whole title", () => {
  const pill = pillTitle({ note: { title: "Grid" }, freshPage: null });
  assert.deepEqual(pill, { text: "Grid", hint: "Grid\nClick to rename", renamable: true, draft: false });
});

test("the pill of a fresh page offers to name the note", () => {
  assert.deepEqual(pillTitle({ note: null, freshPage: { title: "" } }), {
    text: "Title",
    hint: "Click to name this note",
    renamable: true,
    draft: true,
  });
});
