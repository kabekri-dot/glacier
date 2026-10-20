import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { syncErrorMessage } from "../src/notes-home.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryFolder } from "../src/memory-folder.mjs";
import { folderRemote } from "../src/folder-remote.mjs";

// A folder on this computer as a Notes Home (#97, ADR 0011): the notes are
// Markdown files in a folder the person picked, laid out like the Notes
// Repo. Tested through the Notebook core with an in-memory folder of the
// same shape as Chrome's File System Access handles.

const margins = { title: "Margins", created: "2026-10-02T10:00:00.000Z", body: "Space outside the border." };
const padding = { title: "Padding", created: "2026-10-03T10:00:00.000Z", body: "Space inside the border.", course: "CSS" };

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => {
    const { path, text } = noteToFile(note);
    return [path, text];
  }));
}

function browser(folder, ...notes) {
  const storage = memoryStorage();
  for (const note of notes) storage.putNote(note);
  const remote = folderRemote({ getFolder: async () => folder.handle });
  return { notebook: createNotebook({ storage }), remote };
}

test("the first connect combines the notes here with the ones in the folder", async () => {
  const folder = memoryFolder();
  folder.editFile("collections/CSS/Padding.md", filesOf(padding)["collections/CSS/Padding.md"]);
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);

  assert.deepEqual(notebook.notes().map((note) => note.title).sort(), ["Margins", "Padding"]);
  assert.ok("notes/Margins.md" in folder.files());
});

test("the notes land in collections, notes and archive, like on GitHub", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins, padding, { title: "Floats", created: "2026-10-01T10:00:00.000Z", body: "Old." });
  await notebook.switchNotesHome("folder", remote);
  notebook.archiveNote("Floats");
  await notebook.sync(remote);

  assert.deepEqual(Object.keys(folder.files()).sort(), ["archive/notes/Floats.md", "collections/CSS/Padding.md", "notes/Margins.md"].sort());
  assert.deepEqual(folder.files()["collections/CSS/Padding.md"], filesOf(padding)["collections/CSS/Padding.md"]);
});

test("a file edited in another editor comes in on the next sync", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);

  const text = folder.files()["notes/Margins.md"].replace("Space outside the border.", "Edited in Obsidian.");
  folder.editFile("notes/Margins.md", text);
  const result = await notebook.sync(remote);

  assert.deepEqual(result.pulled, ["Margins"]);
  assert.equal(notebook.note("Margins").body, "Edited in Obsidian.");
});

test("a file changed since it was read is refused as stale, and nothing is written", async () => {
  const folder = memoryFolder();
  const remote = folderRemote({ getFolder: async () => folder.handle });
  await remote.connect();
  const made = await remote.commit({ writes: [{ path: "notes/A.md", text: "one" }] });
  folder.editFile("notes/A.md", "two");

  await assert.rejects(
    remote.commit({
      writes: [
        { path: "notes/B.md", text: "new" },
        { path: "notes/A.md", text: "stale", version: made["notes/A.md"] },
      ],
    }),
    { reason: "conflict" },
  );
  assert.deepEqual(folder.files(), { "notes/A.md": "two" });
});

test("a new file where the folder already has one is refused as stale", async () => {
  const folder = memoryFolder();
  folder.editFile("notes/A.md", "made elsewhere");
  const remote = folderRemote({ getFolder: async () => folder.handle });
  await assert.rejects(remote.commit({ writes: [{ path: "notes/A.md", text: "again" }] }), { reason: "conflict" });
});

test("a note changed here and in another editor before syncing keeps both versions", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);

  notebook.saveBody("Margins", "Typed in Glacier.");
  folder.editFile("notes/Margins.md", folder.files()["notes/Margins.md"].replace("Space outside the border.", "Typed in Obsidian."));
  await notebook.sync(remote);

  assert.equal(notebook.note("Margins").body, "Typed in Glacier.");
  assert.equal(notebook.conflictCopies().length, 1);
});

test("a note moved to another Collection moves its file, and the emptied folder goes too", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, padding);
  await notebook.switchNotesHome("folder", remote);
  notebook.moveToCourse("Padding", "Layout");
  await notebook.sync(remote);

  assert.deepEqual(Object.keys(folder.files()), ["collections/Layout/Padding.md"]);
  assert.ok(!folder.folders().includes("collections/CSS"));
});

test("a write that fails leaves the old note whole", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);
  const before = folder.files()["notes/Margins.md"];
  folder.failWrites();
  notebook.saveBody("Margins", "Typed while the disk was full.");

  await assert.rejects(notebook.sync(remote));
  assert.equal(folder.files()["notes/Margins.md"], before);
  folder.failWrites(false);
  await notebook.sync(remote);
  assert.match(folder.files()["notes/Margins.md"], /Typed while the disk was full\./);
});

test("hidden folders such as Obsidian's own are left alone", async () => {
  const folder = memoryFolder();
  folder.editFile(".obsidian/app.json", "{}");
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);
  assert.deepEqual(notebook.notes().map((note) => note.title), ["Margins"]);
  assert.equal(folder.files()[".obsidian/app.json"], "{}");
});

test("after a restart the folder needs the browser's OK again before syncing", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins);
  await notebook.switchNotesHome("folder", remote);
  folder.forgetPermission();
  notebook.saveBody("Margins", "Typed after a restart.");

  await assert.rejects(notebook.sync(remote), { reason: "unauthorized" });
  assert.equal(folder.permissionRequests(), 0, "syncing never asks by itself");
  assert.equal(notebook.note("Margins").body, "Typed after a restart.");

  await folder.handle.requestPermission({ mode: "readwrite" });
  await notebook.sync(remote);
  assert.match(folder.files()["notes/Margins.md"], /Typed after a restart\./);
});

test("a folder that is gone can't be found", async () => {
  const remote = folderRemote({ getFolder: async () => null });
  await assert.rejects(remote.connect(), { reason: "not-found" });
});

test("a sync with nothing new reads no file again", async () => {
  const folder = memoryFolder();
  const { notebook, remote } = browser(folder, margins, padding);
  await notebook.switchNotesHome("folder", remote);
  let reads = 0;
  const counted = folderRemote({ getFolder: async () => folder.handle });
  const readFile = counted.readFile;
  counted.readFile = (path) => {
    reads += 1;
    return readFile(path);
  };
  await notebook.sync(counted);
  assert.equal(reads, 0);
});

test("the folder's problems are explained in its own words", () => {
  const messageFor = (reason) => syncErrorMessage(Object.assign(new Error(), { reason }), { home: "folder" });
  assert.match(messageFor("unauthorized"), /Chrome needs your OK/);
  assert.match(messageFor("not-found"), /Couldn't find your notes folder/);
  assert.doesNotMatch(messageFor("unknown"), /GitHub/);
});
