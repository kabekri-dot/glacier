import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { notebookMenu, deletedNotice, deleteNoteQuestion, deletedCollectionNotice, noteMenu, archivedNotice, secondVersionBar, noteOrigin, pillTitle, secretMark, backButtonHint, HELP_URL, pushpin, noteRowMenu, moveChoices, madeCollectionNotice, collectionTakenText, renamedCollectionNotice, deletedKeptNotesNotice, movedNotice, deleteCollectionChoice, editedLine } from "../src/menu-contents.mjs";

// What the notes list and ⋯ list (#67, #121, #123), as plain data the
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
test("a search with no match says so and offers a new note with that title", () => {
  assert.deepEqual(notebookMenu(notebookWith(), " zebra "), [
    { kind: "empty", text: "No notes match “zebra”." },
    { kind: "newNamed", label: "New note “zebra”", title: "zebra" },
  ]);
});

test("a search inside notes with no match offers a note named after the words", () => {
  assert.deepEqual(notebookMenu(notebookWith(), "// zebra stripes").at(-1), { kind: "newNamed", label: "New note “zebra stripes”", title: "zebra stripes" });
});

test("without a search the list starts with the recent notes", () => {
  const notebook = notebookWith();
  notebook.markOpened("Margins");
  notebook.markOpened("Flexbox");
  const menu = notebookMenu(notebook, " ");
  assert.deepEqual(menu.slice(0, 2), [
    { kind: "heading", text: "Recent", hint: null },
    { kind: "notes", titles: ["Flexbox", "Margins"] },
  ]);
});

test("Recent lists at most 5 notes", () => {
  const notebook = notebookWith();
  for (const title of ["A", "B", "C", "D", "E", "F"]) {
    notebook.createNote({ title });
    notebook.markOpened(title);
  }
  assert.deepEqual(notebookMenu(notebook, "")[1].titles, ["F", "E", "D", "C", "B"]);
});

// The Collections part (#123): each Collection a folder, folded at first,
// with its number of notes; the notes without one in their own folder.
function folders(parts) {
  return parts.filter((part) => part.kind === "folder");
}

test("Collections has a heading with + New, then each Collection folded with its number of notes", () => {
  const menu = notebookMenu(notebookWith(), "");
  assert.deepEqual(menu[0], { kind: "collectionsHeading", text: "Collections", add: { label: "+ New", hint: "Make a new collection" } });
  assert.deepEqual(folders(menu).map((f) => [f.label, f.count, f.open]), [
    ["TOP Foundations", 2, false],
    ["Not in a collection", 2, false],
  ]);
});

test("a Collection's folder holds its notes and ends with + New note in it", () => {
  const [top] = folders(notebookMenu(notebookWith(), ""));
  assert.equal(top.course, "TOP Foundations");
  assert.equal(top.renamable, true);
  assert.equal(top.icon, "folder");
  assert.deepEqual(top.parts, [
    { kind: "notes", titles: ["Box model", "Flexbox"] },
    { kind: "newInCollection", label: "+ New note in TOP Foundations", hint: "Make a note in TOP Foundations", course: "TOP Foundations" },
  ]);
});

test("a folder opened by a click stays open, the others folded", () => {
  const notebook = notebookWith();
  const menu = notebookMenu(notebook, "", null, { opened: new Set([folders(notebookMenu(notebook, ""))[0].key]) });
  assert.deepEqual(folders(menu).map((f) => f.open), [true, false]);
});

test("the notes without a Collection have their own folder, without a rename or ⋯", () => {
  const loose = folders(notebookMenu(notebookWith(), "")).at(-1);
  assert.equal(loose.label, "Not in a collection");
  assert.equal(loose.renamable, false);
  assert.equal(loose.menu, null);
  assert.deepEqual(loose.parts, [{ kind: "notes", titles: ["Loose page", "Margins"] }]);
});

test("an empty Notebook says there are no notes yet and how to make a Collection", () => {
  const menu = notebookMenu(createNotebook({ storage: memoryStorage() }), "");
  assert.deepEqual(menu, [
    { kind: "collectionsHeading", text: "Collections", add: { label: "+ New", hint: "Make a new collection" } },
    { kind: "empty", text: "Collections hold notes that belong together. Make one with + New." },
    { kind: "empty", text: "No notes yet. Just start writing on a page, or press + for a new note." },
  ]);
});

test("the Collections hint goes away once there is a Collection", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.newCollection("Biology");
  const texts = notebookMenu(notebook, "").filter((part) => part.kind === "empty").map((part) => part.text);
  assert.ok(!texts.some((text) => text.startsWith("Collections hold")));
});

