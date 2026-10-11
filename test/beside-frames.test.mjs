import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawBesideFrames } from "../sidebar/beside-frames.js";

// The one piece of Glacier that runs in a web page draws the panels beside
// the sidebar (#21). ADR 0008 promises it never reads, stores or sends
// anything from the page, so its code may not even reach for those.
const code = drawBesideFrames.toString().replace(/\/\/.*$/gm, "");

test("the panels beside the sidebar never read anything from the page", () => {
  for (const reading of [
    /innerText|innerHTML|outerHTML|textContent/,
    /querySelector|getElement|\.children|\.body\b/,
    /\blocation\b|\bcookie\b|\btitle\b(?!\s*=)|getSelection/,
  ]) {
    assert.doesNotMatch(code, reading);
  }
});

test("the panels beside the sidebar never store or send anything", () => {
  for (const sending of [/localStorage|sessionStorage|indexedDB/, /fetch|XMLHttpRequest|sendBeacon|WebSocket/, /sendMessage|postMessage|runtime|storage/]) {
    assert.doesNotMatch(code, sending);
  }
});

test("the panels beside the sidebar draw in one self contained function", () => {
  // executeScript copies the function's text into the page, so it can't use
  // anything from outside it.
  assert.doesNotMatch(readFileSync(new URL("../sidebar/beside-frames.js", import.meta.url), "utf8"), /^import /m);
});
