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
  let handle = null;
  let running = null;
  let again = false;

  function setStatus(next) {
    status = { lastSynced: notebook.lastSynced(), ...next };
    onStatus(status);
  }

  function plan(after) {
    if (handle !== null) clearTimer(handle);
    handle = setTimer(() => {
      handle = null;
      return syncNow();
    }, after);
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
      // The conflict shows until every Conflict Copy is gone (merged by hand,
      // then renamed or removed from the Notes Repo), not just this once.
      const conflicts = notebook.conflictCopies();
      setStatus(conflicts.length > 0 ? { state: "conflict", conflicts } : { state: "synced" });
      if (result.pulled.length > 0) onPulled(result.pulled);
    } catch (error) {
      console.error("Glacier: sync failed", error);
      if (error?.reason === "offline") {
        setStatus({ state: "offline" });
        plan(retryDelay);
      } else if (error?.reason === "unauthorized") {
        setStatus({ state: "error", reason: "unauthorized" });
      } else {
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
        detail: `A note changed in two places. Glacier kept both: the other version is in ${status.conflicts?.join(", ") ?? "the note marked conflict with the date"}. Merge them by hand, then rename that note or delete its file from your Notes repo. ${last}`,
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