test("an empty Collection is a folder of 0 with only + New note in it", () => {
  const notebook = notebookWith();
  notebook.newCollection("Biology");
  const biology = folders(notebookMenu(notebook, "")).find((f) => f.course === "Biology");
  assert.equal(biology.count, 0);
  assert.deepEqual(biology.parts.map((part) => part.kind), ["newInCollection"]);
});

test("archived notes are listed only in the Archive, folded after a line, with its number", () => {
  const notebook = notebookWith();
  notebook.markOpened("Margins");
  notebook.archiveNote("Margins");
  const menu = notebookMenu(notebook, "");
  assert.deepEqual(menu.at(-2), { kind: "line" });
  const archive = menu.at(-1);
  assert.deepEqual([archive.kind, archive.label, archive.count, archive.open, archive.icon, archive.menu], ["folder", "Archive", 1, false, "archive", null]);
  assert.deepEqual(archive.parts, [{ kind: "notes", titles: ["Margins"] }]);
  const elsewhere = JSON.stringify(menu.slice(0, -1));
  assert.equal(elsewhere.includes("Margins"), false);
  assert.equal(notebookMenu(notebook, "outside")[0].kind, "empty");
});

test("without archived notes there is no Archive", () => {
  assert.equal(notebookMenu(notebookWith(), "").some((part) => part.label === "Archive"), false);
});

test("a Collection in the Archive is its own folder there, offering Download all and Unarchive all", () => {
  const notebook = notebookWith();
  notebook.archiveCollection("TOP Foundations");
  const [inside] = notebookMenu(notebook, "").at(-1).parts;
  assert.equal(inside.label, "TOP Foundations");
  assert.equal(inside.count, 2);
  assert.deepEqual([inside.course, inside.archived, inside.renamable], ["TOP Foundations", true, false]);
  assert.deepEqual(inside.parts, [{ kind: "notes", titles: ["Box model", "Flexbox"] }]);
  assert.deepEqual(inside.menu.map((item) => item.label), ["Download all", "Unarchive all"]);
});

test("the expanded view opens every folder", () => {
  const notebook = notebookWith();
  notebook.archiveNote("Margins");
  assert.ok(folders(notebookMenu(notebook, "", null, { wide: true })).every((f) => f.open));
});

// For this page (#123): only when the open note's page has more than one note.
function threeNotesForOnePage() {
  const notebook = notebookWith();
  const page = "https://odin.example/flex";
  notebook.createNote({ title: "Flex questions", source: page, created: "2026-10-01T09:00:00.000Z" });
  notebook.createNote({ title: "Flex tricks", source: `${page}#gap`, created: "2026-10-02T09:00:00.000Z" });
  notebook.saveBody("Flex questions", "Why does it shrink?");
  return notebook;
}

test("For this page comes first, newest first, with the open note marked", () => {
  const notebook = threeNotesForOnePage();
  const menu = notebookMenu(notebook, "", notebook.note("Flex tricks"));
  assert.deepEqual(menu.slice(0, 2), [
    { kind: "heading", text: "For this page", hint: "Every note for this page, the latest first" },
    { kind: "notes", titles: ["Flex questions", "Flex tricks", "Flexbox"], current: "Flex tricks" },
  ]);
});

test("a page with only the open note, or a note without a page, has no For this page", () => {
  const notebook = threeNotesForOnePage();
  assert.equal(notebookMenu(notebook, "", notebook.note("Loose page"))[0].kind, "collectionsHeading");
  assert.equal(notebookMenu(notebook, "", notebook.note("Margins"))[0].kind, "collectionsHeading");
});

test("a search hides For this page", () => {
  const notebook = threeNotesForOnePage();
  assert.equal(notebookMenu(notebook, "zebra", notebook.note("Flexbox"))[0].text, "No notes match “zebra”.");
});

test("Several versions tops the list with each original and its second version", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  notebook.createNote({ title: "Gone (conflict 2026-10-02)" });
  assert.deepEqual(notebookMenu(notebook, "").slice(0, 3), [
    { kind: "heading", text: "Several versions (2)", hint: SEVERAL },
    { kind: "pair", notes: [{ title: "Margins", label: "Margins" }, { title: "Margins (conflict 2026-10-02)", label: "Margins (conflict 2026-10-02)" }] },
    { kind: "pair", notes: [{ title: "Gone (conflict 2026-10-02)", label: "Gone (conflict 2026-10-02)" }] },
  ]);
});

