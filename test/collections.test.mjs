import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteFromFile, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";
import { zipFiles } from "../src/zip.mjs";

// Course became Collection (#73): files sit in collections/<Collection>/ with
// a `collection:` line, old `course:` files and courses/ folders still load,
// and Collection names ignore capital letters. Tested through the Notebook core.

const boxModel = {
  title: "Box model",
  course: "TOP Foundations",
  source: "https://odin.example/box",
  created: "2026-10-01T09:30:00.000Z",
  body: "See [[Margins]].",
};

test("a note in a Collection is written to collections/ with a collection line", () => {
  const { path, text } = noteToFile(boxModel);
  assert.equal(path, "collections/TOP Foundations/Box model.md");
  assert.match(text, /^---\ncollection: TOP Foundations\n/);
  assert.doesNotMatch(text, /^course:/m);
  assert.deepEqual(noteFromFile(path, text), boxModel);
});

test("an old file with a course line in courses/ loads into its Collection", () => {
  const text = "---\ncourse: TOP Foundations\nsource: https://odin.example/box\ncreated: 2026-10-01T09:30:00.000Z\n---\nSee [[Margins]].";
  assert.deepEqual(noteFromFile("courses/TOP Foundations/Box model.md", text), boxModel);
  assert.equal(noteFromFile("courses/CSS/Grid.md", "Two axes").course, "CSS");
  assert.equal(noteFromFile("collections/CSS/Grid.md", "Two axes").course, "CSS");
});

const oldRepo = {
  "courses/TOP Foundations/Box model.md":
    "---\ncourse: TOP Foundations\nsource: https://odin.example/box\ncreated: 2026-10-01T09:30:00.000Z\n---\nSee [[Margins]].",
  "archive/courses/TOP Foundations/Old.md": "---\ncourse: TOP Foundations\ncreated: 2026-09-01T00:00:00.000Z\n---\nGone",
  "notes/Margins.md": "---\ncreated: 2026-10-02T10:00:00.000Z\n---\nSpace",
};

test("the first sync after loading courses/ files moves them to collections/ as one commit", async () => {
  const remote = memoryRemote(oldRepo);
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  assert.deepEqual(notebook.note("Box model"), boxModel);
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()).sort(), [
    "archive/collections/TOP Foundations/Old.md",
    "collections/TOP Foundations/Box model.md",
    "notes/Margins.md",
  ]);
  assert.equal(remote.commits().length, 1);
  await notebook.sync(remote);
  assert.equal(remote.commits().length, 1);
});

test("a second browser that synced the courses/ files follows the move without losing notes", async () => {
  const remote = memoryRemote(oldRepo);
  const first = createNotebook({ storage: memoryStorage() });
  const second = createNotebook({ storage: memoryStorage() });
  await first.firstSync(remote);
  await second.firstSync(remote);
  await first.sync(remote);
  await second.sync(remote);
  assert.deepEqual(second.note("Box model"), boxModel);
  assert.equal(second.notes().length, 3);
  assert.equal(remote.commits().length, 1);
});

test("an old Export zip with courses/ folders and course lines restores", async () => {
  const zip = zipFiles([{ path: "courses/TOP Foundations/Box model.md", text: oldRepo["courses/TOP Foundations/Box model.md"] }]);
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal((await notebook.importZip(zip)).added, 1);
  assert.deepEqual(notebook.note("Box model"), boxModel);
});

// "Testing Test" with two notes and "Testing test" with one.
function notebookWithSplitCollection(storage = memoryStorage()) {
  storage.putNote({ title: "A", course: "Testing test", created: "2026-10-01T00:00:00.000Z", body: "" });
  storage.putNote({ title: "B", course: "Testing Test", created: "2026-10-02T00:00:00.000Z", body: "" });
  storage.putNote({ title: "C", course: "Testing Test", created: "2026-10-03T00:00:00.000Z", body: "" });
  storage.putMeta("lastCourse", "Testing test");
  return createNotebook({ storage });
}

