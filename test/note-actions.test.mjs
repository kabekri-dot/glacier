import { test } from "node:test";
import assert from "node:assert/strict";
import { noteActions } from "../src/note-actions.mjs";

test("no note open means no This note menu", () => {
  assert.equal(noteActions(null), null);
});

test("an open note gets its name, Download as a file, Archive and Delete", () => {
  const menu = noteActions({ title: "Arrays basics", archived: false });
  assert.equal(menu.heading, "Arrays basics");
  assert.deepEqual(
    menu.actions.map((action) => [action.kind, action.label]),
    [
      ["download", "Download as a file"],
      ["archive", "Archive"],
      ["delete", "Delete"],
    ],
  );
});

test("an archived note offers Unarchive instead of Archive", () => {
  const menu = noteActions({ title: "Old", archived: true });
  assert.deepEqual(menu.actions.map((action) => action.label), ["Download as a file", "Unarchive", "Delete"]);
});
