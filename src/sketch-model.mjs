// Drawing in a sketch block (#101, #102, ADR 0007): pure functions on a
// sketch's shapes, with no DOM. A box shape (rectangle, square, circle,
// triangle) is `{ kind, x, y, w, h }`, its box in the drawing area's own
// pixels. Text is a box too, with its `text`; its letters grow with its
// height. A line or arrow is `{ kind, x1, y1, x2, y2 }`, and an end dropped
// on a shape sticks to it: `stuck1` or `stuck2` is `{ id, fx, fy }`, the
// shape's `id` and where on its box the end sits, as a share of its width
// and height. Shapes get an `id` only once an end sticks to them. The
// sidebar turns mouse drags into calls here and draws what comes back; the
// Notebook core keeps the shapes and writes them into the sketch's svg file.

// The toolbar above a picked sketch, in order: the four shapes, line, arrow
// and text, then select (and move) and delete.
export const SKETCH_TOOLS = [
  { id: "rectangle", label: "Rectangle" },
  { id: "square", label: "Square" },
  { id: "circle", label: "Circle" },
  { id: "triangle", label: "Triangle" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "text", label: "Text. Click to place it, double click to change it" },
  { id: "select", label: "Select and move. Drag a corner to resize, with Shift to keep the proportions" },
  { id: "delete", label: "Delete the picked shape" },
];

// The six ink colours of the toolbar: the paper's own ink, then five muted,
// pencil-like shades, each in a shade for light papers and a lighter one
// for dark papers (Aurora, Chalkboard).
export const SKETCH_COLORS = [
  { id: "ink", label: "Ink" },
  { id: "blue", label: "Blue", light: "#3f6fa8", dark: "#8fb4e3" },
  { id: "green", label: "Green", light: "#4f8a5b", dark: "#8fcf9c" },
  { id: "red", label: "Red", light: "#b5493f", dark: "#e8928a" },
  { id: "orange", label: "Orange", light: "#c27a2c", dark: "#e8b073" },
  { id: "purple", label: "Purple", light: "#7a5aa6", dark: "#c0a6e6" },
];

const BOX_KINDS = new Set(["rectangle", "square", "circle", "triangle"]);
const LINE_KINDS = new Set(["line", "arrow"]);
// A drag shorter than this is a click, which draws nothing.
const SMALLEST = 4;
// How close a click must come to a line or a handle to grab it.
const NEAR = 6;
// The drawing area is never lower than this many ruled rows.
const FEWEST_ROWS = 3;
// A new text's height; its letters are three quarters of it.
export const TEXT_HEIGHT = 28;
const LETTERS = 0.75;
const LONGEST_TEXT = 500;

export function isLine(shape) {
  return LINE_KINDS.has(shape.kind);
}

// The shape a drag from `from` to `to` draws, or null for a mere click. A
// square and a circle keep equal sides, as long as the longer drag, growing
// from where the drag started. A line or arrow runs from `from` to `to`.
export function shapeFromDrag(kind, from, to) {
  let w = Math.abs(to.x - from.x);
  let h = Math.abs(to.y - from.y);
  if (Math.max(w, h) < SMALLEST) return null;
  if (LINE_KINDS.has(kind)) return { kind, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  if (kind === "square" || kind === "circle") {
    w = h = Math.max(w, h);
  }
  const x = to.x < from.x ? from.x - w : from.x;
  const y = to.y < from.y ? from.y - h : from.y;
  return { kind, x, y, w, h };
}

// The box around any shape.
export function bounds(shape) {
  if (!isLine(shape)) return shape;
  const x = Math.min(shape.x1, shape.x2);
  const y = Math.min(shape.y1, shape.y2);
  return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
}

function inBox({ x, y, w, h }, point, margin = 0) {
  return point.x >= x - margin && point.x <= x + w + margin && point.y >= y - margin && point.y <= y + h + margin;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// How far the point is from the line between its two ends.
function distanceToLine({ x1, y1, x2, y2 }, point) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const along = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy || 1)));
  return distance(point, { x: x1 + along * dx, y: y1 + along * dy });
}

// The index of the topmost shape under the point, or -1. A line counts when
// the point is close to it.
export function shapeAt(shapes, point) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const shape = shapes[i];
    if (isLine(shape) ? distanceToLine(shape, point) <= NEAR : inBox(shape, point)) return i;
  }
  return -1;
}

// The index of the topmost shape a line end can stick to under the point.
function stickyShapeAt(shapes, point) {
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    if (!isLine(shapes[i]) && inBox(shapes[i], point)) return i;
  }
  return -1;
}

