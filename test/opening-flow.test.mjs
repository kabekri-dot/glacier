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
