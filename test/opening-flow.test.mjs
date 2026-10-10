import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpeningFlow } from "../src/opening-flow.mjs";

// The Opening flow through its public interface, with a fake browser page.

const lessonA = { title: "Lesson A", source: "https://a.test/lesson" };

function setup({ permission = false, grantOnRequest = true, pages = [], open } = {}) {
  const shown = [];
  const state = { permission, tab: null, listener: null };
  let openNote = open ?? { current: null, openedByPage: false };
  const page = {
    currentPage: () => Promise.resolve(state.tab),
    hasPermission: () => Promise.resolve(state.permission),
    requestPermission: () => {
      if (grantOnRequest) state.permission = true;
      return Promise.resolve(grantOnRequest);
    },
    onPageChange: (fn) => (state.listener = fn),
  };
  const flow = createOpeningFlow({
    page,
    getOpenNote: () => openNote,
    lessonNoteForSource: (url) => pages.find((n) => n.source === url) ?? null,
    show: (view) => shown.push(view),
  });
  return { flow, shown, state, page, setOpen: (o) => (openNote = o) };
}

test("without permission the sidebar opens on the start prompt", async () => {
  const { flow, shown } = setup();
  await flow.start();
  assert.deepEqual(shown, [{ type: "startPrompt" }]);
});

test("clicking + Lesson note without permission shows the permission card", async () => {
  const { flow, shown } = setup();
  await flow.clickLessonNote();
  assert.deepEqual(shown, [{ type: "permissionCard" }]);
});

test("allowing opens the page's Lesson Note", async () => {
  const { flow, shown, state } = setup({ pages: [lessonA] });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.allow();
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

test("allowing on an unknown lesson page shows the lesson form", async () => {
  const { flow, shown, state } = setup();
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.allow();
  assert.deepEqual(shown, [
    { type: "lessonForm", page: { url: "https://new.test/x", title: "New" } },
  ]);
});

test("declining the browser's prompt shows the new-note form", async () => {
  const { flow, shown } = setup({ grantOnRequest: false });
  await flow.allow();
  assert.deepEqual(shown, [{ type: "newNoteForm" }]);
});

test("choosing Not now shows the new-note form", () => {
  const { flow, shown } = setup();
  flow.decline();
  assert.deepEqual(shown, [{ type: "newNoteForm" }]);
});

test("with permission already granted the sidebar opens the page's note", async () => {
  const { flow, shown, state } = setup({ permission: true, pages: [lessonA] });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.start();
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

test("a title-less page uses its address as the title", async () => {
  const { flow, shown, state } = setup({ permission: true });
  state.tab = { url: "https://new.test/x" };
  await flow.start();
  assert.deepEqual(shown[0].page, { url: "https://new.test/x", title: "https://new.test/x" });
});

for (const url of ["chrome://settings", "file:///home/me/lesson.pdf"]) {
  test(`${url} offers the new-note form, not a Lesson Note`, async () => {
    const { flow, shown, state } = setup({
      permission: true,
      pages: [{ title: "Trap", source: url }],
    });
    state.tab = { url, title: "Page" };
    await flow.start();
    assert.deepEqual(shown, [{ type: "newNoteForm" }]);
  });
}

test("two quick page changes resolving out of order end on the latest page", async () => {
  const reads = [];
  const shown = [];
  const flow = createOpeningFlow({
    page: {
      currentPage: () => new Promise((resolve) => reads.push(resolve)),
      hasPermission: () => Promise.resolve(true),
      requestPermission: () => Promise.resolve(true),
      onPageChange: () => {},
    },
    getOpenNote: () => ({ current: null, openedByPage: false }),
    lessonNoteForSource: (url) => (url === lessonA.source ? lessonA : null),
    show: (view) => shown.push(view),
  });
  const first = flow.pageChanged();
  const second = flow.pageChanged();
  await new Promise((resolve) => setImmediate(resolve));
  reads[1]({ url: lessonA.source, title: "A" });
  await second;
  reads[0]({ url: "https://old.test/", title: "Old" });
  await first;
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

test("a page change doesn't replace a note the user opened themselves", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [lessonA],
    open: { current: { title: "A Concept" }, openedByPage: false },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("a page change follows a page-opened note to the new page", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [lessonA],
    open: { current: { title: "Other" }, openedByPage: true },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

test("a page change without permission is ignored", async () => {
  const { flow, shown, state } = setup({ pages: [lessonA] });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("listening forwards the browser's page changes to the flow", async () => {
  const { flow, shown, state } = setup({ permission: true, pages: [lessonA] });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  flow.listen();
  await state.listener();
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

// The pill's "Note for this page" entry (#48).

function setupEntry({ permission = true, pages = [lessonA], open } = {}) {
  const entries = [];
  const base = setup({ permission, pages, open });
  const flow = createOpeningFlow({
    page: base.page,
    getOpenNote: () => open ?? { current: null, openedByPage: false },
    lessonNoteForSource: (url) => pages.find((n) => n.source === url) ?? null,
    show: (view) => base.shown.push(view),
    showPageEntry: (entry) => entries.push(entry),
  });
  return { ...base, flow, entries };
}

const concept = { title: "A Concept" };

test("a kept note on a lesson page with a Lesson Note offers to open it", async () => {
  const { flow, state, entries } = setupEntry({
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.deepEqual(entries.at(-1), { type: "openPageNote", note: lessonA });
});

test("a kept note on a lesson page without a Lesson Note offers to make one", async () => {
  const { flow, state, entries } = setupEntry({
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.pageChanged();
  assert.deepEqual(entries.at(-1), {
    type: "makePageNote",
    page: { url: "https://new.test/x", title: "New" },
  });
});

test("no entry when the note on screen is the page's own note", async () => {
  const { flow, state, entries } = setupEntry({
    open: { current: lessonA, openedByPage: false },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.equal(entries.at(-1), null);
});

test("no entry on a page that isn't a lesson page", async () => {
  const { flow, state, entries } = setupEntry({
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: "chrome://newtab", title: "New Tab" };
  await flow.pageChanged();
  assert.equal(entries.at(-1), null);
});

test("no entry without the tabs permission", async () => {
  const { flow, state, entries } = setupEntry({
    permission: false,
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.start();
  await flow.pageChanged();
  assert.ok(entries.length > 0);
  assert.ok(entries.every((e) => e === null));
});

test("no entry once the page's note is shown by the page", async () => {
  const { flow, state, entries } = setupEntry({
    open: { current: { title: "Other" }, openedByPage: true },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  assert.equal(entries.at(-1), null);
});

test("clicking the entry opens the page's note, page-opened", async () => {
  const { flow, state, shown } = setupEntry({
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.pageChanged();
  await flow.clickPageEntry();
  assert.deepEqual(shown, [{ type: "open", note: lessonA }]);
});

test("clicking the entry on a page with no note shows the lesson form", async () => {
  const { flow, state, shown } = setupEntry({
    open: { current: concept, openedByPage: false },
  });
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.pageChanged();
  await flow.clickPageEntry();
  assert.deepEqual(shown, [
    { type: "lessonForm", page: { url: "https://new.test/x", title: "New" } },
  ]);
});

test("opening a note by hand refreshes the entry without showing anything", async () => {
  const { flow, state, entries, shown } = setupEntry();
  state.tab = { url: lessonA.source, title: "Lesson A" };
  await flow.refreshPageEntry();
  assert.equal(entries.at(-1), null);
  assert.deepEqual(shown, []);
});
