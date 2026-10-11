import { test } from "node:test";
import assert from "node:assert/strict";

import { createConflictLine } from "../src/conflict-line.mjs";
import { syncDotText } from "../src/auto-sync.mjs";

test("the line says how many notes have two versions", () => {
  const line = createConflictLine();
  assert.equal(line.text(1), "A note has two versions. Check it");
  assert.equal(line.text(3), "3 notes have two versions. Check them");
});

test("the line shows while there are second versions and not when there are none", () => {
  const line = createConflictLine();
  assert.equal(line.shown(0), false);
  assert.equal(line.shown(2), true);
});

test("a closed line stays away while the count stays the same or shrinks", () => {
  const line = createConflictLine();
  line.close(2);
  assert.equal(line.shown(2), false);
  assert.equal(line.shown(1), false);
});

test("a closed line comes back when a new conflict happens", () => {
  const line = createConflictLine();
  line.close(2);
  assert.equal(line.shown(3), true);
});

test("a closed line comes back for a new conflict after all were sorted out", () => {
  const line = createConflictLine();
  line.close(2);
  assert.equal(line.shown(0), false);
  assert.equal(line.shown(1), true);
});

test("the dot explains each state on hover", () => {
  assert.equal(syncDotText({ state: "synced" }), "All saved to GitHub");
  assert.equal(syncDotText({ state: "syncing" }), "Saving to GitHub");
  assert.equal(syncDotText({ state: "offline" }), "Offline. Your changes are kept here and sync later");
  assert.equal(syncDotText({ state: "off" }), "Not connected to GitHub. Set it up in Settings");
});

test("the dot on a conflict says how many notes have two versions and that a click shows them", () => {
  assert.equal(
    syncDotText({ state: "conflict", conflicts: ["a", "b"] }),
    "2 notes have two versions. Click to see them",
  );
  assert.equal(syncDotText({ state: "conflict", conflicts: ["a"] }), "A note has two versions. Click to see them");
});

test("the dot on an error gives the error's short text", () => {
  assert.equal(syncDotText({ state: "error", message: "Repo not found." }), "Repo not found.");
  assert.match(syncDotText({ state: "error", reason: "unauthorized" }), /token/);
});
