import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Automatic two-way sync (#15, ADR 0003): each browser pulls the Notes Repo's
// changes in and pushes its own out. Two Notebooks sharing one in-memory
// remote stand in for Chrome and Firefox.

const concept = {
  type: "concept",
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

const lesson = {
  type: "lesson",
  title: "Box model",
  course: "TOP Foundations",
  source: "https://odin.example/foundations/box-model",
  created: "2026-10-01T09:30:00.000Z",
  body: "See [[Margins]].\n",
};

function fileOf(note) {
  const { path, text } = noteToFile(note);
  return { [path]: text };
}

function browserWith(...notes) {
  const storage = memoryStorage();
  for (const note of notes) storage.putNote(note);
  return createNotebook({ storage });
}

test("a note written here is pushed to the Notes Repo", async () => {
  const remote = memoryRemote({});
  const notebook = browserWith(concept);
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), fileOf(concept));
});

test("an edit here is pushed over the Notes Repo's older version", async () => {
  const remote = memoryRemote(fileOf(concept));
  const notebook = browserWith();
  await notebook.firstSync(remote);
  notebook.saveBody("Margins", "Edited here.");
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), fileOf({ ...concept, body: "Edited here." }));
});

test("a note edited in one browser appears in the other after its next sync", async () => {
  const remote = memoryRemote(fileOf(concept));
  const chrome = browserWith();
  const firefox = browserWith();
  await chrome.firstSync(remote);
  await firefox.firstSync(remote);
  chrome.saveBody("Margins", "Edited in Chrome.");
  await chrome.sync(remote);
  const result = await firefox.sync(remote);
  assert.equal(firefox.note("Margins").body, "Edited in Chrome.");
  assert.deepEqual(result.pulled, ["Margins"]);
});

test("a new note from the other browser comes in, with its Backlinks", async () => {
  const remote = memoryRemote({});
  const chrome = browserWith(concept, lesson);
  const firefox = browserWith();
  await chrome.sync(remote);
  await firefox.sync(remote);
  assert.deepEqual(firefox.note("Box model"), lesson);
  assert.deepEqual(firefox.backlinks("Margins").map((note) => note.title), ["Box model"]);
});

test("a sync with nothing changed writes nothing", async () => {
  const remote = memoryRemote({});
  const notebook = browserWith(concept);
  await notebook.sync(remote);
  const result = await notebook.sync(remote);
  assert.equal(result.pushed, 0);
  assert.deepEqual(result.pulled, []);
});

test("a rename moves the note's file in the Notes Repo", async () => {
  const remote = memoryRemote({});
  const notebook = browserWith(concept, lesson);
  await notebook.sync(remote);
  notebook.renameNote("Margins", "Outer space");
  await notebook.sync(remote);
  const renamed = notebook.note("Outer space");
  const rewritten = notebook.note("Box model");
  assert.deepEqual(remote.files(), { ...fileOf(rewritten), ...fileOf(renamed) });
});

test("a rename in one browser renames the note in the other", async () => {
  const remote = memoryRemote({});
  const chrome = browserWith(concept);
  const firefox = browserWith();
  await chrome.sync(remote);
  await firefox.sync(remote);
  chrome.renameNote("Margins", "Outer space");
  await chrome.sync(remote);
  await firefox.sync(remote);
  assert.deepEqual(firefox.notes().map((note) => note.title), ["Outer space"]);
});

test("a note changed in both browsers keeps both texts: the incoming one as a Conflict Copy", async () => {
  const remote = memoryRemote(fileOf(concept));
  const chrome = browserWith();
  const firefox = browserWith();
  await chrome.firstSync(remote);
  await firefox.firstSync(remote);
  chrome.saveBody("Margins", "Chrome's text.");
  await chrome.sync(remote);
  firefox.saveBody("Margins", "Firefox's text.");
  const result = await firefox.sync(remote);
  assert.equal(firefox.note("Margins").body, "Firefox's text.");
  const copy = firefox.notes().find((note) => note.title.startsWith("Margins (conflict "));
  assert.equal(copy.body, "Chrome's text.");
  assert.equal(result.conflicts, 1);
});

test("offline, edits stay in this browser and are pushed by a later sync", async () => {
  const remote = memoryRemote({});
  const notebook = browserWith(concept);
  remote.failWith("offline");
  await assert.rejects(notebook.sync(remote), (error) => error.reason === "offline");
  assert.equal(notebook.note("Margins").body, concept.body);
  remote.failWith(null);
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), fileOf(concept));
});

test("a sync remembers when it last finished", async () => {
  const notebook = browserWith(concept);
  assert.equal(notebook.lastSynced(), undefined);
  await notebook.sync(memoryRemote({}));
  assert.ok(!Number.isNaN(Date.parse(notebook.lastSynced())));
});