// The handles of a picked shape: a box's four corners (nw, ne, sw, se) or
// a line's two ends (1 and 2).
function handles(shape) {
  if (isLine(shape)) {
    return [
      { id: 1, x: shape.x1, y: shape.y1 },
      { id: 2, x: shape.x2, y: shape.y2 },
    ];
  }
  const { x, y, w, h } = shape;
  return [
    { id: "nw", x, y },
    { id: "ne", x: x + w, y },
    { id: "sw", x, y: y + h },
    { id: "se", x: x + w, y: y + h },
  ];
}

// The points to draw the picked shape's handles at.
export function handlePoints(shape) {
  return handles(shape).map(({ x, y }) => ({ x, y }));
}

// The handle of a picked shape under the point, or null.
export function handleAt(shape, point) {
  return handles(shape).find((handle) => distance(handle, point) <= NEAR)?.id ?? null;
}

// The shape moved by `by`, kept inside the drawing area.
export function moveShape(shape, by, area) {
  const clamp = (value, most) => Math.min(Math.max(value, 0), Math.max(most, 0));
  const box = bounds(shape);
  const dx = clamp(box.x + by.x, area.width - box.w) - box.x;
  const dy = clamp(box.y + by.y, area.height - box.h) - box.y;
  if (!isLine(shape)) return { ...shape, x: shape.x + dx, y: shape.y + dy };
  return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
}

// The line with end 1 or 2 at the point, stuck as told or loose.
function withEnd(line, end, point, stuck) {
  const next = { ...line, [`x${end}`]: point.x, [`y${end}`]: point.y };
  delete next[`stuck${end}`];
  if (stuck) next[`stuck${end}`] = stuck;
  return next;
}

// Every stuck line end put back on its shape; an end whose shape is gone
// stays where it is, loose.
function follow(shapes) {
  return shapes.map((shape) => {
    if (!isLine(shape)) return shape;
    let next = shape;
    for (const end of [1, 2]) {
      const stuck = shape[`stuck${end}`];
      if (!stuck) continue;
      const to = shapes.find((other) => other.id === stuck.id && !isLine(other));
      const point = to
        ? { x: Math.round(to.x + stuck.fx * to.w), y: Math.round(to.y + stuck.fy * to.h) }
        : { x: shape[`x${end}`], y: shape[`y${end}`] };
      next = withEnd(next, end, point, to ? stuck : undefined);
    }
    return next;
  });
}

// The shapes with the one at `index` given an id, if it had none.
function withId(shapes, index) {
  if (shapes[index].id !== undefined) return shapes;
  const id = Math.max(0, ...shapes.map((shape) => shape.id ?? 0)) + 1;
  return shapes.map((shape, i) => (i === index ? { ...shape, id } : shape));
}

const share = (value) => Math.round(value * 1000) / 1000;

// The shapes with end 1 or 2 of the line at `index` moved to the point,
// stuck to the shape it lands on, or loose on empty paper.
export function moveLineEnd(shapes, index, end, point) {
  const on = stickyShapeAt(shapes, point);
  if (on === -1) return shapes.map((shape, i) => (i === index ? withEnd(shape, end, point) : shape));
  const next = withId(shapes, on);
  const { id, x, y, w, h } = next[on];
  const stuck = { id, fx: share((point.x - x) / (w || 1)), fy: share((point.y - y) / (h || 1)) };
  return next.map((shape, i) => (i === index ? withEnd(shape, end, point, stuck) : shape));
}

// The shapes with a newly drawn one on top. A line's ends stick to the
// shapes they were drawn on.
export function addShape(shapes, shape) {
  let next = [...shapes, shape];
  if (!isLine(shape)) return next;
  const index = next.length - 1;
  next = moveLineEnd(next, index, 1, { x: shape.x1, y: shape.y1 });
  return moveLineEnd(next, index, 2, { x: shape.x2, y: shape.y2 });
}

// The shapes with the one at `index` moved; arrows stuck to it follow. A
// moved line lets go of what it was stuck to.
export function moveShapeIn(shapes, index, by, area) {
  return follow(
    shapes.map((shape, i) => {
      if (i !== index) return shape;
      const moved = moveShape(shape, by, area);
      delete moved.stuck1;
      delete moved.stuck2;
      return moved;
    }),
  );
}

