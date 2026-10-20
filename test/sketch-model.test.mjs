import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SKETCH_TOOLS,
  shapeFromDrag,
  shapeAt,
  moveShape,
  resizedHeight,
  readShapes,
  shapesSvg,
  sketchLook,
  SKETCH_COLORS,
  withStyle,
  styleShapeIn,
  shapeStyle,
  addShape,
  moveShapeIn,
  moveLineEnd,
  resizeShape,
  resizeShapeIn,
  removeShape,
  handleAt,
  textShape,
  textSize,
  withText,
} from "../src/sketch-model.mjs";

// Drawing in a sketch block (#101): click and drag draws a shape, a drag
// moves one, Delete removes it. Pure functions; the sidebar only draws them.

test("the toolbar offers the four shapes, line, arrow and text, then select and delete", () => {
  assert.deepEqual(
    SKETCH_TOOLS.map((tool) => tool.id),
    ["rectangle", "square", "circle", "triangle", "line", "arrow", "text", "select", "delete"],
  );
  for (const tool of SKETCH_TOOLS) assert.ok(tool.label);
});

test("dragging draws a rectangle between the two points, in any direction", () => {
  assert.deepEqual(shapeFromDrag("rectangle", { x: 90, y: 60 }, { x: 10, y: 20 }), {
    kind: "rectangle",
    x: 10,
    y: 20,
    w: 80,
    h: 40,
  });
});

test("a square and a circle keep equal sides, the longer drag wins", () => {
  assert.deepEqual(shapeFromDrag("square", { x: 10, y: 10 }, { x: 40, y: 70 }), { kind: "square", x: 10, y: 10, w: 60, h: 60 });
  assert.deepEqual(shapeFromDrag("circle", { x: 50, y: 50 }, { x: 20, y: 40 }), { kind: "circle", x: 20, y: 20, w: 30, h: 30 });
});

test("a click without a drag draws nothing", () => {
  assert.equal(shapeFromDrag("triangle", { x: 10, y: 10 }, { x: 12, y: 11 }), null);
});

test("a click finds the topmost shape under it", () => {
  const shapes = [
    { kind: "rectangle", x: 0, y: 0, w: 100, h: 100 },
    { kind: "circle", x: 40, y: 40, w: 30, h: 30 },
  ];
  assert.equal(shapeAt(shapes, { x: 50, y: 50 }), 1);
  assert.equal(shapeAt(shapes, { x: 5, y: 5 }), 0);
  assert.equal(shapeAt(shapes, { x: 150, y: 5 }), -1);
});

test("a moved shape stays inside the drawing area", () => {
  const shape = { kind: "square", x: 10, y: 10, w: 40, h: 40 };
  assert.deepEqual(moveShape(shape, { x: 15, y: 5 }, { width: 200, height: 100 }), { ...shape, x: 25, y: 15 });
  assert.deepEqual(moveShape(shape, { x: 500, y: -50 }, { width: 200, height: 100 }), { ...shape, x: 160, y: 0 });
});

test("the drawing area's height snaps to whole ruled rows, at least three", () => {
  assert.equal(resizedHeight(100, 28), 112);
  assert.equal(resizedHeight(10, 28), 84);
});

test("shapes read from a file keep only what Glacier draws", () => {
  assert.deepEqual(
    readShapes([
      { kind: "circle", x: 1, y: 2, w: 3, h: 4 },
      { kind: "script", x: 1, y: 2, w: 3, h: 4 },
      { kind: "square", x: "<b>", y: 2, w: 3, h: 4 },
      null,
    ]),
    [{ kind: "circle", x: 1, y: 2, w: 3, h: 4 }],
  );
});

test("each shape is drawn as an svg element", () => {
  const svg = shapesSvg([
    { kind: "rectangle", x: 0, y: 0, w: 10, h: 20 },
    { kind: "circle", x: 0, y: 0, w: 10, h: 10 },
    { kind: "triangle", x: 0, y: 0, w: 10, h: 10 },
  ]);
  assert.match(svg, /<rect x="0" y="0" width="10" height="20"\/>/);
  assert.match(svg, /<ellipse cx="5" cy="5" rx="5" ry="5"\/>/);
  assert.match(svg, /<polygon points="5,0 10,10 0,10"\/>/);
});

