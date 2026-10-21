import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const DASHES = /[—–]/;

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const filesIn = (dir, ext) =>
  readdirSync(new URL(`../${dir}/`, import.meta.url))
    .filter((name) => name.endsWith(ext))
    .map((name) => `${dir}/${name}`);

// Drops // and /* */ comments but keeps everything inside string literals.
// Regex literals are copied whole so a quote inside one is not read as a string.
function withoutJsComments(code) {
  let out = "";
  let quote = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      out += c;
      if (c === "\\") out += code[++i] ?? "";
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
    } else if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && code[i + 1] === "*") {
      i = code.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else if (c === "/" && /[(,=:[!&|?{};]$|^$/.test(out.trimEnd().slice(-1)) || (c === "/" && /\breturn$/.test(out.trimEnd()))) {
      out += c;
      let inClass = false;
      for (i++; i < code.length; i++) {
        out += code[i];
        if (code[i] === "\\") out += code[++i] ?? "";
        else if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        else if (code[i] === "/" && !inClass) break;
      }
    } else out += c;
  }
  return out;
}

const withoutBlockComments = (text, open, close) =>
  text.replace(new RegExp(`${open}[\\s\\S]*?${close}`, "g"), "");

const jsFiles = [...filesIn("sidebar", ".js"), ...filesIn("src", ".mjs"), "background.js"];

for (const file of jsFiles) {
  test(`${file} shows no em or en dashes in its strings`, () => {
    assert.doesNotMatch(withoutJsComments(read(file)), DASHES);
  });
}

for (const file of filesIn("sidebar", ".html")) {
  test(`${file} shows no em or en dashes`, () => {
    assert.doesNotMatch(withoutBlockComments(read(file), "<!--", "-->"), DASHES);
  });
}

for (const file of filesIn("sidebar", ".css")) {
  const css = withoutBlockComments(read(file), "/\\*", "\\*/");
  test(`${file} has no em or en dashes`, () => {
    assert.doesNotMatch(css, DASHES);
  });
  test(`${file} does not force capitals`, () => {
    assert.doesNotMatch(css, /text-transform:\s*uppercase/);
  });
}

test("manifest.json descriptions have no em or en dashes", () => {
  assert.doesNotMatch(read("manifest.json"), DASHES);
});

// Course became Collection (#73). Only text with a space can be shown to the
// user, so names like "courses" or a class like "course-list" in the code
// don't count. Since #126 a Course is a Collection marked for learning: the
// Course layout's own texts (src/course-view.mjs) and the few phrases that
// mark or unmark one elsewhere may say it, and Home lists "Your courses" (#127).
const STRINGS = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
const COURSE_WORD = /(?<![-.\w$])courses?(?![-\w])/i;
const COURSE_LAYOUT_FILE = "src/course-view.mjs";
const COURSE_PHRASES = /Make it a course|Not a course any more|Course layout|[Yy]our courses/g;

for (const file of jsFiles.filter((name) => name !== COURSE_LAYOUT_FILE)) {
  test(`${file} shows no Course in its strings`, () => {
    const shown = (withoutJsComments(read(file)).match(STRINGS) ?? [])
      .map((literal) => literal.replace(/\$\{[^}]*\}/g, "").replace(COURSE_PHRASES, ""))
      .filter((literal) => literal.includes(" "));
    assert.deepEqual(shown.filter((literal) => COURSE_WORD.test(literal)), []);
  });
}

for (const file of filesIn("sidebar", ".html")) {
  test(`${file} shows no Course`, () => {
    const text = withoutBlockComments(read(file), "<!--", "-->").replace(/<[^>]*>/g, " ");
    assert.doesNotMatch(text, COURSE_WORD);
  });
}
