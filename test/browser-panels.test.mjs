import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserPanels } from "../src/browser-panels.mjs";

// The real browser port of the Panel placement, with a fake browser.

function fakeBrowser({ refuse = false } = {}) {
  const scripts = [];
  const api = {
    runtime: { getURL: (path) => `ext://glacier/${path}` },
    scripting: {
      async executeScript(details) {
        if (refuse) throw new Error("Cannot access contents of the page");
        scripts.push(details);
      },
    },
  };
  const panels = createBrowserPanels(api, { channel: "abc", origin: "ext://glacier", drawBesideFrames: () => true, sidebarX: () => 40 });
  return { panels, scripts };
}

test("the frames are drawn in the tab with this sidebar's channel and the section", async () => {
  const { panels, scripts } = fakeBrowser();
  assert.equal(await panels.drawFrames(7, { settings: { section: "look" } }), true);
  assert.equal(scripts[0].target.tabId, 7);
  assert.deepEqual(scripts[0].args, [
    {
      origin: "ext://glacier",
      settings: "ext://glacier/sidebar/beside.html?panel=settings&channel=abc&section=look",
      sidebarX: 40,
    },
  ]);
});

test("a page the browser won't let Glacier draw on reports a refusal", async () => {
  const { panels } = fakeBrowser({ refuse: true });
  assert.equal(await panels.drawFrames(7, { settings: { section: null } }), false);
});
