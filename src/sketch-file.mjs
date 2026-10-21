// The file format of a Sketch (#101, ADR 0007). Pure, so it can be tested
// with node --test.
import { readShapes, shapesSvg, sketchLook } from "./sketch-model.mjs";

// A Sketch is kept inside its note as `note.sketches`, numbered from 1:
// `{ 1: { width, height, shapes } }`, the shapes as src/sketch-model.mjs
// describes them. In the Notes Home and in an Export each one is an `.svg`
// file next to the note's file, `<Title> – sketch <n>.svg`, which GitHub,
// Obsidian and any browser show as a picture. The shapes are kept as JSON in
// the file's `<metadata>`, so Glacier reads its own drawing back unchanged. The note's
// text holds the embed line `![[<Title> – sketch <n>.svg]]` where it sits.

// The en dash ADR 0007 puts in a sketch's file name.
const SKETCH_DASH = "\u2013";
const SKETCH_NAME = new RegExp(`^(.*) ${SKETCH_DASH} sketch (\\d+)\\.svg$`);
const SKETCH_LINE = new RegExp(`^!\\[\\[(.*) ${SKETCH_DASH} sketch (\\d+)\\.svg\\]\\]$`);
// The pen the picture is drawn with outside Glacier, on a light page.
const SKETCH_INK = "#2b2b2b";
// The size given to a sketch file that doesn't say its own.
const SKETCH_SIZE = 160;

export function sketchFileName(stem, n) {
  return `${stem} ${SKETCH_DASH} sketch ${n}.svg`;
}

// The file name and number an embed line points at, or null for any other
// line: `{ stem, n }`.
export function sketchInLine(line) {
  const match = SKETCH_LINE.exec((line ?? "").trim());
  return match ? { stem: match[1], n: Number(match[2]) } : null;
}

// Is this line a sketch's embed line (#101)? It shows as a drawing, never as
// text, so the caret steps over it as one block (#104).
export function isSketchLine(line) {
  return sketchInLine(line) !== null;
}

// A note's text with its embed lines pointing at the sketch files under
// another file name.
export function renameEmbeds(body, fromStem, toStem) {
  return body.replaceAll(`![[${fromStem} ${SKETCH_DASH} sketch `, `![[${toStem} ${SKETCH_DASH} sketch `);
}

function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function unescapeXml(text) {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

// A sketch as its svg file's text.
export function sketchToSvg(sketch) {
  const { width, height, shapes } = sketch;
  const look = sketchLook(sketch);
  const data = escapeXml(JSON.stringify({ glacier: "sketch", width, height, shapes, ...(look === "clean" && { look }) }));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<metadata>${data}</metadata>\n` +
    `<g fill="none" stroke="${SKETCH_INK}" color="${SKETCH_INK}" stroke-width="2" stroke-linejoin="round">\n` +
    shapesSvg(shapes, look) +
    "</g>\n</svg>\n"
  );
}

// A sketch from its svg file's text, or undefined when the file isn't one
// of Glacier's sketches. Only plain numbers and known shapes are kept.
export function sketchFromSvg(text) {
  const match = /<metadata>([\s\S]*?)<\/metadata>/.exec(text ?? "");
  if (!match) return undefined;
  try {
    const data = JSON.parse(unescapeXml(match[1]));
    if (data?.glacier !== "sketch" || !Array.isArray(data.shapes)) return undefined;
    const size = (value) => (Number.isFinite(value) && value > 0 ? value : SKETCH_SIZE);
    const sketch = { width: size(data.width), height: size(data.height), shapes: readShapes(data.shapes) };
    if (data.look === "clean") sketch.look = "clean";
    return sketch;
  } catch {
    return undefined;
  }
}

export // For a sketch file's path: the path of its note's Markdown file and the
// sketch's number, or null when the file is no sketch.
function sketchFilePath(path) {
  const at = path.lastIndexOf("/") + 1;
  const match = SKETCH_NAME.exec(path.slice(at));
  return match ? { notePath: `${path.slice(0, at)}${match[1]}.md`, n: Number(match[2]) } : null;
}
