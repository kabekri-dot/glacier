import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteFromFile, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Courses (#126): a Collection marked for learning, its notes its lessons.
// Each lesson keeps `lesson: <number>` in its frontmatter, and `done: true`
// once finished, so it syncs and Obsidian can read it. Tested through the
// Notebook core.

function webDev() {
  const storage = memoryStorage();
  storage.putNote({ title: "Flexbox", course: "Web Dev", created: "2026-10-02T09:00:00.000Z", body: "Rows." });
  storage.putNote({ title: "Box model", course: "Web Dev", created: "2026-10-01T09:00:00.000Z", body: "Boxes." });
  storage.putNote({ title: "Grid", course: "Web Dev", created: "2026-10-03T09:00:00.000Z", body: "Two ways." });
  storage.putNote({ title: "Colour", course: "Design", created: "2026-10-01T08:00:00.000Z", body: "Hue." });
  storage.putNote({ title: "Loose", created: "2026-10-01T08:00:00.000Z", body: "Alone." });
  return createNotebook({ storage });
}

test("a Collection is not a course until it is made one", () => {
  const notebook = webDev();
  assert.equal(notebook.isCourse("Web Dev"), false);
  assert.equal(notebook.lessonOf("Flexbox"), null);
  notebook.makeCourse("Web Dev");
  assert.equal(notebook.isCourse("Web Dev"), true);
  assert.equal(notebook.isCourse("web dev"), true);
  assert.equal(notebook.isCourse("Design"), false);
});

test("making a course numbers its notes by when they were made, oldest first", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  assert.deepEqual(
    notebook.lessons("Web Dev").map(({ title, lesson }) => [title, lesson]),
    [["Box model", 1], ["Flexbox", 2], ["Grid", 3]],
  );
  assert.equal(notebook.note("Flexbox").lesson, 2);
  assert.equal(notebook.note("Colour").lesson, undefined);
});

test("a lesson knows its place, the lessons around it and the progress", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.markDone("Box model");
  assert.deepEqual(notebook.lessonOf("Flexbox"), {
    course: "Web Dev",
    at: 2,
    count: 3,
    done: false,
    doneCount: 1,
    previous: "Box model",
    next: "Grid",
    lessons: [
      { title: "Box model", lesson: 1, done: true },
      { title: "Flexbox", lesson: 2, done: false },
      { title: "Grid", lesson: 3, done: false },
    ],
  });
  assert.equal(notebook.lessonOf("Box model").previous, null);
  assert.equal(notebook.lessonOf("Grid").next, null);
  assert.equal(notebook.lessonOf("Colour"), null);
  assert.equal(notebook.lessonOf("Loose"), null);
});

test("a lesson marked done can be marked not done again", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.markDone("Grid");
  assert.equal(notebook.note("Grid").done, true);
  assert.equal(notebook.lessonOf("Grid").doneCount, 1);
  notebook.markDone("Grid", false);
  assert.equal(notebook.note("Grid").done, undefined);
  assert.equal(notebook.lessonOf("Grid").doneCount, 0);
});

test("marking done doesn't count as an edit, so the page still opens the note it opened", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  const before = notebook.note("Grid").edited;
  notebook.markDone("Grid");
  assert.equal(notebook.note("Grid").edited, before);
});

test("a note outside a course can't be marked done", () => {
  const notebook = webDev();
  notebook.markDone("Colour");
  assert.equal(notebook.note("Colour").done, undefined);
});

test("a new note in a course gets the next number", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  const made = notebook.createNote({ title: "Animations", course: "Web Dev" });
  assert.equal(made.lesson, 4);
  assert.equal(notebook.createNote({ title: "Type", course: "Design" }).lesson, undefined);
});

test("New lesson makes a note at the end of the course, named after its number", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  const made = notebook.newLesson("Web Dev");
  assert.equal(made.title, "Lesson 4");
  assert.equal(made.course, "Web Dev");
  assert.equal(notebook.lessonOf("Lesson 4").at, 4);
  assert.equal(notebook.newLesson("Web Dev").title, "Lesson 5");
});

test("the next number follows the highest one, even after a lesson went", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.deleteNote("Flexbox");
  assert.deepEqual(notebook.lessons("Web Dev").map(({ title }) => title), ["Box model", "Grid"]);
  assert.equal(notebook.lessonOf("Grid").at, 2);
  assert.equal(notebook.createNote({ title: "Animations", course: "Web Dev" }).lesson, 4);
});

test("a note moved into a course becomes its last lesson", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.moveToCourse("Loose", "Web Dev");
  assert.equal(notebook.lessonOf("Loose").at, 4);
});

test("moving a note out of the course takes its number and done away", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.markDone("Grid");
  notebook.moveToCourse("Grid", "Design");
  assert.equal(notebook.note("Grid").lesson, undefined);
  assert.equal(notebook.note("Grid").done, undefined);
  notebook.markDone("Flexbox");
  notebook.removeFromCourse("Flexbox");
  assert.equal(notebook.note("Flexbox").lesson, undefined);
  assert.equal(notebook.note("Flexbox").done, undefined);
  assert.deepEqual(notebook.lessons("Web Dev").map(({ title }) => title), ["Box model"]);
});

