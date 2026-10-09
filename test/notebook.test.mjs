import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";

// The Notebook core is the first test seam. It holds all note logic and has
// no screen code: storage is plugged in from outside (ADR 0003), and tests
// use an in-memory stand-in.

test("a new Notebook is empty", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal(notebook.isEmpty(), true);
  assert.deepEqual(notebook.notes(), []);
});
