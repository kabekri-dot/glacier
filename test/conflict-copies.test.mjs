import { test } from "node:test";
import assert from "node:assert/strict";

import { createAutoSync, syncStatusText, syncDotText, conflictMessage } from "../src/auto-sync.mjs";
import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Conflict Copies (#16, ADR 0004): when the same note changed in two
// browsers before Sync, Glacier keeps both. The incoming version becomes
// "<Title> (conflict <date>)" and the sync status shows the conflict until
// that copy is gone. Two Notebooks sharing one in-memory remote stand in for
// Chrome and Firefox.

const margins = {
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

function fileOf(note) {
  const { path, text } = noteToFile(note);
  return { [path]: text };
}

function browser() {
  return createNotebook({ storage: memoryStorage() });
}

function conflictCopyIn(notebook) {
  return notebook.notes().find((note) => note.title.startsWith("Margins (conflict "));
}

// Chrome pushes its edit in the moment between Firefox listing the Notes
// Repo and Firefox writing, so Firefox's write names a stale version.
async function staleWriteSetup() {
  const remote = memoryRemote(fileOf(margins));
  const chrome = browser();
  const firefox = browser();
  await chrome.firstSync(remote);
  await firefox.firstSync(remote);
  chrome.saveBody("Margins", "Chrome's text.");
  firefox.saveBody("Margins", "Firefox's text.");
  remote.beforeNextWrite(() => chrome.sync(remote));
  return { remote, chrome, firefox };
}

test("a write the Notes Repo rejects as stale makes a Conflict Copy and keeps both texts", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const result = await firefox.sync(remote);
  assert.equal(result.conflicts, 1);
  assert.equal(firefox.note("Margins").body, "Firefox's text.");
  assert.equal(conflictCopyIn(firefox).body, "Chrome's text.");
  const texts = Object.values(remote.files());
  assert.ok(texts.some((text) => text.endsWith("Firefox's text.")));
  assert.ok(texts.some((text) => text.endsWith("Chrome's text.")));
});

test("after a stale write both texts reach the other browser too", async () => {
  const { remote, chrome, firefox } = await staleWriteSetup();
  await firefox.sync(remote);
  await chrome.sync(remote);
  assert.equal(chrome.note("Margins").body, "Firefox's text.");
  assert.equal(conflictCopyIn(chrome).body, "Chrome's text.");
});

test("the Conflict Copy's title has the date", async () => {
  const { remote, firefox } = await staleWriteSetup();
  await firefox.sync(remote);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(conflictCopyIn(firefox).title, `Margins (conflict ${today})`);
});

test("the same text written in both browsers is no conflict", async () => {
  const remote = memoryRemote(fileOf(margins));
  const chrome = browser();
  const firefox = browser();
  await chrome.firstSync(remote);
  await firefox.firstSync(remote);
  chrome.saveBody("Margins", "Same text.");
  firefox.saveBody("Margins", "Same text.");
  await chrome.sync(remote);
  const result = await firefox.sync(remote);
  assert.equal(result.conflicts, 0);
  assert.equal(conflictCopyIn(firefox), undefined);
});

test("the notebook lists its Conflict Copies", async () => {
  const { remote, firefox } = await staleWriteSetup();
  assert.deepEqual(firefox.conflictCopies(), []);
  await firefox.sync(remote);
  assert.deepEqual(firefox.conflictCopies(), [conflictCopyIn(firefox).title]);
});

function autoSyncFor(notebook, remote) {
  return createAutoSync({
    notebook,
    connect: async () => ({ remote, repo: "me/notes" }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
}

test("the sync status shows the conflict until the Conflict Copy is gone", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const autoSync = autoSyncFor(firefox, remote);
  assert.equal((await autoSync.syncNow()).state, "conflict");
  assert.equal((await autoSync.syncNow()).state, "conflict", "still there on the next sync");
  const copy = conflictCopyIn(firefox).title;
  const { path } = noteToFile(conflictCopyIn(firefox));
  const { version } = (await remote.listFiles()).find((file) => file.path === path);
  await remote.deleteFile(path, version);
  const status = await autoSync.syncNow();
  assert.equal(firefox.note(copy), undefined);
  assert.equal(status.state, "synced");
});

test("renaming the Conflict Copy after merging by hand ends the conflict", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const autoSync = autoSyncFor(firefox, remote);
  await autoSync.syncNow();
  firefox.renameNote(conflictCopyIn(firefox).title, "Margins in print");
  assert.equal((await autoSync.syncNow()).state, "synced");
});

test("the conflict message is short and counts the copies", () => {
  assert.equal(conflictMessage(1), "A note has two versions. Check it");
  assert.equal(conflictMessage(3), "3 notes have two versions. Check them");
});

test("the conflict status uses the short message", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const status = await autoSyncFor(firefox, remote).syncNow();
  assert.equal(syncStatusText(status).detail.startsWith(conflictMessage(1)), true);
  assert.doesNotMatch(syncStatusText(status).detail, /Notes repo|file/);
});

test("the notebook lists each Conflict Copy with its original", async () => {
  const { remote, firefox } = await staleWriteSetup();
  await firefox.sync(remote);
  assert.deepEqual(firefox.conflictCopyPairs(), [
    { copy: conflictCopyIn(firefox).title, original: "Margins" },
  ]);
});

test("a Conflict Copy whose original was renamed is listed without one", async () => {
  const { remote, firefox } = await staleWriteSetup();
  await firefox.sync(remote);
  firefox.renameNote("Margins", "Margins in print");
  assert.equal(firefox.conflictCopyPairs()[0].original, null);
});

test("the conflict clears when the last Conflict Copy is deleted", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const autoSync = autoSyncFor(firefox, remote);
  await autoSync.syncNow();
  firefox.deleteNote(conflictCopyIn(firefox).title);
  autoSync.changed();
  assert.equal(autoSync.status().state, "synced");
});

test("the conflict clears when the last Conflict Copy is archived", async () => {
  const { remote, firefox } = await staleWriteSetup();
  const autoSync = autoSyncFor(firefox, remote);
  await autoSync.syncNow();
  firefox.archiveNote(conflictCopyIn(firefox).title);
  assert.deepEqual(firefox.conflictCopies(), []);
  autoSync.changed();
  assert.equal(autoSync.status().state, "synced");
});

test("the dot explains each state on hover", () => {
  assert.equal(syncDotText({ state: "synced" }), "All saved to GitHub");
  assert.equal(syncDotText({ state: "syncing" }), "Saving to GitHub");
  assert.equal(syncDotText({ state: "offline" }), "Offline. Your changes are kept here and sync later");
  assert.equal(syncDotText({ state: "off" }), "Your notes live only in this browser. Choose where they live in Settings");
});

test("the dot on a conflict says how many notes have two versions and that a click shows them", () => {
  assert.equal(
    syncDotText({ state: "conflict", conflicts: ["a", "b"] }),
    "2 notes have two versions. Click to see them",
  );
  assert.equal(syncDotText({ state: "conflict", conflicts: ["a"] }), "A note has two versions. Click to see them");
});

test("the dot on an error gives the error's short text", () => {
  assert.equal(syncDotText({ state: "error", message: "Repo not found." }), "Repo not found.");
  assert.match(syncDotText({ state: "error", reason: "unauthorized" }), /token/);
});
