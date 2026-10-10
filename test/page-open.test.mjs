import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePageOpen, isOpenedByPage } from "../src/page-open.mjs";

// When the page behind the sidebar changes (a tab switch or a navigation),
// Glacier must decide whether to follow it. A note the user opened themselves
// — a Concept Note reached through a Link, or any note they navigated to — must
// stay put; only a page-opened Lesson Note, or an empty panel, follows the page
// (issue #29). This is the pure decision; panel.js does the drawing and the
// latest-change-wins ordering around it.

// A page-opened Lesson Note for one page; a note the user navigated to.
const lessonA = { title: "Lesson A", source: "https://a.test/lesson" };
const lessonB = { title: "Lesson B", source: "https://b.test/lesson" };
const concept = { title: "A Concept" };

function notebook(notes) {
  return (url) => notes.find((n) => n.source === url) ?? null;
}

test("nothing open: open the page's existing Lesson Note", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: { url: lessonA.source, title: "Lesson A" },
    lessonNoteForSource: notebook([lessonA]),
  });
  assert.deepEqual(decision, { type: "open", note: lessonA });
});

test("nothing open, no note for the page: offer the Lesson Note form", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: { url: "https://new.test/x", title: "New" },
    lessonNoteForSource: notebook([]),
  });
  assert.deepEqual(decision, {
    type: "lessonForm",
    page: { url: "https://new.test/x", title: "New" },
  });
});

test("nothing open, browser-internal page: offer the by-hand form", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: null,
    lessonNoteForSource: notebook([]),
  });
  assert.deepEqual(decision, { type: "newNoteForm" });
});

test("a Concept Note opened through a Link stays put on a page change", () => {
  const decision = decidePageOpen({
    current: concept,
    openedByPage: false,
    page: { url: lessonA.source, title: "Lesson A" },
    lessonNoteForSource: notebook([lessonA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("any note the user navigated to stays put, even its own page's Lesson Note", () => {
  // Lesson A opened by following a Link, then the sidebar lands on page A: still
  // the user's note, so it is kept rather than re-opened.
  const decision = decidePageOpen({
    current: lessonA,
    openedByPage: false,
    page: { url: lessonA.source, title: "Lesson A" },
    lessonNoteForSource: notebook([lessonA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("switching between two lesson tabs follows the page", () => {
  // Lesson A is open because the page opened it; moving to tab B shows B's note.
  const decision = decidePageOpen({
    current: lessonA,
    openedByPage: true,
    page: { url: lessonB.source, title: "Lesson B" },
    lessonNoteForSource: notebook([lessonA, lessonB]),
  });
  assert.deepEqual(decision, { type: "open", note: lessonB });
});

test("a page-opened note follows to a lesson page that has no note yet", () => {
  const decision = decidePageOpen({
    current: lessonA,
    openedByPage: true,
    page: { url: "https://b.test/fresh", title: "Fresh" },
    lessonNoteForSource: notebook([lessonA]),
  });
  assert.deepEqual(decision, {
    type: "lessonForm",
    page: { url: "https://b.test/fresh", title: "Fresh" },
  });
});

test("a page-opened note is kept on a browser-internal page, not replaced by a form", () => {
  const decision = decidePageOpen({
    current: lessonA,
    openedByPage: true,
    page: null,
    lessonNoteForSource: notebook([lessonA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("a Lesson Note just created with a Source follows the next page change", () => {
  const created = { title: "Fresh", source: "https://a.test/fresh" };
  const decision = decidePageOpen({
    current: created,
    openedByPage: isOpenedByPage(created),
    page: { url: lessonB.source, title: "Lesson B" },
    lessonNoteForSource: notebook([lessonB]),
  });
  assert.deepEqual(decision, { type: "open", note: lessonB });
});

test("a note just created without a Source is kept on a page change", () => {
  const created = { title: "By hand" };
  const decision = decidePageOpen({
    current: created,
    openedByPage: isOpenedByPage(created),
    page: { url: lessonB.source, title: "Lesson B" },
    lessonNoteForSource: notebook([lessonB]),
  });
  assert.deepEqual(decision, { type: "keep" });
});
