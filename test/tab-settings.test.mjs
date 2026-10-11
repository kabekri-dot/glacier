import { test } from "node:test";
import assert from "node:assert/strict";
import { readTabSettings } from "../src/tab-settings.mjs";

test("with nothing saved, the tab settings are today's decisions", () => {
  assert.deepEqual(readTabSettings(undefined), {
    keepUserOpenedNotes: false,
    onNonWebsite: "keep",
    showPreviousButton: true,
  });
});

test("saved tab choices are read back", () => {
  const saved = { keepUserOpenedNotes: true, onNonWebsite: "newNoteForm", showPreviousButton: false };
  assert.deepEqual(readTabSettings(saved), saved);
});

test("unknown saved values go back to the defaults", () => {
  assert.deepEqual(
    readTabSettings({ keepUserOpenedNotes: "yes", onNonWebsite: "x", showPreviousButton: 0 }),
    { keepUserOpenedNotes: false, onNonWebsite: "keep", showPreviousButton: true },
  );
});
