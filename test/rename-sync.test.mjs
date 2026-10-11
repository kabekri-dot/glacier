import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// A rename syncs as one commit (#17, ADR 0005): the renamed note's new file,
// its old file going away and every note whose Links were rewritten reach
// the Notes Repo together, or not at all.

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

const padding = {
  type: "concept",
  title: "Padding",
  created: "2026-10-03T10:00:00.000Z",
  body: "Not the same as [[Margins]].",
};

function pathOf(note) {
  return noteToFile(note).path;
}

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => [pathOf(note), noteToFile(note).text]));
}

async function syncedBrowser(remote) {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  return notebook;
}

test("a rename that touches several notes arrives as one commit", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel, padding));
  const notebook = await syncedBrowser(remote);
  notebook.renameNote("Margins", "Outer space");
  await notebook.sync(remote);
  const renamed = notebook.note("Outer space");
  assert.equal(remote.commits().length, 1);
  assert.deepEqual(
    remote.commits()[0].sort(),
    [pathOf(margins), pathOf(renamed), pathOf(boxModel), pathOf(padding)].sort(),
  );
});

test("after the rename commit the Notes Repo has the new file and the rewritten Links", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel, padding));
  const notebook = await syncedBrowser(remote);
  notebook.renameNote("Margins", "Outer space");
  await notebook.sync(remote);
  assert.deepEqual(
    remote.files(),
    filesOf(
      { ...margins, title: "Outer space" },
      { ...boxModel, body: "See [[Outer space]].\n" },
      { ...padding, body: "Not the same as [[Outer space]]." },
    ),
  );
});

test("a rename that fails to reach the Notes Repo leaves it unchanged", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel, padding));
  const notebook = await syncedBrowser(remote);
  notebook.renameNote("Margins", "Outer space");
  remote.beforeNextWrite(() => remote.failWith("offline"));
  await assert.rejects(notebook.sync(remote));
  assert.deepEqual(remote.files(), filesOf(margins, boxModel, padding));
  assert.deepEqual(remote.commits(), []);
});

test("a rename refused because a linking note changed elsewhere changes nothing, then lands as one commit", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel, padding));
  const notebook = await syncedBrowser(remote);
  const other = await syncedBrowser(remote);
  other.saveBody("Box model", "See [[Margins]].\nMore from the other browser.\n");
  notebook.renameNote("Margins", "Outer space");
  remote.beforeNextWrite(() => other.sync(remote));
  await notebook.sync(remote);
  const [byOther, ...afterIt] = remote.commits();
  assert.deepEqual(byOther, [pathOf(boxModel)]);
  assert.equal(afterIt.length, 1, "the rename is one commit after the refused one");
  const renamed = notebook.note("Outer space");
  for (const path of [pathOf(margins), pathOf(renamed), pathOf(boxModel), pathOf(padding)]) {
    assert.ok(afterIt[0].includes(path), `${path} is in the rename commit`);
  }
});

test("a rename that couldn't reach the Notes Repo goes as one commit with the next sync", async () => {
  const remote = memoryRemote(filesOf(margins, boxModel, padding));
  const notebook = await syncedBrowser(remote);
  notebook.renameNote("Margins", "Outer space");
  remote.beforeNextWrite(() => remote.failWith("offline"));
  await assert.rejects(notebook.sync(remote));
  remote.failWith(null);
  await notebook.sync(remote);
  assert.equal(remote.commits().length, 1);
  assert.equal(remote.files()[pathOf(margins)], undefined);
});
