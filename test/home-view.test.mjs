import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { homeView } from "../src/home-view.mjs";
import { LAYOUTS } from "../src/course-view.mjs";

// The Home layout (#127): the start screen that shows where the empty page
// would. Where you left off, your courses, the other collections and the
// notes opened lately, as plain data the sidebar only has to draw.

const NOW = new Date(2026, 9, 21, 15, 0);
const at = (month, day, hour = 9) => new Date(2026, month - 1, day, hour, 30).toISOString();

function notebookWith() {
  const storage = memoryStorage();
  storage.putNote({ title: "Box model", course: "Web Dev", created: at(10, 1), edited: at(10, 1), body: "Every box has a margin." });
  storage.putNote({ title: "Flexbox", course: "Web Dev", created: at(10, 2), edited: at(10, 2), body: "" });
  storage.putNote({ title: "Grid", course: "Web Dev", created: at(10, 3), edited: at(10, 3), body: "" });
  storage.putNote({ title: "Colour", course: "Design", created: at(10, 4), edited: at(10, 20), body: "# Colour\n\n- **Warm** colours come forward\nmore" });
  storage.putNote({ title: "Type", course: "Design", created: at(10, 5), edited: at(10, 5), body: "" });
  storage.putNote({ title: "Loose idea", created: at(10, 6), edited: at(10, 21), body: "Loose idea\nWrite in my own words." });
  storage.putNote({ title: "Put away", created: at(10, 7), edited: at(10, 21, 14), archived: true, body: "Old" });
  const notebook = createNotebook({ storage });
  notebook.makeCourse("Web Dev");
  notebook.markDone("Box model");
  return notebook;
}

test("Home is the third layout, with its one line", () => {
  assert.deepEqual(LAYOUTS.map((layout) => layout.name), ["Zen", "Course", "Home"]);
  assert.equal(LAYOUTS[2].hint, "A start screen with where you left off, your courses and your collections.");
});

test("continue shows the note edited last, not an archived one, with its collection and when", () => {
  const { resume } = homeView(notebookWith(), { now: NOW });
  assert.equal(resume.label, "Continue where you left off");
  assert.equal(resume.title, "Loose idea");
  assert.equal(resume.collection, "");
  assert.equal(resume.when, "edited today");
});

test("continue shows the first line of text, without the title and the Markdown marks", () => {
  const notebook = notebookWith();
  assert.equal(homeView(notebook, { now: NOW }).resume.firstLine, "Write in my own words.");
  notebook.archiveNote("Loose idea");
  const { resume } = homeView(notebook, { now: NOW });
  assert.equal(resume.title, "Colour");
  assert.equal(resume.collection, "Design");
  assert.equal(resume.when, "edited yesterday");
  assert.equal(resume.firstLine, "Warm colours come forward");
});

test("a note with no text yet has no first line on the continue card", () => {
  const storage = memoryStorage();
  storage.putNote({ title: "Blank", created: at(10, 1), body: "" });
  const { resume } = homeView(createNotebook({ storage }), { now: NOW });
  assert.equal(resume.firstLine, "");
  assert.equal(resume.when, "edited 1 October");
});

test("a locked secret note shows only its title on the continue card", async () => {
  const notebook = notebookWith();
  await notebook.setPasscode("open sesame");
  await notebook.makeSecret("Loose idea");
  await notebook.settled();
  notebook.lock();
  const { resume } = homeView(notebook, { now: NOW });
  assert.equal(resume.title, "Loose idea");
  assert.equal(resume.locked, true);
  assert.equal(resume.firstLine, "");
});

test("your courses show how many lessons are done, the next one and the progress", () => {
  assert.deepEqual(homeView(notebookWith(), { now: NOW }).courses, [
    { course: "Web Dev", text: "1 of 3 lessons done · next: Flexbox", progress: { done: 1, of: 3 }, open: "Flexbox" },
  ]);
});

test("a course with every lesson done opens its last lesson", () => {
  const notebook = notebookWith();
  notebook.markDone("Flexbox");
  notebook.markDone("Grid");
  const [course] = homeView(notebook, { now: NOW }).courses;
  assert.equal(course.text, "3 of 3 lessons done · next: Grid");
  assert.equal(course.open, "Grid");
});

test("without courses there are none to show", () => {
  const notebook = notebookWith();
  notebook.unmakeCourse("Web Dev");
  assert.deepEqual(homeView(notebook, { now: NOW }).courses, []);
});

test("collections that aren't courses show their number of notes and open the one edited last", () => {
  const notebook = notebookWith();
  notebook.newCollection("Books");
  assert.deepEqual(homeView(notebook, { now: NOW }).collections, [
    { name: "Books", text: "No notes yet", open: null },
    { name: "Design", text: "2 notes", open: "Colour" },
  ]);
  notebook.unmakeCourse("Web Dev");
  assert.deepEqual(
    homeView(notebook, { now: NOW }).collections.map((card) => card.name),
    ["Books", "Design", "Web Dev"],
  );
});

test("a collection of one note says note", () => {
  const notebook = notebookWith();
  notebook.archiveNote("Type");
  assert.equal(homeView(notebook, { now: NOW }).collections[0].text, "1 note");
});

test("the + New card makes a collection", () => {
  assert.deepEqual(homeView(notebookWith(), { now: NOW }).newCollection, { label: "+ New", text: "collection", hint: "Make a new collection" });
});

test("recent lists the five notes opened last, without the one to continue, each with its collection", () => {
  const notebook = notebookWith();
  for (const title of ["Box model", "Flexbox", "Grid", "Colour", "Type", "Loose idea"]) notebook.markOpened(title);
  notebook.markOpened("Colour");
  assert.deepEqual(homeView(notebook, { now: NOW }).recent, [
    { title: "Colour", collection: "Design" },
    { title: "Type", collection: "Design" },
    { title: "Grid", collection: "Web Dev" },
    { title: "Flexbox", collection: "Web Dev" },
    { title: "Box model", collection: "Web Dev" },
  ]);
});

test("the section labels are plain words", () => {
  assert.deepEqual(homeView(notebookWith(), { now: NOW }).labels, { courses: "Your courses", collections: "Collections", recent: "Recent" });
});

test("an empty Notebook says so and offers to start writing", () => {
  const view = homeView(createNotebook({ storage: memoryStorage() }), { now: NOW });
  assert.equal(view.resume, null);
  assert.deepEqual(view.empty, { text: "No notes yet.", button: "Start writing" });
  assert.deepEqual(view.courses, []);
  assert.deepEqual(view.recent, []);
});

test("a Notebook with notes is not empty", () => {
  assert.equal(homeView(notebookWith(), { now: NOW }).empty, null);
});