test("Several versions comes before For this page", () => {
  const notebook = threeNotesForOnePage();
  notebook.createNote({ title: "Margins (conflict 2026-10-02)" });
  const headings = notebookMenu(notebook, "", notebook.note("Flexbox"))
    .filter((part) => part.kind === "heading")
    .map((part) => part.text);
  assert.deepEqual(headings.slice(0, 2), ["Several versions (1)", "For this page"]);
});

test("without notes that have two versions the list has no Several versions", () => {
  const texts = notebookMenu(notebookWith(), "").map((part) => part.text);
  assert.equal(texts.some((text) => text?.startsWith("Several versions")), false);
});

// The ⋯ on a row (#123), the small menu under it.
test("a note's ⋯ offers Move to collection, Download, Archive and Delete", () => {
  assert.deepEqual(noteRowMenu("Grid").map((item) => [item.kind, item.label, item.icon]), [
    ["move", "Move to collection…", "folder"],
    ["download", "Download", "download"],
    ["archive", "Archive", "archive"],
    ["delete", "Delete", "trash"],
  ]);
  assert.ok(noteRowMenu("Grid").every((item) => item.hint));
});

test("an archived note's ⋯ offers Unarchive", () => {
  assert.deepEqual(noteRowMenu("Grid", true).map((item) => item.label), ["Move to collection…", "Download", "Unarchive", "Delete"]);
});

test("a Collection's ⋯ offers a new note in it, Download all, Archive all and Delete collection", () => {
  const [top] = folders(notebookMenu(notebookWith(), ""));
  assert.deepEqual(top.menu.map((item) => [item.kind, item.label]), [
    ["newNote", "New note in TOP Foundations"],
    ["download", "Download all"],
    ["archive", "Archive all"],
    ["delete", "Delete collection"],
  ]);
  assert.equal(top.menu[1].hint, "Download the 2 notes in “TOP Foundations” as one zip");
});

test("an empty Collection's ⋯ only offers a new note in it and Delete collection", () => {
  const notebook = notebookWith();
  notebook.newCollection("Biology");
  const biology = folders(notebookMenu(notebook, "")).find((f) => f.course === "Biology");
  assert.deepEqual(biology.menu.map((item) => item.kind), ["newNote", "delete"]);
});

test("Move to collection lists every Collection, the note's own marked, and Not in a collection", () => {
  const notebook = notebookWith();
  notebook.newCollection("Biology");
  assert.deepEqual(moveChoices(notebook, "TOP Foundations"), {
    choices: [
      { course: "Biology", label: "Biology", current: false },
      { course: "TOP Foundations", label: "TOP Foundations", current: true },
      { course: "", label: "Not in a collection", current: false },
    ],
    empty: null,
  });
});

test("a note in no Collection is not offered Not in a collection, and without Collections it says how to make one", () => {
  const notebook = notebookWith();
  assert.deepEqual(moveChoices(notebook, undefined).choices.map((choice) => choice.label), ["TOP Foundations"]);
  const bare = createNotebook({ storage: memoryStorage() });
  assert.deepEqual(moveChoices(bare, undefined), { choices: [], empty: "No collections yet. Make one with + New next to Collections." });
});

test("the questions and notices of a Collection's row say what happens", () => {
  assert.equal(madeCollectionNotice("Biology"), "Made the collection “Biology”. Move notes into it from their ⋯.");
  assert.equal(collectionTakenText("Biology"), "There is already a collection “Biology”.");
  assert.equal(renamedCollectionNotice("Odin"), "Renamed the collection to “Odin”.");
  assert.equal(deletedKeptNotesNotice("Odin", 3), "Deleted the collection “Odin”. Its 3 notes are in Not in a collection.");
  assert.equal(movedNotice("Grid", "Odin"), "Moved “Grid” to Odin.");
  assert.equal(movedNotice("Grid", ""), "Took “Grid” out of its collection.");
});

test("deleting a Collection asks whether its notes stay, naming the Notes Home on Delete all", () => {
  assert.deepEqual(deleteCollectionChoice("Testing", 12, "github"), {
    text: "Delete the collection “Testing”? Its 12 notes can stay, without a collection.",
    keepNotes: { label: "Delete, keep notes", hint: "Delete the collection. Its notes go to Not in a collection" },
    all: { label: "Delete all", hint: "Delete the collection and its 12 notes for good. They're also removed from your GitHub repo." },
  });
  assert.equal(deleteCollectionChoice("Testing", 1, null).all.hint, "Delete the collection and its 1 note for good.");
});

