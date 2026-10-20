import { test } from "node:test";
import assert from "node:assert/strict";
import { turnFrames } from "../src/page-turn.mjs";

// The pixel page turn (#108): each frame is two outlines in big pixels, the
// part of the page still lying flat and the folded back of its corner.

const frames = turnFrames(400, 600, { count: 8, pixel: 8 });

test("a page turn has the asked number of frames, from whole to gone", () => {
  assert.equal(frames.length, 8);
  const xs = (points) => points.map(([x]) => x);
  assert.deepEqual([Math.min(...xs(frames[0].sheet)), Math.max(...xs(frames[0].sheet))], [0, 400]);
  assert.deepEqual(frames.at(-1).sheet, []);
});

test("every edge of the turning page steps like pixel art: across or down, never slanted", () => {
  for (const { sheet, back } of frames) {
    for (const outline of [sheet, back]) {
      outline.forEach(([x, y], i) => {
        const [nx, ny] = outline[(i + 1) % outline.length];
        assert.ok(x === nx || y === ny, `slanted edge ${x},${y} to ${nx},${ny}`);
      });
    }
  }
});

test("the folded back sits on the turned corner's side of the fold, and grows", () => {
  const area = (points) =>
    Math.abs(points.reduce((sum, [x, y], i) => {
      const [nx, ny] = points[(i + 1) % points.length];
      return sum + x * ny - nx * y;
    }, 0)) / 2;
  assert.ok(area(frames[1].back) > 0);
  assert.ok(area(frames[1].sheet) > area(frames[4].sheet));
});
