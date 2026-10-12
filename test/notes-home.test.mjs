import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { createNotebook, noteToFile, syncErrorMessage } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";
import { NOTES_HOMES, notesHomeName, switchQuestion, chosenNotesHome, notesHomeChoices, googleReady, folderReady } from "../src/notes-home.mjs";
import { createAutoSync, syncBox, syncDotText, syncStatusText, needsFolderOk } from "../src/auto-sync.mjs";
import { GOOGLE_CONFIG } from "../src/google-config.mjs";

// Where your notes live (#94, ADR 0011): one Notes Home at a time. Switching
// combines the notes here and in the new place, deletes nothing and leaves
// the old place as it was. In-memory remotes stand in for the places.

const margins = { title: "Margins", created: "2026-10-02T10:00:00.000Z", body: "Space outside the border." };
const padding = { title: "Padding", created: "2026-10-03T10:00:00.000Z", body: "Space inside the border." };
const flexbox = { title: "Flexbox", created: "2026-10-04T10:00:00.000Z", body: "One direction at a time." };

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => {
    const { path, text } = noteToFile(note);
    return [path, text];
  }));
}

const titles = (notebook) => notebook.notes().map((note) => note.title).sort();
const bodies = (files) => Object.values(files).map((text) => text.split("---\n").pop().trim()).sort();

test("choosing a place brings its notes here and these notes there", async () => {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const remote = memoryRemote(filesOf(padding));
  await notebook.switchNotesHome("github", remote);
  assert.deepEqual(titles(notebook), ["Margins", "Padding"]);
  assert.deepEqual(remote.files(), filesOf(margins, padding));
});

test("switching to another place combines both ways and deletes nothing in either", async () => {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const first = memoryRemote(filesOf(padding));
  await notebook.switchNotesHome("github", first);
  const firstAfter = first.files();

  const second = memoryRemote(filesOf(flexbox, { ...margins, body: "Margins as the other place has them." }));
  const secondBefore = Object.keys(second.files());
  await notebook.switchNotesHome("github", second);

  assert.deepEqual(first.files(), firstAfter, "the old place is left untouched");
  for (const path of secondBefore) assert.ok(path in second.files(), `${path} is still there`);
  assert.equal(notebook.note("Margins").body, margins.body);
  const copy = notebook.notes().find((note) => note.title.startsWith("Margins (conflict "));
  assert.equal(copy.body, "Margins as the other place has them.");
  assert.deepEqual(titles(notebook), ["Flexbox", "Margins", copy.title, "Padding"].sort());
  assert.deepEqual(bodies(second.files()), notebook.notes().map((note) => note.body).sort());
});

test("switching shows each step and is ready only once the notes are in both places", async () => {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const remote = memoryRemote({});
  const steps = [];
  await notebook.switchNotesHome("github", remote, (step) => {
    steps.push(step.step);
    if (step.step === "ready") assert.deepEqual(remote.files(), filesOf(margins));
  });
  assert.deepEqual(steps, ["connecting", "downloading", "linking", "ready"]);
});

test("a switch that fails keeps the place there was", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.switchNotesHome("github", memoryRemote({}));
  const broken = memoryRemote({});
  broken.failWith("unauthorized");
  await assert.rejects(notebook.switchNotesHome("github", broken));
  assert.equal(notebook.notesHome(), "github");
});

test("switching to only in this browser stops syncing", async () => {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const remote = memoryRemote({});
  await notebook.switchNotesHome("github", remote);
  await notebook.switchNotesHome("browser");
  notebook.saveBody("Margins", "Typed after leaving GitHub.");
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), filesOf(margins));
  assert.equal(notebook.notesHome(), "browser");
});

test("the chosen place is read back after a restart", async () => {
  const storage = memoryStorage();
  await createNotebook({ storage }).switchNotesHome("github", memoryRemote({}));
  assert.equal(createNotebook({ storage }).notesHome(), "github");
});

test("before any choice there is no Notes Home saved", () => {
  assert.equal(createNotebook({ storage: memoryStorage() }).notesHome(), null);
});

test("the places to choose from start with Google Drive, each with its pixel icon", () => {
  assert.deepEqual(NOTES_HOMES.map((home) => home.name), ["Google Drive", "A folder on this computer", "Only in this browser", "GitHub"]);
  for (const { icon } of NOTES_HOMES) {
    assert.ok(existsSync(new URL(`../art/icon-${icon}.svg`, import.meta.url)), icon);
  }
});

test("switching asks first in one plain line naming the place", () => {
  assert.equal(switchQuestion("github"), "Your notes will be combined with the ones in GitHub. Nothing is deleted.");
  assert.equal(notesHomeName("browser"), "Only in this browser");
});