// Lines, arrows, text and resizing (#102).

const box = (fields) => ({ kind: "rectangle", x: 0, y: 0, w: 100, h: 50, ...fields });

test("dragging with the line or arrow tool draws from one point to the other", () => {
  assert.deepEqual(shapeFromDrag("arrow", { x: 10, y: 20 }, { x: 90, y: 5 }), { kind: "arrow", x1: 10, y1: 20, x2: 90, y2: 5 });
  assert.equal(shapeFromDrag("line", { x: 10, y: 20 }, { x: 11, y: 21 }), null);
});

test("an arrow drawn from one box to another sticks to both", () => {
  const shapes = [box({ x: 0 }), box({ x: 200 })];
  const drawn = addShape(shapes, shapeFromDrag("arrow", { x: 50, y: 25 }, { x: 250, y: 25 }));
  const arrow = drawn[2];
  assert.equal(arrow.stuck1.id, drawn[0].id);
  assert.equal(arrow.stuck2.id, drawn[1].id);
  assert.notEqual(drawn[0].id, drawn[1].id);
});

test("an arrow end stuck to a shape follows it when the shape moves", () => {
  const drawn = addShape([box({ x: 0 }), box({ x: 200 })], shapeFromDrag("arrow", { x: 50, y: 25 }, { x: 250, y: 25 }));
  const moved = moveShapeIn(drawn, 1, { x: 20, y: 40 }, { width: 400, height: 200 });
  assert.deepEqual([moved[2].x1, moved[2].y1, moved[2].x2, moved[2].y2], [50, 25, 270, 65]);
});

test("an arrow end stuck to a shape follows it when the shape is resized", () => {
  const drawn = addShape([box({ x: 0 })], shapeFromDrag("line", { x: 100, y: 50 }, { x: 300, y: 50 }));
  const resized = resizeShapeIn(drawn, 0, "se", { x: 200, y: 100 }, false);
  assert.deepEqual([resized[1].x1, resized[1].y1], [200, 100]);
});

test("an end drawn on empty paper stays where it was dropped", () => {
  const drawn = addShape([box({ x: 0 })], shapeFromDrag("line", { x: 50, y: 25 }, { x: 300, y: 150 }));
  assert.ok(drawn[1].stuck1);
  assert.equal(drawn[1].stuck2, undefined);
  const moved = moveShapeIn(drawn, 0, { x: 10, y: 0 }, { width: 400, height: 200 });
  assert.deepEqual([moved[1].x2, moved[1].y2], [300, 150]);
});

test("a dragged line end sticks to the shape it is dropped on, or comes loose", () => {
  const shapes = [box({ x: 200 }), { kind: "line", x1: 10, y1: 10, x2: 50, y2: 10 }];
  const stuck = moveLineEnd(shapes, 1, 2, { x: 210, y: 20 });
  assert.equal(stuck[1].stuck2.id, stuck[0].id);
  assert.deepEqual([stuck[1].x2, stuck[1].y2], [210, 20]);
  const loose = moveLineEnd(stuck, 1, 2, { x: 150, y: 150 });
  assert.equal(loose[1].stuck2, undefined);
});

test("moving a line itself lets go of the shapes it was stuck to", () => {
  const drawn = addShape([box({ x: 0 })], shapeFromDrag("line", { x: 50, y: 25 }, { x: 300, y: 150 }));
  const moved = moveShapeIn(drawn, 1, { x: 10, y: 10 }, { width: 400, height: 200 });
  assert.equal(moved[1].stuck1, undefined);
  assert.deepEqual([moved[1].x1, moved[1].y1, moved[1].x2, moved[1].y2], [60, 35, 310, 160]);
});

