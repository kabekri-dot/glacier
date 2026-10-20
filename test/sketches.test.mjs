import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook, noteToFile, sketchToSvg, sketchFromSvg, sketchEmbed, sketchInLine } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";
import { unzipFiles } from "../src/zip.mjs";

// Sketch blocks (#101, ADR 0007): a drawing between the lines of a note,
// written into the note as `![[<Title> – sketch <n>.svg]]` and kept as that
// `.svg` file next to the note, with its shapes as JSON in the file's
// `<metadata>`. Sketch files go wherever their note goes.

const DASH = "–";

const drawing = {
  width: 320,
  height: 120,
  shapes: [
    { kind: "rectangle", x: 10, y: 10, w: 80, h: 40 },
    { kind: "circle", x: 120, y: 20, w: 50, h: 50 },
    { kind: "triangle", x: 200, y: 10, w: 60, h: 50 },
    { kind: "square", x: 270, y: 60, w: 40, h: 40 },
  ],
};

function notebookWithSketch(title = "Box model", fields = {}) {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title, ...fields });
  const { n, line } = notebook.addSketch(title, { width: 320 });
  notebook.saveBody(title, `Boxes:\n${line}\nThe end.`);
  notebook.saveSketch(title, n, drawing);
  return notebook;
}

function sketchPath(folder, stem, n = 1) {
  return `${folder}/${stem} ${DASH} sketch ${n}.svg`;
}

test("a new sketch gets the next number and its embed line names the note", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({ title: "Box model" });
  const first = notebook.addSketch("Box model", { width: 300 });
  const second = notebook.addSketch("Box model", { width: 300 });
  assert.deepEqual(first, { n: 1, line: `![[Box model ${DASH} sketch 1.svg]]` });
  assert.equal(second.n, 2);
  assert.deepEqual(notebook.sketch("Box model", 1).shapes, []);
});

test("an embed line tells which note's sketch it shows", () => {
  const notebook = notebookWithSketch();
  assert.deepEqual(notebook.sketchForLine(sketchEmbed("Box model", 1)), { title: "Box model", n: 1, sketch: drawing });
  assert.equal(notebook.sketchForLine("![[Other note.svg]]"), null);
  assert.equal(notebook.sketchForLine("Just text"), null);
  assert.deepEqual(sketchInLine(`![[A/B ${DASH} sketch 3.svg]]`), { stem: "A/B", n: 3 });
});

test("a saved sketch is kept with its note", () => {
  const notebook = notebookWithSketch();
  assert.deepEqual(notebook.sketch("Box model", 1), drawing);
});

test("the shapes come back from the svg file unchanged", () => {
  const svg = sketchToSvg(drawing);
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /<metadata>/);
  assert.match(sketchToSvg({ ...drawing, look: "clean" }), /<rect [\s\S]*<ellipse [\s\S]*<polygon /);
  assert.deepEqual(sketchFromSvg(svg), drawing);
});

test("lines, arrows and text come back from the svg file unchanged", () => {
  const diagram = {
    width: 320,
    height: 120,
    shapes: [
      { kind: "rectangle", x: 10, y: 10, w: 80, h: 40, id: 1 },
      { kind: "arrow", x1: 90, y1: 30, x2: 200, y2: 30, stuck1: { id: 1, fx: 1, fy: 0.5 } },
      { kind: "line", x1: 10, y1: 100, x2: 300, y2: 100 },
      { kind: "text", x: 210, y: 20, w: 70, h: 28, text: "Server <main> & \"cache\"" },
    ],
  };
  const svg = sketchToSvg(diagram);
  assert.match(svg, /<text [^>]*>Server &lt;main&gt; &amp; /);
  assert.deepEqual(sketchFromSvg(svg), diagram);
});

test("colour and fill come back from the svg file, which shows them", () => {
  const coloured = {
    width: 200,
    height: 120,
    shapes: [{ kind: "circle", x: 5, y: 5, w: 40, h: 40, color: "red", fill: true }, { kind: "rectangle", x: 60, y: 5, w: 40, h: 40 }],
  };
  const svg = sketchToSvg(coloured);
  assert.match(svg, /<g stroke="#b5493f" color="#b5493f">/);
  assert.match(svg, /fill-opacity="0.15"/);
  assert.deepEqual(sketchFromSvg(svg), coloured);
});

test("an svg that Glacier didn't draw is not read as a sketch", () => {
  assert.equal(sketchFromSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), undefined);
});

