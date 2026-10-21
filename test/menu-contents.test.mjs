import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { PAGE_NOTE_HINT } from "../src/new-note-choices.mjs";
import { notebookMenu, deletedNotice, deleteNoteQuestion, deletedCollectionNotice, noteMenu, deleteCollectionQuestion, archivedNotice, secondVersionBar, rowActions, noteOrigin, pillTitle, secretMark, backButtonHint, HELP_URL, pushpin } from "../src/menu-contents.mjs";

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
    { kind: "group", label: "TOP Foundations", hint: "Notes in this collection", open: true, archive: false, titles: ["Box model", "Flexbox"], course: "TOP Foundations", actions: [
      { kind: "download", hint: "Download 'TOP Foundations', 2 notes" },
      { kind: "archive", hint: "Archive 'TOP Foundations', 2 notes" },
      { kind: "delete", hint: "Delete 'TOP Foundations', 2 notes" },
    ] },
    { kind: "heading", text: "No collection", hint: "Notes not in any collection" },
    { kind: "notes", titles: ["Loose page", "Margins"] },
  ]);
});

// Several notes per page (#68): the ▾ menu starts with the notes for the open
// note's page.
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

test("an empty Notebook says there are no notes yet", () => {
  const menu = notebookMenu(createNotebook({ storage: memoryStorage() }), "");
  assert.deepEqual(menu, [
    { kind: "heading", text: "Notebook", hint: null },
    { kind: "empty", text: "Collections hold notes that belong together. Make one with + New collection." },
    { kind: "newCollection", label: "+ New collection", hint: "Make an empty collection to fill later" },
    { kind: "empty", text: "No notes yet. Just start writing on a page, or press + for a new note." },
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

test("the delete question names the Collection, the count and where the notes live", () => {
  assert.equal(
    deleteCollectionQuestion("Testing", 12, "github"),
    "Delete the collection “Testing” and its 12 notes? They're also removed from your GitHub repo.",
  );
  assert.equal(archivedNotice(12), "Archived 12 notes.");
});

test("the delete questions name the real Notes Home", () => {
  assert.equal(deleteNoteQuestion("Flexbox", "github"), "Delete “Flexbox” for good? It is also removed from your GitHub repo.");
  assert.equal(deleteNoteQuestion("Flexbox", "google-drive"), "Delete “Flexbox” for good? It is also removed from Google Drive.");
  assert.equal(deleteNoteQuestion("Flexbox", "folder"), "Delete “Flexbox” for good? It is also removed from your notes folder.");
  assert.equal(
    deleteCollectionQuestion("Testing", 1, "google-drive"),
    "Delete the collection “Testing” and its 1 note? They're also removed from Google Drive.",
  );
});

test("with notes only in this browser the delete questions name no other place", () => {
  assert.equal(deleteNoteQuestion("Flexbox", "browser"), "Delete “Flexbox” for good?");
  assert.equal(deleteNoteQuestion("Flexbox", null), "Delete “Flexbox” for good?");
  assert.equal(deleteCollectionQuestion("Testing", 12, "browser"), "Delete the collection “Testing” and its 12 notes?");
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
  assert.equal(deleteCollectionQuestion("Biology", 0, "github"), "Delete the empty collection “Biology”?");
});

test("with no note open the pill says Glacier quietly and cannot be renamed", () => {
  assert.deepEqual(pillTitle({ note: null, freshPage: null }), { text: "Glacier", hint: "", renamable: false, draft: false });
});

test("the title of an open note shows its headings on a click, the hover showing the whole title", () => {
  const pill = pillTitle({ note: { title: "Grid" }, freshPage: null });
  assert.deepEqual(pill, { text: "Grid", hint: "Grid\nClick to see its headings", renamable: true, draft: false });
});

test("the pill of a fresh page offers to name the note", () => {
  assert.deepEqual(pillTitle({ note: null, freshPage: { title: "" } }), {
    text: "Title",
    hint: "Click to name this note",
    renamable: true,
    draft: true,
  });
});

// Page groups (#92): a website with several notes outside any Collection is
// its own group under "No collection", named after the page, until you move it.
function noCollectionPart(parts) {
  const at = parts.findIndex((part) => part.kind === "heading" && part.text === "No collection");
  const end = parts.findIndex((part, index) => index > at && part.kind === "group" && part.archive);
  return parts.slice(at + 1, end === -1 ? undefined : end);
}

function pageWithTwoNotes() {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margin collapse", source: "https://example.com/loose", pageTitle: "Loose page, a guide", created: "2026-10-03T09:00:00.000Z" });
  return notebook;
}

test("a website with two notes outside a Collection is its own group, named after the page", () => {
  const notebook = pageWithTwoNotes();
  assert.deepEqual(noCollectionPart(notebookMenu(notebook, "")), [
    {
      kind: "group",
      label: "Loose page, a guide",
      hint: "Notes for this website",
      open: true,
      archive: false,
      page: "https://example.com/loose",
      titles: ["Loose page", "Margin collapse"],
      actions: [{ kind: "move", hint: "Move the notes for 'Loose page, a guide' to a collection" }],
    },
    { kind: "notes", titles: ["Margins"] },
  ]);
});

test("a website with one note stays a plain row", () => {
  const parts = noCollectionPart(notebookMenu(notebookWith(), ""));
  assert.deepEqual(parts, [{ kind: "notes", titles: ["Loose page", "Margins"] }]);
});

test("a page group without a remembered page title is named after its short address", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Second loose", source: "https://example.com/loose#part" });
  const group = noCollectionPart(notebookMenu(notebook, "")).find((part) => part.kind === "group");
  assert.equal(group.label, "example.com/loose");
});

test("page groups and plain rows stand in one list sorted by name", () => {
  const notebook = pageWithTwoNotes();
  notebook.createNote({ title: "Aside" });
  notebook.createNote({ title: "Zebra" });
  const parts = noCollectionPart(notebookMenu(notebook, ""));
  assert.deepEqual(
    parts.map((part) => (part.kind === "group" ? `group ${part.label}` : part.titles.join(", "))),
    ["Aside", "group Loose page, a guide", "Margins, Zebra"],
  );
});

test("a website's notes inside a Collection stay a plain list there", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Flex again", course: "TOP Foundations", source: "https://odin.example/flex" });
  const collection = notebookMenu(notebook, "").find((part) => part.kind === "group" && part.course === "TOP Foundations");
  assert.deepEqual(collection.titles, ["Box model", "Flex again", "Flexbox"]);
});

test("archived notes don't count for a page group", () => {
  const notebook = pageWithTwoNotes();
  notebook.archiveNote("Margin collapse");
  assert.deepEqual(noCollectionPart(notebookMenu(notebook, ""))[0], { kind: "notes", titles: ["Loose page", "Margins"] });
});

// Secret notes (#109): a lock shows before a secret note's title.
test("a secret note's title has the lock before it, a plain one none", async () => {
  const notebook = notebookWith();
  await notebook.setPasscode("pass");
  await notebook.makeSecret("Margins");
  assert.deepEqual(secretMark(notebook, "Margins"), { hint: "Secret note" });
  assert.equal(secretMark(notebook, "Flexbox"), null);
});

test("the notice after a delete names what went", () => {
  assert.equal(deletedNotice("Box model"), "Deleted “Box model”.");
  assert.equal(deletedCollectionNotice("Testing", 3), "Deleted the collection “Testing” and its 3 notes.");
  assert.equal(deletedCollectionNotice("Testing", 1), "Deleted the collection “Testing” and its 1 note.");
  assert.equal(deletedCollectionNotice("Biology", 0), "Deleted the empty collection “Biology”.");
});

// The ⋯ menu (#121, #122): three big icons, Delete on its own, then Note
// details, Keyboard shortcuts and Help.
test("⋯ starts with Rename, Download and Archive as three big icons with words", () => {
  const menu = noteMenu({ title: "Grid" });
  assert.deepEqual(menu.big.map((a) => [a.kind, a.label, a.icon]), [
    ["rename", "Rename", "pencil"],
    ["download", "Download", "download"],
    ["archive", "Archive", "archive"],
  ]);
  assert.equal(menu.big.every((a) => a.hint), true);
});

test("⋯ on an archived note offers Unarchive among the big icons", () => {
  const menu = noteMenu({ title: "Grid", archived: true });
  assert.deepEqual(menu.big.map((a) => a.label), ["Rename", "Download", "Unarchive"]);
});

test("Delete stands on its own and asks for good right there, naming the note", () => {
  const menu = noteMenu({ title: "Grid" });
  assert.deepEqual([menu.delete.kind, menu.delete.label, menu.delete.icon], ["delete", "Delete", "trash"]);
  assert.equal(deleteNoteQuestion("Grid", null), "Delete “Grid” for good?");
});

test("⋯ ends with Note details, Keyboard shortcuts and Help", () => {
  const menu = noteMenu({ title: "Grid" });
  assert.deepEqual(menu.help.map((a) => [a.kind, a.label, a.icon]), [
    ["details", "Note details", "info"],
    ["shortcuts", "Keyboard shortcuts", "keyboard"],
    ["help", "Help", "help"],
  ]);
  assert.equal(menu.help[0].under, "Collection, secret, page, links");
});

test("Help opens the common questions page", () => {
  assert.equal(HELP_URL, "https://github.com/kabekri-dot/glacier/blob/main/docs/help.md");
});

test("pin, move, extract and secret are no longer in ⋯", () => {
  const menu = noteMenu({ title: "Grid", secret: true }, { pinned: true });
  const kinds = [...menu.big, menu.delete, ...menu.help].map((a) => a.kind);
  for (const gone of ["pin", "unpin", "move", "extract", "secret", "notSecret"]) assert.equal(kinds.includes(gone), false, gone);
  assert.equal(menu.later, undefined);
});

test("the pushpin says what a click does, and its notice what just happened", () => {
  assert.deepEqual(pushpin(false), {
    label: "Pin this note",
    hint: "Pin this note. It stays open when you change tabs",
    notice: "Unpinned. Glacier follows your tabs again.",
  });
  assert.deepEqual(pushpin(true), {
    label: "Unpin this note",
    hint: "Unpin this note. Glacier follows your tabs again",
    notice: "Pinned. This note stays open when you change tabs.",
  });
});

test("the Download icon says it can save or print the note", () => {
  const download = noteMenu({ title: "Grid" }).big.find((action) => action.kind === "download");
  assert.equal(download.hint, "Save this note as Markdown or PDF, or print it");
});

test("hovering ← names the note it goes back to", () => {
  assert.equal(backButtonHint("Flexbox"), "Back to Flexbox");
});