test("deleting a shape leaves its arrows where they are, loose", () => {
  const drawn = addShape([box({ x: 0 })], shapeFromDrag("arrow", { x: 50, y: 25 }, { x: 300, y: 150 }));
  const left = removeShape(drawn, 0);
  assert.equal(left.length, 1);
  assert.equal(left[0].stuck1, undefined);
  assert.deepEqual([left[0].x1, left[0].y1], [50, 25]);
});

test("a click near a line picks it, a click away from it does not", () => {
  const shapes = [{ kind: "line", x1: 0, y1: 0, x2: 100, y2: 100 }];
  assert.equal(shapeAt(shapes, { x: 52, y: 48 }), 0);
  assert.equal(shapeAt(shapes, { x: 80, y: 10 }), -1);
});

test("a picked shape has a handle on each corner, a line one on each end", () => {
  assert.equal(handleAt(box({}), { x: 99, y: 51 }), "se");
  assert.equal(handleAt(box({}), { x: 1, y: 0 }), "nw");
  assert.equal(handleAt(box({}), { x: 50, y: 25 }), null);
  assert.equal(handleAt({ kind: "arrow", x1: 0, y1: 0, x2: 80, y2: 40 }, { x: 79, y: 41 }), 2);
});

test("dragging a corner resizes the shape, the other corner stays put", () => {
  assert.deepEqual(resizeShape(box({ x: 10, y: 10 }), "se", { x: 60, y: 110 }, false), box({ x: 10, y: 10, w: 50, h: 100 }));
  assert.deepEqual(resizeShape(box({ x: 10, y: 10 }), "nw", { x: 50, y: 40 }, false), box({ x: 50, y: 40, w: 60, h: 20 }));
});

test("with Shift a resize keeps the shape's proportions", () => {
  assert.deepEqual(resizeShape(box({}), "se", { x: 300, y: 60 }, true), box({ w: 300, h: 150 }));
});

test("a square stays square and text keeps its proportions without Shift", () => {
  const square = { kind: "square", x: 0, y: 0, w: 40, h: 40 };
  assert.deepEqual(resizeShape(square, "se", { x: 80, y: 50 }, false), { ...square, w: 80, h: 80 });
  const text = textShape({ x: 0, y: 14 }, "Hi", 30);
  const bigger = resizeShape(text, "se", { x: 60, y: 10 }, false);
  assert.equal(bigger.w, 60);
  assert.equal(textSize(bigger), textSize(text) * 2);
});

test("text is placed where you click and can be changed later", () => {
  const text = textShape({ x: 40, y: 50 }, "Client", 60);
  assert.equal(text.kind, "text");
  assert.equal(text.x, 40);
  assert.ok(text.y < 50 && text.y + text.h > 50);
  const changed = withText([text], 0, "Server", 70);
  assert.deepEqual(changed, [{ ...text, text: "Server", w: 70 }]);
  assert.deepEqual(withText([text], 0, "  ", 0), []);
});

test("lines, arrows and text read from a file keep only plain numbers and text", () => {
  assert.deepEqual(
    readShapes([
      { kind: "arrow", x1: 1, y1: 2, x2: 3, y2: 4, stuck1: { id: 2, fx: 0.5, fy: 0.5 }, stuck2: { id: "x" } },
      { kind: "line", x1: 1, y1: 2, x2: "3", y2: 4 },
      { kind: "text", x: 1, y: 2, w: 3, h: 4, text: "<b>Hi</b>" },
      { kind: "text", x: 1, y: 2, w: 3, h: 4, text: 7 },
      { kind: "rectangle", x: 1, y: 2, w: 3, h: 4, id: 2, onclick: "x" },
    ]),
    [
      { kind: "arrow", x1: 1, y1: 2, x2: 3, y2: 4, stuck1: { id: 2, fx: 0.5, fy: 0.5 } },
      { kind: "text", x: 1, y: 2, w: 3, h: 4, text: "<b>Hi</b>" },
      { kind: "rectangle", x: 1, y: 2, w: 3, h: 4, id: 2 },
    ],
  );
});

