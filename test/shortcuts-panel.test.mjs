import { test } from "node:test";
import assert from "node:assert/strict";
import { SHORTCUT_GROUPS, readShortcutsPanel } from "../src/shortcuts-panel.mjs";

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
    ["Start of a line", "Anywhere in a line", "Keys"],
  );
});

test("the cheat sheet lists every shortcut the editor has", () => {
  const keys = everyEntry();
  for (const wanted of ["/", "#", "##", "###", "-", "```", "[[Title]]", "**bold**", "`code`", "Enter", "Backspace", "Esc", "Ctrl A twice", "Ctrl C", "Ctrl K"]) {
    assert.ok(keys.includes(wanted), `missing ${wanted}`);
  }
});
