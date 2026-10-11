import { test } from "node:test";
import assert from "node:assert/strict";
import { readPanelPlace, decidePanelPlace } from "../src/panel-place.mjs";

const article = "https://example.com/lesson-1";

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

test("the first time a panel opens, the explanation card shows", () => {
  assert.equal(decidePanelPlace({ choice: "ask", granted: false, url: article }), "card");
});

test("when the browser already allows it, no card shows and the panels open beside", () => {
  assert.equal(decidePanelPlace({ choice: "ask", granted: true, url: article }), "beside");
});

test("allowed, the panels open beside the sidebar on a website", () => {
  assert.equal(decidePanelPlace({ choice: "beside", granted: true, url: article }), "beside");
});

test("declined, the panels open inside the sidebar", () => {
  assert.equal(decidePanelPlace({ choice: "inside", granted: false, url: article }), "inside");
});

test("choosing inside in settings keeps them inside even with the permission", () => {
  assert.equal(decidePanelPlace({ choice: "inside", granted: true, url: article }), "inside");
});

test("a permission taken back in the browser puts the panels inside", () => {
  assert.equal(decidePanelPlace({ choice: "beside", granted: false, url: article }), "inside");
});

test("browser pages fall back to inside the sidebar", () => {
  for (const url of [
    "chrome://newtab/",
    "chrome://settings/",
    "about:newtab",
    "about:preferences",
    "edge://settings",
    "view-source:https://example.com/",
    "file:///home/me/notes.html",
    undefined,
  ]) {
    assert.equal(decidePanelPlace({ choice: "beside", granted: true, url }), "inside", String(url));
  }
});

test("a PDF falls back to inside the sidebar", () => {
  assert.equal(decidePanelPlace({ choice: "beside", granted: true, url: "https://example.com/slides.pdf" }), "inside");
  assert.equal(decidePanelPlace({ choice: "beside", granted: true, url: "https://example.com/Slides.PDF?page=2#x" }), "inside");
});

test("the extension stores, where no extension may draw, fall back to inside the sidebar", () => {
  for (const url of [
    "https://chromewebstore.google.com/detail/glacier/abc",
    "https://chrome.google.com/webstore/detail/abc",
    "https://addons.mozilla.org/en-US/firefox/",
  ]) {
    assert.equal(decidePanelPlace({ choice: "beside", granted: true, url }), "inside", url);
  }
});
