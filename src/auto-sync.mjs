// Sync runs by itself (#15, ADR 0003): the panel asks for one when the
// sidebar opens (pulling the other browser's changes) and tells this module
// whenever a note changed, so a push follows a few seconds after typing
// stops. Offline, the edits stay in this browser and a later try pushes them.
// It keeps the sync status (synced, syncing, offline, conflict, plus "last
// synced") for the pill to draw.
//
// The Notebook core does the syncing itself; this only decides when. Timers
// are injected for tests. No browser APIs here.

import { notesHomeName, signInLostText, syncErrorMessage } from "./notes-home.mjs";

const NOTHING_MOVED = { sent: 0, received: 0 };

export function createAutoSync({
  notebook,
  // Resolves to `{ remote, repo, home }`, or null while the notes live only
  // in this browser. `home` is the Notes Home's id (src/notes-home.mjs), which
  // the dot and its box name and word their errors by.
  connect,
  beforeSync = () => {},
  onStatus = () => {},
  onPulled = () => {},
  delay = 3000,
  retryDelay = 30000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let status = { state: "off", lastSynced: notebook.lastSynced() };
  // The last status that wasn't "syncing", for a run that is cut off.
  let settled = status;
  let handle = null;
  let running = null;
  let again = false;
  let warnedOffline = false;
  let home;

  function setStatus(next) {
    status = { lastSynced: notebook.lastSynced(), ...(next.state !== "off" && home && { home }), ...next };
    if (status.state !== "syncing") settled = status;
    onStatus(status);
  }

  function plan(after) {
    if (handle !== null) clearTimer(handle);
    handle = setTimer(() => {
      handle = null;
      return syncNow();
    }, after);
  }

  // The conflict shows until every Conflict Copy is gone: merged by hand and
  // deleted, archived or renamed, not just this once.
  function conflictStatus() {
    const conflicts = notebook.conflictCopies();
    return conflicts.length > 0 ? { state: "conflict", conflicts } : { state: "synced" };
  }

  // Resolves to how many notes went out and came in, zero when nothing ran.
  async function syncOnce() {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
    const connection = await connect();
    if (!connection) {
      setStatus({ state: "off" });
      return NOTHING_MOVED;
    }
    beforeSync();
    home = connection.home ?? "github";
    setStatus({ state: "syncing" });
    try {
      const result = await notebook.sync(connection.remote);
      warnedOffline = false;
      setStatus(conflictStatus());
      if (result.pulled.length > 0) onPulled(result.pulled);
      return { sent: result.pushed, received: result.pulled.length };
    } catch (error) {
      if (error?.reason === "aborted") {
        // Cut off because the sidebar is closing: not an error. The changes
        // stay pending and go out on the next sync.
        setStatus(settled.state === "off" ? conflictStatus() : settled);
        plan(retryDelay);
        return NOTHING_MOVED;
      }
      if (error?.reason === "offline") {
        if (!warnedOffline) console.warn("Glacier: offline", error.message, error.cause);
        warnedOffline = true;
        setStatus({ state: "offline" });
        plan(retryDelay);
      } else if (error?.reason === "unauthorized") {
        console.error("Glacier: sync failed", error);
        setStatus({ state: "error", reason: "unauthorized" });
      } else {
        console.error("Glacier: sync failed", error);
        // A version that changed under this push is picked up by the next
        // sync's pull, so trying again soon is enough.
        setStatus({ state: "error", message: syncErrorMessage(error, { home, repo: connection.repo }) });
        plan(retryDelay);
      }
    }
    return NOTHING_MOVED;
  }

  // Sync now. A call while a sync is running asks for one more round after
  // it, so nothing typed in the meantime is left out.
  function syncNow() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      const total = { sent: 0, received: 0 };
      do {
        again = false;
        const moved = await syncOnce();
        total.sent += moved.sent;
        total.received += moved.received;
      } while (again);
      return { ...status, ...total };
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    // A note changed: push a few seconds after the last change.
    changed() {
      if (status.state === "conflict") setStatus(conflictStatus());
      plan(delay);
    },
    syncNow,
    // Run a planned sync straight away (the sidebar is being hidden).
    flush() {
      if (handle !== null) syncNow();
    },
    status() {
      return status;
    },
  };
}

