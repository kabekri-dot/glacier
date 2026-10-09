import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";

// The Notebook core is the first test seam. It holds all note logic and has
// no screen code: storage is plugged in from outside (ADR 0003), and tests
// use an in-memory stand-in.

test("a new Notebook is empty", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.isEmpty(), true);
  assert.deepEqual(notebook.notes(), []);
});

test("a page without a Lesson Note has none (the '+ Lesson note' prompt)", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(
    notebook.lessonNoteForSource("https://example.com/lesson-1"),
    undefined,
  );
});

test("a new Lesson Note takes the page title and remembers the page as its Source", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const note = notebook.createLessonNote({
    title: "Introduction",
    source: "https://odin.example/foundations/intro",
    course: "TOP Foundations",
  });
  assert.equal(note.type, "lesson");
  assert.equal(note.title, "Introduction");
  assert.equal(note.course, "TOP Foundations");
  assert.equal(
    notebook.lessonNoteForSource("https://odin.example/foundations/intro"),
    note,
  );
});

test("Source matching ignores the query string and the #fragment", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Lesson",
    source: "https://khan.example/algebra/lesson?utm=newsletter#section-2",
    course: "Khan Algebra 1",
  });
  const found = notebook.lessonNoteForSource(
    "https://khan.example/algebra/lesson?ref=sidebar#top",
  );
  assert.ok(found);
  assert.equal(found.title, "Lesson");
});

test("the last-used Course is remembered for the picker", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.lastCourse(), undefined);
  notebook.createLessonNote({
    title: "A",
    source: "https://e.example/a",
    course: "TOP Foundations",
  });
  assert.equal(notebook.lastCourse(), "TOP Foundations");
  notebook.createLessonNote({
    title: "B",
    source: "https://e.example/b",
    course: "Khan Algebra 1",
  });
  assert.equal(notebook.lastCourse(), "Khan Algebra 1");
});

test("notes and the last-used Course survive a restart (same storage, new Notebook)", () => {
  // A browser restart throws away the Notebook object but keeps its storage
  // (IndexedDB, ADR 0003). A fresh Notebook over the same storage must see
  // every note and the last-used Course again.
  const storage = memoryStorage();
  const first = createNotebook({ storage });
  first.createLessonNote({
    title: "Variables",
    source: "https://odin.example/foundations/variables",
    course: "TOP Foundations",
  });

  const afterRestart = createNotebook({ storage });
  assert.equal(afterRestart.notes().length, 1);
  assert.equal(afterRestart.notes()[0].title, "Variables");
  assert.equal(afterRestart.lastCourse(), "TOP Foundations");
});

test("editing a note's body saves it and survives a restart", () => {
  const storage = memoryStorage();
  const first = createNotebook({ storage });
  first.createLessonNote({
    title: "Loops",
    source: "https://odin.example/foundations/loops",
    course: "TOP Foundations",
  });
  first.saveBody("Loops", "A loop repeats **until** it is done.");
  assert.equal(
    first.note("Loops").body,
    "A loop repeats **until** it is done.",
  );

  const afterRestart = createNotebook({ storage });
  assert.equal(
    afterRestart.note("Loops").body,
    "A loop repeats **until** it is done.",
  );
});

test("a clashing title gets the Course added so titles stay unique", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Introduction",
    source: "https://e.example/top",
    course: "TOP Foundations",
  });
  const second = notebook.createLessonNote({
    title: "Introduction",
    source: "https://e.example/khan",
    course: "Khan Algebra 1",
  });
  assert.equal(second.title, "Introduction (Khan Algebra 1)");
  const titles = notebook.notes().map((n) => n.title).sort();
  assert.deepEqual(titles, ["Introduction", "Introduction (Khan Algebra 1)"]);
});
