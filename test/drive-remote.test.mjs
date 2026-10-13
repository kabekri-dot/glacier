import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryDrive } from "../src/memory-drive.mjs";
import { driveRemote } from "../src/drive-remote.mjs";

// Google Drive as a Notes Home (#95, ADR 0011): the notes are Markdown files
// in a folder named Glacier in the person's Drive, laid out like the Notes
// Repo. Tested through the Notebook core with an in-memory Drive.

const margins = { title: "Margins", created: "2026-10-02T10:00:00.000Z", body: "Space outside the border." };
const padding = { title: "Padding", created: "2026-10-03T10:00:00.000Z", body: "Space inside the border.", course: "CSS" };

function filesOf(...notes) {
  return Object.fromEntries(notes.map((note) => {
    const { path, text } = noteToFile(note);
    return [path, text];
  }));
}

// One browser signed in to the Drive: a token that a renewal replaces.
function signedIn(drive) {
  let token = drive.signIn();
  const asked = [];
  const getToken = async (options = {}) => {
    asked.push(options);
    if (options.renew) token = drive.signIn();
    return token;
  };
  return { remote: driveRemote({ getToken, fetch: drive.fetch }), asked };
}

function browser(drive, ...notes) {
  const storage = memoryStorage();
  for (const note of notes) storage.putNote(note);
  return { notebook: createNotebook({ storage }), ...signedIn(drive) };
}

test("the first connect combines the notes here with the ones in Drive", async () => {
  const drive = memoryDrive();
  const other = browser(drive, padding);
  await other.notebook.switchNotesHome("google-drive", other.remote);

  const here = browser(drive, margins);
  await here.notebook.switchNotesHome("google-drive", here.remote);

  assert.deepEqual(here.notebook.notes().map((note) => note.title).sort(), ["Margins", "Padding"]);
  assert.deepEqual(drive.files(), filesOf(margins, padding));
});

test("the notes go into one folder named Glacier, with the same layout as GitHub", async () => {
  const drive = memoryDrive();
  const first = browser(drive, margins, padding);
  await first.notebook.switchNotesHome("google-drive", first.remote);
  const second = browser(drive);
  await second.notebook.switchNotesHome("google-drive", second.remote);

  assert.equal(drive.glacierFolders(), 1);
  assert.deepEqual(Object.keys(drive.files()).sort(), ["collections/CSS/Padding.md", "notes/Margins.md"]);
});

test("the path of every file is found again from a listing that comes in several pages", async () => {
  const drive = memoryDrive({ pageLimit: 2 });
  const notes = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((title, i) => ({
    title,
    created: `2026-10-0${i + 1}T10:00:00.000Z`,
    body: `About ${title}.`,
    ...(i % 2 === 0 && { course: "Greek" }),
  }));
  const first = browser(drive, ...notes);
  await first.notebook.switchNotesHome("google-drive", first.remote);

  const second = browser(drive);
  await second.notebook.switchNotesHome("google-drive", second.remote);
  assert.deepEqual(second.notebook.notes().map((note) => note.title).sort(), ["Alpha", "Beta", "Delta", "Epsilon", "Gamma"]);
  assert.equal(second.notebook.note("Gamma").course, "Greek");
});

test("an edit on a second computer comes in on the next sync", async () => {
  const drive = memoryDrive();
  const first = browser(drive, margins);
  await first.notebook.switchNotesHome("google-drive", first.remote);
  const second = browser(drive);
  await second.notebook.switchNotesHome("google-drive", second.remote);

  second.notebook.saveBody("Margins", "Edited on the second computer.");
  await second.notebook.sync(second.remote);
  const result = await first.notebook.sync(first.remote);

  assert.deepEqual(result.pulled, ["Margins"]);
  assert.equal(first.notebook.note("Margins").body, "Edited on the second computer.");
});

test("a commit naming a version that changed since is refused, and nothing is written", async () => {
  const drive = memoryDrive();
  const { remote } = signedIn(drive);
  await remote.connect();
  const made = await remote.commit({ writes: [{ path: "notes/A.md", text: "one" }] });
  await remote.commit({ writes: [{ path: "notes/A.md", text: "two", version: made["notes/A.md"] }] });

  await assert.rejects(
    remote.commit({
      writes: [
        { path: "notes/B.md", text: "new" },
        { path: "notes/A.md", text: "stale", version: made["notes/A.md"] },
      ],
    }),
    { reason: "conflict" },
  );
  assert.deepEqual(drive.files(), { "notes/A.md": "two" });
});

test("a new file where Drive already has one is refused as stale", async () => {
  const drive = memoryDrive();
  const { remote } = signedIn(drive);
  await remote.connect();
  await remote.commit({ writes: [{ path: "notes/A.md", text: "one" }] });
  await assert.rejects(remote.commit({ writes: [{ path: "notes/A.md", text: "again" }] }), { reason: "conflict" });
});

