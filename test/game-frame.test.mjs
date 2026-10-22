import { test } from "node:test";
import assert from "node:assert/strict";

import { PAPERS } from "../src/look.mjs";
import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { PAPER_GAMES, gameFor, newFrame, press, release, togglePause, pause, tick, resize, panel } from "../src/game-frame.mjs";

// The shared frame every hidden game plugs into (#129): which game `/break`
// starts on a paper, ready, play, pause and over, the panels' contents and
// each game's own top 5.

// A tiny game: it runs until `crash` is set, scores one point a second and
// counts the presses it got.
function fakeGame(id = "test") {
  return {
    id,
    title: "Test run",
    how: ["Space to hop."],
    newGame: ({ width, height }) => ({ width, height, time: 0, presses: 0, held: false, crash: null }),
    press: (world) => {
      world.presses += 1;
      world.held = true;
    },
    release: (world) => {
      world.held = false;
    },
    step: (world, seconds) => {
      world.time += seconds;
      return world.crash;
    },
    resize: (world, width, height) => Object.assign(world, { width, height }),
    points: (world) => Math.floor(world.time),
    summary: (world) => `${Math.floor(world.time)} s`,
    scoreBoxes: () => [],
  };
}

function frameOf(game = fakeGame(), notebook = createNotebook({ storage: memoryStorage() })) {
  return newFrame({ game, width: 380, height: 600, random: () => 0.5, keepScore: notebook.keepScore });
}

function playFor(frame, seconds) {
  for (let i = 0; i < seconds * 60; i += 1) tick(frame, 1 / 60);
}

function endRound(frame, seconds, how = "Bump!") {
  playFor(frame, seconds);
  frame.world.crash = how;
  tick(frame, 1 / 60);
}

test("every paper has its own game", () => {
  assert.deepEqual(
    PAPERS.map((paper) => paper.name),
    PAPER_GAMES.map((entry) => entry.paper),
  );
  assert.equal(new Set(PAPER_GAMES.map((entry) => entry.id)).size, PAPERS.length);
  const titles = Object.fromEntries(PAPER_GAMES.map((entry) => [entry.paper, entry.title]));
  assert.deepEqual(titles, {
    Glacier: "Penguin break",
    Forest: "Squirrel jump",
    Ocean: "Little fish",
    Desert: "Camel walk",
    Volcano: "Stone blaster",
    Aurora: "Northern light",
    "Blank Page": "Paper plane",
    "School Notebook": "Doodle hop",
    Chalkboard: "Chalk snake",
    Moleskine: "Block stack",
    Engineer: "Brick breaker",
  });
});

test("/break starts the game of the paper in use", () => {
  assert.equal(gameFor("Ocean", ["penguin", "ocean"]), "ocean");
  assert.equal(gameFor("Glacier", ["penguin", "ocean"]), "penguin");
});

test("a paper whose game isn't built yet starts Penguin break", () => {
  assert.equal(gameFor("Chalkboard", ["penguin"]), "penguin");
  assert.equal(gameFor("No such paper", ["penguin"]), "penguin");
});

test("the frame opens ready, with the game's icon, title and how to play", () => {
  const frame = frameOf();
  assert.equal(frame.mode, "ready");
  assert.deepEqual(panel(frame), {
    kind: "start",
    icon: true,
    title: "Test run",
    lines: ["Space to hop.", "Space or a click to start.", "P pauses, Esc goes back to your note."],
  });
});

test("nothing moves until Space or a click starts the round", () => {
  const frame = frameOf();
  playFor(frame, 1);
  assert.equal(frame.world.time, 0);
  press(frame);
  assert.equal(frame.mode, "play");
  assert.equal(frame.world.presses, 0);
  assert.equal(panel(frame), null);
  playFor(frame, 1);
  assert.ok(frame.world.time > 0.9);
});

test("while playing, Space goes to the game and letting go too", () => {
  const frame = frameOf();
  press(frame);
  press(frame);
  assert.equal(frame.world.presses, 1);
  assert.equal(frame.world.held, true);
  release(frame);
  assert.equal(frame.world.held, false);
});

test("P pauses, the world stands still, and P goes on", () => {
  const frame = frameOf();
  press(frame);
  playFor(frame, 1);
  togglePause(frame);
  const time = frame.world.time;
  playFor(frame, 1);
  assert.equal(frame.mode, "pause");
  assert.equal(frame.world.time, time);
  assert.deepEqual(panel(frame), {
    kind: "pause",
    icon: false,
    title: "Paused",
    lines: ["P or Space to go on.", "Esc goes back to your note."],
  });
  togglePause(frame);
  assert.equal(frame.mode, "play");
});

