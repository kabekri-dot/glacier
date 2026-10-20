import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, sketchEmbed } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { printHtml } from "../src/print-layout.mjs";
import { notebookMenu } from "../src/menu-contents.mjs";

// The print layout (#71): the notes laid out on their own, for the browser's
// print window ("Save as PDF").

function notebookWith() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Box model", course: "CSS" });
  notebook.saveBody("Box model", "Space <outside> the border.");
  notebook.createNote({ title: "Flexbox", course: "CSS" });
  notebook.saveBody("Flexbox", "Rows and columns.");
  notebook.createNote({ title: "Margins" });
  return notebook;
}

test("one note prints as its title and its text, with nothing else", () => {
  const notebook = notebookWith();
  const html = printHtml(notebook.notesToPrint("Box model"));
  assert.match(html, /<h1>Box model<\/h1>/);
  assert.match(html, /Space &lt;outside&gt; the border\./);
  assert.doesNotMatch(html, /<button|<nav|sidebar/i);
});

test("a Course prints every note, each starting on a new page", () => {
  const notebook = notebookWith();
  const html = printHtml(notebook.notesOfCourse("CSS"));
  assert.match(html, /Box model/);
  assert.match(html, /Flexbox/);
  assert.doesNotMatch(html, /Margins/);
  assert.equal(html.match(/<section/g).length, 2);
  assert.match(html, /page-break-before/);
});

test("the Notebook menu offers a Download on each Collection heading", () => {
  const parts = notebookMenu(notebookWith(), "");
  const course = parts.find((part) => part.kind === "group");
  assert.equal(course.actions[0].hint, "Download 'CSS', 2 notes");
});

function noteWithSketchesAndBreak() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Plan" });
  const { n } = notebook.addSketch("Plan", { width: 200, height: 100 });
  notebook.saveSketch("Plan", n, {
    width: 200,
    height: 100,
    shapes: [{ type: "line", x1: 0, y1: 0, x2: 50, y2: 50 }],
  });
  notebook.saveBody("Plan", `Before\n${sketchEmbed("Plan", n)}\n%%page%%\nAfter`);
  return notebook;
}

test("a sketch prints as its drawing, not its embed line", () => {
  const html = printHtml(noteWithSketchesAndBreak().notesToPrint("Plan"));
  assert.match(html, /<svg/);
  assert.doesNotMatch(html, /!\[\[|sketch 1\.svg/);
});

test("a page break prints as a real page break with nothing written", () => {
  const html = printHtml(noteWithSketchesAndBreak().notesToPrint("Plan"));
  assert.doesNotMatch(html, /%%page%%/);
  assert.match(html, /class="page-break"/);
  assert.match(html, /\.page-break \{[^}]*break-before: page/);
});

test("a page break inside a code block is printed as code", () => {
  const html = printHtml([{ title: "T", body: "```\n%%page%%\n```" }]);
  assert.match(html, /%%page%%/);
});
