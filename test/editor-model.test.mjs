import { test } from "node:test";
import assert from "node:assert/strict";

import { splitIntoLines, linesToText } from "../src/editor-model.mjs";

// The editor model is the second test seam: pure functions on one note's
// text, with no DOM. Here we only prove the round trip; Enter/Backspace,
// the `/` menu and raw-offset mapping arrive in later slices.

test("splitting a note into lines and joining back gives the same text", () => {
  const text = "# Title\n\n- one\n- two\nplain line";
  assert.deepEqual(splitIntoLines(text), [
    "# Title",
    "",
    "- one",
    "- two",
    "plain line",
  ]);
  assert.equal(linesToText(splitIntoLines(text)), text);
});
