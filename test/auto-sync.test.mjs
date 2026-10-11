import { test } from "node:test";
import assert from "node:assert/strict";

import { createAutoSync, syncStatusText } from "../src/auto-sync.mjs";
import { createNotebook, noteToFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";

// Sync runs by itself (#15, ADR 0003): a pull when the sidebar opens and a
// push a few seconds after typing stops. Timers are injected, and an
// in-memory remote stands in for GitHub.

const margins = {
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

function manualTimer() {
  let fn = null;
  return {
    setTimer: (callback) => {
      fn = callback;
      return 1;
    },
    clearTimer: () => {
      fn = null;
    },
    pending: () => fn !== null,
    fire: async () => {
      const callback = fn;
      fn = null;
      await callback?.();
    },
  };
}

function setup({ remote = memoryRemote({}), connected = true } = {}) {
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const timer = manualTimer();
  const statuses = [];
  const pulled = [];
  const autoSync = createAutoSync({
    notebook,
    connect: async () => (connected ? { remote, repo: "me/notes" } : null),
    onStatus: (status) => statuses.push(status.state),
    onPulled: (titles) => pulled.push(...titles),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  return { notebook, remote, timer, statuses, pulled, autoSync };
}

test("a few seconds after typing stops, the change is pushed", async () => {
  const { notebook, remote, timer, autoSync } = setup();
  notebook.saveBody("Margins", "Typed.");
  autoSync.changed();
  assert.deepEqual(remote.files(), {});
  await timer.fire();
  const { path, text } = noteToFile(notebook.note("Margins"));
  assert.equal(notebook.note("Margins").body, "Typed.");
  assert.deepEqual(remote.files(), { [path]: text });
});

test("opening the sidebar pulls the other browser's changes and says which notes changed", async () => {
  const other = { ...margins, title: "Padding", body: "Space inside." };
  const { path, text } = noteToFile(other);
  const { notebook, pulled, autoSync } = setup({ remote: memoryRemote({ [path]: text }) });
  await autoSync.syncNow();
  assert.equal(notebook.note("Padding").body, "Space inside.");
  assert.deepEqual(pulled, ["Padding"]);
});

test("the status goes from syncing to synced, with the time of the last sync", async () => {
  const { statuses, autoSync } = setup();
  const status = await autoSync.syncNow();
  assert.deepEqual(statuses, ["syncing", "synced"]);
  assert.ok(status.lastSynced);
});

test("without a Notes Repo nothing syncs and the status says so", async () => {
  const { autoSync } = setup({ connected: false });
  const status = await autoSync.syncNow();
  assert.equal(status.state, "off");
});

test("offline, the status says offline and the edit is pushed on a later try", async () => {
  const { notebook, remote, timer, autoSync } = setup();
  remote.failWith("offline");
  notebook.saveBody("Margins", "Typed offline.");
  const status = await autoSync.syncNow();
  assert.equal(status.state, "offline");
  assert.ok(timer.pending(), "a retry is planned");
  remote.failWith(null);
  await timer.fire();
  assert.equal(autoSync.status().state, "synced");
  assert.equal(Object.values(remote.files())[0].endsWith("Typed offline."), true);
});

test("a note changed in two places shows the conflict state", async () => {
  const remote = memoryRemote({});
  const { notebook, autoSync } = setup({ remote });
  await autoSync.syncNow();
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.sync(remote);
  firefox.saveBody("Margins", "Firefox's text.");
  await firefox.sync(remote);
  notebook.saveBody("Margins", "Chrome's text.");
  const status = await autoSync.syncNow();
  assert.equal(status.state, "conflict");
});

test("an expired token gives a clear message", async () => {
  const { remote, autoSync } = setup();
  remote.failWith("unauthorized");
  const status = await autoSync.syncNow();
  assert.equal(status.state, "error");
  assert.match(syncStatusText(status).detail, /expired/);
  assert.match(syncStatusText(status).detail, /Notes repo/);
});

test("each status has a short label, and says when the last sync was", () => {
  const now = new Date("2026-10-11T12:00:00");
  const lastSynced = new Date("2026-10-11T11:55:00").toISOString();
  assert.equal(syncStatusText({ state: "synced", lastSynced }, now).label, "Synced");
  assert.equal(syncStatusText({ state: "syncing", lastSynced }, now).label, "Syncing");
  assert.equal(syncStatusText({ state: "offline", lastSynced }, now).label, "Offline");
  assert.equal(syncStatusText({ state: "conflict", lastSynced }, now).label, "Conflict");
  assert.match(syncStatusText({ state: "synced", lastSynced }, now).detail, /Last synced 5 minutes ago/);
  assert.match(syncStatusText({ state: "offline" }, now).detail, /kept in this browser/);
});

// A fake fetch for the real GitHub remote (#62).
async function failingSync(failure) {
  const { githubRemote } = await import("../src/github-remote.mjs");
  const storage = memoryStorage();
  storage.putNote(margins);
  const notebook = createNotebook({ storage });
  const remote = githubRemote({
    repo: "me/notes",
    token: "t",
    fetch: async (url) => {
      if (url.endsWith("/repos/me/notes")) return { ok: true, json: async () => ({ default_branch: "main" }) };
      throw failure;
    },
  });
  await remote.connect();
  const statuses = [];
  const autoSync = createAutoSync({
    notebook,
    connect: async () => ({ remote, repo: "me/notes" }),
    onStatus: (s) => statuses.push(s.state),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  notebook.saveBody("Margins", "Typed.");
  return { autoSync, statuses };
}

function captureConsole() {
  const logged = { error: [], warn: [] };
  const original = { error: console.error, warn: console.warn };
  console.error = (...a) => logged.error.push(a);
  console.warn = (...a) => logged.warn.push(a);
  return { logged, restore: () => Object.assign(console, original) };
}

test("a request cut off by the sidebar closing logs nothing and ends on a real status", async () => {
  const cap = captureConsole();
  try {
    const { autoSync, statuses } = await failingSync(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await autoSync.syncNow();
    assert.equal(autoSync.status().state, "synced");
    assert.equal(statuses.at(-1), "synced");
    assert.deepEqual(cap.logged, { error: [], warn: [] });
  } finally {
    cap.restore();
  }
});

test("a network failure shows Offline, keeps the cause and warns only once", async () => {
  const cap = captureConsole();
  try {
    const { autoSync } = await failingSync(new TypeError("Failed to fetch"));
    await autoSync.syncNow();
    await autoSync.syncNow();
    assert.equal(autoSync.status().state, "offline");
    assert.equal(cap.logged.error.length, 0);
    assert.equal(cap.logged.warn.length, 1);
    assert.match(cap.logged.warn[0][1], /TypeError: Failed to fetch/);
  } finally {
    cap.restore();
  }
});

async function withConflict() {
  const remote = memoryRemote({});
  const { notebook, autoSync, statuses } = setup({ remote });
  await autoSync.syncNow();
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.sync(remote);
  firefox.saveBody("Margins", "Firefox's text.");
  await firefox.sync(remote);
  notebook.saveBody("Margins", "Chrome's text.");
  await autoSync.syncNow();
  return { notebook, autoSync, statuses };
}

test("deleting the last Conflict Copy clears the conflict at once", async () => {
  const { notebook, autoSync } = await withConflict();
  assert.equal(autoSync.status().state, "conflict");
  notebook.deleteNote(notebook.conflictCopies()[0]);
  autoSync.changed();
  assert.equal(autoSync.status().state, "synced");
});

test("archiving the last Conflict Copy clears the conflict at once", async () => {
  const { notebook, autoSync } = await withConflict();
  notebook.archiveNote(notebook.conflictCopies()[0]);
  autoSync.changed();
  assert.equal(autoSync.status().state, "synced");
});

test("a request cut off during a sync never leaves the status on syncing", async () => {
  const cap = captureConsole();
  try {
    const { autoSync } = await failingSync(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const first = autoSync.syncNow();
    autoSync.syncNow();
    await first;
    assert.notEqual(autoSync.status().state, "syncing");
  } finally {
    cap.restore();
  }
});

// The box under the sync dot (#75).
import { syncBox, syncResultText } from "../src/auto-sync.mjs";

const boxNow = new Date("2026-10-11T12:00:00");
const twoMinutesAgo = new Date("2026-10-11T11:58:00").toISOString();

test("the box says up to date with a quiet last synced line", () => {
  const box = syncBox({ state: "synced", lastSynced: twoMinutesAgo }, boxNow);
  assert.equal(box.status, "Up to date");
  assert.equal(box.last, "Last synced 2 minutes ago");
  assert.equal(box.action, "Sync now");
  assert.equal(box.conflicts, null);
});

test("the box says when the browser is offline", () => {
  const box = syncBox({ state: "offline", lastSynced: twoMinutesAgo }, boxNow);
  assert.equal(box.status, "Offline. Your changes are kept here");
});

test("the box says a sync is running", () => {
  assert.equal(syncBox({ state: "syncing" }, boxNow).status, "Syncing…");
});

test("the box gives an error in plain words", () => {
  const box = syncBox({ state: "error", message: "Repo not found.", lastSynced: twoMinutesAgo }, boxNow);
  assert.equal(box.status, "Repo not found.");
});

test("the box says when nothing was synced yet", () => {
  assert.equal(syncBox({ state: "synced" }, boxNow).last, "Not synced yet");
});

test("the box offers a way to check notes with two versions", () => {
  const box = syncBox({ state: "conflict", conflicts: ["a", "b", "c", "d", "e", "f"], lastSynced: twoMinutesAgo }, boxNow);
  assert.equal(box.conflicts, "6 notes have two versions. Check them");
});

test("not connected, the box says so and offers to set up sync", () => {
  const box = syncBox({ state: "off" }, boxNow);
  assert.equal(box.status, "Not connected to GitHub");
  assert.equal(box.action, "Set up sync");
  assert.equal(box.last, null);
});

test("a sync that changed nothing reads up to date", () => {
  assert.equal(syncResultText({ state: "synced", sent: 0, received: 0 }), "Up to date");
});

test("a sync that moved notes says how many went each way", () => {
  assert.equal(syncResultText({ state: "synced", sent: 3, received: 1 }), "3 notes sent, 1 received");
  assert.equal(syncResultText({ state: "synced", sent: 1, received: 0 }), "1 note sent");
  assert.equal(syncResultText({ state: "synced", sent: 0, received: 2 }), "2 notes received");
});

test("a sync that failed gives the offline or error words", () => {
  assert.equal(syncResultText({ state: "offline" }), "Offline. Your changes are kept here");
  assert.equal(syncResultText({ state: "error", message: "Repo not found." }), "Repo not found.");
});

test("syncNow reports how many notes were sent and received", async () => {
  const { autoSync } = setup();
  const result = await autoSync.syncNow();
  assert.equal(result.sent, 1);
  assert.equal(result.received, 0);
});
