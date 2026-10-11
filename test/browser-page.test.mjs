import { test } from "node:test";
import assert from "node:assert/strict";

import { createBrowserPage } from "../src/browser-page.mjs";

// The link to the lesson (#61) switches to the tab where the lesson is open,
// also in another window, and only opens a new tab when none has it. Tested
// through the browser page port with a fake browser.

function fakeBrowser({ tabs = [], tabsPermission = true } = {}) {
  const calls = [];
  const api = {
    tabs: {
      query: async () => tabs,
      update: async (id, props) => calls.push(["activate", id, props]),
      create: async (props) => calls.push(["create", props.url]),
    },
    windows: {
      update: async (id, props) => calls.push(["focusWindow", id, props]),
    },
    permissions: {
      contains: async (wanted) => Boolean(wanted.permissions?.includes("tabs") && tabsPermission),
    },
  };
  return { api, calls };
}

test("a Source open in a tab switches to that tab and its window", async () => {
  const { api, calls } = fakeBrowser({
    tabs: [
      { id: 1, windowId: 10, url: "https://www.youtube.com/watch?v=other" },
      { id: 2, windowId: 20, url: "https://www.youtube.com/watch?v=abc&utm_source=feed#t=10" },
    ],
  });
  await createBrowserPage(api).openSource("https://www.youtube.com/watch?v=abc");
  assert.deepEqual(calls, [
    ["activate", 2, { active: true }],
    ["focusWindow", 20, { focused: true }],
  ]);
});

test("a Source no tab has open opens in a new tab", async () => {
  const { api, calls } = fakeBrowser({
    tabs: [{ id: 1, windowId: 10, url: "https://www.youtube.com/watch?v=other" }],
  });
  await createBrowserPage(api).openSource("https://www.youtube.com/watch?v=abc");
  assert.deepEqual(calls, [["create", "https://www.youtube.com/watch?v=abc"]]);
});

test("without the tabs permission the Source always opens in a new tab", async () => {
  const { api, calls } = fakeBrowser({
    tabsPermission: false,
    tabs: [{ id: 2, windowId: 20, url: "https://www.youtube.com/watch?v=abc" }],
  });
  await createBrowserPage(api).openSource("https://www.youtube.com/watch?v=abc");
  assert.deepEqual(calls, [["create", "https://www.youtube.com/watch?v=abc"]]);
});
