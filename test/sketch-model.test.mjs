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
} from "../src/sketch-model.mjs";

// Drawing in a sketch block (#101): click and drag draws a shape, a drag
// moves one, Delete removes it. Pure functions; the sidebar only draws them.

test("the toolbar offers the four shapes, then select and delete", () => {
  assert.deepEqual(
    SKETCH_TOOLS.map((tool) => tool.id),
    ["rectangle", "square", "circle", "triangle", "select", "delete"],
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