test("Collections that differ only in capitals show as one, spelled like the one with the most notes", () => {
  const notebook = notebookWithSplitCollection();
  assert.deepEqual(notebook.courses(), ["Testing Test"]);
  assert.deepEqual(notebook.outline().courses, [{ course: "Testing Test", titles: ["A", "B", "C"] }]);
  assert.equal(notebook.note("A").course, "Testing Test");
  assert.deepEqual(notebook.courseChoices(), ["Testing Test"]);
});

test("on a tie in notes the older Collection's spelling wins", () => {
  const storage = memoryStorage();
  storage.putNote({ title: "New", course: "khan", created: "2026-10-05T00:00:00.000Z", body: "" });
  storage.putNote({ title: "Old", course: "Khan", created: "2026-10-01T00:00:00.000Z", body: "" });
  const notebook = createNotebook({ storage });
  assert.deepEqual(notebook.courses(), ["Khan"]);
  assert.equal(notebook.note("New").course, "Khan");
});

test("merged Collections land in one folder on the next sync, in the same commit", async () => {
  const remote = memoryRemote({
    "courses/Testing test/A.md": "---\ncourse: Testing test\ncreated: 2026-10-01T00:00:00.000Z\n---\n",
    "courses/Testing Test/B.md": "---\ncourse: Testing Test\ncreated: 2026-10-02T00:00:00.000Z\n---\n",
    "courses/Testing Test/C.md": "---\ncourse: Testing Test\ncreated: 2026-10-03T00:00:00.000Z\n---\n",
  });
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  assert.deepEqual(notebook.courses(), ["Testing Test"]);
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()).sort(), [
    "collections/Testing Test/A.md",
    "collections/Testing Test/B.md",
    "collections/Testing Test/C.md",
  ]);
  assert.equal(remote.commits().length, 1);
});

test("typing a Collection name in other capitals picks the existing Collection", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Grid", course: "Testing Test" });
  notebook.createNote({ title: "Flex" });
  assert.equal(notebook.moveToCourse("Flex", " testing TEST ").course, "Testing Test");
  assert.equal(notebook.lastCourse(), "Testing Test");
  assert.equal(notebook.createNote({ title: "Box", course: "TESTING test" }).course, "Testing Test");
  assert.deepEqual(notebook.courses(), ["Testing Test"]);
});

test("a Collection pulled in with other capitals joins the existing one", async () => {
  const remote = memoryRemote({});
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Grid", course: "Testing Test" });
  notebook.createNote({ title: "Flex", course: "Testing Test" });
  await notebook.sync(remote);
  const other = createNotebook({ storage: memoryStorage() });
  other.createNote({ title: "Box", course: "testing test" });
  await other.sync(remote);
  assert.deepEqual(other.courses(), ["Testing Test"]);
  assert.equal(other.note("Box").course, "Testing Test");
});

// Actions on a whole Collection (#74).

const wholeCollection = [
  { title: "Box model", course: "TOP Foundations", created: "2026-10-01T09:00:00.000Z", body: "Boxes." },
  { title: "Flexbox", course: "TOP Foundations", created: "2026-10-02T09:00:00.000Z", body: "Flex." },
  { title: "Algebra", course: "Khan", created: "2026-10-03T09:00:00.000Z", body: "x." },
  { title: "Loose", created: "2026-10-04T09:00:00.000Z", body: "No Collection." },
];

async function syncedWholeCollection() {
  const files = Object.fromEntries(wholeCollection.map((n) => [noteToFile(n).path, noteToFile(n).text]));
  const remote = memoryRemote(files);
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  return { notebook, remote };
}

test("archiving a Collection archives exactly its notes and says which", async () => {
  const { notebook } = await syncedWholeCollection();
  const archived = notebook.archiveCollection("top foundations");
  assert.deepEqual(archived.sort(), ["Box model", "Flexbox"]);
  assert.deepEqual(notebook.archivedNotes().map((n) => n.title), ["Box model", "Flexbox"]);
  assert.deepEqual(notebook.outline().courses.map((c) => c.course), ["Khan"]);
  assert.deepEqual(notebook.outline().uncategorised, ["Loose"]);
});