test("a lesson moved within its own course keeps its place", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.moveToCourse("Flexbox", "web dev");
  assert.equal(notebook.lessonOf("Flexbox").at, 2);
});

test("unmarking a course takes every number and done away", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.markDone("Grid");
  notebook.archiveNote("Box model");
  notebook.unmakeCourse("Web Dev");
  assert.equal(notebook.isCourse("Web Dev"), false);
  for (const title of ["Box model", "Flexbox", "Grid"]) {
    assert.equal(notebook.note(title).lesson, undefined);
    assert.equal(notebook.note(title).done, undefined);
  }
});

test("an archived lesson leaves the lessons and comes back to its place", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.archiveNote("Flexbox");
  assert.equal(notebook.lessonOf("Grid").count, 2);
  notebook.unarchiveNote("Flexbox");
  assert.equal(notebook.lessonOf("Flexbox").at, 2);
});

test("a note without a number in a course comes after the numbered lessons", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  const storage = memoryStorage();
  for (const note of notebook.notes()) storage.putNote(note);
  storage.putNote({ title: "From Obsidian", course: "Web Dev", created: "2026-09-01T00:00:00.000Z", body: "" });
  const again = createNotebook({ storage });
  assert.deepEqual(again.lessons("Web Dev").map(({ title }) => title), ["Box model", "Flexbox", "Grid", "From Obsidian"]);
});

test("the notes list shows a course's notes in lesson order", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  const webDevPart = notebook.outline().courses.find(({ course }) => course === "Web Dev");
  assert.deepEqual(webDevPart.titles, ["Box model", "Flexbox", "Grid"]);
});

test("a renamed course is still a course with the same lessons", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.renameCollection("Web Dev", "Frontend");
  assert.equal(notebook.isCourse("Frontend"), true);
  assert.equal(notebook.lessonOf("Grid").at, 3);
});

test("Undo after Delete, keep notes puts a course back with its lessons and progress", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.markDone("Box model");
  const kept = notebook.deleteCollectionKeepNotes("Web Dev");
  assert.equal(notebook.note("Grid").lesson, undefined);
  notebook.putBackCollection(kept);
  assert.equal(notebook.isCourse("Web Dev"), true);
  assert.equal(notebook.lessonOf("Grid").at, 3);
  assert.equal(notebook.note("Box model").done, true);
});

test("a lesson's number and done are written in its frontmatter and read back", () => {
  const note = { title: "Grid", course: "Web Dev", created: "2026-10-03T09:00:00.000Z", lesson: 3, done: true, body: "Two ways." };
  const { path, text } = noteToFile(note);
  assert.match(text, /^lesson: 3$/m);
  assert.match(text, /^done: true$/m);
  assert.deepEqual(noteFromFile(path, text), note);
});

test("a note that isn't a lesson has no lesson or done line", () => {
  const { text } = noteToFile({ title: "Colour", course: "Design", created: "2026-10-01T08:00:00.000Z", body: "Hue." });
  assert.doesNotMatch(text, /^(lesson|done):/m);
});

test("a lesson line Obsidian wrote oddly is read as no number", () => {
  const text = "---\ncollection: Web Dev\nlesson: two\ndone: maybe\n---\nRows.";
  const note = noteFromFile("collections/Web Dev/Flexbox.md", text);
  assert.equal(note.lesson, undefined);
  assert.equal(note.done, undefined);
});

test("a course and its progress sync through the Notes Home to another browser and back", async () => {
  const remote = memoryRemote({});
  const chrome = webDev();
  chrome.makeCourse("Web Dev");
  chrome.markDone("Box model");
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  assert.equal(firefox.isCourse("Web Dev"), true);
  assert.equal(firefox.lessonOf("Box model").done, true);
  assert.equal(firefox.lessonOf("Grid").at, 3);
  firefox.markDone("Grid");
  await firefox.sync(remote);
  await chrome.sync(remote);
  assert.equal(chrome.lessonOf("Grid").done, true);
  assert.equal(chrome.lessonOf("Grid").doneCount, 2);
  firefox.unmakeCourse("Web Dev");
  await firefox.sync(remote);
  await chrome.sync(remote);
  assert.equal(chrome.isCourse("Web Dev"), false);
  assert.equal(chrome.note("Box model").done, undefined);
});

test("Undo after Not a course any more puts every lesson back with its progress", () => {
  const notebook = webDev();
  notebook.makeCourse("Web Dev");
  notebook.moveToCourse("Flexbox", "Web Dev");
  notebook.markDone("Grid");
  const kept = notebook.unmakeCourse("Web Dev");
  notebook.putLessonsBack(kept);
  assert.deepEqual(notebook.lessons("Web Dev"), [
    { title: "Box model", lesson: 1, done: false },
    { title: "Flexbox", lesson: 2, done: false },
    { title: "Grid", lesson: 3, done: true },
  ]);
});
