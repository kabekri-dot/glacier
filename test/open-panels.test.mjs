import { test } from "node:test";
import assert from "node:assert/strict";

import { createOpenPanels } from "../src/open-panels.mjs";

// Which windows have the Glacier panel open (issue #49). Each panel keeps a
// connection to the background; the background records it here.

test("a window with no connected panel is not open", () => {
  const panels = createOpenPanels();
  assert.equal(panels.isOpen(1), false);
});

test("a window is open while its panel is connected", () => {
  const panels = createOpenPanels();
  panels.connect(1, "a");
  assert.equal(panels.isOpen(1), true);
  assert.equal(panels.isOpen(2), false);
});

test("a window is closed once its panel disconnects", () => {
  const panels = createOpenPanels();
  panels.connect(1, "a");
  panels.disconnect(1, "a");
  assert.equal(panels.isOpen(1), false);
});

test("a window stays open while another connection of it remains", () => {
  const panels = createOpenPanels();
  panels.connect(1, "a");
  panels.connect(1, "b");
  panels.disconnect(1, "a");
  assert.equal(panels.isOpen(1), true);
});

test("disconnecting an unknown connection changes nothing", () => {
  const panels = createOpenPanels();
  panels.connect(1, "a");
  panels.disconnect(1, "zzz");
  panels.disconnect(7, "a");
  assert.equal(panels.isOpen(1), true);
});