function lastSyncedPhrase(lastSynced, now) {
  if (!lastSynced) return "Not synced yet";
  const then = new Date(lastSynced);
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return "Last synced just now";
  if (minutes === 1) return "Last synced 1 minute ago";
  if (minutes < 60) return `Last synced ${minutes} minutes ago`;
  const time = `${then.getHours()}:${String(then.getMinutes()).padStart(2, "0")}`;
  if (then.toDateString() === now.toDateString()) return `Last synced at ${time}`;
  return `Last synced on ${then.toISOString().slice(0, 10)} at ${time}`;
}

function lastSyncedText(lastSynced, now) {
  return `${lastSyncedPhrase(lastSynced, now)}.`;
}

const OFFLINE_SHORT = "Offline. Your changes are kept here";

// The box under the sync dot (#75): the status in words, the quiet last
// synced line, the button's label, and the line for notes with two versions.
export function syncBox(status, now = new Date()) {
  if (status.state === "off") {
    return { status: "Only in this browser", last: null, action: "Choose where they live", conflicts: null };
  }
  const words = {
    syncing: "Syncing…",
    offline: OFFLINE_SHORT,
    error: syncDotText(status),
    conflict: "Synced",
  };
  const box = {
    status: words[status.state] ?? "Up to date",
    last: lastSyncedPhrase(status.lastSynced, now),
    action: "Sync now",
    conflicts: status.state === "conflict" ? conflictMessage(status.conflicts?.length ?? 1) : null,
  };
  // Google's quiet renewal failed (#95): one button signs in again.
  if (needsGoogleSignIn(status)) return { ...box, action: "Sign in with Google", signIn: true };
  // Chrome forgot the folder's permission and the quiet ask didn't do (#97).
  if (needsFolderOk(status)) return { ...box, action: "Reconnect", reconnect: true };
  return box;
}

// Chrome forgot that Glacier may write to the notes folder, as it does after
// a restart (#97). The notes keep saving in this browser meanwhile.
export function needsFolderOk(status) {
  return status.state === "error" && status.reason === "unauthorized" && status.home === "folder";
}

function errorDetail(status, last) {
  if (status.reason === "unauthorized") return signInLostText(status.home);
  return `${status.message} ${last}`;
}

function needsGoogleSignIn(status) {
  return status.state === "error" && status.reason === "unauthorized" && status.home === "google-drive";
}

// What the Sync now button shows for a few seconds once a sync is done.
export const JUST_SYNCED = "Just synced";

export function syncResultText(result) {
  if (result.state === "offline") return OFFLINE_SHORT;
  if (result.state === "error") return syncDotText(result);
  return JUST_SYNCED;
}

export function conflictMessage(count) {
  return count === 1 ? "A note has two versions. Check it" : `${count} notes have two versions. Check them`;
}

// The Notes Home's name, for a status from before there was a choice.
function placeOf(status) {
  return notesHomeName(status.home ?? "github");
}

// What hovering the sync dot says, for every state (#70).
export function syncDotText(status) {
  switch (status.state) {
    case "syncing":
      return `Saving to ${placeOf(status)}`;
    case "synced":
      return `All saved to ${placeOf(status)}`;
    case "offline":
      return `${OFFLINE_SHORT} and sync later`;
    case "conflict": {
      const count = status.conflicts?.length ?? 1;
      return `${count === 1 ? "A note has" : `${count} notes have`} two versions. Click to see them`;
    }
    case "error":
      return syncStatusText(status).detail.replace(/ (Last synced|Not synced yet).*$/, "");
    default:
      return "Your notes live only in this browser. Choose where they live in Settings";
  }
}

// The status in words: a short `label` and a sentence of `detail`.
export function syncStatusText(status, now = new Date()) {
  const last = lastSyncedText(status.lastSynced, now);
  switch (status.state) {
    case "syncing":
      return { label: "Syncing", detail: `Syncing with ${placeOf(status)}. ${last}` };
    case "synced":
      return { label: "Synced", detail: `Your notes match the ones in ${placeOf(status)}. ${last}` };
    case "offline":
      return {
        label: "Offline",
        detail: `Couldn't reach ${placeOf(status)}. Your changes are kept in this browser and sync when you are back online. ${last}`,
      };
    case "conflict":
      return {
        label: "Conflict",
        detail: `${conflictMessage(status.conflicts?.length ?? 1)}. ${last}`,
      };
    case "error":
      return {
        label: "Not synced",
        detail: errorDetail(status, last),
      };
    default:
      return { label: "Saved in this browser", detail: "Saved only in this browser. Choose where your notes live in Settings." };
  }
}