// The shape with one corner dragged to the point while the opposite corner
// stays put. `keepProportions` (Shift) keeps its width to height; a square
// and text always do.
export function resizeShape(shape, corner, point, keepProportions) {
  const anchor = {
    x: corner.includes("w") ? shape.x + shape.w : shape.x,
    y: corner.includes("n") ? shape.y + shape.h : shape.y,
  };
  let w = Math.max(SMALLEST, Math.abs(point.x - anchor.x));
  let h = Math.max(SMALLEST, Math.abs(point.y - anchor.y));
  if (keepProportions || shape.kind === "square" || shape.kind === "text") {
    const scale = Math.max(w / shape.w, h / shape.h);
    w = Math.round(shape.w * scale);
    h = Math.round(shape.h * scale);
  }
  const x = point.x < anchor.x ? anchor.x - w : anchor.x;
  const y = point.y < anchor.y ? anchor.y - h : anchor.y;
  return { ...shape, x, y, w, h };
}

// The shapes with the one at `index` resized; arrows stuck to it follow.
export function resizeShapeIn(shapes, index, corner, point, keepProportions) {
  return follow(shapes.map((shape, i) => (i === index ? resizeShape(shape, corner, point, keepProportions) : shape)));
}

// The shapes without the one at `index`; arrows stuck to it come loose.
export function removeShape(shapes, index) {
  return follow(shapes.filter((_, i) => i !== index));
}

// A new text placed where the click was, `width` wide (the sidebar measures
// it in the note's handwriting font at textSize).
export function textShape(point, text, width) {
  return { kind: "text", x: point.x, y: point.y - TEXT_HEIGHT / 2, w: width, h: TEXT_HEIGHT, text };
}

// How big a text's letters are, in pixels.
export function textSize(shape) {
  return shape.h * LETTERS;
}

// The shapes with the text at `index` changed and `width` wide; an empty
// text is removed.
export function withText(shapes, index, text, width) {
  if (!text.trim()) return removeShape(shapes, index);
  return shapes.map((shape, i) => (i === index ? { ...shape, text, w: width } : shape));
}

// A dragged height for the drawing area, snapped to whole ruled rows so the
// text below still sits on the lines.
export function resizedHeight(height, rowHeight) {
  return Math.max(FEWEST_ROWS, Math.round(height / rowHeight)) * rowHeight;
}

// Shapes from a file, keeping only the kinds Glacier draws with plain
// numbers and text, so nothing else from a file ever reaches the page.
export function readShapes(shapes) {
  if (!Array.isArray(shapes)) return [];
  return shapes.map(readShape).filter(Boolean);
}

const numbers = (shape, keys) => keys.every((key) => Number.isFinite(shape[key]));

function readStuck(stuck) {
  return stuck && numbers(stuck, ["id", "fx", "fy"]) ? { id: stuck.id, fx: stuck.fx, fy: stuck.fy } : undefined;
}

// The colour and fill a shape from a file keeps: a known colour name and
// a plain true.
function readStyle(from, to) {
  if (SKETCH_COLORS.some(({ id }) => id === from.color && id !== "ink")) to.color = from.color;
  if (from.fill === true) to.fill = true;
  return to;
}

function readShape(shape) {
  const read = shape ? readPlainShape(shape) : null;
  return read && readStyle(shape, read);
}

function readPlainShape(shape) {
  const { kind } = shape;
  if (LINE_KINDS.has(kind) && numbers(shape, ["x1", "y1", "x2", "y2"])) {
    const { x1, y1, x2, y2 } = shape;
    const line = { kind, x1, y1, x2, y2 };
    for (const end of ["stuck1", "stuck2"]) {
      const stuck = readStuck(shape[end]);
      if (stuck) line[end] = stuck;
    }
    return line;
  }
  const isText = kind === "text" && typeof shape.text === "string";
  if ((BOX_KINDS.has(kind) || isText) && numbers(shape, ["x", "y", "w", "h"])) {
    const { x, y, w, h } = shape;
    const box = { kind, x, y, w, h };
    if (isText) box.text = shape.text.slice(0, LONGEST_TEXT);
    if (Number.isFinite(shape.id)) box.id = shape.id;
    return box;
  }
  return null;
}

function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const tidy = (value) => Math.round(value * 10) / 10;

// The two short strokes of an arrow's head at its second end.
function arrowHeadPoints({ x1, y1, x2, y2 }) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const side = (turn) => ({ x: x2 - 10 * Math.cos(angle + turn), y: y2 - 10 * Math.sin(angle + turn) });
  return [side(0.45), { x: x2, y: y2 }, side(-0.45)];
}

function arrowHead(arrow) {
  const [a, tip, b] = arrowHeadPoints(arrow);
  return `M${tidy(a.x)} ${tidy(a.y)} L${tip.x} ${tip.y} L${tidy(b.x)} ${tidy(b.y)}`;
}