test("a sketch is synced to the Notes Home as an svg file next to its note", async () => {
  const remote = memoryRemote({});
  const notebook = notebookWithSketch("Box model", { course: "TOP" });
  await notebook.sync(remote);
  const files = remote.files();
  const path = sketchPath("collections/TOP", "Box model");
  assert.ok(files["collections/TOP/Box model.md"].includes(`![[Box model ${DASH} sketch 1.svg]]`));
  assert.deepEqual(sketchFromSvg(files[path]), drawing);
});

test("a sketch drawn in one browser arrives in the other", async () => {
  const remote = memoryRemote({});
  const chrome = notebookWithSketch();
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  assert.deepEqual(firefox.sketch("Box model", 1), drawing);
  const moved = { ...drawing, shapes: [{ kind: "square", x: 0, y: 0, w: 30, h: 30 }] };
  firefox.saveSketch("Box model", 1, moved);
  await firefox.sync(remote);
  const result = await chrome.sync(remote);
  assert.deepEqual(chrome.sketch("Box model", 1), moved);
  assert.deepEqual(result.pulled, ["Box model"]);
});

test("a sync with no sketch changed writes nothing", async () => {
  const remote = memoryRemote({});
  const notebook = notebookWithSketch();
  await notebook.sync(remote);
  await notebook.sync(remote);
  assert.equal(remote.commits().length, 1);
});

test("a sketch changed in both browsers keeps both drawings", async () => {
  const remote = memoryRemote({});
  const chrome = notebookWithSketch();
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  const inFirefox = { ...drawing, shapes: [drawing.shapes[0]] };
  const inChrome = { ...drawing, shapes: [drawing.shapes[1]] };
  firefox.saveSketch("Box model", 1, inFirefox);
  await firefox.sync(remote);
  chrome.saveSketch("Box model", 1, inChrome);
  const result = await chrome.sync(remote);
  assert.equal(result.conflicts, 1);
  assert.deepEqual(chrome.sketch("Box model", 1), inChrome);
  assert.deepEqual(chrome.sketch("Box model", 2), inFirefox);
  assert.ok(chrome.note("Box model").body.includes(sketchEmbed("Box model", 2)));
  assert.deepEqual(sketchFromSvg(remote.files()[sketchPath("notes", "Box model")]), inChrome);
});

test("renaming a note renames its sketch files and its embed lines", async () => {
  const remote = memoryRemote({});
  const notebook = notebookWithSketch();
  await notebook.sync(remote);
  notebook.renameNote("Box model", "Boxes");
  assert.equal(notebook.note("Boxes").body, `Boxes:\n${sketchEmbed("Boxes", 1)}\nThe end.`);
  assert.deepEqual(notebook.sketch("Boxes", 1), drawing);
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()).sort(), ["notes/Boxes.md", sketchPath("notes", "Boxes")].sort());
  assert.equal(remote.commits().length, 2);
});

test("a rename in one browser carries the sketch along in the other", async () => {
  const remote = memoryRemote({});
  const chrome = notebookWithSketch();
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  chrome.renameNote("Box model", "Boxes");
  await chrome.sync(remote);
  await firefox.sync(remote);
  assert.equal(firefox.note("Box model"), undefined);
  assert.deepEqual(firefox.sketch("Boxes", 1), drawing);
});

test("moving a note to a Collection moves its sketch files with it", async () => {
  const remote = memoryRemote({});
  const chrome = notebookWithSketch();
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  chrome.moveToCourse("Box model", "TOP");
  await chrome.sync(remote);
  assert.deepEqual(Object.keys(remote.files()).sort(), ["collections/TOP/Box model.md", sketchPath("collections/TOP", "Box model")].sort());
  await firefox.sync(remote);
  assert.equal(firefox.note("Box model").course, "TOP");
  assert.deepEqual(firefox.sketch("Box model", 1), drawing);
});

test("archiving a note moves its sketch files under archive/", async () => {
  const remote = memoryRemote({});
  const notebook = notebookWithSketch();
  await notebook.sync(remote);
  notebook.archiveNote("Box model");
  await notebook.sync(remote);
  assert.deepEqual(Object.keys(remote.files()).sort(), ["archive/notes/Box model.md", sketchPath("archive/notes", "Box model")].sort());
  assert.deepEqual(notebook.sketch("Box model", 1), drawing);
});

test("deleting a note deletes its sketch files in every browser", async () => {
  const remote = memoryRemote({});
  const chrome = notebookWithSketch();
  await chrome.sync(remote);
  const firefox = createNotebook({ storage: memoryStorage() });
  await firefox.firstSync(remote);
  chrome.deleteNote("Box model");
  await chrome.sync(remote);
  assert.deepEqual(remote.files(), {});
  await firefox.sync(remote);
  assert.equal(firefox.note("Box model"), undefined);
});

