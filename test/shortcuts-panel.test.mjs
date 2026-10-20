import { test } from "node:test";
import assert from "node:assert/strict";
import { SLASH_COMMANDS } from "../src/editor-model.mjs";
import { HANDLED_KEYS, SHORTCUT_GROUPS, readShortcutsPanel } from "../src/shortcuts-panel.mjs";

const everyEntry = () => SHORTCUT_GROUPS.flatMap((group) => group.entries.map(([keys]) => keys));

test("with nothing saved, the Shortcuts panel is off and open", () => {
  assert.deepEqual(readShortcutsPanel(undefined), { on: false, folded: false });
});

test("a saved choice of on and folded is read back", () => {
  assert.deepEqual(readShortcutsPanel({ on: true, folded: true }), { on: true, folded: true });
});

test("unknown saved values go back to the defaults", () => {
  assert.deepEqual(readShortcutsPanel({ on: "yes", folded: 1 }), { on: false, folded: false });
});

test("the cheat sheet lists the start of a line, anywhere and key shortcuts", () => {
  assert.deepEqual(
    SHORTCUT_GROUPS.map((group) => group.title),
    ["How Glacier works", "Start of a line", "Anywhere in a line", "Keys"],
  );
});

test("the cheat sheet lists every shortcut the editor has", () => {
  const keys = everyEntry();
  for (const wanted of ["/", "#", "##", "###", "-", "```", "[[Title]]", "**bold**", "`code`", "Enter", "Backspace", "Esc", "Ctrl A twice", "Ctrl C", "Ctrl K"]) {
    assert.ok(keys.includes(wanted), `missing ${wanted}`);
  }
});

test("every key the sidebar handles is in the panel", () => {
  const keys = everyEntry();
  for (const [handled] of HANDLED_KEYS) assert.ok(keys.includes(handled), `missing ${handled}`);
});

test("the list of handled keys names the keys Glacier reacts to", () => {
  const handled = HANDLED_KEYS.map(([keys]) => keys);
  for (const wanted of ["Enter", "Shift Enter", "Delete", "Ctrl B", "Ctrl I", "Ctrl E", "Ctrl Shift E", "Ctrl Z", "Ctrl Shift Z or Ctrl Y", "Tab or Enter", "Alt Shift G", "Ctrl K", "//", "Esc", "Cmd"]) {
    assert.ok(handled.includes(wanted), `missing ${wanted}`);
  }
});

test("every command in the / menu is in the cheat sheet", () => {
  const keys = everyEntry();
  for (const { markdown } of SLASH_COMMANDS) {
    const shown = markdown === "[[ ]]" ? "[[Title]]" : markdown;
    assert.ok(keys.includes(shown), `missing ${markdown}`);
  }
});

test("the cheat sheet teaches quotes, italics, bold italic and web links", () => {
  const keys = everyEntry();
  for (const wanted of [">", "*italic*", "_italic_", "***bold italic***", "[text](https://...)"]) {
    assert.ok(keys.includes(wanted), `missing ${wanted}`);
  }
});

import { shortcutRows, shortcutNotice, CHROME_SHORTCUTS_URL } from "../src/shortcuts-panel.mjs";

const rowFor = (rows, suggested) => rows.find((row) => row.suggested === suggested);

test("a shortcut that is set shows as it is set, not as suggested", () => {
  const commands = [{ name: "open-glacier", shortcut: "Ctrl+Shift+Y" }, { name: "clip-selection", shortcut: "Alt+Shift+C" }];
  const rows = shortcutRows(commands, HANDLED_KEYS, "chrome");
  const row = rowFor(rows, "Alt Shift G");
  assert.equal(row.keys, "Ctrl Shift Y");
  assert.equal(row.notSet, false);
  assert.equal(row.fix, undefined);
});

test("an empty shortcut shows Not set with a link that opens Chrome's shortcuts page", () => {
  const commands = [{ name: "open-glacier", shortcut: "" }, { name: "clip-selection", shortcut: "Alt+Shift+C" }];
  const row = rowFor(shortcutRows(commands, HANDLED_KEYS, "chrome"), "Alt Shift G");
  assert.equal(row.keys, "Not set");
  assert.equal(row.notSet, true);
  assert.deepEqual(row.fix, { label: "Set it in Chrome", url: CHROME_SHORTCUTS_URL });
});

test("in Firefox an empty shortcut says where to set it, as text", () => {
  const row = rowFor(shortcutRows([{ name: "open-glacier", shortcut: "" }], HANDLED_KEYS, "firefox"), "Alt Shift G");
  assert.equal(row.notSet, true);
  assert.equal(row.fix.url, undefined);
  assert.match(row.fix.label, /about:addons/);
  assert.match(row.fix.label, /Manage Extension Shortcuts/);
});

test("without the browser's list of shortcuts, the rows stay as listed", () => {
  const rows = shortcutRows(undefined, HANDLED_KEYS, "chrome");
  assert.equal(rows.length, HANDLED_KEYS.length);
  assert.equal(rowFor(rows, "Alt Shift G").keys, "Alt Shift G");
  assert.equal(rowFor(rows, "Alt Shift G").notSet, false);
});

test("other keys are passed through unchanged", () => {
  const row = rowFor(shortcutRows([], HANDLED_KEYS, "chrome"), "Ctrl B");
  assert.deepEqual([row.keys, row.notSet], ["Ctrl B", false]);
});

test("the welcome mentions the shortcut only when it is not set", () => {
  assert.equal(shortcutNotice([{ name: "open-glacier", shortcut: "Alt+Shift+G" }], "chrome"), null);
  assert.equal(shortcutNotice(undefined, "chrome"), null);
  const notice = shortcutNotice([{ name: "open-glacier", shortcut: "" }], "chrome");
  assert.match(notice.text, /no shortcut/i);
  assert.equal(notice.fix.url, CHROME_SHORTCUTS_URL);
});