test("deleting an empty Collection asks a plain question", () => {
  assert.deepEqual(deleteCollectionChoice("Biology", 0, "github"), {
    text: "Delete the empty collection “Biology”?",
    keepNotes: null,
    all: { label: "Delete", hint: "Delete the empty collection" },
  });
});

// The expanded view (#123): each note's second line.
test("in the expanded view a note says when it was edited and in which Collection", () => {
  const now = new Date("2026-10-21T15:00:00");
  assert.equal(editedLine({ edited: "2026-10-21T09:00:00", course: "Odin" }, now), "Edited today, in Odin");
  assert.equal(editedLine({ edited: "2026-10-20T09:00:00" }, now), "Edited yesterday");
  assert.equal(editedLine({ created: "2026-10-02T09:00:00", course: "Khan" }, now), "Edited 2 October, in Khan");
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

test("the delete questions name the real Notes Home", () => {
  assert.equal(deleteNoteQuestion("Flexbox", "github"), "Delete “Flexbox” for good? It is also removed from your GitHub repo.");
  assert.equal(deleteNoteQuestion("Flexbox", "google-drive"), "Delete “Flexbox” for good? It is also removed from Google Drive.");
  assert.equal(deleteNoteQuestion("Flexbox", "folder"), "Delete “Flexbox” for good? It is also removed from your notes folder.");
  assert.equal(
    deleteCollectionChoice("Testing", 1, "google-drive").all.hint,
    "Delete the collection and its 1 note for good. They're also removed from Google Drive.",
  );
  assert.equal(archivedNotice(12), "Archived 12 notes.");
});

test("with notes only in this browser the delete questions name no other place", () => {
  assert.equal(deleteNoteQuestion("Flexbox", "browser"), "Delete “Flexbox” for good?");
  assert.equal(deleteNoteQuestion("Flexbox", null), "Delete “Flexbox” for good?");
  assert.equal(deleteCollectionChoice("Testing", 12, "browser").all.hint, "Delete the collection and its 12 notes for good.");
});

test("a note with a page is from a website and one without is your own", () => {
  const notebook = notebookWith();
  assert.deepEqual(noteOrigin(notebook, "Flexbox"), { kind: "website", hint: "From a website" });
  assert.deepEqual(noteOrigin(notebook, "Margins"), { kind: "own", hint: "Your own note" });
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

// Page groups (#92): a website with several notes outside any Collection is
// its own folder in "Not in a collection", named after the page, until you
// move it.
function noCollectionPart(parts) {
  return parts.find((part) => part.kind === "folder" && part.label === "Not in a collection").parts;
}

function pageWithTwoNotes() {
  const notebook = notebookWith();
  notebook.createNote({ title: "Margin collapse", source: "https://example.com/loose", pageTitle: "Loose page, a guide", created: "2026-10-03T09:00:00.000Z" });
  return notebook;
}

test("a website with two notes outside a Collection is its own folder, named after the page", () => {
  const notebook = pageWithTwoNotes();
  assert.deepEqual(noCollectionPart(notebookMenu(notebook, "")), [
    {
      kind: "folder",
      key: "page:https://example.com/loose",
      label: "Loose page, a guide",
      hint: "Notes for this website",
      icon: "globe",
      count: 2,
      open: false,
      renamable: false,
      page: "https://example.com/loose",
      titles: ["Loose page", "Margin collapse"],
      menu: [{ kind: "move", label: "Move to collection…", icon: "folder", hint: "Move the notes for “Loose page, a guide” to a collection" }],
      parts: [{ kind: "notes", titles: ["Loose page", "Margin collapse"] }],
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
  const group = noCollectionPart(notebookMenu(notebook, "")).find((part) => part.kind === "folder");
  assert.equal(group.label, "example.com/loose");
});

test("page groups and plain rows stand in one list sorted by name", () => {
  const notebook = pageWithTwoNotes();
  notebook.createNote({ title: "Aside" });
  notebook.createNote({ title: "Zebra" });
  const parts = noCollectionPart(notebookMenu(notebook, ""));
  assert.deepEqual(
    parts.map((part) => (part.kind === "folder" ? `group ${part.label}` : part.titles.join(", "))),
    ["Aside", "group Loose page, a guide", "Margins, Zebra"],
  );
});

test("a website's notes inside a Collection stay a plain list there", () => {
  const notebook = notebookWith();
  notebook.createNote({ title: "Flex again", course: "TOP Foundations", source: "https://odin.example/flex" });
  const collection = notebookMenu(notebook, "").find((part) => part.kind === "folder" && part.course === "TOP Foundations");
  assert.deepEqual(collection.parts[0].titles, ["Box model", "Flex again", "Flexbox"]);
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
