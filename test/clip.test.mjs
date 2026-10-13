import { test } from "node:test";
import assert from "node:assert/strict";

import { clipQuote, appendClip } from "../src/clip.mjs";

test("one line is quoted with the page link under it", () => {
  assert.equal(clipQuote("Hello", "Page", "https://p.example"), "> Hello\n> — [Page](https://p.example)");
});

test("every line of several is quoted, blank ones too", () => {
  assert.equal(clipQuote("One\n\nTwo", "Page", "https://p.example"), "> One\n>\n> Two\n> — [Page](https://p.example)");
});

test("a page with no title uses its address as the link text", () => {
  assert.equal(clipQuote("Hello", "", "https://p.example"), "> Hello\n> — [https://p.example](https://p.example)");
});

test("a clip goes after a blank line, or alone in an empty note", () => {
  assert.equal(appendClip("Notes\n", "> q"), "Notes\n\n> q");
  assert.equal(appendClip("", "> q"), "> q");
  assert.equal(appendClip(undefined, "> q"), "> q");
});