test("lines, arrows and text are drawn as svg, the text escaped", () => {
  const svg = shapesSvg([
    { kind: "line", x1: 0, y1: 0, x2: 10, y2: 20 },
    { kind: "arrow", x1: 0, y1: 0, x2: 100, y2: 0 },
    { kind: "text", x: 0, y: 0, w: 30, h: 20, text: "a < b & c" },
  ]);
  assert.match(svg, /<line x1="0" y1="0" x2="10" y2="20"\/>/);
  assert.match(svg, /<path d="M0 0 L100 0 M[^"]+"\/>/);
  assert.match(svg, /<text [^>]*>a &lt; b &amp; c<\/text>/);
});

// The hand-drawn look (#103).

const everyKind = [
  { kind: "rectangle", x: 5, y: 5, w: 80, h: 40 },
  { kind: "square", x: 5, y: 5, w: 40, h: 40 },
  { kind: "circle", x: 5, y: 5, w: 40, h: 40 },
  { kind: "triangle", x: 5, y: 5, w: 40, h: 40 },
  { kind: "line", x1: 0, y1: 0, x2: 50, y2: 20 },
  { kind: "arrow", x1: 0, y1: 0, x2: 50, y2: 20 },
];

test("the same shape gets the same wobbly path every time", () => {
  for (const shape of everyKind) {
    assert.equal(shapesSvg([shape], "hand"), shapesSvg([{ ...shape }], "hand"), shape.kind);
  }
});

test("a hand-drawn shape is a wobbly path, not the exact element", () => {
  for (const shape of everyKind) {
    assert.match(shapesSvg([shape], "hand"), /^<path d="M/, shape.kind);
    assert.notEqual(shapesSvg([shape], "hand"), shapesSvg([shape], "clean"), shape.kind);
  }
});

test("moving a shape keeps its wobble", () => {
  const rect = everyKind[0];
  const wobble = (shape) => /d="M([\d.-]+) ([\d.-]+)/.exec(shapesSvg([shape], "hand")).slice(1).map(Number);
  const [x, y] = wobble(rect);
  const [movedX, movedY] = wobble({ ...rect, x: rect.x + 30, y: rect.y + 10 });
  assert.equal(Math.round((movedX - x) * 10), 300);
  assert.equal(Math.round((movedY - y) * 10), 100);
});

test("text is written the same in both looks", () => {
  const text = { kind: "text", x: 0, y: 0, w: 40, h: 28, text: "Hi" };
  assert.equal(shapesSvg([text], "hand"), shapesSvg([text], "clean"));
});

test("a sketch is hand-drawn unless it says clean", () => {
  assert.equal(sketchLook({}), "hand");
  assert.equal(sketchLook({ look: "clean" }), "clean");
  assert.equal(sketchLook({ look: "other" }), "hand");
});

test("a hand-drawn circle is one smooth round stroke that stays close to the circle", () => {
  const circle = { kind: "circle", x: 0, y: 0, w: 100, h: 100 };
  const d = /d="([^"]+)"/.exec(shapesSvg([circle], "hand"))[1];
  assert.doesNotMatch(d, /Q/, "no small bends between points, which make corners");
  assert.match(d, /C/, "smooth curves");
  const numbers = d.match(/-?[\d.]+/g).map(Number);
  for (let i = 0; i < numbers.length; i += 2) {
    const distance = Math.hypot(numbers[i] - 50, numbers[i + 1] - 50);
    assert.ok(distance > 44 && distance < 58, `point ${i / 2} is ${distance.toFixed(1)} from the middle`);
  }
});

// A pen sketch look (#105).

const strokesOf = (shape) => (shapesSvg([shape], "hand").match(/M[\d.-]+ [\d.-]+/g) ?? []).map((m) => m.slice(1).split(" ").map(Number));

test("every stroke is drawn twice", () => {
  assert.equal(strokesOf(everyKind[4]).length, 2);
  assert.equal(strokesOf(everyKind[0]).length, 8);
  assert.equal(strokesOf(everyKind[3]).length, 6);
  assert.equal(strokesOf(everyKind[2]).length, 2);
  assert.equal(strokesOf(everyKind[5]).length, 4);
});

