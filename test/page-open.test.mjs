import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePageOpen, isOpenedByPage } from "../src/page-open.mjs";

// When the page behind the sidebar changes (a tab switch or a navigation),
// Glacier must decide whether to follow it. By default a website always wins
// (#50); with `keepUserOpenedNotes` a note the user opened themselves stays put
// and only a page-opened note, or an empty panel, follows the page
// (#29). This is the pure decision; panel.js does the drawing and the
// latest-change-wins ordering around it.

// A page-opened note for one page; a note the user navigated to.
const noteA = { title: "Page A", source: "https://a.test/lesson" };
const noteB = { title: "Page B", source: "https://b.test/lesson" };
const blank = { title: "A blank note" };

function notebook(notes) {
  return (url) => notes.find((n) => n.source === url) ?? null;
}

test("nothing open: open the page's existing note", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: { url: noteA.source, title: "Page A" },
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, { type: "open", note: noteA });
});

test("nothing open, no note for the page: offer a fresh page for the lesson", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: { url: "https://new.test/x", title: "New" },
    noteForPage: notebook([]),
  });
  assert.deepEqual(decision, {
    type: "pageDraft",
    page: { url: "https://new.test/x", title: "New" },
  });
});

test("nothing open, browser-internal page: offer a fresh page by hand", () => {
  const decision = decidePageOpen({
    current: null,
    openedByPage: false,
    page: null,
    noteForPage: notebook([]),
  });
  assert.deepEqual(decision, { type: "blankDraft" });
});

test("with the old option, a blank note opened through a Link stays put on a page change", () => {
  const decision = decidePageOpen({
    current: blank,
    openedByPage: false,
    page: { url: noteA.source, title: "Page A" },
    keepUserOpenedNotes: true,
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("with the old option, any note the user navigated to stays put, even its own page's note", () => {
  // Note A opened by following a Link, then the sidebar lands on page A: still
  // the user's note, so it is kept rather than re-opened.
  const decision = decidePageOpen({
    current: noteA,
    openedByPage: false,
    page: { url: noteA.source, title: "Page A" },
    keepUserOpenedNotes: true,
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("switching between two lesson tabs follows the page", () => {
  // Note A is open because the page opened it; moving to tab B shows B's note.
  const decision = decidePageOpen({
    current: noteA,
    openedByPage: true,
    page: { url: noteB.source, title: "Page B" },
    noteForPage: notebook([noteA, noteB]),
  });
  assert.deepEqual(decision, { type: "open", note: noteB });
});

test("a page-opened note follows to a lesson page that has no note yet", () => {
  const decision = decidePageOpen({
    current: noteA,
    openedByPage: true,
    page: { url: "https://b.test/fresh", title: "Fresh" },
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, {
    type: "pageDraft",
    page: { url: "https://b.test/fresh", title: "Fresh" },
  });
});

test("a page-opened note is kept on a browser-internal page, not replaced by a fresh page", () => {
  const decision = decidePageOpen({
    current: noteA,
    openedByPage: true,
    page: null,
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("a note just created with a Source follows the next page change", () => {
  const created = { title: "Fresh", source: "https://a.test/fresh" };
  const decision = decidePageOpen({
    current: created,
    openedByPage: isOpenedByPage(created),
    page: { url: noteB.source, title: "Page B" },
    noteForPage: notebook([noteB]),
  });
  assert.deepEqual(decision, { type: "open", note: noteB });
});

test("with the old option, a note just created without a Source is kept on a page change", () => {
  const created = { title: "By hand" };
  const decision = decidePageOpen({
    current: created,
    openedByPage: isOpenedByPage(created),
    page: { url: noteB.source, title: "Page B" },
    keepUserOpenedNotes: true,
    noteForPage: notebook([noteB]),
  });
  assert.deepEqual(decision, { type: "keep" });
});

test("by default a blank note is replaced by the website's note", () => {
  const decision = decidePageOpen({
    current: blank,
    openedByPage: false,
    page: { url: noteA.source, title: "Page A" },
    noteForPage: notebook([noteA]),
  });
  assert.deepEqual(decision, { type: "open", note: noteA });
});
