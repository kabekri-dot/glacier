import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { LAYOUTS, courseView, madeCourseNotice, notCourseNotice, doneNotice } from "../src/course-view.mjs";

// The Course layout (#126): what the sidebar draws around the open note.
// A lesson gets its course and place on top with the progress, a tab per
// lesson on the paper's edge, and Previous, Mark as done and Next lesson at
// the bottom. A note in a Collection that isn't a course gets a card.

function webDev() {
  const storage = memoryStorage();
  storage.putNote({ title: "Box model", course: "Web Dev", source: "https://www.developer.mozilla.org/box", created: "2026-10-01T09:00:00.000Z", body: "" });
  storage.putNote({ title: "Flexbox", course: "Web Dev", created: "2026-10-02T09:00:00.000Z", body: "" });
  storage.putNote({ title: "Grid", course: "Web Dev", created: "2026-10-03T09:00:00.000Z", body: "" });
  storage.putNote({ title: "Colour", course: "Design", created: "2026-10-01T08:00:00.000Z", body: "" });
  storage.putNote({ title: "Loose", created: "2026-10-01T08:00:00.000Z", body: "" });
  const notebook = createNotebook({ storage });
  notebook.makeCourse("Web Dev");
  notebook.markDone("Box model");
  return notebook;
}

const viewOf = (notebook, title, layout = "course") => courseView(notebook, notebook.note(title), layout);

test("the layouts are Zen, Course and Home, each with a one line hint", () => {
  assert.deepEqual(LAYOUTS.map((layout) => layout.name), ["Zen", "Course", "Home"]);
  assert.equal(LAYOUTS[1].hint, "For learning. A collection you mark as a course shows its notes as lessons.");
  assert.ok(LAYOUTS.every((layout) => layout.hint && !layout.hint.includes("\n")));
});

test("in Zen nothing is added, not even for a lesson", () => {
  assert.equal(viewOf(webDev(), "Flexbox", "zen"), null);
});

test("a note in no collection looks as in Zen", () => {
  assert.equal(viewOf(webDev(), "Loose"), null);
  assert.equal(courseView(webDev(), null, "course"), null);
});

test("a note in a collection that isn't a course gets a card to make it one", () => {
  assert.deepEqual(viewOf(webDev(), "Colour"), {
    kind: "ask",
    course: "Design",
    heading: "Design isn't a course.",
    text: "Make it one to see its notes as lessons, with your progress and Next lesson.",
    button: "Make Design a course",
  });
});

test("a lesson shows its course and place, how many are done and the progress", () => {
  const view = viewOf(webDev(), "Flexbox");
  assert.equal(view.kind, "lesson");
  assert.equal(view.course, "Web Dev");
  assert.equal(view.place, "Lesson 2 of 3");
  assert.equal(view.doneText, "1 done");
  assert.deepEqual(view.progress, { done: 1, of: 3 });
});

test("each lesson has a numbered tab, a tick when done, and the open one sticks out", () => {
  const view = viewOf(webDev(), "Flexbox");
  assert.deepEqual(
    view.tabs.map(({ title, label, open, done }) => [title, label, open, done]),
    [
      ["Box model", "✓", false, true],
      ["Flexbox", "2", true, false],
      ["Grid", "3", false, false],
    ],
  );
  assert.equal(view.tabs[0].hint, "Lesson 1: Box model, done");
  assert.equal(view.tabs[1].hint, "Lesson 2: Flexbox");
  assert.deepEqual(view.newTab, { label: "+", hint: "New lesson at the end" });
});

test("Previous and Next lesson name the lessons around, and stop at the ends", () => {
  const middle = viewOf(webDev(), "Flexbox");
  assert.deepEqual(middle.previous, { label: "‹ Previous", title: "Box model", hint: "Previous lesson: Box model" });
  assert.deepEqual(middle.next, { label: "Next lesson ›", title: "Grid", hint: "Next lesson: Grid" });
  assert.equal(viewOf(webDev(), "Box model").previous.title, null);
  assert.equal(viewOf(webDev(), "Grid").next.title, null);
});

test("Mark as done turns into a pressed Done, which a click undoes", () => {
  const notebook = webDev();
  assert.deepEqual(viewOf(notebook, "Flexbox").doneButton, { label: "Mark as done", pressed: false, hint: "Mark this lesson as done" });
  assert.deepEqual(viewOf(notebook, "Box model").doneButton, { label: "✓ Done", pressed: true, hint: "Done. Click to mark it not done" });
});

test("a lesson with a page links to it by its site", () => {
  assert.deepEqual(viewOf(webDev(), "Box model").pageLink, {
    label: "Lesson page: developer.mozilla.org ↗",
    source: "https://www.developer.mozilla.org/box",
  });
  assert.equal(viewOf(webDev(), "Flexbox").pageLink, null);
});

test("an archived lesson shows no course", () => {
  const notebook = webDev();
  notebook.archiveNote("Grid");
  assert.equal(viewOf(notebook, "Grid"), null);
});

test("the notices say what changed", () => {
  assert.equal(madeCourseNotice("Design"), "Design is a course now. Its notes are its lessons, in this order.");
  assert.equal(notCourseNotice("Design"), "Design isn't a course any more. Its notes stay in it.");
});

test("marking a lesson done says what comes next", () => {
  const notebook = webDev();
  notebook.markDone("Flexbox");
  assert.equal(doneNotice(notebook.lessonOf("Flexbox")), "Lesson done. Next lesson is one click away.");
  notebook.markDone("Grid");
  assert.equal(doneNotice(notebook.lessonOf("Grid")), "Every lesson of Web Dev is done.");
  notebook.markDone("Box model", false);
  assert.equal(doneNotice(notebook.lessonOf("Grid")), "Lesson done.");
});
