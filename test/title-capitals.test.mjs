import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Titles that differ only in capitals name one file on Windows and macOS
// (#118), so the Notebook counts them as the same title.

test("renaming a note to its own title in other capitals works", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Lists" });
  const result = notebook.renameNote("Lists", "lists");
  assert.equal(result.ok, true);
  assert.equal(notebook.note("lists").title, "lists");
  assert.equal(notebook.note("Lists"), undefined);
});

test("renaming another note to a taken title in other capitals is refused with a suggestion", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Lists" });
  notebook.createNote({ title: "Arrays" });
  const result = notebook.renameNote("Arrays", "lists");
  assert.equal(result.ok, false);
  assert.equal(result.suggestion, "lists 2");
  assert.notEqual(notebook.note("Arrays"), undefined);
});

test("a new note titled like another in other capitals gets a free title", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Lists" });
  const made = notebook.createNote({ title: "lists" });
  assert.equal(made.title, "lists 2");
  assert.equal(notebook.note("Lists").title, "Lists");
});

function clashingStorage() {
  const storage = memoryStorage();
  storage.putNote({ title: "Lists", created: "2026-10-01T09:00:00.000Z", edited: "2026-10-01T09:00:00.000Z", body: "Big one. See [[lists]]." });
  storage.putNote({ title: "lists", created: "2026-10-02T09:00:00.000Z", edited: "2026-10-02T09:00:00.000Z", body: "Small one." });
  storage.putNote({ title: "Index", created: "2026-10-03T09:00:00.000Z", body: "[[Lists]] and [[lists]]" });
  return storage;
}

test("two notes already clashing in capitals keep their text, the newer one numbered", () => {
  const notebook = createNotebook({ storage: clashingStorage() });
  assert.equal(notebook.note("Lists").body, "Big one. See [[lists 2]].");
  assert.equal(notebook.note("lists 2").body, "Small one.");
  assert.equal(notebook.note("lists"), undefined);
  assert.equal(notebook.note("Index").body, "[[Lists]] and [[lists 2]]");
});

test("two existing notes in different capitals sync to two different files", async () => {
  const remote = memoryRemote({});
  const notebook = createNotebook({ storage: clashingStorage() });
  await notebook.firstSync(remote);
  await notebook.sync(remote);
  const paths = Object.keys(remote.files()).map((path) => path.toLowerCase());
  assert.equal(paths.length, 3);
  assert.equal(new Set(paths).size, 3);
});

test("a file coming in whose title clashes in capitals with a note here keeps the file's title, and the note here is numbered", async () => {
  const incoming = { title: "lists", created: "2026-10-02T09:00:00.000Z", body: "From the folder." };
  const remote = memoryRemote({ [noteToFile(incoming).path]: noteToFile(incoming).text });
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Lists" });
  notebook.saveBody("Lists", "Mine.");
  await notebook.firstSync(remote);
  await notebook.sync(remote);
  assert.equal(notebook.note("lists").body, "From the folder.");
  assert.equal(notebook.note("Lists 2").body, "Mine.");
  const paths = Object.keys(remote.files()).map((path) => path.toLowerCase());
  assert.equal(new Set(paths).size, paths.length);
});
