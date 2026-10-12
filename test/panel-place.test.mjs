import { test } from "node:test";
import assert from "node:assert/strict";
import { readPanelPlace, createPanelPlacement } from "../src/panel-place.mjs";

// The Panel placement through its public interface, with a fake browser port.

const article = "https://example.com/lesson-1";
const NO_FRAMES = { settings: null };

function setup({ choice = "ask", granted = false, url = article, grantOnRequest = true } = {}) {
  const state = { tab: { id: 1, url }, granted, refuse: false, slow: 0, onTabChange: null };
  const drawn = [];
  const views = [];
  const kept = [];
  const asked = [];
  const browser = {
    activeTab() {
      const tab = state.tab;
      const wait = state.slow;
      state.slow = 0;
      return new Promise((resolve) => setTimeout(() => resolve(tab), wait));
    },
    hasPermission: async () => state.granted,
    async requestPermission() {
      asked.push("permission");
      if (grantOnRequest) state.granted = true;
      return grantOnRequest;
    },
    async drawFrames(tabId, frames) {
      drawn.push([tabId, frames]);
      return !state.refuse;
    },
    onTabChange: (fn) => (state.onTabChange = fn),
  };
  const placement = createPanelPlacement({
    browser,
    show: (view) => views.push(view),
    keepChoice: (place) => kept.push(place),
    choice,
  });
  const switchTab = (tab) => {
    state.tab = tab;
    return state.onTabChange();
  };
  return { placement, state, drawn, views, kept, asked, switchTab, last: () => views.at(-1) };
}

test("with nothing saved, Glacier has not asked yet where the panels open", () => {
  assert.equal(readPanelPlace(undefined), "ask");
});

test("a saved choice of beside or inside is read back", () => {
  assert.equal(readPanelPlace("beside"), "beside");
  assert.equal(readPanelPlace("inside"), "inside");
});

test("an unknown saved choice means asking again", () => {
  assert.equal(readPanelPlace("left"), "ask");
});

test("the first time settings open, the explanation card shows", async () => {
  const { placement, drawn, last } = setup();
  await placement.start();
  await placement.openSettings();
  assert.equal(last().card, true);
  assert.equal(last().open, true);
  assert.equal(placement.isOpen(), true);
  assert.equal(placement.settingsOpen(), false);
  assert.equal(last().settings, null);
  assert.deepEqual(drawn, []);
});

test("Allow on the card, on a website, opens settings beside the sidebar", async () => {
  const { placement, drawn, kept, last } = setup();
  await placement.start();
  await placement.openSettings();
  await placement.answerCard(true);
  assert.deepEqual(drawn, [[1, { settings: { section: null } }]]);
  assert.deepEqual(kept, ["beside"]);
  assert.equal(last().card, false);
  assert.equal(last().settings, "beside");
  assert.equal(last().explain, false);
});

test("the card remembers the section settings were opened at", async () => {
  const { placement, last } = setup();
  await placement.openSettings("notes-home");
  await placement.answerCard(false);
  assert.equal(last().section, "notes-home");
});

test("Not now on the card opens settings inside the sidebar without the line", async () => {
  const { placement, drawn, kept, asked, last } = setup();
  await placement.openSettings();
  await placement.answerCard(false);
  assert.deepEqual(asked, []);
  assert.deepEqual(drawn, []);
  assert.deepEqual(kept, ["inside"]);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, false);
});

test("declining the browser's prompt opens settings inside without the line", async () => {
  const { placement, drawn, kept, last } = setup({ grantOnRequest: false });
  await placement.openSettings();
  await placement.answerCard(true);
  assert.deepEqual(drawn, []);
  assert.deepEqual(kept, ["inside"]);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, false);
});

test("browser pages, PDFs and the extension stores open settings inside with the line", async () => {
  for (const url of [
    "chrome://newtab/",
    "chrome://settings/",
    "about:newtab",
    "about:preferences",
    "edge://settings",
    "view-source:https://example.com/",
    "file:///home/me/notes.html",
    "https://example.com/slides.pdf",
    "https://example.com/Slides.PDF?page=2#x",
    "https://chromewebstore.google.com/detail/glacier/abc",
    "https://chrome.google.com/webstore/detail/abc",
    "https://addons.mozilla.org/en-US/firefox/",
    undefined,
  ]) {
    const { placement, state, drawn, last } = setup({ choice: "beside", granted: true });
    state.tab = url ? { id: 1, url } : null;
    await placement.openSettings();
    assert.deepEqual(drawn, [], String(url));
    assert.equal(last().settings, "inside", String(url));
    assert.equal(last().explain, true, String(url));
  }
});