test("a sketch is synced to a Notes Home chosen later too", async () => {
  const notebook = notebookWithSketch();
  const remote = memoryRemote({});
  await notebook.switchNotesHome("drive", remote);
  assert.deepEqual(sketchFromSvg(remote.files()[sketchPath("notes", "Box model")]), drawing);
});

test("a picture someone put in a note folder is left alone", async () => {
  const remote = memoryRemote({ "notes/Holiday.svg": "<svg></svg>" });
  const notebook = notebookWithSketch();
  await notebook.sync(remote);
  await notebook.sync(remote);
  assert.equal(remote.files()["notes/Holiday.svg"], "<svg></svg>");
});

test("Export puts the sketch files next to their notes in the zip", async () => {
  const notebook = notebookWithSketch("Box model", { course: "TOP" });
  const files = await unzipFiles(notebook.exportZip());
  const svg = files.find(({ path }) => path === sketchPath("collections/TOP", "Box model"));
  assert.deepEqual(sketchFromSvg(svg.text), drawing);
  const collection = await unzipFiles(notebook.exportCourseZip("TOP"));
  assert.equal(collection.length, 2);
});

test("one note with a sketch downloads as a zip with its sketch files", async () => {
  const notebook = notebookWithSketch();
  notebook.createNote({ title: "Plain" });
  const files = await unzipFiles(notebook.exportNoteZip("Box model"));
  assert.deepEqual(files.map(({ path }) => path).sort(), ["notes/Box model.md", sketchPath("notes", "Box model")].sort());
  assert.equal(notebook.hasSketches("Box model"), true);
  assert.equal(notebook.hasSketches("Plain"), false);
});

test("Restore from backup brings the sketches back", async () => {
  const zip = notebookWithSketch().exportZip();
  const restored = createNotebook({ storage: memoryStorage() });
  const result = await restored.importZip(zip);
  assert.deepEqual(result, { added: 1, unchanged: 0, copies: 0 });
  assert.deepEqual(restored.sketch("Box model", 1), drawing);
});

test("a restored copy next to a changed note keeps its own sketch", async () => {
  const zip = notebookWithSketch().exportZip();
  const notebook = notebookWithSketch();
  notebook.saveBody("Box model", "Changed here.");
  await notebook.importZip(zip);
  const copy = notebook.notes().find((note) => note.title.startsWith("Box model (imported"));
  assert.ok(copy.body.includes(sketchEmbed(copy.title, 1)));
  assert.deepEqual(notebook.sketch(copy.title, 1), drawing);
});

test("a note's file is still only its Markdown", () => {
  const notebook = notebookWithSketch();
  assert.equal(noteToFile(notebook.note("Box model")).path, "notes/Box model.md");
  assert.equal(notebook.exportNote("Box model").path, "notes/Box model.md");
});

test("a sketch's embed line is not a Link", () => {
  const notebook = notebookWithSketch();
  assert.deepEqual(notebook.outgoingLinks("Box model"), []);
});

test("a clean sketch stays clean through its svg file, and a hand-drawn one is the default", () => {
  const clean = { ...drawing, look: "clean" };
  const svg = sketchToSvg(clean);
  assert.match(svg, /<rect /);
  assert.deepEqual(sketchFromSvg(svg), clean);
  const hand = sketchToSvg(drawing);
  assert.doesNotMatch(hand, /<rect /);
  assert.equal(sketchFromSvg(hand).look, undefined);
});

test("the svg file of a sketch is the same every time it is written", () => {
  assert.equal(sketchToSvg(drawing), sketchToSvg({ ...drawing }));
});

// Google Drive gives a picture file a new version after it is written,
// though its text stays the same: that is no change from elsewhere, so a
// sketch drawn on meanwhile is not kept twice.
test("a sketch file with a new version but the same text is no change from elsewhere", async () => {
  const remote = memoryRemote({});
  const notebook = notebookWithSketch();
  await notebook.sync(remote);
  const path = sketchPath("notes", "Box model");
  const { text, version } = await remote.readFile(path);
  await remote.writeFile(path, text, version);
  const drawnOn = { ...drawing, shapes: [...drawing.shapes, { kind: "circle", x: 10, y: 60, w: 30, h: 30 }] };
  notebook.saveSketch("Box model", 1, drawnOn);
  const result = await notebook.sync(remote);
  assert.equal(result.conflicts, 0);
  assert.equal(notebook.sketch("Box model", 2), undefined);
  assert.deepEqual(sketchFromSvg(remote.files()[path]), drawnOn);
});
