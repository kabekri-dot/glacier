import { test } from "node:test";
import assert from "node:assert/strict";

import { createScreen } from "../src/screen.mjs";
import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";

// The Screen owns what the sidebar shows: the note on screen, whether the page
// opened it, the fresh page and the note before it, the ← history and saving.
// Tested through its public interface with the in-memory storage and timers
// that only fire when the test says so.

const page = { url: "https://odin.example/lesson?utm_source=x", title: "Flexbox" };

function manualTimer() {
  let fn = null;
  return {
    setTimer: (callback) => {
      fn = callback;
      return 1;
    },
    clearTimer: () => {
      fn = null;
    },
    fire: () => {
      const callback = fn;
      fn = null;
      callback?.();
    },
  };
}

function setup({ onSaveError = () => {}, notebook = createNotebook({ storage: memoryStorage() }) } = {}) {
  const timer = manualTimer();
  const left = [];
  const screen = createScreen({
    notebook,
    onSaveError,
    beforeLeave: () => left.push(screen.note()?.title ?? null),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  return { notebook, screen, timer, left };
}

function withNotes() {
  const context = setup();
  const { notebook } = context;
  const first = notebook.createNote({ title: "First" });
  const second = notebook.createNote({ title: "Second" });
  const grid = notebook.createNote({ title: "Grid", source: "https://odin.example/grid", course: "TOP" });
  return { ...context, first, second, grid };
}

// --- Opening notes, by the page or by the user (ADR 0009) -----------------

test("a note opened by the page is on screen as opened by the page", () => {
  const { screen, grid } = withNotes();
  const view = screen.show({ type: "open", note: grid });
  assert.deepEqual(view, { type: "note", note: grid, reload: true });
  assert.deepEqual(screen.onScreen(), { current: grid, openedByPage: true });
});

test("a note opened by the user is on screen as not opened by the page", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  assert.deepEqual(screen.onScreen(), { current: first, openedByPage: false });
});

test("opening a note lists it first in the recent notes", () => {
  const { notebook, screen, first, second } = withNotes();
  screen.open(second);
  screen.open(first);
  assert.deepEqual(notebook.recentNotes().map((n) => n.title), ["First", "Second"]);
});

test("the editor is told before a note is left, so an open / menu goes first", () => {
  const { screen, first, second, left } = withNotes();
  screen.open(first);
  screen.open(second);
  assert.deepEqual(left, [null, "First"]);
});

test("the start prompt and the permission card show no note", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  assert.deepEqual(screen.show({ type: "startPrompt" }), { type: "startPrompt" });
  assert.equal(screen.note(), null);
  assert.deepEqual(screen.show({ type: "permissionCard" }), { type: "permissionCard" });
  assert.equal(screen.note(), null);
  assert.equal(screen.freshPage(), null);
});

// --- A fresh page (#61) ----------------------------------------------------

test("a fresh page for a website makes no note until you type", () => {
  const { notebook, screen } = setup();
  const view = screen.show({ type: "pageDraft", page });
  assert.deepEqual(view, { type: "freshPage", title: "Flexbox", source: page.url, editTitle: false });
  assert.deepEqual(screen.freshPage(), { title: "Flexbox", source: page.url });
  assert.equal(screen.edit(""), null);
  assert.deepEqual(notebook.notes(), []);
});

test("clicking on a fresh page or leaving it without typing makes nothing", () => {
  const { notebook, screen, first } = withNotes();
  screen.show({ type: "pageDraft", page });
  screen.open(first);
  screen.startFreshPage({});
  screen.show({ type: "startPrompt" });
  assert.deepEqual(notebook.notes().map((n) => n.title).sort(), ["First", "Grid", "Second"]);
});

test("the first character makes a note for the page with its title, Source and last Course", () => {
  const { notebook, screen } = withNotes();
  screen.show({ type: "pageDraft", page });
  const view = screen.edit("F");
  screen.flush();
  const note = notebook.note("Flexbox");
  assert.deepEqual(view, { type: "note", note: { ...note, body: "", edited: view.note.created }, reload: false, changed: true });
  assert.equal(note.source, "https://odin.example/lesson");
  assert.equal(note.course, "TOP");
  assert.equal(note.body, "F");
  assert.equal(screen.freshPage(), null);
  assert.deepEqual(screen.onScreen(), { current: view.note, openedByPage: true });
});

