import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Delete this note (#57): the note goes from the Notebook, and the next sync
// removes its file from the Notes Repo for good.

const margins = {
  type: "concept",
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

const boxModel = {
  type: "lesson",
  title: "Box model",
  course: "TOP Foundations",
  source: "https://odin.example/foundations/box-model",
  created: "2026-10-01T09:30:00.000Z",
  body: "See [[Margins]].\n",
};

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => [noteToFile(note).path, noteToFile(note).text]));
}

async function syncedBrowser(remote) {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  return notebook;
}

test("a deleted note is gone from the Notebook, search and recent notes", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.markOpened("Margins");
  notebook.deleteNote("Margins");
  assert.equal(notebook.note("Margins"), undefined);
  assert.deepEqual(notebook.search("Space outside").map((hit) => hit.title), []);
  assert.deepEqual(notebook.recentNotes().map((note) => note.title), []);
  assert.deepEqual(notebook.outline().concepts, []);
});

test("a deleted note no longer counts as a backlink", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.deleteNote("Box model");
  assert.deepEqual(notebook.backlinks("Margins"), []);
});

test("a Link to a deleted note becomes a Missing Link", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.deleteNote("Margins");
  assert.equal(notebook.isMissingLink("Margins"), true);
  assert.deepEqual(notebook.outgoingLinks("Box model"), ["Margins"]);
});

test("the next sync deletes the file and a later pull does not bring it back", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const notebook = await syncedBrowser(remote);
  notebook.deleteNote("Margins");
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()), [noteToFile(boxModel).path]);
  await notebook.sync(remote);
  assert.equal(notebook.note("Margins"), undefined);
});

test("another browser loses the note on its next sync", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const here = await syncedBrowser(remote);
  const there = await syncedBrowser(remote);
  here.deleteNote("Margins");
  await here.sync(remote);
  await there.sync(remote);
  assert.equal(there.note("Margins"), undefined);
});

test("deleting a note that does not exist changes nothing", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins)));
  notebook.deleteNote("Nothing here");
  assert.equal(notebook.notes().length, 1);
});