// The two looks of a sketch (ADR 0007): hand-drawn is the default, clean is
// exact lines. A sketch stores `look: "clean"` only when it is clean.
export const SKETCH_LOOKS = [
  { id: "hand", label: "Hand-drawn" },
  { id: "clean", label: "Clean" },
];

export function sketchLook(sketch) {
  return sketch?.look === "clean" ? "clean" : "hand";
}

// A small seeded random number generator (mulberry32), so a shape wobbles
// the same way every time it is drawn.
function randomFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The seed of a shape: its kind and size, not where it sits, so moving a
// shape does not change its wobble.
function seedOf(shape) {
  const size = isLine(shape) ? [shape.x2 - shape.x1, shape.y2 - shape.y1] : [shape.w, shape.h];
  const text = `${shape.kind}:${size.join(",")}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash;
}

// How far a hand-drawn stroke's ends stray from the exact line, in pixels.
const WOBBLE = 0.8;
// How far a stroke bows to one side, and how far a stroke runs past its corner.
const BOW = 2.2;
const OVERSHOOT_LEAST = 2;
const OVERSHOOT_MOST = 5;
// How far the second pass sits from the first.
const SECOND_PASS = 1.6;

const between = (random, least, most) => least + random() * (most - least);

const secondPassShift = (random) => ({ x: between(random, -SECOND_PASS, SECOND_PASS), y: between(random, -SECOND_PASS, SECOND_PASS) });

// One pen stroke from a to b: it runs a little past both ends and bows
// gently to one side. `random` gives numbers from 0 to 1.
function strokePath(a, b, random) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const jitter = () => between(random, -WOBBLE, WOBBLE);
  const before = between(random, OVERSHOOT_LEAST, OVERSHOOT_MOST);
  const after = between(random, OVERSHOOT_LEAST, OVERSHOOT_MOST);
  const from = { x: a.x - ux * before + jitter(), y: a.y - uy * before + jitter() };
  const to = { x: b.x + ux * after + jitter(), y: b.y + uy * after + jitter() };
  const bow = between(random, -BOW, BOW) * Math.min(1, length / 40);
  const cx = (from.x + to.x) / 2 - uy * bow;
  const cy = (from.y + to.y) / 2 + ux * bow;
  return `M${tidy(from.x)} ${tidy(from.y)} Q${tidy(cx)} ${tidy(cy)} ${tidy(to.x)} ${tidy(to.y)}`;
}

// The strokes of a polyline, one per side, drawn twice: the second pass is
// shifted a little and wobbles on its own, as if traced over once.
function sketchedPath(points, closed, random) {
  const sides = closed ? points.map((point, i) => [point, points[(i + 1) % points.length]]) : points.slice(1).map((point, i) => [points[i], point]);
  const shift = secondPassShift(random);
  const moved = (point) => ({ x: point.x + shift.x, y: point.y + shift.y });
  const first = sides.map(([a, b]) => strokePath(a, b, random));
  const second = sides.map(([a, b]) => strokePath(moved(a), moved(b), random));
  return `<path d="${[...first, ...second].join(" ")}"/>`;
}

// One smooth round stroke around the box, starting at `start` and sweeping
// `sweep` radians, so a pass can stop short of or run past where it began.
function circleStroke({ x, y, w, h }, random, start, sweep, offset) {
  const steps = 20;
  const swell = (random() - 0.5) * 0.05;
  const phaseA = random() * 2 * Math.PI;
  const phaseB = random() * 2 * Math.PI;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start + (i / steps) * sweep;
    const scale = 1 + swell + 0.018 * Math.sin(2 * angle + phaseA) + 0.012 * Math.sin(3 * angle + phaseB);
    return {
      x: x + offset.x + w / 2 + (w / 2) * scale * Math.cos(angle),
      y: y + offset.y + h / 2 + (h / 2) * scale * Math.sin(angle),
    };
  });
  const at = (i) => points[Math.min(Math.max(i, 0), steps)];
  let d = `M${tidy(points[0].x)} ${tidy(points[0].y)}`;
  for (let i = 0; i < steps; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${tidy(c1.x)} ${tidy(c1.y)} ${tidy(c2.x)} ${tidy(c2.y)} ${tidy(p2.x)} ${tidy(p2.y)}`;
  }
  return d;
}

// A circle drawn twice, each pass one smooth stroke; the two passes start
// at different places and do not quite meet.
function sketchedCircle(box, random) {
  const start = random() * 2 * Math.PI;
  const first = circleStroke(box, random, start, 2 * Math.PI + 0.12, { x: 0, y: 0 });
  const shift = secondPassShift(random);
  const second = circleStroke(box, random, start + between(random, 0.5, 1.2), 2 * Math.PI - 0.15, shift);
  return `<path d="${first} ${second}"/>`;
}

