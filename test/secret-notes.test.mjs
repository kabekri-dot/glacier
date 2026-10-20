import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";
import { unzipFiles } from "../src/zip.mjs";

// Secret notes (#109, ADR 0012): the body is encrypted with a key from the
// Glacier passcode, in the browser and in every Notes Home.

const DIARY = "Dear diary, the password is hunter2.";

async function notebookWithSecret({ storage = memoryStorage() } = {}) {
  const notebook = createNotebook({ storage });
  notebook.createNote({ title: "Diary" });
  notebook.saveBody("Diary", DIARY);
  await notebook.setPasscode("open sesame");
  await notebook.makeSecret("Diary");
  await notebook.settled();
  return { notebook, storage };
}

test("a secret note's file holds no plain text of its body", async () => {
  const { notebook } = await notebookWithSecret();
  const { path, text } = notebook.exportNote("Diary");
  assert.equal(path, "notes/Diary.md");
  assert.match(text, /^---\n[\s\S]*secret: true\n---\n```glacier-secret\n[\s\S]*\n```\n$/);
  assert.ok(!text.includes("diary"));
  assert.ok(!text.includes("hunter2"));
});

test("the browser's own copy of a secret note holds no plain text either", async () => {
  const { storage } = await notebookWithSecret();
  assert.ok(!JSON.stringify(storage.allNotes()).includes("hunter2"));
  assert.ok(!JSON.stringify([storage.getMeta("secretPasscode")]).includes("open sesame"));
});

test("an unlocked secret note reads and saves as plain text", async () => {
  const { notebook, storage } = await notebookWithSecret();
  assert.equal(notebook.note("Diary").body, DIARY);
  notebook.saveBody("Diary", "A new secret.");
  await notebook.settled();
  assert.equal(notebook.note("Diary").body, "A new secret.");
  assert.ok(!storage.getNote("Diary").body.includes("new secret"));
});

test("a locked secret note shows no text until the right passcode opens it", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.lock();
  assert.equal(notebook.isLocked("Diary"), true);
  assert.equal(notebook.note("Diary").body, "");
  assert.equal(await notebook.unlock("open sesame"), true);
  assert.equal(notebook.isLocked("Diary"), false);
  assert.equal(notebook.note("Diary").body, DIARY);
});

test("a wrong passcode doesn't open a secret note", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.lock();
  assert.equal(await notebook.unlock("open sesam"), false);
  assert.equal(notebook.isLocked("Diary"), true);
  assert.equal(notebook.note("Diary").body, "");
});

test("a locked secret note can't be written into", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.lock();
  assert.equal(notebook.saveBody("Diary", "Overwritten"), undefined);
  await notebook.unlock("open sesame");
  assert.equal(notebook.note("Diary").body, DIARY);
});

test("search doesn't look inside a locked secret note", async () => {
  const { notebook } = await notebookWithSecret();
  assert.deepEqual(notebook.search("//hunter2").map((r) => r.title), ["Diary"]);
  notebook.lock();
  assert.deepEqual(notebook.search("//hunter2"), []);
  assert.deepEqual(notebook.search("diary").map((r) => r.title), ["Diary"]);
});

test("a locked secret note's Links and Backlinks are not shown", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.createNote({ title: "Plans" });
  notebook.saveBody("Diary", "See [[Plans]].");
  notebook.createNote({ title: "Index" });
  notebook.saveBody("Index", "[[Diary]]");
  assert.deepEqual(notebook.backlinks("Plans").map((n) => n.title), ["Diary"]);
  notebook.lock();
  assert.deepEqual(notebook.outgoingLinks("Diary"), []);
  assert.deepEqual(notebook.backlinks("Plans"), []);
  assert.deepEqual(notebook.backlinks("Diary"), []);
});

test("a locked secret note isn't printed", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.lock();
  assert.deepEqual(notebook.notesToPrint("Diary"), []);
});

test("sync sends a secret note encrypted, and another browser opens it with the passcode", async () => {
  const { notebook } = await notebookWithSecret();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  const files = remote.files();
  assert.ok(files["notes/Diary.md"].includes("```glacier-secret"));
  assert.ok(!Object.values(files).join("").includes("hunter2"));

  const other = createNotebook({ storage: memoryStorage() });
  await other.firstSync(remote);
  assert.equal(other.isLocked("Diary"), true);
  assert.equal(await other.unlock("wrong"), false);
  assert.equal(await other.unlock("open sesame"), true);
  assert.equal(other.note("Diary").body, DIARY);
});

test("an edit to a secret note syncs encrypted and opens in the other browser", async () => {
  const { notebook } = await notebookWithSecret();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  const other = createNotebook({ storage: memoryStorage() });
  await other.firstSync(remote);
  await other.unlock("open sesame");

  notebook.saveBody("Diary", "Changed in Chrome.");
  await notebook.sync(remote);
  assert.ok(!remote.files()["notes/Diary.md"].includes("Chrome"));
  const { pulled } = await other.sync(remote);
  assert.deepEqual(pulled, ["Diary"]);
  assert.equal(other.note("Diary").body, "Changed in Chrome.");
});

