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

test("Source matching ignores the #fragment and known tracking parameters", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Lesson",
    source: "https://khan.example/algebra/lesson",
    course: "Khan Algebra 1",
  });
  // A tracking parameter (utm_*, fbclid, gclid, ref…) and a #fragment are not
  // part of the lesson, so the same Lesson Note is found.
  const viaCampaign = notebook.lessonNoteForSource(
    "https://khan.example/algebra/lesson?utm_source=mail",
  );
  const viaFragment = notebook.lessonNoteForSource(
    "https://khan.example/algebra/lesson#part-2",
  );
  assert.equal(viaCampaign?.title, "Lesson");
  assert.equal(viaFragment?.title, "Lesson");
});

test("Source matching keeps the query parameter that identifies the lesson", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const a = notebook.createLessonNote({
    title: "Video A",
    source: "https://youtube.example/watch?v=A",
    course: "A Course",
  });
  const b = notebook.createLessonNote({
    title: "Video B",
    source: "https://youtube.example/watch?v=B",
    course: "A Course",
  });
  // Two YouTube videos share the /watch path but are different lessons.
  assert.equal(a.title, "Video A");
  assert.equal(b.title, "Video B");
  assert.equal(
    notebook.lessonNoteForSource("https://youtube.example/watch?v=A")?.title,
    "Video A",
  );
  assert.equal(
    notebook.lessonNoteForSource("https://youtube.example/watch?v=B")?.title,
    "Video B",
  );
});

test("Source matching doesn't care about parameter order", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Module",
    source: "https://lms.example/course?unit=3&lesson=7",
    course: "A Course",
  });
  const found = notebook.lessonNoteForSource(
    "https://lms.example/course?lesson=7&unit=3",
  );
  assert.equal(found?.title, "Module");
});

test("Lesson Notes stored before this change (path-only Source) still match", () => {
  // A note created under the old rule kept only origin+path as its Source.
  // Visiting that path again — even with a tracking parameter — must still
  // find it, so no stored Source is orphaned by the new matching.
  const storage = memoryStorage();
  storage.putNote({
    type: "lesson",
    title: "Old Note",
    course: "A Course",
    source: "https://odin.example/foundations/intro",
    created: "2024-01-01T00:00:00.000Z",
    body: "",
  });
  const notebook = createNotebook({ storage });
  const found = notebook.lessonNoteForSource(
    "https://odin.example/foundations/intro?utm_campaign=newsletter",
  );
  assert.equal(found?.title, "Old Note");
});

test("a Lesson Note without a Source doesn't make the lookup throw", () => {
  // A stored Lesson Note can lack a Source (e.g. a half-created or imported
  // note). Looking up the Lesson Note for a page must skip it, not throw.
  const storage = memoryStorage();
  storage.putNote({
    type: "lesson",
    title: "Sourceless",
    course: "A Course",
    created: "2024-01-01T00:00:00.000Z",
    body: "",
  });
  const notebook = createNotebook({ storage });

  let found;
  assert.doesNotThrow(() => {
    found = notebook.lessonNoteForSource("https://example.com/lesson-1");
  });
  assert.equal(found, undefined);

  // A real match alongside the sourceless note is still found.
  const real = notebook.createLessonNote({
    title: "Real",
    source: "https://example.com/lesson-1",
    course: "A Course",
  });
  assert.equal(
    notebook.lessonNoteForSource("https://example.com/lesson-1"),
    real,
  );
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

test("typing on an empty Notebook is never turned into a stray note", () => {
  // On a fresh install there is no note to save into yet (issue #23). A save
  // for a title that doesn't exist is ignored rather than creating a note, so
  // the panel can keep the page read-only until a real note exists without the
  // core silently inventing one behind it.
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.saveBody("Untitled", "something I typed"), undefined);
  assert.equal(notebook.isEmpty(), true);
  assert.deepEqual(notebook.notes(), []);
});

// Concept Notes and Links (#8). A Concept Note captures one idea, belongs to
// no Course and is shared across Courses. A [[Title]] Link points to a note by
// its unique title; a Link to a note that doesn't exist yet is a Missing Link,
// and following it creates a Concept Note with that title.

test("a Concept Note has no Course and no Source", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const note = notebook.createConceptNote({ title: "Box model" });
  assert.equal(note.type, "concept");
  assert.equal(note.title, "Box model");
  assert.equal(note.course, undefined);
  assert.equal(note.source, undefined);
  assert.equal(notebook.note("Box model"), note);
});

test("outgoing Links of a note are found correctly, distinct and in order", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Layout",
    source: "https://e.example/layout",
    course: "CSS",
  });
  notebook.saveBody(
    "Layout",
    "The [[Box model]] feeds [[Flow]]; see the [[Box model]] again.",
  );
  assert.deepEqual(notebook.outgoingLinks("Layout"), ["Box model", "Flow"]);
});

test("a note with no body or no Links has no outgoing Links", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Empty",
    source: "https://e.example/empty",
    course: "CSS",
  });
  assert.deepEqual(notebook.outgoingLinks("Empty"), []);
  assert.deepEqual(notebook.outgoingLinks("No such note"), []);
});

test("following a Missing Link creates a Concept Note with that title and opens it", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.isMissingLink("Flow"), true);

  const opened = notebook.openLink("Flow");
  assert.equal(opened.type, "concept");
  assert.equal(opened.title, "Flow");
  assert.equal(opened.course, undefined);
  // It now exists, so it is no longer a Missing Link.
  assert.equal(notebook.isMissingLink("Flow"), false);
  assert.equal(notebook.note("Flow"), opened);
});

test("following a Link to an existing note opens it without creating a new one", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const existing = notebook.createLessonNote({
    title: "Variables",
    source: "https://e.example/vars",
    course: "TOP Foundations",
  });
  const opened = notebook.openLink("Variables");
  assert.equal(opened, existing);
  assert.equal(notebook.notes().length, 1);
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
