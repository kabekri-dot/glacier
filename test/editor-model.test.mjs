import { test } from "node:test";
import assert from "node:assert/strict";

import {
  splitIntoLines,
  linesToText,
  editorTextToBody,
} from "../src/editor-model.mjs";

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

// The panel reads the editable note with innerText (which, unlike textContent,
// reflects the line breaks Enter creates) and saves the result as the body.
// editorTextToBody is that DOM-free seam, so the save path is tested without a
// browser (issue #24).

test("the edited text becomes the saved body with its line breaks intact", () => {
  assert.equal(editorTextToBody("line one\nline two"), "line one\nline two");
});

test("an empty line in the edited text stays an empty line in the body", () => {
  assert.equal(editorTextToBody("# Title\n\nbody"), "# Title\n\nbody");
});

test("platform line breaks are normalized to \\n so the body is the same everywhere", () => {
  assert.equal(editorTextToBody("line one\r\nline two\rline three"), "line one\nline two\nline three");
});

test("the saved body round-trips back through the editor's lines", () => {
  const body = editorTextToBody("# Title\n\n- one\n- two\nplain line");
  assert.equal(linesToText(splitIntoLines(body)), body);
});
