import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile, sourceLabel } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// The line above the text (#61): the Collection, changed in place, and the link
// to the lesson, labelled with its site. Tested through the Notebook core.

function notebookWithCollections() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Algebra", source: "https://khan.example/a", course: "Khan" });
  notebook.createNote({ title: "Grid", source: "https://odin.example/grid", course: "TOP" });
  notebook.createNote({ title: "Atoms", source: "https://chem.example/a", course: "Chemistry" });
  return notebook;
}

test("the Collection list starts with the last used Collection", () => {
  const notebook = notebookWithCollections();
  assert.deepEqual(notebook.courseChoices(), ["Chemistry", "Khan", "TOP"]);
  notebook.moveToCourse("Grid", "TOP");
  assert.deepEqual(notebook.courseChoices(), ["TOP", "Chemistry", "Khan"]);
});

test("changing the Collection moves the note and its file", () => {
  const notebook = notebookWithCollections();
  const before = noteToFile(notebook.note("Grid")).path;
  const moved = notebook.moveToCourse("Grid", " Khan ");
  assert.equal(moved.course, "Khan");
  assert.equal(notebook.note("Grid").course, "Khan");
  assert.equal(before, "collections/TOP/Grid.md");
  assert.equal(noteToFile(notebook.note("Grid")).path, "collections/Khan/Grid.md");
  assert.deepEqual(notebook.outline().courses.find((c) => c.course === "Khan").titles, ["Algebra", "Grid"]);
});

test("a new Collection typed in place becomes the last used one", () => {
  const notebook = notebookWithCollections();
  notebook.moveToCourse("Grid", "TOP Advanced");
  assert.equal(notebook.lastCourse(), "TOP Advanced");
  assert.equal(notebook.courseChoices()[0], "TOP Advanced");
});

test("changing the Collection moves the file in the Notes repo on the next sync", async () => {
  const notebook = notebookWithCollections();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  notebook.moveToCourse("Grid", "Khan");
  await notebook.sync(remote);
  const paths = Object.keys(remote.files());
  assert.ok(paths.includes("collections/Khan/Grid.md"));
  assert.ok(!paths.includes("collections/TOP/Grid.md"));
});

test("the link to the lesson is labelled with its site, without www", () => {
  assert.equal(sourceLabel("https://www.youtube.com/watch?v=abc"), "youtube.com");
  assert.equal(sourceLabel("https://www.theodinproject.com/lessons/x"), "theodinproject.com");
  assert.equal(sourceLabel("https://khanacademy.org/math"), "khanacademy.org");
});

test("a note can be taken out of its Collection, and its file moves to notes", async () => {
  const notebook = notebookWithCollections();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  notebook.removeFromCourse("Grid");
  assert.equal(notebook.note("Grid").course, undefined);
  await notebook.sync(remote);
  const paths = Object.keys(remote.files());
  assert.ok(paths.includes("notes/Grid.md"));
  assert.ok(!paths.includes("collections/TOP/Grid.md"));
});

test("an empty Collection is listed and offered until it has notes", () => {
  const notebook = notebookWithCollections();
  assert.equal(notebook.newCollection(" Biology "), "Biology");
  assert.ok(notebook.outline().courses.some((c) => c.course === "Biology" && c.titles.length === 0));
  assert.ok(notebook.courseChoices().includes("Biology"));
  notebook.moveToCourse("Grid", "Biology");
  assert.equal(notebook.outline().courses.filter((c) => c.course === "Biology").length, 1);
});

test("a new Collection in other capitals picks the existing one", () => {
  const notebook = notebookWithCollections();
  assert.equal(notebook.newCollection("khan"), "Khan");
  notebook.newCollection("Biology");
  assert.equal(notebook.newCollection("BIOLOGY"), "Biology");
  assert.equal(notebook.moveToCourse("Grid", "biology").course, "Biology");
  assert.equal(notebook.outline().courses.filter((c) => c.course.toLowerCase() === "biology").length, 1);
});

test("deleting an empty Collection removes it from the list", () => {
  const notebook = notebookWithCollections();
  notebook.newCollection("Biology");
  notebook.deleteCollection("Biology");
  assert.ok(!notebook.courses().includes("Biology"));
});

test("moving a note into a new Collection is one commit in the Notes repo", async () => {
  const notebook = notebookWithCollections();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  const before = remote.commits().length;
  notebook.moveToCourse("Grid", "Fresh");
  await notebook.sync(remote);
  assert.ok(Object.keys(remote.files()).includes("collections/Fresh/Grid.md"));
  assert.equal(remote.commits().length, before + 1);
});