test("P before the start or after the end does nothing", () => {
  const frame = frameOf();
  togglePause(frame);
  assert.equal(frame.mode, "ready");
  press(frame);
  endRound(frame, 1);
  togglePause(frame);
  assert.equal(frame.mode, "over");
});

test("leaving the tab or window pauses and lets go, and Space goes on without a hop", () => {
  const frame = frameOf();
  press(frame);
  press(frame);
  pause(frame);
  assert.equal(frame.mode, "pause");
  assert.equal(frame.world.held, false);
  press(frame);
  assert.equal(frame.mode, "play");
  assert.equal(frame.world.presses, 1);
});

test("the end keeps the points in the game's top 5 and says what happened", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const frame = frameOf(fakeGame(), notebook);
  press(frame);
  endRound(frame, 12, "Bump!");
  assert.equal(frame.mode, "over");
  assert.deepEqual(
    notebook.topScores("test").map((entry) => entry.score),
    [12],
  );
  const shown = panel(frame);
  assert.equal(shown.kind, "end");
  assert.equal(shown.title, "New best!");
  assert.deepEqual(shown.lines, ["12 s", "12 points"]);
  assert.equal(shown.footer, "Space: again · Esc: back to your note");
});

test("the end says what happened when it isn't a new best", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.keepScore("test", 50);
  const frame = frameOf(fakeGame(), notebook);
  press(frame);
  endRound(frame, 3, "Bump!");
  assert.equal(panel(frame).title, "Bump!");
});

test("the top 5 shows gold, silver and bronze for places 1 to 3 and marks the new score, after an equal older one", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  for (const score of [40, 30, 20, 10]) notebook.keepScore("test", score);
  const frame = frameOf(fakeGame(), notebook);
  press(frame);
  endRound(frame, 20);
  const rows = panel(frame).top;
  assert.deepEqual(
    rows.map(({ place, medal, score, word, mine }) => ({ place, medal, score, word, mine })),
    [
      { place: 1, medal: "gold", score: 40, word: "points", mine: false },
      { place: 2, medal: "silver", score: 30, word: "points", mine: false },
      { place: 3, medal: "bronze", score: 20, word: "points", mine: false },
      { place: 4, medal: null, score: 20, word: "points", mine: true },
      { place: 5, medal: null, score: 10, word: "points", mine: false },
    ],
  );
  assert.match(rows[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test("a round that doesn't make the top 5 marks no row", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  for (const score of [50, 40, 30, 20, 10]) notebook.keepScore("test", score);
  const frame = frameOf(fakeGame(), notebook);
  press(frame);
  endRound(frame, 2);
  assert.ok(panel(frame).top.every((row) => !row.mine));
});

test("each game keeps its own top 5", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const penguin = frameOf(fakeGame("penguin"), notebook);
  press(penguin);
  endRound(penguin, 30);
  const squirrel = frameOf(fakeGame("forest"), notebook);
  press(squirrel);
  endRound(squirrel, 5);
  assert.deepEqual(notebook.topScores("penguin").map((entry) => entry.score), [30]);
  assert.deepEqual(notebook.topScores("forest").map((entry) => entry.score), [5]);
  assert.equal(panel(squirrel).title, "New best!");
});

test("Space after the end starts a fresh round straight away", () => {
  const frame = frameOf();
  press(frame);
  endRound(frame, 5);
  press(frame);
  assert.equal(frame.mode, "play");
  assert.equal(frame.world.time, 0);
  assert.equal(frame.world.presses, 0);
  assert.equal(panel(frame), null);
});

test("a round is kept once, however long the end panel stays", () => {
  const notebook = createNotebook({ storage: memoryStorage() });
  const frame = frameOf(fakeGame(), notebook);
  press(frame);
  endRound(frame, 4);
  playFor(frame, 2);
  assert.equal(notebook.topScores("test").length, 1);
});

test("tick says when the round just ended, so the score can be synced", () => {
  const frame = frameOf();
  press(frame);
  assert.equal(tick(frame, 1 / 60), false);
  frame.world.crash = "Bump!";
  assert.equal(tick(frame, 1 / 60), true);
  assert.equal(tick(frame, 1 / 60), false);
});

test("the sidebar changing size reaches the game", () => {
  const frame = frameOf();
  resize(frame, 500, 700);
  assert.equal(frame.world.width, 500);
  assert.equal(frame.width, 500);
  press(frame);
  endRound(frame, 1);
  press(frame);
  assert.equal(frame.world.height, 700);
});
