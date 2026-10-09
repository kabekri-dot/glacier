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
function fakeIndexedDB({ abortOnWrite = false, throwOnPut = false } = {}) {
  const stores = new Map();

  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name, options = {}) {
      stores.set(name, { keyPath: options.keyPath ?? null, data: new Map() });
      return {};
    },
    transaction(name) {
      const store = stores.get(name);
      const tx = { error: null, onerror: null, onabort: null };
      const objectStore = {
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
      tx.objectStore = () => objectStore;
      return tx;
    },
  };

  return {
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
