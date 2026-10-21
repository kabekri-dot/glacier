import { test } from "node:test";
import assert from "node:assert/strict";
import { syncWord, showsCloud } from "../src/auto-sync.mjs";

// The sync word in the top bar (#121): nothing while all is well, a short
// word where the user is needed.
test("while all is well the top bar shows no sync word", () => {
  for (const state of ["off", "syncing", "synced"]) assert.equal(syncWord({ state }), null, state);
});

test("offline says Offline", () => {
  assert.equal(syncWord({ state: "offline" }), "Offline");
});

test("notes with two versions say 2 versions", () => {
  assert.equal(syncWord({ state: "conflict", conflicts: ["a"] }), "2 versions");
  assert.equal(syncWord({ state: "conflict", conflicts: ["a", "b"] }), "2 versions");
});

test("a sign in that stopped working says Sign in again", () => {
  assert.equal(syncWord({ state: "error", reason: "unauthorized", home: "google-drive" }), "Sign in again");
  assert.equal(syncWord({ state: "error", reason: "unauthorized", home: "github" }), "Sign in again");
});

test("a folder Chrome forgot says Reconnect", () => {
  assert.equal(syncWord({ state: "error", reason: "unauthorized", home: "folder" }), "Reconnect");
});

test("any other sync problem says Not synced", () => {
  assert.equal(syncWord({ state: "error", message: "Repo not found." }), "Not synced");
});

test("while the notes live only in this browser the tiny pixel cloud stays instead of a word", () => {
  assert.equal(showsCloud({ state: "off" }), true);
  for (const state of ["syncing", "synced", "offline", "conflict", "error"]) assert.equal(showsCloud({ state }), false, state);
});