test("a page that has a note can get a second one, under a free title", () => {
  const { notebook, screen } = withNotes();
  screen.show({ type: "open", note: notebook.createNote({ title: "Flexbox", source: page.url, course: "TOP", created: "2026-10-01T09:00:00.000Z" }) });
  screen.show({ type: "pageDraft", page });
  const view = screen.edit("More");
  assert.equal(view.note.title, "Flexbox (TOP)");
  assert.deepEqual(notebook.notesForPage(page.url).map((note) => note.title), ["Flexbox (TOP)", "Flexbox"]);
});

test("typing more after the first character keeps one note", () => {
  const { notebook, screen } = setup();
  screen.show({ type: "pageDraft", page });
  screen.edit("F");
  assert.equal(screen.edit("Fl"), null);
  screen.flush();
  assert.equal(notebook.notes().length, 1);
  assert.equal(notebook.note("Flexbox").body, "Fl");
});

test("a note made on a fresh page can be gone back to with ←", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  screen.startFreshPage({ title: "Idea" });
  screen.edit("x");
  assert.equal(screen.previous(), "First");
  assert.equal(screen.back().note.title, "First");
});

test("confirming the title makes exactly one note", () => {
  const { notebook, screen } = setup();
  screen.startFreshPage({ editTitle: true });
  const view = screen.confirmTitle("  Box model ");
  assert.equal(view.type, "note");
  assert.equal(view.note.title, "Box model");
  screen.edit("idea");
  screen.flush();
  assert.equal(notebook.notes().length, 1);
  assert.equal(notebook.note("Box model").body, "idea");
});

test("an empty title is refused and makes nothing", () => {
  const { notebook, screen } = setup();
  screen.startFreshPage({});
  assert.deepEqual(screen.confirmTitle("   "), { type: "titleRefused" });
  assert.deepEqual(notebook.notes(), []);
  assert.notEqual(screen.freshPage(), null);
});

test("a confirmed title that is taken gets the Course added", () => {
  const { notebook, screen } = setup();
  notebook.createNote({ title: "Introduction", course: "TOP" });
  screen.show({ type: "pageDraft", page: { url: page.url, title: "Introduction" } });
  assert.equal(screen.confirmTitle("Introduction").note.title, "Introduction (TOP)");
});

test("a blank note has no page or Course and is not opened by the page", () => {
  const { notebook, screen } = withNotes();
  assert.deepEqual(screen.show({ type: "blankDraft" }), {
    type: "freshPage",
    title: "",
    source: undefined,
    editTitle: false,
  });
  screen.confirmTitle("Reading notes");
  assert.equal(notebook.note("Reading notes").source, undefined);
  assert.equal(notebook.note("Reading notes").course, undefined);
  assert.equal(screen.onScreen().openedByPage, false);
});

test("a note made by writing first takes its title from the first line", () => {
  const { notebook, screen } = setup();
  screen.startFreshPage({});
  const view = screen.edit("# Box model basics and more words here\nSecond line");
  screen.flush();
  assert.equal(view.note.title, "Box model basics and more");
  assert.equal(notebook.note("Box model basics and more").body, "# Box model basics and more words here\nSecond line");
});

test("a title taken from the first line that clashes gets a free name", () => {
  const { notebook, screen } = setup();
  notebook.createNote({ title: "Margins" });
  screen.startFreshPage({});
  assert.notEqual(screen.edit("Margins").note.title, "Margins");
  assert.equal(notebook.notes().length, 2);
});

test("a first line with no words falls back to a plain default", () => {
  const { screen } = setup();
  screen.startFreshPage({});
  assert.equal(screen.edit("***").note.title, "New note");
});

test("a fresh page from the menu can ask for the title to be edited", () => {
  const { screen } = setup();
  assert.deepEqual(screen.startFreshPage({ title: "Box", editTitle: true }), {
    type: "freshPage",
    title: "Box",
    source: undefined,
    editTitle: true,
  });
  assert.equal(screen.show({ type: "pageDraft", page, editTitle: true }).editTitle, true);
});

// --- Esc on a fresh page ---------------------------------------------------

test("cancelling a fresh page goes back to the note from before", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  screen.startFreshPage({});
  assert.deepEqual(screen.cancel(), { type: "note", note: first, reload: true });
  assert.deepEqual(screen.onScreen(), { current: first, openedByPage: false });
});

test("cancelling keeps whether the note before was opened by the page", () => {
  const { screen, grid } = withNotes();
  screen.show({ type: "open", note: grid });
  screen.show({ type: "pageDraft", page });
  screen.cancel();
  assert.deepEqual(screen.onScreen(), { current: grid, openedByPage: true });
});

test("cancelling with no note before asks the page what to show", () => {
  const { screen } = setup();
  screen.show({ type: "blankDraft" });
  assert.deepEqual(screen.cancel(), { type: "followPage" });
});

