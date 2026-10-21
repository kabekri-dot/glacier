import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Delete this note (#57): the note goes from the Notebook, and the next sync
// removes its file from the Notes Repo for good.

const margins = {
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

const boxModel = {
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
  assert.deepEqual(notebook.outline().uncategorised, []);
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

// Undo after a delete (#116): the note comes back exactly as it was.

test("undo after a delete gives back the same note, with its Collection, page and sketches", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  const { n } = notebook.addSketch("Box model", { width: 300 });
  notebook.saveSketch("Box model", n, { width: 300, height: 100, shapes: [{ kind: "circle", x: 1, y: 2, w: 30, h: 30 }] });
  const before = notebook.note("Box model");
  const kept = notebook.deleteNote("Box model");
  assert.deepEqual(notebook.undoDelete(kept), ["Box model"]);
  assert.deepEqual(notebook.note("Box model"), before);
  assert.deepEqual(notebook.outline().courses, [{ course: "TOP Foundations", titles: ["Box model"] }]);
});

test("undo after a delete puts the note back in the recent notes", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.markOpened("Margins");
  notebook.markOpened("Box model");
  notebook.undoDelete(notebook.deleteNote("Margins"));
  assert.deepEqual(notebook.recentNotes().map((note) => note.title), ["Box model", "Margins"]);
});

test("undo after deleting a secret note gives it back secret and still readable", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  await notebook.setPasscode("open sesame");
  await notebook.makeSecret("Margins");
  await notebook.settled();
  notebook.undoDelete(notebook.deleteNote("Margins"));
  await notebook.settled();
  assert.equal(notebook.isSecret("Margins"), true);
  assert.equal(notebook.note("Margins").body, margins.body);
  notebook.lock();
  assert.equal(notebook.note("Margins").body, "");
  assert.equal(await notebook.unlock("open sesame"), true);
  assert.equal(notebook.note("Margins").body, margins.body);
});

test("an undone delete is not removed from the Notes Home by the next sync", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const notebook = await syncedBrowser(remote);
  notebook.undoDelete(notebook.deleteNote("Margins"));
  await notebook.sync(remote);
  assert.equal(remote.files()[noteToFile(margins).path], noteToFile(margins).text);
  assert.equal(notebook.note("Margins").body, margins.body);
});

test("a delete undone after a sync comes back to the Notes Home on the next one", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const notebook = await syncedBrowser(remote);
  const kept = notebook.deleteNote("Margins");
  await notebook.sync(remote);
  notebook.undoDelete(kept);
  await notebook.sync(remote);
  assert.equal(remote.files()[noteToFile(margins).path], noteToFile(margins).text);
  await notebook.sync(remote);
  assert.equal(notebook.note("Margins").body, margins.body);
});

test("undo after deleting a Collection gives back the Collection and every note in it", async () => {
  const lists = { ...boxModel, title: "Lists", body: "Bullets." };
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel, lists)));
  const kept = notebook.deleteCollection("TOP Foundations");
  assert.deepEqual(notebook.outline().courses, []);
  assert.deepEqual(notebook.undoDelete(kept).sort(), ["Box model", "Lists"]);
  assert.deepEqual(notebook.outline().courses, [{ course: "TOP Foundations", titles: ["Box model", "Lists"] }]);
  assert.equal(notebook.note("Lists").body, "Bullets.");
});

test("undo after deleting an empty Collection lists it again", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins)));
  notebook.newCollection("Biology");
  notebook.undoDelete(notebook.deleteCollection("Biology"));
  assert.ok(notebook.courses().includes("Biology"));
});

test("undo does not overwrite a new note that took the deleted title", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins)));
  const kept = notebook.deleteNote("Margins");
  notebook.createNote({ title: "Margins" });
  notebook.saveBody("Margins", "A new one.");
  assert.deepEqual(notebook.undoDelete(kept), []);
  assert.equal(notebook.note("Margins").body, "A new one.");
});
