// The real Notebook storage: each browser keeps its own copy in IndexedDB,
// which is fast and works offline (ADR 0003). Chrome and Firefox each hold
// their own copy until Sync (a later slice) shares them through the Notes Repo.
//
// The Notebook core is synchronous (it was built against the in-memory
// stand-in), while IndexedDB is asynchronous. We bridge the two by loading the
// whole Notebook into memory once on open, then serving reads from memory and
// writing changes through to IndexedDB in the background. So "saved as you
// type" needs no save button: every putNote/putMeta persists on its own.
//
// This module only runs in the browser; tests use the in-memory stand-in.

const DB_NAME = "glacier";
const DB_VERSION = 1;
const NOTES = "notes"; // keyed by title
const META = "meta"; // key/value settings, e.g. the last-used Course

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTES)) {
        db.createObjectStore(NOTES, { keyPath: "title" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Load the whole Notebook and its settings in a single read transaction, so
// startup is one pass and both reflect the same snapshot (issue #23). Settings
// are read with a cursor, which hands back each key together with its own
// value, so keys and values can never be paired up out of step (unlike two
// position-matched lists that a concurrent write could misalign).
function loadAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES, META], "readonly");
    let notes = [];
    const meta = [];
    let notesDone = false;
    let metaDone = false;
    const finish = () => {
      if (notesDone && metaDone) resolve({ notes, meta });
    };

    const notesRequest = tx.objectStore(NOTES).getAll();
    notesRequest.onsuccess = () => {
      notes = notesRequest.result;
      notesDone = true;
      finish();
    };

    const metaCursor = tx.objectStore(META).openCursor();
    metaCursor.onsuccess = () => {
      const cursor = metaCursor.result;
      if (cursor) {
        meta.push([cursor.key, cursor.value]);
        cursor.continue();
      } else {
        metaDone = true;
        finish();
      }
    };

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Open the Notebook's IndexedDB storage and return a plug-in with the same
// shape as memoryStorage(), so the Notebook core cannot tell them apart.
export async function openIndexedDbStorage({
  indexedDB = globalThis.indexedDB,
  onPersistError = (error) =>
    console.error("Glacier: IndexedDB write failed", error),
} = {}) {
  if (!indexedDB) {
    throw new Error("openIndexedDbStorage needs IndexedDB");
  }

  const db = await openDatabase(indexedDB);

  const { notes: loadedNotes, meta: loadedMeta } = await loadAll(db);

  const notes = new Map();
  for (const note of loadedNotes) {
    notes.set(note.title, note);
  }

  const meta = new Map(loadedMeta);

  // Persist in the background; failures are reported, not thrown, so typing is
  // never blocked. Both ways a write can fail are caught: the transaction
  // errors or aborts (e.g. the disk quota is exceeded), and a synchronous
  // throw from starting the transaction or storing the value — which would
  // otherwise escape after the in-memory copy already claimed the change.
  // The panel surfaces these so the user knows a save failed (issue #25).
  // Sync (a later slice) is the real safety net across browsers.
  //
  // One failed write fires both `error` (bubbling from the request) and
  // `abort` on the transaction, so report at most once per transaction.
  function persist(storeName, mutate) {
    let reported = false;
    const report = (error) => {
      if (reported) return;
      reported = true;
      onPersistError(error);
    };
    try {
      const tx = db.transaction(storeName, "readwrite");
      tx.onerror = () => report(tx.error);
      tx.onabort = () => report(tx.error);
      mutate(tx.objectStore(storeName));
    } catch (error) {
      report(error);
    }
  }

  return {
    allNotes() {
      return [...notes.values()];
    },
    putNote(note) {
      notes.set(note.title, note);
      persist(NOTES, (store) => store.put(note));
    },
    getNote(title) {
      return notes.get(title);
    },
    deleteNote(title) {
      notes.delete(title);
      persist(NOTES, (store) => store.delete(title));
    },
    getMeta(key) {
      return meta.get(key);
    },
    putMeta(key, value) {
      meta.set(key, value);
      persist(META, (store) => store.put(value, key));
    },
  };
}