test("cancelling after the note before was deleted asks the page", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  screen.startFreshPage({});
  notebook.deleteNote("First");
  assert.deepEqual(screen.cancel(), { type: "followPage" });
});

test("New note for this page remembers the note on screen, through the permission card", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  assert.deepEqual(screen.startNoteForPage(), { type: "followPage", newForPage: true });
  assert.equal(screen.note(), null);
  screen.show({ type: "permissionCard" });
  screen.show({ type: "blankDraft" });
  assert.equal(screen.cancel().note.title, "First");
});

test("a note made on the fresh page forgets the note before", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  screen.startFreshPage({});
  screen.edit("x");
  screen.startFreshPage({});
  assert.equal(screen.cancel().note.title, "x");
});

// --- ← -----------------------------------------------------------------------

test("there is no previous note at the start", () => {
  const { screen, first } = withNotes();
  assert.equal(screen.previous(), null);
  assert.equal(screen.back(), null);
  screen.open(first);
  assert.equal(screen.previous(), null);
});

test("← steps back through earlier notes in order", () => {
  const { screen, first, second, grid } = withNotes();
  for (const note of [first, second, grid]) screen.open(note);
  assert.equal(screen.previous(), "Second");
  assert.equal(screen.back().note.title, "Second");
  assert.equal(screen.back().note.title, "First");
  assert.equal(screen.back(), null);
});

test("← opens a note with a page as opened by the page", () => {
  const { screen, first, grid } = withNotes();
  screen.open(grid);
  screen.open(first);
  screen.back();
  assert.deepEqual(screen.onScreen(), { current: grid, openedByPage: true });
});

test("showing the same note again adds no step", () => {
  const { screen, first, second } = withNotes();
  screen.open(first);
  screen.open(first);
  screen.open(second);
  assert.equal(screen.back().note.title, "First");
  assert.equal(screen.back(), null);
});

test("a new note after going back drops the forward steps", () => {
  const { screen, first, second, grid } = withNotes();
  for (const note of [first, second, grid]) screen.open(note);
  screen.back();
  screen.back();
  screen.open(grid);
  assert.equal(screen.back().note.title, "First");
  assert.equal(screen.back(), null);
});

test("going back and opening that note again does not add a step", () => {
  const { screen, first, second } = withNotes();
  screen.open(first);
  screen.open(second);
  screen.back();
  screen.open(first);
  assert.equal(screen.previous(), null);
});

test("← skips a note that has gone", () => {
  const { notebook, screen, first, second, grid } = withNotes();
  for (const note of [first, second, grid]) screen.open(note);
  notebook.deleteNote("Second");
  assert.equal(screen.back().note.title, "First");
});

// --- This note: rename, Course, archive, delete ------------------------------

test("renaming keeps the note open under its new name", () => {
  const { notebook, screen, grid } = withNotes();
  screen.show({ type: "open", note: grid });
  const view = screen.rename("Grid layout");
  assert.equal(view.type, "note");
  assert.equal(view.reload, true);
  assert.equal(view.changed, true);
  assert.equal(screen.note().title, "Grid layout");
  assert.equal(screen.onScreen().openedByPage, true);
  assert.equal(notebook.note("Grid"), undefined);
});

test("a rename to a taken title is refused with a suggestion", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  const view = screen.rename("Second");
  assert.equal(view.type, "titleRefused");
  assert.ok(view.suggestion);
  assert.equal(screen.note().title, "First");
});

test("text typed just before a rename is kept in the renamed note", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  screen.edit("typed");
  screen.rename("Renamed");
  screen.flush();
  assert.equal(notebook.note("Renamed").body, "typed");
});

test("moving to another Course keeps the note open", () => {
  const { notebook, screen, grid } = withNotes();
  screen.open(grid);
  screen.edit("text");
  const view = screen.moveToCourse("Khan");
  assert.equal(view.type, "note");
  assert.equal(view.reload, false);
  assert.equal(view.changed, true);
  assert.equal(screen.note().course, "Khan");
  assert.equal(notebook.note("Grid").body, "text");
  screen.edit("more");
  screen.flush();
  assert.equal(notebook.note("Grid").body, "more");
});

test("archiving leaves no note on screen and asks the page what to show", () => {
  const { notebook, screen, grid } = withNotes();
  screen.open(grid);
  screen.edit("last words");
  assert.deepEqual(screen.archive(), { type: "followPage", changed: true });
  assert.equal(screen.note(), null);
  assert.equal(notebook.note("Grid").archived, true);
  assert.equal(notebook.note("Grid").body, "last words");
});