test("a note changed on two computers before syncing keeps both versions", async () => {
  const drive = memoryDrive();
  const first = browser(drive, margins);
  await first.notebook.switchNotesHome("google-drive", first.remote);
  const second = browser(drive);
  await second.notebook.switchNotesHome("google-drive", second.remote);

  first.notebook.saveBody("Margins", "First computer.");
  second.notebook.saveBody("Margins", "Second computer.");
  await second.notebook.sync(second.remote);
  await first.notebook.sync(first.remote);

  assert.equal(first.notebook.note("Margins").body, "First computer.");
  assert.equal(first.notebook.conflictCopies().length, 1);
  assert.match(drive.files()["notes/Margins.md"], /First computer\./);
});

test("a renamed note moves its file, and the old one goes to Drive's trash", async () => {
  const drive = memoryDrive();
  const { notebook, remote } = browser(drive, margins);
  await notebook.switchNotesHome("google-drive", remote);
  notebook.renameNote("Margins", "Gutters");
  await notebook.sync(remote);

  assert.deepEqual(Object.keys(drive.files()), ["notes/Gutters.md"]);
  assert.deepEqual(drive.trash(), ["Margins.md"]);
});

test("files Glacier didn't put in its folder are left out", async () => {
  const drive = memoryDrive();
  drive.addFile({ name: "Margins.md", text: "Someone else's file." });
  const { notebook, remote } = browser(drive);
  await notebook.switchNotesHome("google-drive", remote);
  assert.deepEqual(notebook.notes(), []);
});

test("an expired sign-in is renewed quietly and the sync goes on", async () => {
  const drive = memoryDrive();
  const { notebook, remote, asked } = browser(drive, margins);
  await notebook.switchNotesHome("google-drive", remote);
  drive.expireTokens();
  notebook.saveBody("Margins", "Typed after an hour.");
  await notebook.sync(remote);

  assert.ok(asked.some((options) => options.renew));
  assert.match(drive.files()["notes/Margins.md"], /Typed after an hour\./);
});

test("a sign-in that can't be renewed asks to sign in again", async () => {
  const drive = memoryDrive();
  const notebook = createNotebook({ storage: memoryStorage() });
  const getToken = async ({ renew } = {}) => {
    if (renew) throw Object.assign(new Error("Signed out of Google"), { reason: "unauthorized" });
    return "an old token";
  };
  await assert.rejects(notebook.switchNotesHome("google-drive", driveRemote({ getToken, fetch: drive.fetch })), { reason: "unauthorized" });
});

test("Drive out of reach is offline, and a refusal is forbidden", async () => {
  const drive = memoryDrive();
  const { remote } = signedIn(drive);
  drive.failWith("offline");
  await assert.rejects(remote.connect(), { reason: "offline" });
  drive.failWith("forbidden");
  await assert.rejects(remote.connect(), { reason: "forbidden" });
});

test("a sync with nothing new reads no file again", async () => {
  const drive = memoryDrive();
  const { notebook, remote } = browser(drive, margins, padding);
  await notebook.switchNotesHome("google-drive", remote);
  const before = drive.requests();
  await notebook.sync(remote);
  // Finding the folder and one page of listing; no reads, no writes.
  assert.equal(drive.requests() - before, 2);
});

// The first connect with many notes was slow: one upload after the other.
test("many notes go up a few at a time, never more than six at once, each folder made once", async () => {
  const drive = memoryDrive();
  let inFlight = 0;
  let most = 0;
  const slowFetch = async (address, options) => {
    const upload = address.includes("/upload/");
    if (upload) most = Math.max(most, (inFlight += 1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      return await drive.fetch(address, options);
    } finally {
      if (upload) inFlight -= 1;
    }
  };
  const token = drive.signIn();
  const remote = driveRemote({ getToken: async () => token, fetch: slowFetch });
  const storage = memoryStorage();
  for (let i = 0; i < 20; i += 1) {
    storage.putNote({ title: `Note ${i}`, created: "2026-10-01T10:00:00.000Z", body: `Text ${i}`, ...(i % 2 === 0 && { course: "CSS" }) });
  }
  const notebook = createNotebook({ storage });
  await notebook.switchNotesHome("google-drive", remote);

  assert.equal(Object.keys(drive.files()).length, 20);
  assert.ok(most > 1, `uploads ran one at a time (${most})`);
  assert.ok(most <= 6, `too many uploads at once (${most})`);
  assert.equal(drive.glacierFolders(), 1);
});

test("a second computer reads the notes from Drive a few at a time", async () => {
  const drive = memoryDrive();
  const first = browser(drive, ...Array.from({ length: 12 }, (_, i) => ({ title: `Note ${i}`, created: "2026-10-01T10:00:00.000Z", body: `Text ${i}` })));
  await first.notebook.switchNotesHome("google-drive", first.remote);

  let inFlight = 0;
  let most = 0;
  const slowFetch = async (address, options) => {
    const read = address.includes("alt=media");
    if (read) most = Math.max(most, (inFlight += 1));
    await new Promise((resolve) => setTimeout(resolve, 5));
    try {
      return await drive.fetch(address, options);
    } finally {
      if (read) inFlight -= 1;
    }
  };
  const token = drive.signIn();
  const notebook = createNotebook({ storage: memoryStorage() });
  await notebook.switchNotesHome("google-drive", driveRemote({ getToken: async () => token, fetch: slowFetch }));

  assert.equal(notebook.notes().length, 12);
  assert.ok(most > 1 && most <= 6, `reads at once: ${most}`);
});
