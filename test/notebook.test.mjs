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

test("the Course picker lists every Course once, in order, from the Lesson Notes", () => {
  // The "+ Lesson note" picker offers the Courses that already exist so a note
  // joins one by a click, with the last-used one preselected (issue #3). A
  // Course shows once however many Lesson Notes it holds; Concept Notes, which
  // have no Course, add nothing.
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.deepEqual(notebook.courses(), []);
  notebook.createLessonNote({
    title: "Intro",
    source: "https://e.example/intro",
    course: "TOP Foundations",
  });
  notebook.createLessonNote({
    title: "Arrays",
    source: "https://e.example/arrays",
    course: "Khan Algebra 1",
  });
  notebook.createLessonNote({
    title: "Objects",
    source: "https://e.example/objects",
    course: "TOP Foundations",
  });
  notebook.createConceptNote({ title: "Box model" });
  assert.deepEqual(notebook.courses(), ["Khan Algebra 1", "TOP Foundations"]);
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

function notebookWithNotes() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({
    title: "Introduction",
    source: "https://e.example/intro",
    course: "TOP Foundations",
  });
  notebook.createLessonNote({
    title: "Variables",
    source: "https://e.example/vars",
    course: "TOP Foundations",
  });
  notebook.createLessonNote({
    title: "Fractions",
    source: "https://k.example/fractions",
    course: "Khan Algebra 1",
  });
  notebook.createConceptNote({ title: "Box model" });
  return notebook;
}

test("search finds notes by title, ignoring case", () => {
  const notebook = notebookWithNotes();
  const results = notebook.search("BOX");
  assert.deepEqual(results.map((r) => r.title), ["Box model"]);
  assert.equal(results[0].type, "concept");
});

test("search finds notes by their text and shows the match in a snippet", () => {
  const notebook = notebookWithNotes();
  notebook.saveBody("Variables", "A variable holds a value you can reuse later.");
  const results = notebook.search("holds a");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Variables");
  assert.deepEqual(results[0].snippet, {
    before: "A variable ",
    match: "holds a",
    after: " value you can reuse later.",
  });
});

test("a long text match is cut to a short snippet around the match", () => {
  const notebook = notebookWithNotes();
  const filler = "word ".repeat(40);
  notebook.saveBody("Variables", `${filler}needle ${filler}`);
  const [result] = notebook.search("needle");
  assert.equal(result.snippet.match, "needle");
  assert.ok(result.snippet.before.length < 50);
  assert.ok(result.snippet.after.length < 50);
});

test("title matches come before text matches", () => {
  const notebook = notebookWithNotes();
  notebook.saveBody("Introduction", "Think of the box around everything.");
  const results = notebook.search("box");
  assert.deepEqual(results.map((r) => r.title), ["Box model", "Introduction"]);
});

test("a title match highlights the title, not the text", () => {
  const notebook = notebookWithNotes();
  const [result] = notebook.search("frac");
  assert.equal(result.title, "Fractions");
  assert.equal(result.snippet, undefined);
});

test("searching for nothing or for something absent finds nothing", () => {
  const notebook = notebookWithNotes();
  assert.deepEqual(notebook.search(""), []);
  assert.deepEqual(notebook.search("   "), []);
  assert.deepEqual(notebook.search("zzz"), []);
});

test("the outline lists Courses with their Lesson Notes, then the Concept Notes", () => {
  const notebook = notebookWithNotes();
  const outline = notebook.outline();
  assert.deepEqual(outline.courses, [
    { course: "Khan Algebra 1", titles: ["Fractions"] },
    { course: "TOP Foundations", titles: ["Introduction", "Variables"] },
  ]);
  assert.deepEqual(outline.concepts, ["Box model"]);
});

test("a Lesson Note without a Course is listed apart from the Courses", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createLessonNote({ title: "Loose", source: undefined, course: undefined });
  const outline = notebook.outline();
  assert.deepEqual(outline.courses, []);
  assert.deepEqual(outline.uncategorised, ["Loose"]);
});

test("recent notes list the most recently opened first, each once", () => {
  const notebook = notebookWithNotes();
  notebook.markOpened("Introduction");
  notebook.markOpened("Variables");
  notebook.markOpened("Introduction");
  assert.deepEqual(notebook.recentNotes().map((n) => n.title), [
    "Introduction",
    "Variables",
  ]);
});

