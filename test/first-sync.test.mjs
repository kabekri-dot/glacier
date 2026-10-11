import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile, notesRepoName, syncErrorMessage } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Connect GitHub and the first sync (#14, ADR 0003): the first sync brings
// every note in the Notes Repo into the browser, step by step. GitHub plugs in
// from outside; here an in-memory remote stands in for it.

const boxModel = {
  title: "Box model",
  course: "TOP Foundations",
  source: "https://odin.example/foundations/box-model",
  created: "2026-10-01T09:30:00.000Z",
  body: "See [[Margins]].\n",
};

const margins = {
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => {
    const { path, text } = noteToFile(note);
    return [path, text];
  }));
}

test("a first sync fills an empty Notebook from the files in the Notes Repo", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(memoryRemote(filesOf(boxModel, margins)));
  assert.deepEqual(notebook.note("Box model"), boxModel);
  assert.deepEqual(notebook.note("Margins"), margins);
  assert.deepEqual(notebook.backlinks("Margins").map((note) => note.title), ["Box model"]);
});

test("a first sync tells how many notes it brought in", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const result = await notebook.firstSync(memoryRemote(filesOf(boxModel, margins)));
  assert.equal(result.notes, 2);
});

test("a first sync shows each step, counting the notes as they download", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const steps = [];
  await notebook.firstSync(memoryRemote(filesOf(boxModel, margins)), (step) => steps.push(step));
  assert.deepEqual(steps, [
    { step: "connecting" },
    { step: "downloading", done: 0, total: 2 },
    { step: "downloading", done: 1, total: 2 },
    { step: "downloading", done: 2, total: 2 },
    { step: "linking" },
    { step: "ready", notes: 2 },
  ]);
});

test("an empty Notes Repo gives an empty, ready Notebook", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const result = await notebook.firstSync(memoryRemote({}));
  assert.equal(result.notes, 0);
  assert.ok(notebook.isEmpty());
});

test("files outside courses/, notes/ and concepts/, or not Markdown, are left out", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(memoryRemote({
    ...filesOf(margins),
    "README.md": "My notes",
    ".obsidian/app.json": "{}",
    "concepts/picture.png": "png",
  }));
  assert.deepEqual(notebook.notes().map((note) => note.title), ["Margins"]);
});

test("a note already here with the same text stays as it is", async () => {
  const storage = memoryStorage();
  const notebook = createNotebook({ storage });
  storage.putNote(margins);
  await notebook.firstSync(memoryRemote(filesOf(margins)));
  assert.equal(notebook.notes().length, 1);
});

test("a note already here with other text is never overwritten: the Notes Repo's version becomes a Conflict Copy", async () => {
  const storage = memoryStorage();
  const notebook = createNotebook({ storage });
  storage.putNote({ ...margins, body: "Mine" });
  await notebook.firstSync(memoryRemote(filesOf(margins)));
  assert.equal(notebook.note("Margins").body, "Mine");
  const copy = notebook.notes().find((note) => note.title.startsWith("Margins (conflict "));
  assert.match(copy.title, /^Margins \(conflict \d{4}-\d{2}-\d{2}\)$/);
  assert.equal(copy.body, margins.body);
});

test("a first sync writes nothing to the Notes Repo", async () => {
  const storage = memoryStorage();
  const notebook = createNotebook({ storage });
  storage.putNote({ ...margins, body: "Mine" });
  const remote = memoryRemote(filesOf(margins));
  await notebook.firstSync(remote);
  assert.deepEqual(remote.files(), filesOf(margins));
});

test("a wrong token stops the first sync before anything changes", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const remote = memoryRemote(filesOf(margins));
  remote.failWith("unauthorized");
  await assert.rejects(notebook.firstSync(remote), (error) => error.reason === "unauthorized");
  assert.ok(notebook.isEmpty());
});

test("a wrong token, a wrong repo, no access or no connection each get a clear message", () => {
  const messageFor = (reason) => syncErrorMessage(Object.assign(new Error(), { reason }), "me/notes");
  assert.match(messageFor("unauthorized"), /token/);
  assert.match(messageFor("not-found"), /me\/notes/);
  assert.match(messageFor("forbidden"), /Contents/);
  assert.match(messageFor("offline"), /reach GitHub/);
  assert.match(syncErrorMessage(new Error("boom"), "me/notes"), /try again/i);
});

test("a Notes Repo name is owner/name, typed or pasted as its GitHub address", () => {
  assert.equal(notesRepoName("me/notes"), "me/notes");
  assert.equal(notesRepoName("  https://github.com/me/notes.git "), "me/notes");
  assert.equal(notesRepoName("github.com/me/notes/"), "me/notes");
  assert.equal(notesRepoName("notes"), undefined);
  assert.equal(notesRepoName("me/notes/extra"), undefined);
});

// A Notes Repo written before there was one kind of note (#68, ADR 0010):
// notes without a Course in concepts/, and a `type` line in every frontmatter.
const oldRepo = {
  "concepts/Margins.md": "---\ntype: concept\ncreated: 2026-10-02T10:00:00.000Z\n---\nSpace outside the border.",
  "courses/TOP Foundations/Box model.md":
    "---\ntype: lesson\ncourse: TOP Foundations\nsource: https://odin.example/foundations/box-model\ncreated: 2026-10-01T09:30:00.000Z\n---\nSee [[Margins]].\n",
};

test("old files in concepts/ come in as notes without a page or Course", async () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(memoryRemote(oldRepo));
  assert.deepEqual(notebook.note("Margins"), margins);
  assert.deepEqual(notebook.note("Box model"), boxModel);
});

test("the first sync after a first sync moves concepts/ files to notes/ as one commit", async () => {
  const remote = memoryRemote(oldRepo);
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.firstSync(remote);
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), filesOf(boxModel, margins));
  assert.equal(remote.commits().length, 1);
  assert.ok(remote.commits()[0].includes("concepts/Margins.md"));
  assert.equal(notebook.notes().length, 2);
});

test("a browser that synced the old files moves them on its next sync, as one commit", async () => {
  const remote = memoryRemote(oldRepo);
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.sync(remote);
  assert.deepEqual(remote.files(), filesOf(boxModel, margins));
  assert.equal(remote.commits().length, 1);
  await notebook.sync(remote);
  assert.equal(remote.commits().length, 1);
});
