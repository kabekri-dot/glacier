// Sync runs by itself (#15, ADR 0003): the panel asks for one when the
// sidebar opens (pulling the other browser's changes) and tells this module
// whenever a note changed, so a push follows a few seconds after typing
// stops. Offline, the edits stay in this browser and a later try pushes them.
// It keeps the sync status (synced, syncing, offline, conflict, plus "last
// synced") for the pill to draw.
//
// The Notebook core does the syncing itself; this only decides when. Timers
// are injected for tests. No browser APIs here.

import { syncErrorMessage } from "./notebook.mjs";

export function createAutoSync({
  notebook,
  // Resolves to `{ remote, repo }`, or null while no Notes Repo is connected.
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

  function setStatus(next) {
    status = { lastSynced: notebook.lastSynced(), ...next };
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

  async function syncOnce() {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
    const connection = await connect();
    if (!connection) {
      setStatus({ state: "off" });
      return;
    }
    beforeSync();
    setStatus({ state: "syncing" });
    try {
      const result = await notebook.sync(connection.remote);
      warnedOffline = false;
      setStatus(conflictStatus());
      if (result.pulled.length > 0) onPulled(result.pulled);
    } catch (error) {
      if (error?.reason === "aborted") {
        // Cut off because the sidebar is closing: not an error. The changes
        // stay pending and go out on the next sync.
        setStatus(settled.state === "off" ? conflictStatus() : settled);
        plan(retryDelay);
        return;
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
        setStatus({ state: "error", message: syncErrorMessage(error, connection.repo) });
        plan(retryDelay);
      }
    }
  }

  // Sync now. A call while a sync is running asks for one more round after
  // it, so nothing typed in the meantime is left out.
  function syncNow() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await syncOnce();
      } while (again);
      return status;
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

function lastSyncedText(lastSynced, now) {
  if (!lastSynced) return "Not synced yet.";
  const then = new Date(lastSynced);
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return "Last synced just now.";
  if (minutes === 1) return "Last synced 1 minute ago.";
  if (minutes < 60) return `Last synced ${minutes} minutes ago.`;
  const time = `${then.getHours()}:${String(then.getMinutes()).padStart(2, "0")}`;
  if (then.toDateString() === now.toDateString()) return `Last synced at ${time}.`;
  return `Last synced on ${then.toISOString().slice(0, 10)} at ${time}.`;
}

export function conflictMessage(count) {
  return count === 1 ? "A note has two versions. Check it" : `${count} notes have two versions. Check them`;
}

// What hovering the sync dot says, for every state (#70).
export function syncDotText(status) {
  switch (status.state) {
    case "syncing":
      return "Saving to GitHub";
    case "synced":
      return "All saved to GitHub";
    case "offline":
      return "Offline. Your changes are kept here and sync later";
    case "conflict": {
      const count = status.conflicts?.length ?? 1;
      return `${count === 1 ? "A note has" : `${count} notes have`} two versions. Click to see them`;
    }
    case "error":
      return syncStatusText(status).detail.replace(/ (Last synced|Not synced yet).*$/, "");
    default:
      return "Not connected to GitHub. Set it up in Settings";
  }
}

// The status in words: a short `label` and a sentence of `detail`.
export function syncStatusText(status, now = new Date()) {
  const last = lastSyncedText(status.lastSynced, now);
  switch (status.state) {
    case "syncing":
      return { label: "Syncing", detail: `Syncing with your Notes repo. ${last}` };
    case "synced":
      return { label: "Synced", detail: `Your notes match your Notes repo. ${last}` };
    case "offline":
      return {
        label: "Offline",
        detail: `Couldn't reach GitHub. Your changes are kept in this browser and sync when you are back online. ${last}`,
      };
    case "conflict":
      return {
        label: "Conflict",
        detail: `${conflictMessage(status.conflicts?.length ?? 1)}. ${last}`,
      };
    case "error":
      return {
        label: "Not synced",
        detail:
          status.reason === "unauthorized"
            ? "GitHub no longer accepts your token. It may have expired. Make a new one and paste it in Notes repo."
            : `${status.message} ${last}`,
      };
    default:
      return { label: "Saved in this browser", detail: "Saved in this browser. Connect a Notes repo to sync." };
  }
}