test("recent notes are capped and skip notes that no longer exist", () => {
  const notebook = notebookWithNotes();
  notebook.markOpened("Fractions");
  notebook.markOpened("Gone");
  notebook.markOpened("Box model");
  assert.deepEqual(notebook.recentNotes(1).map((n) => n.title), ["Box model"]);
  assert.deepEqual(notebook.recentNotes().map((n) => n.title), [
    "Box model",
    "Fractions",
  ]);
});

test("Backlinks list exactly the notes containing [[This Title]]", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createConceptNote({ title: "Box model" });
  notebook.createLessonNote({ title: "Layout", source: "https://e.example/l", course: "CSS" });
  notebook.createLessonNote({ title: "Margins", source: "https://e.example/m", course: "CSS" });
  notebook.createLessonNote({ title: "Colours", source: "https://e.example/c", course: "CSS" });
  notebook.saveBody("Layout", "The [[Box model]] and again [[Box model]].");
  notebook.saveBody("Margins", "Part of the [[Box model]]");
  notebook.saveBody("Colours", "Nothing here, only [[Box model 2]] and [Box model].");
  notebook.saveBody("Box model", "I link to myself: [[Box model]]");
  assert.deepEqual(
    notebook.backlinks("Box model").map((note) => note.title).sort(),
    ["Layout", "Margins"],
  );
});

test("a note nobody links to has no Backlinks", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createConceptNote({ title: "Alone" });
  assert.deepEqual(notebook.backlinks("Alone"), []);
});

function renameFixture() {
  const notebook = createNotebook({ storage: memoryStorage() });
  const box = notebook.createConceptNote({ title: "Box model" });
  const lesson = notebook.createLessonNote({
    title: "CSS basics",
    source: "https://example.com/css",
    course: "TOP",
  });
  notebook.saveBody(lesson.title, "See [[Box model]] and [[Box model 2]] and [[Box model]].");
  notebook.createConceptNote({ title: "Box model 2" });
  return { notebook, box, lesson };
}

test("rename rewrites every exact [[Old Title]] and nothing else", () => {
  const { notebook } = renameFixture();
  const result = notebook.renameNote("Box model", "Boxes");
  assert.equal(result.ok, true);
  assert.equal(
    notebook.note("CSS basics").body,
    "See [[Boxes]] and [[Box model 2]] and [[Boxes]].",
  );
});

test("a renamed note has its new title and the old one is gone", () => {
  const { notebook } = renameFixture();
  const result = notebook.renameNote("Box model", "Boxes");
  assert.equal(result.note.title, "Boxes");
  assert.equal(notebook.note("Box model"), undefined);
  assert.equal(notebook.note("Boxes").type, "concept");
});

test("rename rewrites Links inside the renamed note itself", () => {
  const { notebook } = renameFixture();
  notebook.saveBody("Box model", "I am [[Box model]].");
  notebook.renameNote("Box model", "Boxes");
  assert.equal(notebook.note("Boxes").body, "I am [[Boxes]].");
});

test("Backlinks still work after a rename", () => {
  const { notebook } = renameFixture();
  notebook.renameNote("Box model", "Boxes");
  assert.deepEqual(
    notebook.backlinks("Boxes").map((note) => note.title),
    ["CSS basics"],
  );
});

test("a taken title is refused and a free alternative suggested", () => {
  const { notebook } = renameFixture();
  const result = notebook.renameNote("Box model", "CSS basics");
  assert.equal(result.ok, false);
  assert.equal(notebook.note("CSS basics").body.includes("[[Box model]]"), true);
  assert.notEqual(result.suggestion, "CSS basics");
  assert.equal(notebook.note(result.suggestion), undefined);
});

test("the suggestion for a taken title adds the Course of a Lesson Note", () => {
  const { notebook } = renameFixture();
  notebook.createLessonNote({ title: "Intro", source: "https://e.com/a", course: "TOP" });
  const other = notebook.createLessonNote({ title: "Other", source: "https://e.com/b", course: "Khan" });
  const result = notebook.renameNote(other.title, "Intro");
  assert.equal(result.suggestion, "Intro (Khan)");
});

test("renaming a note to its own title changes nothing", () => {
  const { notebook } = renameFixture();
  const result = notebook.renameNote("Box model", "Box model");
  assert.equal(result.ok, true);
  assert.equal(notebook.note("Box model").title, "Box model");
});

test("a blank new title is refused", () => {
  const { notebook } = renameFixture();
  assert.equal(notebook.renameNote("Box model", "   ").ok, false);
  assert.notEqual(notebook.note("Box model"), undefined);
});
