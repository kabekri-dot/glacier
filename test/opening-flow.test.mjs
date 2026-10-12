import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpeningFlow } from "../src/opening-flow.mjs";

// The Opening flow through its public interface, with a fake browser page.

const noteA = { title: "Page A", source: "https://a.test/lesson" };

function setup({ lastNote = null, permission = false, grantOnRequest = true, pages = [], open, tabSettings = {} } = {}) {
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
    noteForPage: (url) => pages.find((n) => n.source === url) ?? null,
    getLastNote: () => lastNote,
    show: (view) => shown.push(view),
    getTabSettings: () => tabSettings,
  });
  return { flow, shown, state, page, setOpen: (o) => (openNote = o) };
}

test("without permission the sidebar opens on the start prompt", async () => {
  const { flow, shown } = setup();
  await flow.start();
  assert.deepEqual(shown, [{ type: "startPrompt" }]);
});

test("allowing opens the page's note", async () => {
  const { flow, shown, state } = setup({ pages: [noteA] });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.allow();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("allowing on an unknown lesson page shows a fresh page", async () => {
  const { flow, shown, state } = setup();
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.allow();
  assert.deepEqual(shown, [
    { type: "pageDraft", page: { url: "https://new.test/x", title: "New" } },
  ]);
});

test("declining the browser's prompt shows a fresh page by hand", async () => {
  const { flow, shown } = setup({ grantOnRequest: false });
  await flow.allow();
  assert.deepEqual(shown, [{ type: "blankDraft" }]);
});

test("choosing Not now shows a fresh page by hand", () => {
  const { flow, shown } = setup();
  flow.decline();
  assert.deepEqual(shown, [{ type: "blankDraft" }]);
});

test("with permission already granted the sidebar opens the page's note", async () => {
  const { flow, shown, state } = setup({ permission: true, pages: [noteA] });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.start();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("a title-less page uses its address as the title", async () => {
  const { flow, shown, state } = setup({ permission: true });
  state.tab = { url: "https://new.test/x" };
  await flow.start();
  assert.deepEqual(shown[0].page, { url: "https://new.test/x", title: "https://new.test/x" });
});

for (const url of ["chrome://settings", "file:///home/me/lesson.pdf"]) {
  test(`${url} offers a fresh page by hand, not a note`, async () => {
    const { flow, shown, state } = setup({
      permission: true,
      pages: [{ title: "Trap", source: url }],
    });
    state.tab = { url, title: "Page" };
    await flow.start();
    assert.deepEqual(shown, [{ type: "blankDraft" }]);
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
    noteForPage: (url) => (url === noteA.source ? noteA : null),
    show: (view) => shown.push(view),
  });
  const first = flow.pageChanged();
  const second = flow.pageChanged();
  await new Promise((resolve) => setImmediate(resolve));
  reads[1]({ url: noteA.source, title: "A" });
  await second;
  reads[0]({ url: "https://old.test/", title: "Old" });
  await first;
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

const blank = { title: "A blank note" };
const noteB = { title: "Page B", source: "https://b.test/lesson" };

test("a note the user opened is replaced by a website's note", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [noteA],
    open: { current: blank, openedByPage: false },
  });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.pageChanged();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("a note made by hand is replaced by a fresh page on a website with no note", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    open: { current: blank, openedByPage: false },
  });
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.pageChanged();
  assert.deepEqual(shown, [
    { type: "pageDraft", page: { url: "https://new.test/x", title: "New" } },
  ]);
});

test("a non-website page keeps the open note", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [noteA],
    open: { current: blank, openedByPage: false },
  });
  state.tab = { url: "chrome://settings", title: "Settings" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("switching back to a tab shows that tab's note again", async () => {
  const { flow, shown, state, setOpen } = setup({
    permission: true,
    pages: [noteA, noteB],
  });
  state.tab = { url: noteA.source, title: "A" };
  await flow.pageChanged();
  setOpen({ current: blank, openedByPage: false });
  state.tab = { url: noteB.source, title: "B" };
  await flow.pageChanged();
  state.tab = { url: noteA.source, title: "A" };
  await flow.pageChanged();
  assert.deepEqual(shown, [
    { type: "open", note: noteA },
    { type: "open", note: noteB },
    { type: "open", note: noteA },
  ]);
});

test("with the old option on, a note the user opened stays put", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [noteA],
    open: { current: blank, openedByPage: false },
    tabSettings: { keepUserOpenedNotes: true },
  });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("a page change follows a page-opened note to the new page", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    pages: [noteA],
    open: { current: { title: "Other" }, openedByPage: true },
  });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.pageChanged();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("a page change without permission is ignored", async () => {
  const { flow, shown, state } = setup({ pages: [noteA] });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("listening forwards the browser's page changes to the flow", async () => {
  const { flow, shown, state } = setup({ permission: true, pages: [noteA] });
  state.tab = { url: noteA.source, title: "Page A" };
  flow.listen();
  await state.listener();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("a setting changed after the flow was made takes effect on the next page change", async () => {
  const settings = { keepUserOpenedNotes: false };
  const shown = [];
  const state = { tab: { url: noteA.source, title: "Page A" } };
  const flow = createOpeningFlow({
    page: {
      currentPage: () => Promise.resolve(state.tab),
      hasPermission: () => Promise.resolve(true),
      requestPermission: () => Promise.resolve(true),
      onPageChange: () => {},
    },
    getOpenNote: () => ({ current: blank, openedByPage: false }),
    noteForPage: () => noteA,
    show: (view) => shown.push(view),
    getTabSettings: () => settings,
  });
  await flow.pageChanged();
  settings.keepUserOpenedNotes = true;
  await flow.pageChanged();
  assert.deepEqual(shown, [{ type: "open", note: noteA }]);
});

test("on a page that is not a website the open note is kept by default", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    open: { current: blank, openedByPage: false },
  });
  state.tab = { url: "chrome://newtab/", title: "New Tab" };
  await flow.pageChanged();
  assert.deepEqual(shown, []);
});

test("on a page that is not a website a fresh page by hand shows when chosen", async () => {
  const { flow, shown, state } = setup({
    permission: true,
    open: { current: blank, openedByPage: false },
    tabSettings: { onNonWebsite: "newNoteForm" },
  });
  state.tab = { url: "chrome://newtab/", title: "New Tab" };
  await flow.pageChanged();
  assert.deepEqual(shown, [{ type: "blankDraft" }]);
});

test("New note for this page opens a fresh page with the title ready to edit", async () => {
  const { flow, shown, state } = setup({ permission: true });
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.newNoteForPage();
  assert.deepEqual(shown, [
    { type: "pageDraft", page: { url: "https://new.test/x", title: "New" }, editTitle: true },
  ]);
});

test("New note for this page on a page that has a note still opens a fresh page", async () => {
  const { flow, shown, state } = setup({ permission: true, pages: [noteA] });
  state.tab = { url: noteA.source, title: "Page A" };
  await flow.newNoteForPage();
  assert.deepEqual(shown, [
    { type: "pageDraft", page: { url: noteA.source, title: "Page A" }, editTitle: true },
  ]);
});

test("New note for this page without permission shows the permission card", async () => {
  const { flow, shown } = setup();
  await flow.newNoteForPage();
  assert.deepEqual(shown, [{ type: "permissionCard" }]);
});

test("a fresh sidebar on a browser page opens the note you were last on", async () => {
  const last = { title: "Last one" };
  const { flow, shown } = setup({ permission: true, lastNote: last });
  await flow.start();
  assert.deepEqual(shown, [{ type: "open", note: last, byPage: false }]);
});

test("a fresh sidebar on a website without a note still shows its empty page", async () => {
  const { flow, shown, state } = setup({ permission: true, lastNote: { title: "Last one" } });
  state.tab = { url: "https://new.test/x", title: "New" };
  await flow.start();
  assert.deepEqual(shown, [{ type: "pageDraft", page: { url: "https://new.test/x", title: "New" } }]);
});
