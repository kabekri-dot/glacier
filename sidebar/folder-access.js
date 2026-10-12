// A folder on this computer for the folder Notes Home (#97, ADR 0011). The
// sidebar hands `folder` to the folder remote (src/folder-remote.mjs).
//
// The folder is picked with the browser's folder picker, which only
// Chrome-family browsers have and which must be opened straight from a
// click. Its handle is kept in IndexedDB, in a small database of its own,
// so it survives a restart; it never goes into notes or files.
//
// After a restart Chrome forgets that Glacier may write there. Asking again
// also needs a click, so `askAgain` is called from one, with the handle
// already loaded: the first click anywhere in Glacier, or Reconnect in the
// sync box. Chrome grants an extension's request without a prompt.

const DB_NAME = "glacier-folder";
const STORE = "handles";
const KEY = "notes";
const READ_WRITE = { mode: "readwrite" };

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function inStore(mode, use) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = use(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function createFolderAccess() {
  // The handle as last loaded or picked, so a click can ask for the
  // permission at once, before anything else is awaited.
  let handle;
  let picked = null;

  return {
    // The kept folder, or null when there is none.
    async folder() {
      if (handle === undefined) handle = (await inStore("readonly", (store) => store.get(KEY))) ?? null;
      return handle;
    },

    // Opens the folder picker; must be called straight from a click. True
    // once a folder is picked, false when the picker was closed. The picked
    // folder is only kept once the switch to it worked (`keepPicked`).
    async pick() {
      try {
        picked = await showDirectoryPicker({ id: "glacier-notes", mode: "readwrite" });
      } catch (error) {
        if (error?.name === "AbortError") return false;
        throw error;
      }
      return true;
    },

    // The folder just picked, for switching to it.
    async pickedFolder() {
      return picked;
    },

    async keepPicked() {
      await inStore("readwrite", (store) => store.put(picked, KEY));
      handle = picked;
      picked = null;
    },

    // Asks for the permission again; must be called straight from a click.
    // True when Glacier may write to the folder.
    async askAgain() {
      if (!handle) return false;
      try {
        return (await handle.requestPermission(READ_WRITE)) === "granted";
      } catch (error) {
        console.warn("Glacier: the notes folder's permission was not given", error);
        return false;
      }
    },

    // Leaving the folder forgets it here; its files stay as they are.
    async forget() {
      handle = null;
      await inStore("readwrite", (store) => store.delete(KEY));
    },
  };
}