test("a box's sides run past its corners", () => {
  const [top] = strokesOf(everyKind[0]);
  assert.ok(top[0] < 5, `the top side starts at ${top[0]}, left of the corner at 5`);
  const d = /d="([^"]+)"/.exec(shapesSvg([everyKind[4]], "hand"))[1];
  const end = d.split(" Q")[1].split(" ").slice(2).map(Number);
  assert.ok(end[0] > 50, "a line ends past its end");
});

test("the two passes of a circle do not quite meet", () => {
  const circle = { kind: "circle", x: 0, y: 0, w: 100, h: 100 };
  const d = /d="([^"]+)"/.exec(shapesSvg([circle], "hand"))[1];
  const [first, second] = d.split(" M").map((part) => part.replace(/^M/, ""));
  const start = first.split(" ").slice(0, 2).map(Number);
  const end = second.trim().split(" ").slice(-2).map(Number);
  assert.ok(Math.hypot(start[0] - end[0], start[1] - end[1]) > 0.5);
});

test("a clean shape is still exact", () => {
  assert.equal(shapesSvg([everyKind[0]], "clean"), '<rect x="5" y="5" width="80" height="40"/>\n');
});

// Colours and fill (#106).

const plainBox = { kind: "rectangle", x: 5, y: 5, w: 80, h: 40 };

test("there are six calm ink colours, the paper's own ink first", () => {
  assert.deepEqual(SKETCH_COLORS.map(({ id }) => id), ["ink", "blue", "green", "red", "orange", "purple"]);
  assert.equal(SKETCH_COLORS[0].light, undefined);
});

test("a shape without a colour uses the ink and has no fill", () => {
  assert.deepEqual(shapeStyle(plainBox), { color: "ink", fill: false });
  assert.doesNotMatch(shapesSvg([plainBox], "clean"), /stroke=|fill=/);
});

test("a colour and fill are kept when shapes are read from a file", () => {
  const [read] = readShapes([{ ...plainBox, color: "blue", fill: true }]);
  assert.deepEqual(shapeStyle(read), { color: "blue", fill: true });
  const [plain] = readShapes([{ ...plainBox, color: "<script>", fill: "yes" }]);
  assert.deepEqual(plain, plainBox);
});

test("changing the picked shape's colour leaves the others alone", () => {
  const shapes = [plainBox, { ...plainBox, x: 50 }];
  const next = styleShapeIn(shapes, 1, { color: "red" });
  assert.deepEqual(shapeStyle(next[1]), { color: "red", fill: false });
  assert.equal(next[0], shapes[0]);
  assert.equal("color" in styleShapeIn(next, 1, { color: "ink" })[1], false);
});

test("a coloured shape is drawn in its colour, lighter on a dark paper", () => {
  const blue = SKETCH_COLORS.find(({ id }) => id === "blue");
  const shape = withStyle(plainBox, { color: "blue" });
  assert.match(shapesSvg([shape], "clean"), new RegExp(`stroke="${blue.light}"`));
  assert.match(shapesSvg([shape], "clean", true), new RegExp(`stroke="${blue.dark}"`));
});

test("fill adds a light wash of the colour to boxes, circles and triangles only", () => {
  const filled = (kind) => shapesSvg([withStyle({ ...plainBox, kind }, { color: "green", fill: true })], "hand");
  for (const kind of ["rectangle", "square", "circle", "triangle"]) assert.match(filled(kind), /fill-opacity="0.15"/, kind);
  const line = shapesSvg([withStyle({ kind: "line", x1: 0, y1: 0, x2: 9, y2: 9 }, { fill: true })], "clean");
  assert.doesNotMatch(line, /fill-opacity/);
});

test("fill without a colour washes with the ink", () => {
  assert.match(shapesSvg([withStyle(plainBox, { fill: true })], "clean"), /fill="currentColor" fill-opacity="0.15"/);
});

test("a new shape is drawn with the picked colour and fill", () => {
  assert.deepEqual(shapeStyle(withStyle(plainBox, { color: "purple", fill: true })), { color: "purple", fill: true });
});
