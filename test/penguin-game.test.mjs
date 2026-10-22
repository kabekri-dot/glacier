import { test } from "node:test";
import assert from "node:assert/strict";

import {
  newGame,
  press,
  release,
  togglePause,
  pause,
  step,
  spawn,
  metres,
  points,
  skyAt,
  seededRandom,
  resultLines,
  PENGUIN_SIZE,
  PX_PER_M,
} from "../src/penguin-game.mjs";

// Penguin break (#128), the Glacier paper's hidden game: the world, its
// obstacles, collisions and scoring, without any drawing.

// A game already sliding on the ice (the first press jumps too, so that
// jump is taken back), with nothing coming for a long while.
function sliding({ seed = 1 } = {}) {
  const game = newGame({ width: 380, height: 600, random: seededRandom(seed) });
  press(game);
  release(game);
  game.vy = 0;
  game.next = 1e9;
  return game;
}

// Run the game for `seconds` at 60 frames a second.
function run(game, seconds) {
  for (let t = 0; t < seconds * 60; t += 1) step(game, 1 / 60);
}

test("the game waits for the first jump before it slides", () => {
  const game = newGame({ width: 380, height: 600, random: seededRandom(1) });
  run(game, 1);
  assert.equal(game.mode, "ready");
  assert.equal(metres(game), 0);
  press(game);
  assert.equal(game.mode, "play");
});

test("the speed starts at 170 and rises by 4 every second, up to 360", () => {
  const game = sliding();
  assert.equal(game.speed, 170);
  run(game, 10);
  assert.ok(Math.abs(game.speed - 210) < 0.5);
  run(game, 60);
  assert.equal(game.speed, 360);
});

test("movement goes by time, not by frames", () => {
  const smooth = sliding();
  const choppy = sliding();
  for (let i = 0; i < 120; i += 1) step(smooth, 1 / 120);
  for (let i = 0; i < 30; i += 1) step(choppy, 1 / 30);
  assert.ok(Math.abs(smooth.dist - choppy.dist) < 1);
});

test("every metre is a point", () => {
  const game = sliding();
  run(game, 2);
  assert.equal(metres(game), Math.floor(game.dist / PX_PER_M));
  assert.ok(metres(game) > 0);
  assert.equal(points(game), metres(game));
});

test("a fish is worth 10 points and a golden fish 50", () => {
  const game = sliding();
  const y = game.y + PENGUIN_SIZE.h / 2 - 4;
  game.fishes.push({ x: game.x + PENGUIN_SIZE.w / 2 - 10, y, gold: false, bob: 0 });
  step(game, 1 / 60);
  assert.equal(game.fish, 1);
  game.fishes.push({ x: game.x + PENGUIN_SIZE.w / 2 - 10, y, gold: true, bob: 0 });
  step(game, 1 / 60);
  assert.equal(game.golden, 1);
  assert.equal(points(game), metres(game) + 10 + 50);
});

test("a jump lands back on the ice", () => {
  const game = sliding();
  const floor = game.y;
  press(game);
  release(game);
  step(game, 0.1);
  assert.ok(game.y < floor);
  run(game, 2);
  assert.equal(game.y, floor);
  assert.equal(game.vy, 0);
  assert.equal(game.mode, "play");
});

test("holding the jump goes higher", () => {
  const top = (holding) => {
    const game = sliding();
    press(game);
    if (!holding) release(game);
    let highest = game.y;
    for (let i = 0; i < 120; i += 1) {
      step(game, 1 / 60);
      highest = Math.min(highest, game.y);
    }
    return highest;
  };
  assert.ok(top(true) < top(false) - 20);
});

test("the penguin can't jump again in the air", () => {
  const game = sliding();
  press(game);
  release(game);
  step(game, 0.1);
  const vy = game.vy;
  press(game);
  assert.equal(game.vy, vy);
});

test("sliding onto a crack ends in Splash!", () => {
  const game = sliding();
  game.gaps.push({ x: game.x - 20, w: PENGUIN_SIZE.w + 60 });
  run(game, 2);
  assert.equal(game.mode, "over");
  assert.equal(game.how, "Splash!");
});

