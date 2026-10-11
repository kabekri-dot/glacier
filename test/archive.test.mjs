import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { unzipFiles } from "../src/zip.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Archive (#58): hide a note from the lists but keep it, as a file under
// `archive/` in the Notes Repo.

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

test("an archived note leaves the Notebook list, search and recent notes", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.markOpened("Margins");
  notebook.archiveNote("Margins");
  assert.deepEqual(notebook.outline().uncategorised, []);
  assert.deepEqual(notebook.search("Margins"), []);
  assert.deepEqual(notebook.search("// Space outside"), []);
  assert.deepEqual(notebook.recentNotes(), []);
});

test("an archived note is listed under the archive", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Box model");
  assert.deepEqual(notebook.archivedNotes().map((note) => note.title), ["Box model"]);
  assert.deepEqual(notebook.outline().courses, []);
});

test("unarchive puts a note back in the same Course", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Box model");
  assert.deepEqual(notebook.courses(), []);
  notebook.unarchiveNote("Box model");
  assert.deepEqual(notebook.outline().courses, [{ course: "TOP Foundations", titles: ["Box model"] }]);
  assert.deepEqual(notebook.archivedNotes(), []);
});

test("a page whose note is archived gets the empty paper", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Box model");
  assert.equal(notebook.noteForPage(boxModel.source), undefined);
});

test("a Link to an archived note still opens it", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Margins");
  assert.equal(notebook.isMissingLink("Margins"), false);
  assert.equal(notebook.openLink("Margins").title, "Margins");
  assert.equal(notebook.note("Margins").archived, true);
});

test("an archived note's file moves under archive/ as one commit", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const notebook = await syncedBrowser(remote);
  const before = remote.commits().length;
  notebook.archiveNote("Box model");
  await notebook.sync(remote);
  const paths = (await remote.listFiles()).map((file) => file.path).sort();
  assert.deepEqual(paths, ["archive/collections/TOP Foundations/Box model.md", "notes/Margins.md"]);
  assert.equal(remote.commits().length, before + 1);
});

test("unarchive moves the file back out of archive/", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const notebook = await syncedBrowser(remote);
  notebook.archiveNote("Margins");
  await notebook.sync(remote);
  notebook.unarchiveNote("Margins");
  await notebook.sync(remote);
  const paths = (await remote.listFiles()).map((file) => file.path).sort();
  assert.deepEqual(paths, ["collections/TOP Foundations/Box model.md", "notes/Margins.md"]);
});

test("another browser sees the note archived, without a Conflict Copy", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel));
  const mine = await syncedBrowser(remote);
  const other = await syncedBrowser(remote);
  mine.archiveNote("Margins");
  await mine.sync(remote);
  const result = await other.sync(remote);
  assert.equal(result.conflicts, 0);
  assert.equal(other.note("Margins").archived, true);
  assert.equal(other.notes().length, 2);
  other.unarchiveNote("Margins");
  await other.sync(remote);
  await mine.sync(remote);
  assert.equal(mine.note("Margins").archived, undefined);
});

test("Export archive holds only archived notes", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Box model");
  const files = await unzipFiles(notebook.exportArchiveZip());
  assert.deepEqual(files.map((file) => file.path), ["archive/collections/TOP Foundations/Box model.md"]);
});

test("Export everything and Restore keep the archived state", async () => {
  const notebook = await syncedBrowser(memoryRemote(filesOf(margins, boxModel)));
  notebook.archiveNote("Box model");
  const zip = notebook.exportZip();
  const fresh = createNotebook({ storage: memoryStorage() });
  await fresh.importZip(zip);
  assert.equal(fresh.note("Box model").archived, true);
  assert.equal(fresh.note("Box model").course, "TOP Foundations");
  assert.equal(fresh.note("Margins").archived, undefined);
});