test("a secret note's sketches travel inside the encrypted text, not as pictures", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Map" });
  const { n, line } = notebook.addSketch("Map");
  notebook.saveBody("Map", line);
  notebook.saveSketch("Map", n, { width: 100, height: 50, shapes: [{ kind: "rectangle", x: 1, y: 1, w: 10, h: 10 }] });
  await notebook.setPasscode("pass");
  await notebook.makeSecret("Map");
  const remote = memoryRemote({});
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()), ["notes/Map.md"]);
  assert.equal(notebook.sketch("Map", n).shapes.length, 1);
  notebook.lock();
  assert.equal(notebook.sketch("Map", n), undefined);
});

test("export and restore keep a secret note encrypted", async () => {
  const { notebook } = await notebookWithSecret();
  const zip = notebook.exportZip();
  const files = await unzipFiles(zip);
  assert.ok(!files.map((f) => f.text).join("").includes("hunter2"));

  const fresh = createNotebook({ storage: memoryStorage() });
  assert.equal((await fresh.importZip(zip)).added, 1);
  assert.equal(fresh.isLocked("Diary"), true);
  assert.equal(await fresh.unlock("open sesame"), true);
  assert.equal(fresh.note("Diary").body, DIARY);
  assert.equal((await fresh.importZip(zip)).unchanged, 1);
});

test("changing the passcode encrypts every secret note again", async () => {
  const { notebook, storage } = await notebookWithSecret();
  notebook.createNote({ title: "Letters" });
  notebook.saveBody("Letters", "Dear you.");
  await notebook.makeSecret("Letters");
  await notebook.settled();
  const before = storage.getNote("Diary").body;

  assert.equal((await notebook.changePasscode("wrong", "new one")).ok, false);
  assert.equal((await notebook.changePasscode("open sesame", "new one")).ok, true);
  assert.notEqual(storage.getNote("Diary").body, before);
  notebook.lock();
  assert.equal(await notebook.unlock("open sesame"), false);
  assert.equal(await notebook.unlock("new one"), true);
  assert.equal(notebook.note("Diary").body, DIARY);
  assert.equal(notebook.note("Letters").body, "Dear you.");
});

test("making a note not secret puts its plain text back", async () => {
  const { notebook } = await notebookWithSecret();
  await notebook.makeNotSecret("Diary");
  notebook.lock();
  assert.equal(notebook.note("Diary").secret, undefined);
  assert.ok(notebook.exportNote("Diary").text.endsWith(DIARY));
});

test("a locked note can't be made secret or not secret", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.createNote({ title: "Plain" });
  notebook.lock();
  assert.equal(await notebook.makeNotSecret("Diary"), undefined);
  assert.equal(await notebook.makeSecret("Plain"), undefined);
  assert.equal(notebook.isSecret("Plain"), false);
});

test("the passcode is set once, and then asked for", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.hasPasscode(), false);
  assert.equal(await notebook.setPasscode("first"), true);
  assert.equal(notebook.hasPasscode(), true);
  assert.equal(await notebook.setPasscode("second"), false);
  notebook.lock();
  assert.equal(await notebook.unlock("second"), false);
  assert.equal(await notebook.unlock("first"), true);
});

test("a browser that synced secret notes in asks for their passcode, not a new one", async () => {
  const { notebook } = await notebookWithSecret();
  const remote = memoryRemote({});
  await notebook.sync(remote);
  const other = createNotebook({ storage: memoryStorage() });
  await other.firstSync(remote);
  assert.equal(other.hasPasscode(), true);
});

test("a note extracted from a secret note is secret too", async () => {
  const { notebook, storage } = await notebookWithSecret();
  notebook.createNote({ title: "Piece", secret: true });
  notebook.saveBody("Piece", "A secret piece.");
  await notebook.settled();
  assert.equal(notebook.isSecret("Piece"), true);
  assert.ok(!storage.getNote("Piece").body.includes("piece"));
  assert.equal(notebook.note("Piece").body, "A secret piece.");
});

test("renaming an unlocked secret note keeps it secret and readable", async () => {
  const { notebook, storage } = await notebookWithSecret();
  notebook.renameNote("Diary", "Journal");
  await notebook.settled();
  assert.equal(notebook.note("Journal").body, DIARY);
  assert.ok(storage.getNote("Journal").body.startsWith("```glacier-secret"));
  notebook.lock();
  await notebook.unlock("open sesame");
  assert.equal(notebook.note("Journal").body, DIARY);
});

// Its sketches are named after the title inside the encrypted text, which
// can't be rewritten while locked: the rename waits for the passcode.
test("a locked secret note can't be renamed until it is opened", async () => {
  const { notebook } = await notebookWithSecret();
  notebook.lock();
  const result = notebook.renameNote("Diary", "Journal");
  assert.deepEqual(result, { ok: false, locked: true });
  assert.ok(notebook.note("Diary"));
  assert.equal(notebook.note("Journal"), undefined);
});

test("a secret note's sketch still shows after a rename", async () => {
  const { notebook } = await notebookWithSecret();
  const { n, line } = notebook.addSketch("Diary", { width: 300 });
  notebook.saveBody("Diary", `${DIARY}\n${line}`);
  notebook.saveSketch("Diary", n, { width: 300, height: 90, shapes: [{ kind: "square", x: 0, y: 0, w: 20, h: 20 }] });
  await notebook.settled();
  notebook.renameNote("Diary", "Journal");
  await notebook.settled();
  notebook.lock();
  await notebook.unlock("open sesame");
  const embed = notebook.note("Journal").body.split("\n")[1];
  assert.equal(notebook.sketchForLine(embed)?.sketch.shapes.length, 1);
});