test("once in a crack the ice sliding past can't lift the penguin out", () => {
  const game = sliding();
  game.gaps.push({ x: game.x - 20, w: PENGUIN_SIZE.w + 40 });
  step(game, 0.15);
  assert.ok(game.y > game.ground - PENGUIN_SIZE.h);
  run(game, 2);
  assert.equal(game.how, "Splash!");
});

test("running into an ice block ends in Bonk!", () => {
  const game = sliding();
  game.blocks.push({ x: game.x + PENGUIN_SIZE.w + 10, w: 24, h: 21, tall: false });
  run(game, 1);
  assert.equal(game.mode, "over");
  assert.equal(game.how, "Bonk!");
});

test("jumping in time clears an ice block", () => {
  const game = sliding();
  game.blocks.push({ x: game.x + PENGUIN_SIZE.w + 60, w: 24, h: 21, tall: false });
  press(game);
  run(game, 1);
  release(game);
  run(game, 1);
  assert.equal(game.mode, "play");
});

test("P pauses and the world stands still until it goes on", () => {
  const game = sliding();
  run(game, 1);
  togglePause(game);
  const dist = game.dist;
  run(game, 1);
  assert.equal(game.mode, "pause");
  assert.equal(game.dist, dist);
  togglePause(game);
  assert.equal(game.mode, "play");
});

test("leaving the tab pauses, and Space goes on without jumping", () => {
  const game = sliding();
  pause(game);
  assert.equal(game.mode, "pause");
  press(game);
  assert.equal(game.mode, "play");
  assert.equal(game.vy, 0);
});

test("Space after the end starts a fresh round", () => {
  const game = sliding();
  game.gaps.push({ x: game.x - 20, w: 200 });
  run(game, 2);
  press(game);
  assert.equal(game.mode, "play");
  assert.equal(game.dist, 0);
  assert.equal(game.fish, 0);
  assert.deepEqual(game.gaps, []);
});

test("the obstacles come in the same mix for the same seed", () => {
  const kinds = (seed) => {
    const game = newGame({ width: 380, height: 600, random: seededRandom(seed) });
    return Array.from({ length: 40 }, () => spawn(game));
  };
  assert.deepEqual(kinds(7), kinds(7));
  assert.notDeepEqual(kinds(7), kinds(8));
});

test("the mix holds cracks, ice blocks, a crack then a block, and two cracks", () => {
  const game = newGame({ width: 380, height: 600, random: seededRandom(3) });
  const seen = new Set(Array.from({ length: 200 }, () => spawn(game)));
  assert.deepEqual([...seen].sort(), ["block", "crack", "crack-then-block", "two-cracks"]);
  assert.ok(game.blocks.some((block) => block.tall));
  assert.ok(game.blocks.some((block) => !block.tall));
  assert.ok(game.fishes.some((fish) => fish.gold));
});

test("obstacles come closer together as it speeds up", () => {
  const meanGap = (time) => {
    const game = newGame({ width: 380, height: 600, random: seededRandom(5) });
    game.time = time;
    let total = 0;
    for (let i = 0; i < 200; i += 1) {
      spawn(game);
      total += game.next;
    }
    return total / 200;
  };
  assert.ok(meanGap(70) < meanGap(0));
});

test("the sky turns from day to evening at 250 m and to night at 600 m", () => {
  assert.equal(skyAt(0).sky, "rgb(238,244,251)");
  assert.equal(skyAt(250).sky, "rgb(246,233,224)");
  assert.equal(skyAt(600).sky, "rgb(43,53,87)");
  assert.equal(skyAt(5000).sky, "rgb(43,53,87)");
});

test("the sky blends slowly between its steps", () => {
  const between = skyAt(190).sky;
  assert.notEqual(between, skyAt(0).sky);
  assert.notEqual(between, skyAt(250).sky);
});

test("the end says what happened, with metres, fish and points", () => {
  const game = sliding();
  game.dist = 123 * PX_PER_M;
  game.fish = 2;
  game.golden = 1;
  game.mode = "over";
  game.how = "Bonk!";
  assert.deepEqual(resultLines(game, false), ["Bonk!", "123 m, 2 fish, 1 golden: 193 points"]);
  assert.deepEqual(resultLines(game, true), ["New best!", "123 m, 2 fish, 1 golden: 193 points"]);
  game.golden = 0;
  assert.deepEqual(resultLines(game, false), ["Bonk!", "123 m, 2 fish: 143 points"]);
});
