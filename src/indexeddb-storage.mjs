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

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAllKeys(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName)
      .objectStore(storeName)
      .getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Open the Notebook's IndexedDB storage and return a plug-in with the same
// shape as memoryStorage(), so the Notebook core cannot tell them apart.
export async function openIndexedDbStorage({
  indexedDB = globalThis.indexedDB,
} = {}) {
  if (!indexedDB) {
    throw new Error("openIndexedDbStorage needs IndexedDB");
  }

  const db = await openDatabase(indexedDB);

  const notes = new Map();
  for (const note of await readAll(db, NOTES)) {
    notes.set(note.title, note);
  }

  const meta = new Map();
  const [metaKeys, metaValues] = await Promise.all([
    readAllKeys(db, META),
    readAll(db, META),
  ]);
  metaKeys.forEach((key, i) => meta.set(key, metaValues[i]));

  // Persist in the background; failures are logged, not thrown, so typing is
  // never blocked. Sync (a later slice) is the real safety net across browsers.
  function persist(storeName, mutate) {
    const tx = db.transaction(storeName, "readwrite");
    mutate(tx.objectStore(storeName));
    tx.onerror = () => console.error("Glacier: IndexedDB write failed", tx.error);
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