// The two quick strokes of an arrow's head, from the tip back along each side.
function sketchedArrowHead(arrow, random) {
  const [a, tip, b] = arrowHeadPoints(arrow);
  return `<path d="${strokePath(a, tip, random)} ${strokePath(b, tip, random)}"/>`;
}

// One shape as a hand-drawn svg path. Text is the same in both looks.
function handShapeSvg(shape) {
  const random = randomFrom(seedOf(shape));
  const { kind, x, y, w, h } = shape;
  if (kind === "line" || kind === "arrow") {
    const shaft = sketchedPath([{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }], false, random);
    return kind === "arrow" ? shaft + sketchedArrowHead(shape, random) : shaft;
  }
  if (kind === "circle") return sketchedCircle(shape, random);
  if (kind === "triangle") {
    return sketchedPath([{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }], true, random);
  }
  return sketchedPath([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true, random);
}

// One shape as an svg element, drawn clean.
// Text takes the group's color and, in Glacier, the note's handwriting font.
function shapeSvg(shape) {
  const { kind, x, y, w, h } = shape;
  if (kind === "line") {
    return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"/>`;
  }
  if (kind === "arrow") {
    return `<path d="M${shape.x1} ${shape.y1} L${shape.x2} ${shape.y2} ${arrowHead(shape)}"/>`;
  }
  if (kind === "text") {
    return (
      `<text x="${x}" y="${tidy(y + h * 0.76)}" font-size="${tidy(textSize(shape))}" font-family="cursive" ` +
      `fill="currentColor" stroke="none">${escapeXml(shape.text)}</text>`
    );
  }
  if (kind === "circle") {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  }
  if (kind === "triangle") {
    return `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}

// A shape's colour and fill as the sketch toolbar shows them.
export function shapeStyle(shape) {
  return { color: shape.color ?? "ink", fill: shape.fill === true };
}

// The shape with the given colour and/or fill; the paper's ink and no fill
// are stored as nothing.
export function withStyle(shape, change) {
  const next = { ...shape, ...change };
  if (next.color === "ink") delete next.color;
  if (!next.fill || !BOX_KINDS.has(next.kind)) delete next.fill;
  return next;
}

// The shapes with the one at `index` given a new colour and/or fill.
export function styleShapeIn(shapes, index, change) {
  return shapes.map((shape, i) => (i === index ? withStyle(shape, change) : shape));
}

// A light wash of the shape's colour under its outline, about 15 % strong.
function washSvg(shape, color) {
  return `<g fill="${color}" fill-opacity="0.15" stroke="none">${shapeSvg(shape)}</g>`;
}

// The shapes as svg elements, one per line, for the file and the screen, in
// the given look ("hand" wobbles; anything else is clean). A colour shape is
// wrapped in a group with its colour, in the lighter shade when `dark` (a
// dark paper on screen); the file always gets the shade for a light page.
export function shapesSvg(shapes, look = "clean", dark = false) {
  const draw = (shape) => (look === "hand" && shape.kind !== "text" ? handShapeSvg(shape) : shapeSvg(shape));
  return shapes
    .map((shape) => {
      const { color, fill } = shapeStyle(shape);
      if (color === "ink" && !fill) return `${draw(shape)}\n`;
      const hex = color === "ink" ? "currentColor" : SKETCH_COLORS.find(({ id }) => id === color)[dark ? "dark" : "light"];
      const wash = fill && BOX_KINDS.has(shape.kind) ? washSvg(shape, hex) : "";
      const attributes = color === "ink" ? "" : ` stroke="${hex}" color="${hex}"`;
      return `<g${attributes}>${wash}${draw(shape)}</g>\n`;
    })
    .join("");
}

// Undo and redo for one sketch: the sketch as it was before each saved
// change, and the changes undone since. A new change forgets the redo steps.
export function sketchHistory() {
  const undoSteps = [];
  const redoSteps = [];
  return {
    // A save turned `before` into `after`.
    record(before, after) {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      undoSteps.push(before);
      redoSteps.length = 0;
    },
    // The sketch one step back from `now`, or null when there is none.
    undo(now) {
      if (undoSteps.length === 0) return null;
      redoSteps.push(now);
      return undoSteps.pop();
    },
    // The sketch one undone step forward from `now`, or null.
    redo(now) {
      if (redoSteps.length === 0) return null;
      undoSteps.push(now);
      return redoSteps.pop();
    },
  };
}