test("the sync dot and box name the place", () => {
  assert.equal(syncDotText({ state: "synced", place: "GitHub" }), "All saved to GitHub");
  assert.equal(syncDotText({ state: "syncing", place: "Google Drive" }), "Saving to Google Drive");
  assert.match(syncStatusText({ state: "synced", place: "Google Drive" }).detail, /Google Drive/);
  assert.equal(syncBox({ state: "off" }).status, "Only in this browser");
});

test("a browser that connected GitHub before there was a choice keeps GitHub", () => {
  assert.equal(chosenNotesHome(null, { repo: "me/notes", token: "t" }), "github");
  assert.equal(chosenNotesHome(null, { repo: "", token: "" }), "browser");
  assert.equal(chosenNotesHome("browser", { repo: "me/notes", token: "t" }), "browser");
});

test("auto-sync names the place it syncs with", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const remote = memoryRemote({});
  const autoSync = createAutoSync({ notebook, connect: async () => ({ remote, repo: "me/notes", place: "GitHub" }) });
  const status = await autoSync.syncNow();
  assert.equal(status.place, "GitHub");
});

test("a push that fails once the notes are combined keeps the new place, and the next sync sends them", async () => {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const remote = memoryRemote(filesOf(padding));
  remote.beforeNextWrite(() => remote.failWith("offline"));
  const result = await notebook.switchNotesHome("github", remote);
  assert.equal(result.pushed, false);
  assert.equal(notebook.notesHome(), "github");
  remote.failWith(null);
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), filesOf(margins, padding));
});

// Google Drive (#95).

test("Google Drive shows Not set up yet until its sign-in is registered", () => {
  const unset = notesHomeChoices({ googleReady: false }).find((home) => home.id === "google-drive");
  assert.equal(unset.note, "Not set up yet");
  assert.equal(unset.disabled, true);
  const ready = notesHomeChoices({ googleReady: true }).find((home) => home.id === "google-drive");
  assert.equal(ready.note, undefined);
  assert.equal(ready.disabled, false);
  assert.equal(googleReady({ webClientId: "" }), false);
  assert.equal(googleReady({ webClientId: "123.apps.googleusercontent.com" }), true);
});

test("Chrome finds the same Google client in the manifest as in google-config.mjs", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.oauth2?.client_id ?? "", GOOGLE_CONFIG.chromeClientId);
  assert.ok(manifest.permissions.includes("identity"));
  assert.ok(manifest.key, "a fixed extension ID keeps the sign-in address the same");
});

test("Google Drive's problems are explained in its own words", () => {
  const messageFor = (reason) => syncErrorMessage(Object.assign(new Error(), { reason }), "", "Google Drive");
  assert.match(messageFor("offline"), /Couldn't reach Google Drive/);
  assert.match(messageFor("forbidden"), /Sign in with Google/);
  assert.doesNotMatch(messageFor("unknown"), /GitHub/);
});

test("when Google asks to sign in again, the sync box says so with one button", () => {
  const status = { state: "error", reason: "unauthorized", place: "Google Drive" };
  assert.match(syncStatusText(status).detail, /sign in again/i);
  assert.doesNotMatch(syncStatusText(status).detail, /token/);
  const box = syncBox(status);
  assert.equal(box.action, "Sign in with Google");
  assert.equal(box.signIn, true);
  assert.equal(syncBox({ state: "error", reason: "unauthorized", place: "GitHub" }).signIn, undefined);
});

// A folder on this computer (#97).

test("a folder can be chosen only where the browser has a folder picker", () => {
  const missing = notesHomeChoices({ googleReady: true, folderReady: false }).find((home) => home.id === "folder");
  assert.equal(missing.note, "Only in Chrome and Edge");
  assert.equal(missing.disabled, true);
  const there = notesHomeChoices({ googleReady: true, folderReady: true }).find((home) => home.id === "folder");
  assert.equal(there.note, undefined);
  assert.equal(there.disabled, false);
  assert.equal(folderReady({}), false);
  assert.equal(folderReady({ showDirectoryPicker: () => {} }), true);
});

test("the folder is called your notes folder in sentences", () => {
  assert.equal(switchQuestion("folder"), "Your notes will be combined with the ones in your notes folder. Nothing is deleted.");
  assert.equal(syncDotText({ state: "synced", place: notesHomeName("folder") }), "All saved to your notes folder");
});

test("when Chrome forgot the folder, the sync box asks for its OK with one Reconnect button", () => {
  const status = { state: "error", reason: "unauthorized", place: "your notes folder" };
  assert.equal(syncStatusText(status).detail, "Chrome needs your OK to write to your notes folder again.");
  const box = syncBox(status);
  assert.equal(box.status, "Chrome needs your OK to write to your notes folder again.");
  assert.equal(box.action, "Reconnect");
  assert.equal(box.reconnect, true);
  assert.equal(box.signIn, undefined);
  assert.equal(needsFolderOk(status), true);
  assert.equal(needsFolderOk({ ...status, place: "GitHub" }), false);
});
