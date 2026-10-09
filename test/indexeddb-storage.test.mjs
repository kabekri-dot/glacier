import { test } from "node:test";
import assert from "node:assert/strict";

import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";

// The real storage writes through to IndexedDB in the background. A write can
// still fail — the disk quota is exceeded and the transaction aborts, or the
// value can't be stored and the call throws synchronously. Neither must be
// swallowed: both are reported so the panel can tell the user a save failed
// (issue #25). Tests drive the module with a tiny fake IndexedDB.

// A minimal IndexedDB double covering only what openIndexedDbStorage touches:
// open (with an upgrade on first use), read-all/read-all-keys, and writes that
// can be made to abort or to throw synchronously.
function fakeIndexedDB({ abortOnWrite = false, throwOnPut = false, seed } = {}) {
  const stores = new Map();
  // `seed` pre-fills the stores to stand in for an already-upgraded database
  // with notes and settings in it, so startup reads can be exercised.
  if (seed) {
    const notesStore = { keyPath: "title", data: new Map() };
    for (const note of seed.notes ?? []) notesStore.data.set(note.title, note);
    stores.set("notes", notesStore);
    const metaStore = { keyPath: null, data: new Map() };
    for (const [key, value] of seed.meta ?? []) metaStore.data.set(key, value);
    stores.set("meta", metaStore);
  }

  const stats = { transactions: 0 };

  function makeObjectStore(store, tx) {
    return {
      getAll() {
        const req = {};
        queueMicrotask(() => {
          req.result = [...store.data.values()];
          req.onsuccess?.();
        });
        return req;
      },
      getAllKeys() {
        const req = {};
        queueMicrotask(() => {
          req.result = [...store.data.keys()];
          req.onsuccess?.();
        });
        return req;
      },
      // A cursor walks the store yielding each key together with its own value,
      // so there is no pairing-by-position that could get out of step.
      openCursor() {
        const req = {};
        const entries = [...store.data.entries()];
        let i = 0;
        const step = () => {
          queueMicrotask(() => {
            if (i < entries.length) {
              const [key, value] = entries[i];
              i += 1;
              req.result = { key, value, continue: step };
            } else {
              req.result = null;
            }
            req.onsuccess?.();
          });
        };
        step();
        return req;
      },
      put(value, key) {
        if (throwOnPut) {
          throw new Error("DataError: the value could not be stored");
        }
        const k = key ?? (store.keyPath ? value[store.keyPath] : undefined);
        store.data.set(k, value);
        if (abortOnWrite) {
          queueMicrotask(() => {
            tx.error = new Error("AbortError: quota exceeded");
            // A real failure bubbles an error up to the transaction and then
            // aborts it, firing both events for the one failure.
            tx.onerror?.();
            tx.onabort?.();
          });
        }
      },
      delete(key) {
        store.data.delete(key);
      },
    };
  }

  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name, options = {}) {
      stores.set(name, { keyPath: options.keyPath ?? null, data: new Map() });
      return {};
    },
    transaction(names) {
      stats.transactions += 1;
      const tx = { error: null, onerror: null, onabort: null };
      tx.objectStore = (name) => makeObjectStore(stores.get(name), tx);
      return tx;
    },
  };

  return {
    stats,
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

test("an aborted write is reported, not swallowed", async () => {
  const errors = [];
  const storage = await openIndexedDbStorage({
    indexedDB: fakeIndexedDB({ abortOnWrite: true }),
    onPersistError: (error) => errors.push(error),
  });

  storage.putNote({ title: "T", body: "hi" });
  await flushMicrotasks();

  assert.equal(errors.length, 1, "the aborted transaction is reported once");
});

test("a synchronous write error is caught and reported, not thrown", async () => {
  const errors = [];
  const storage = await openIndexedDbStorage({
    indexedDB: fakeIndexedDB({ throwOnPut: true }),
    onPersistError: (error) => errors.push(error),
  });

  assert.doesNotThrow(() => storage.putNote({ title: "T", body: "hi" }));
  assert.equal(errors.length, 1, "the synchronous failure is reported once");
});

test("startup reads notes and settings in a single pass", async () => {
  // Reading notes and settings in separate passes makes startup slow, which
  // is part of why the panel went editable before the Notebook had loaded
  // (issue #23). One read transaction loads everything at once.
  const idb = fakeIndexedDB({
    seed: {
      notes: [{ title: "Alpha", body: "a" }],
      meta: [["lastCourse", "TOP Foundations"]],
    },
  });

  const storage = await openIndexedDbStorage({ indexedDB: idb });

  assert.equal(
    idb.stats.transactions,
    1,
    "notes and settings load in one transaction, not three",
  );
  assert.equal(storage.getMeta("lastCourse"), "TOP Foundations");
  assert.equal(storage.allNotes()[0].title, "Alpha");
});

test("settings keys and values can't get out of step on load", async () => {
  // Each setting's key is loaded together with its own value (a cursor), not
  // two lists paired by position that a concurrent write could misalign.
  const storage = await openIndexedDbStorage({
    indexedDB: fakeIndexedDB({
      seed: {
        meta: [
          ["lastCourse", "TOP Foundations"],
          ["theme", "Glacier"],
          ["textSize", "100"],
        ],
      },
    }),
  });

  assert.equal(storage.getMeta("lastCourse"), "TOP Foundations");
  assert.equal(storage.getMeta("theme"), "Glacier");
  assert.equal(storage.getMeta("textSize"), "100");
});