test("a page the browser refuses to draw on opens settings inside with the line", async () => {
  const { placement, state, last } = setup({ choice: "beside", granted: true, url: "https://example.com/download?id=7" });
  state.refuse = true;
  await placement.openSettings();
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, true);
});

test("choosing inside keeps the panels inside without the line, even with the permission", async () => {
  const { placement, drawn, last } = setup({ choice: "inside", granted: true, url: "chrome://newtab/" });
  await placement.openSettings();
  assert.deepEqual(drawn, []);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, false);
});

test("a permission taken back in the browser puts the panels inside without the line", async () => {
  const { placement, drawn, last } = setup({ choice: "beside", granted: false, url: "chrome://newtab/" });
  await placement.openSettings();
  assert.deepEqual(drawn, []);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, false);
});

test("settings are drawn beside with their section", async () => {
  const { placement, drawn } = setup({ choice: "beside", granted: true });
  await placement.openSettings("look");
  assert.deepEqual(drawn.at(-1), [1, { settings: { section: "look" } }]);
});

test("the Shortcuts panel does not move settings or draw frames", async () => {
  const { placement, drawn, last } = setup({ choice: "beside", granted: true });
  await placement.start();
  assert.deepEqual(drawn, []);
  assert.equal(last().settings, null);
  assert.equal("shortcuts" in last(), false);
});

test("closing settings takes their frame away", async () => {
  const { placement, drawn, last } = setup({ choice: "beside", granted: true });
  await placement.openSettings();
  assert.equal(placement.settingsOpen(), true);
  assert.equal(placement.closeSettings(), true);
  assert.equal(placement.settingsOpen(), false);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(drawn.at(-1), [1, NO_FRAMES]);
  assert.equal(last().settings, null);
  assert.equal(last().open, false);
});

test("closing the card leaves settings closed", async () => {
  const { placement, last } = setup();
  await placement.openSettings();
  assert.equal(placement.closeSettings(), false);
  assert.equal(last().card, false);
  assert.equal(last().open, false);
});

test("switching tabs moves settings to the new page", async () => {
  const { placement, drawn, switchTab } = setup({ choice: "beside", granted: true });
  await placement.start();
  await placement.openSettings();
  await switchTab({ id: 2, url: "https://example.com/lesson-2" });
  const frames = { settings: { section: null } };
  assert.deepEqual(drawn, [[1, frames], [1, NO_FRAMES], [2, frames]]);
});

test("switching to a browser page takes the frames away and shows the panels inside with the line", async () => {
  const { placement, drawn, switchTab, last } = setup({ choice: "beside", granted: true });
  await placement.start();
  await placement.openSettings();
  await switchTab({ id: 2, url: "about:preferences" });
  assert.deepEqual(drawn.at(-1), [1, NO_FRAMES]);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, true);
});

test("switching tabs with nothing open leaves the page alone", async () => {
  const { placement, drawn, switchTab } = setup({ choice: "beside", granted: true });
  await placement.start();
  assert.equal(switchTab({ id: 2, url: article }), undefined);
  assert.deepEqual(drawn, []);
});

test("two quick changes end on the latest", async () => {
  const { placement, state, drawn, switchTab, last } = setup({ choice: "beside", granted: true });
  await placement.start();
  state.slow = 20;
  const first = placement.openSettings();
  const second = switchTab({ id: 2, url: "chrome://newtab/" });
  await Promise.all([first, second]);
  assert.deepEqual(drawn, []);
  assert.equal(last().settings, "inside");
  assert.equal(last().explain, true);
});

test("choosing beside under Panels asks the browser, and a decline keeps them inside", async () => {
  const { placement, asked, kept } = setup({ choice: "inside", grantOnRequest: false });
  assert.equal(await placement.choosePlace("beside"), "inside");
  assert.deepEqual(asked, ["permission"]);
  assert.deepEqual(kept, ["inside"]);
});

test("choosing inside under Panels moves open settings inside at once", async () => {
  const { placement, drawn, last } = setup({ choice: "beside", granted: true });
  await placement.openSettings();
  assert.equal(await placement.choosePlace("inside"), "inside");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(drawn.at(-1), [1, NO_FRAMES]);
  assert.equal(last().settings, "inside");
});