test("unarchiving keeps the note open, no longer archived", () => {
  const { notebook, screen, first } = withNotes();
  notebook.archiveNote("First");
  screen.open(notebook.note("First"));
  const view = screen.unarchive();
  assert.equal(view.type, "note");
  assert.equal(view.reload, false);
  assert.equal(view.changed, true);
  assert.equal(screen.note().archived, undefined);
  assert.equal(notebook.note("First").archived, undefined);
});

test("deleting leaves no note on screen and asks the page what to show", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  screen.edit("unsaved");
  assert.deepEqual(screen.delete(), { type: "followPage", changed: true });
  assert.equal(screen.note(), null);
  assert.equal(notebook.note("First"), undefined);
});

test("keeping a note after the delete question shows it again as it was", () => {
  const { notebook, screen, grid } = withNotes();
  screen.show({ type: "open", note: grid });
  screen.edit("kept");
  screen.flush();
  const view = screen.reopen();
  assert.deepEqual(view, { type: "note", note: notebook.note("Grid"), reload: true });
  assert.equal(screen.onScreen().openedByPage, true);
});

// --- Notes pulled by Sync ----------------------------------------------------

test("a pull that changed the open note shows it again with the new text", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  notebook.saveBody("First", "from the other browser");
  const view = screen.pulled(["First"]);
  assert.equal(view.reload, true);
  assert.equal(view.note.body, "from the other browser");
  assert.equal(screen.previous(), null);
});

test("a pull that changed other notes only refreshes the Backlinks", () => {
  const { screen, first } = withNotes();
  screen.open(first);
  assert.deepEqual(screen.pulled(["Second"]), { type: "backlinks" });
});

test("a pull that removed the open note asks the page what to show", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  notebook.deleteNote("First");
  assert.deepEqual(screen.pulled(["First"]), { type: "followPage" });
  assert.equal(screen.note(), null);
});

test("with no note open, a pulled note with a page may be the one for this page", () => {
  const { screen } = withNotes();
  assert.deepEqual(screen.pulled(["Grid"]), { type: "pageChanged" });
  assert.equal(screen.pulled(["First"]), null);
});

// --- Saving goes to the note it was typed in (#39) ---------------------------

test("an edit followed by opening another note is saved to the first note", () => {
  const { notebook, screen, first, second } = withNotes();
  const secondBody = notebook.note("Second").body;
  screen.open(first);
  screen.edit("typed in first");
  screen.open(second);
  assert.equal(notebook.note("First").body, "typed in first");
  assert.equal(notebook.note("Second").body, secondBody);
});

test("a timer firing after switching notes writes nothing more", () => {
  const { notebook, screen, timer, first, second } = withNotes();
  screen.open(first);
  screen.edit("a");
  screen.open(second);
  screen.edit("b");
  timer.fire();
  assert.equal(notebook.note("First").body, "a");
  assert.equal(notebook.note("Second").body, "b");
});

test("typing is written once per pause, with the latest text", () => {
  const { notebook, screen, timer, first } = withNotes();
  screen.open(first);
  screen.edit("a");
  screen.edit("ab");
  assert.notEqual(notebook.note("First").body, "ab", "nothing written mid-typing");
  timer.fire();
  assert.equal(notebook.note("First").body, "ab");
});

test("showing the start prompt writes a pending edit immediately", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  screen.edit("last keystrokes");
  screen.show({ type: "startPrompt" });
  assert.equal(notebook.note("First").body, "last keystrokes");
});

test("flush (sidebar hiding) writes a pending edit and keeps the note open", () => {
  const { notebook, screen, first } = withNotes();
  screen.open(first);
  screen.edit("one");
  screen.flush();
  assert.equal(notebook.note("First").body, "one");
  screen.edit("two");
  screen.flush();
  assert.equal(notebook.note("First").body, "two");
});

test("editing with no note open is ignored", () => {
  const { notebook, screen, timer, first } = withNotes();
  const before = notebook.note("First").body;
  screen.edit("nowhere");
  timer.fire();
  screen.open(first);
  screen.show({ type: "startPrompt" });
  screen.edit("still nowhere");
  timer.fire();
  screen.flush();
  assert.equal(notebook.note("First").body, before);
});

test("a failing save reaches the save-error callback", () => {
  const errors = [];
  const boom = new Error("disk full");
  const notebook = createNotebook({ storage: memoryStorage() });
  const first = notebook.createNote({ title: "First" });
  notebook.saveBody = () => {
    throw boom;
  };
  const { screen } = setup({ notebook, onSaveError: (e) => errors.push(e) });
  screen.open(first);
  screen.edit("x");
  screen.flush();
  assert.deepEqual(errors, [boom]);
});
