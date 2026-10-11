import { test } from "node:test";
import assert from "node:assert/strict";

import { createNoteSession } from "../src/note-session.mjs";
import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";

// A new note is a fresh page you write on at once (#61): nothing is made until
// the first character or a confirmed title. Tested through the Note session
// with the in-memory storage and timers that never fire on their own.

const page = { url: "https://odin.example/lesson?utm_source=x", title: "Flexbox" };

function setup() {
  const notebook = createNotebook({ storage: memoryStorage() });
  const created = [];
  const session = createNoteSession({
    notebook,
    onCreate: (note) => created.push(note),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  return { notebook, session, created };
}

test("a fresh page for a website makes no note until you type", () => {
  const { notebook, session } = setup();
  session.openDraft({ type: "lesson", title: page.title, source: page.url });
  session.edit("");
  assert.deepEqual(notebook.notes(), []);
});

test("the first character makes a Lesson note with the page title, Source and last Course", () => {
  const { notebook, session, created } = setup();
  notebook.createLessonNote({ title: "Grid", source: "https://odin.example/grid", course: "TOP" });
  session.openDraft({ type: "lesson", title: page.title, source: page.url });
  session.edit("F");
  session.flush();
  const note = notebook.note("Flexbox");
  assert.equal(note.type, "lesson");
  assert.equal(note.source, "https://odin.example/lesson");
  assert.equal(note.course, "TOP");
  assert.equal(note.body, "F");
  assert.deepEqual(created.map((n) => n.title), ["Flexbox"]);
});

test("leaving a fresh page without typing leaves nothing behind", () => {
  const { notebook, session } = setup();
  const other = notebook.createConceptNote({ title: "Other" });
  session.openDraft({ type: "lesson", title: page.title, source: page.url });
  session.open(other);
  session.openDraft({ type: "concept", title: "" });
  session.close();
  assert.deepEqual(notebook.notes().map((n) => n.title), ["Other"]);
});

test("typing more after the first character keeps one note", () => {
  const { notebook, session } = setup();
  session.openDraft({ type: "lesson", title: page.title, source: page.url });
  session.edit("F");
  session.edit("Fl");
  session.flush();
  assert.equal(notebook.notes().length, 1);
  assert.equal(notebook.note("Flexbox").body, "Fl");
});

test("confirming the title makes exactly one Concept note", () => {
  const { notebook, session, created } = setup();
  session.openDraft({ type: "concept", title: "" });
  const note = session.confirmTitle("  Box model ");
  assert.equal(note.title, "Box model");
  assert.equal(note.type, "concept");
  session.edit("idea");
  session.flush();
  assert.equal(notebook.notes().length, 1);
  assert.equal(notebook.note("Box model").body, "idea");
  assert.deepEqual(created.map((n) => n.title), ["Box model"]);
});

test("an empty title is not confirmed and makes nothing", () => {
  const { notebook, session } = setup();
  session.openDraft({ type: "concept", title: "" });
  assert.equal(session.confirmTitle("   "), null);
  assert.deepEqual(notebook.notes(), []);
});

test("a confirmed title that is taken gets the Course added", () => {
  const { notebook, session } = setup();
  notebook.createLessonNote({ title: "Introduction", course: "TOP" });
  session.openDraft({ type: "lesson", title: "Introduction", source: page.url });
  const note = session.confirmTitle("Introduction");
  assert.equal(note.title, "Introduction (TOP)");
});

test("a note made by hand has no Source", () => {
  const { notebook, session } = setup();
  session.openDraft({ type: "lesson", title: "" });
  const note = session.confirmTitle("Reading notes");
  assert.equal(note.type, "lesson");
  assert.equal(notebook.note("Reading notes").source, undefined);
});

test("typing on a fresh page with no title yet still makes a note", () => {
  const { notebook, session } = setup();
  session.openDraft({ type: "concept", title: "" });
  session.edit("x");
  assert.equal(notebook.notes().length, 1);
  assert.equal(notebook.notes()[0].type, "concept");
});
