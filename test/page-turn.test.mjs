import { test } from "node:test";
import assert from "node:assert/strict";
import { curlAt, easeTurn } from "../src/page-turn.mjs";

// The page turn: the bottom right corner of the page curls up and over to
// the left. At each moment the turn is the part of the page still lying flat
// (sheet) and the folded back of the corner (back), mirrored across the fold.

const W = 400;
const H = 600;

const area = (points) =>
  Math.abs(points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0)) / 2;

test("before the turn the whole page lies flat and nothing is folded", () => {
  const { sheet, back } = curlAt(W, H, 0);
  assert.equal(area(sheet), W * H);
  assert.deepEqual(back, []);
});

test("at the end of the turn nothing of the page is left", () => {
  const { sheet, back } = curlAt(W, H, 1);
  assert.deepEqual(sheet, []);
  assert.deepEqual(back, []);
});

test("the folded back is exactly the part that left the flat page", () => {
  for (const t of [0.1, 0.3, 0.5, 0.7]) {
    const { sheet, back } = curlAt(W, H, t);
    assert.ok(Math.abs(area(sheet) + area(back) - W * H) < 0.01, `at ${t}`);
  }
});

test("the folded back lies over the flat side of the fold", () => {
  const { back, fold } = curlAt(W, H, 0.4);
  const { at, toward } = fold;
  for (const [x, y] of back) {
    assert.ok((x - at[0]) * toward[0] + (y - at[1]) * toward[1] <= 0.01);
  }
});

test("the flat page gets smaller all through the turn", () => {
  const sizes = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => area(curlAt(W, H, t).sheet));
  sizes.slice(1).forEach((size, i) => assert.ok(size < sizes[i], `step ${i}`));
});

test("the turn starts and ends gently", () => {
  assert.equal(easeTurn(0), 0);
  assert.equal(easeTurn(1), 1);
  assert.equal(easeTurn(0.5), 0.5);
  assert.ok(easeTurn(0.1) < 0.1);
  assert.ok(easeTurn(0.9) > 0.9);
});