test("unarchiving a Collection brings back only its archived notes", async () => {
  const { notebook } = await syncedWholeCollection();
  notebook.archiveCollection("TOP Foundations");
  notebook.archiveNote("Algebra");
  notebook.unarchiveCollection("TOP Foundations");
  assert.deepEqual(notebook.archivedNotes().map((n) => n.title), ["Algebra"]);
  assert.deepEqual(notebook.outline().courses.map((c) => c.course), ["TOP Foundations"]);
});

test("deleting a Collection deletes exactly its notes", async () => {
  const { notebook } = await syncedWholeCollection();
  notebook.deleteCollection("TOP Foundations");
  assert.equal(notebook.note("Box model"), undefined);
  assert.equal(notebook.note("Flexbox"), undefined);
  assert.equal(notebook.note("Algebra").title, "Algebra");
  assert.equal(notebook.note("Loose").title, "Loose");
});

test("sync moves an archived Collection under archive/ and removes a deleted one", async () => {
  const { notebook, remote } = await syncedWholeCollection();
  notebook.archiveCollection("TOP Foundations");
  notebook.deleteCollection("Khan");
  await notebook.sync(remote);
  const paths = (await remote.listFiles()).map((f) => f.path).sort();
  assert.deepEqual(paths, [
    "archive/collections/TOP Foundations/Box model.md",
    "archive/collections/TOP Foundations/Flexbox.md",
    "notes/Loose.md",
  ]);
});

test("the Archive lists its notes by Collection", async () => {
  const { notebook } = await syncedWholeCollection();
  notebook.archiveCollection("TOP Foundations");
  notebook.archiveNote("Loose");
  assert.deepEqual(notebook.archivedOutline(), {
    courses: [{ course: "TOP Foundations", titles: ["Box model", "Flexbox"] }],
    uncategorised: ["Loose"],
  });
});

test("moving a website to a Collection moves every note for that page (#92)", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "First", source: "https://example.com/page" });
  notebook.createNote({ title: "Second", source: "https://example.com/page#part" });
  notebook.createNote({ title: "Elsewhere", source: "https://example.com/other" });
  const moved = notebook.movePageToCollection("https://example.com/page", "Web");
  assert.deepEqual(moved.sort(), ["First", "Second"]);
  assert.equal(notebook.note("First").course, "Web");
  assert.equal(notebook.note("Second").course, "Web");
  assert.equal(notebook.note("Elsewhere").course, undefined);
});

test("moving a website's group leaves its notes that are already in another Collection", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Loose one", source: "https://example.com/page" });
  notebook.createNote({ title: "Loose two", source: "https://example.com/page" });
  notebook.createNote({ title: "Filed", source: "https://example.com/page", course: "Elsewhere" });
  assert.deepEqual(notebook.movePageToCollection("https://example.com/page", "Web").sort(), ["Loose one", "Loose two"]);
  assert.equal(notebook.note("Filed").course, "Elsewhere");
});

test("an archived Collection downloads and prints its archived notes", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Old", course: "Done", created: "2026-10-01T09:30:00.000Z" });
  notebook.saveBody("Old", "kept");
  notebook.archiveCollection("Done");
  assert.deepEqual(notebook.notesOfCourse("Done", { archived: true }), [{ title: "Old", body: "kept" }]);
  const copy = createNotebook({ storage: memoryStorage() });
  await copy.importZip(notebook.exportCourseZip("Done", { archived: true }));
  assert.deepEqual(copy.notes().map((note) => note.title), ["Old"]);
});

test("a Collection downloads whole even when its notes differ in capitals", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "One", course: "Web" });
  notebook.createNote({ title: "Two", course: "Web" });
  assert.deepEqual(notebook.notesOfCourse("web").map((note) => note.title), ["One", "Two"]);
  const copy = createNotebook({ storage: memoryStorage() });
  await copy.importZip(notebook.exportCourseZip("WEB"));
  assert.deepEqual(copy.notes().map((note) => note.title).sort(), ["One", "Two"]);
});
