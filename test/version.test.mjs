import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { nextVersion } from "../src/version.mjs";

// Every test version and release gets its own number (README, Making a
// release): small fixes raise the last part, new features the middle one,
// a big new version the first one.

test("a fix raises the last number", () => {
  assert.equal(nextVersion("1.1.0", "fix"), "1.1.1");
});

test("a new feature raises the middle number and starts the last one again", () => {
  assert.equal(nextVersion("1.1.3", "feature"), "1.2.0");
});

test("a big new version raises the first number and starts the rest again", () => {
  assert.equal(nextVersion("1.4.2", "big"), "2.0.0");
});

test("anything else is refused", () => {
  assert.throws(() => nextVersion("1.0.0", "huge"), /fix, feature or big/);
  assert.throws(() => nextVersion("1.0", "fix"), /three numbers/);
});

test("the manifest's version is three numbers, as Chrome and Firefox want", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});
