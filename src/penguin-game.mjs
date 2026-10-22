// Penguin break (#128): the Glacier paper's hidden game, started by typing
// `/break` on an empty line. A penguin slides over the ice while the world
// moves left; it jumps cracks and ice blocks and catches fish. This module is
// the game itself, with no drawing: the world, a seeded random for the
// obstacles, collisions and scoring. It plugs into the shared frame
// (src/game-frame.mjs, #129), which owns ready, pause and the end;
// sidebar/penguin-view.js draws the world. Numbers and wording follow the
// prototype the user played (docs/prototypes/penguin.html).
//
//   newGame({ width, height, random })   a fresh round on the ice
//   press(game) / release(game)          Space, ↑, a click or a tap, and letting go
//   step(game, seconds)                  move the world on; returns what ended it
//   resize(game, width, height)          the sidebar changed size
//   metres(game) / points(game)          the score so far
//   summary(game) / scoreBoxes(game)     the round in words, the boxes at the top
//   skyAt(metres)                        the sky's colours at that distance
//   PENGUIN_BREAK                        all of it, for the frame

// Pixel art, one string per row. K body, W white, E eye, O beak and feet,
// F fish, G golden fish. Ice blocks: B edge, L face, H highlight, D a crack.
export const PENGUIN = [
  "....KKKK...", "...KKKKKK..", "...KWWEWKOO", "..KKWWWWK..", ".KKKWWWWKK.", "KKKKWWWWKK.",
  ".KKKWWWWKK.", "..KKWWWWK..", "..KKWWWWK..", "...KWWWWK..", "....KKKK...", "...OO..OO..",
];
export const FISH = [".FFFF.F", "FFKFFFF", ".FFFF.F"];
export const GOLD = [".GGGG.G", "GGKGGGG", ".GGGG.G"];
export const BLOCK_LOW = ["BBBBBBBB", "BHHLLLLB", "BHLLLLDB", "BLLLLDLB", "BLLLLLLB", "BLLDLLLB", "BBBBBBBB"];
export const BLOCK_TALL = [
  "BBBBBBBB", "BHHLLLLB", "BHLLLLLB", "BLLLLLDB", "BLLLLDLB", "BLLLLLLB", "BLLLLLLB", "BLDLLLLB", "BLLDLLLB", "BBBBBBBB",
];

// One art pixel is 3 by 3 screen pixels; 40 screen pixels make a metre.
export const PX = 3;
export const PX_PER_M = 40;
export const PENGUIN_SIZE = { w: PENGUIN[0].length * PX, h: PENGUIN.length * PX };

const START_SPEED = 170;
const SPEED_UP = 4;
const TOP_SPEED = 360;
const JUMP = 390;
// Holding the key keeps the jump going higher and wider.
const GRAVITY = 1500;
const GRAVITY_HELD = 650;
const FISH_POINTS = 10;
const GOLDEN_POINTS = 50;
// The ice line sits at this share of the height.
const GROUND = 0.68;

export function newGame({ width, height, random = Math.random }) {
  const ground = Math.round(height * GROUND);
  return {
    random,
    width,
    height,
    ground,
    x: 70,
    y: ground - PENGUIN_SIZE.h,
    vy: 0,
    holding: false,
    speed: START_SPEED,
    time: 0,
    dist: 0,
    fish: 0,
    golden: 0,
    gaps: [],
    blocks: [],
    fishes: [],
    next: 380,
    far: 0,
    near: 0,
    how: "",
  };
}

const floorY = (game) => game.ground - PENGUIN_SIZE.h;
const standing = (game) => game.y >= floorY(game) - 0.5 && game.vy === 0;

// Space, ↑, a click or a tap: a jump, from the ice only.
export function press(game) {
  game.holding = true;
  if (standing(game)) game.vy = -JUMP;
}

export function release(game) {
  game.holding = false;
}

// The sidebar got wider or taller: the ice moves with it, and so does
// everything standing on it or floating over it.
export function resize(game, width, height) {
  const ground = Math.round(height * GROUND);
  const shift = ground - game.ground;
  game.width = width;
  game.height = height;
  game.ground = ground;
  game.y += shift;
  for (const fish of game.fishes) fish.y += shift;
}

// What comes next, just past the right edge: a crack, an ice block, a crack
// then a block, or two cracks close together, with fish to catch along the
// way. It gets denser as the penguin gets faster. Returns which it was.
export function spawn(game) {
  const { random, ground } = game;
  const x0 = game.width + 20;
  const hard = Math.min(1, game.time / 70);
  const roll = random();
  const crack = (x, w) => game.gaps.push({ x, w });
  const block = (x) => {
    const tall = random() < 0.5;
    const art = tall ? BLOCK_TALL : BLOCK_LOW;
    game.blocks.push({ x, tall, w: art[0].length * PX, h: art.length * PX });
  };
  const fish = (x, y, gold = false) => game.fishes.push({ x, y, gold, bob: random() * 6 });
  const arc = (x, w) => {
    for (let i = 0; i < 3; i += 1) fish(x + (w * (i + 1)) / 4 - 10, ground - PENGUIN_SIZE.h - 40 - (i === 1 ? 40 : 18));
  };
  let kind;
  let length;
  if (roll < 0.35) {
    kind = "crack";
    const w = 40 + random() * (40 + hard * 50);
    crack(x0, w);
    if (random() < 0.5) arc(x0, w);
    else fish(x0 + w + 70, ground - 16);
    length = w;
  } else if (roll < 0.6) {
    kind = "block";
    block(x0);
    fish(x0 + 2, ground - PENGUIN_SIZE.h - 62, random() < 0.06);
    length = 24;
  } else if (roll < 0.8) {
    kind = "crack-then-block";
    const w = 40 + random() * 30;
    crack(x0, w);
    block(x0 + w + 150 - hard * 40);
    length = w + 180;
  } else {
    kind = "two-cracks";
    const w1 = 34 + random() * 20;
    const w2 = 34 + random() * 20;
    const between = 70 - hard * 15;
    crack(x0, w1);
    crack(x0 + w1 + between, w2);
    fish(x0 + w1 + between / 2 - 10, ground - PENGUIN_SIZE.h - 75, random() < 0.08);
    length = w1 + between + w2;
  }
  game.next = length + 190 + random() * (230 - hard * 90);
  return kind;
}

// Whether the penguin's middle has ice under it at `x`.
function onIce(game, x) {
  return !game.gaps.some((gap) => x + PENGUIN_SIZE.w * 0.35 > gap.x && x + PENGUIN_SIZE.w * 0.65 < gap.x + gap.w);
}

// A fish's height right now: it bobs gently.
export function fishY(game, fish) {
  return fish.y + Math.sin(game.time * 3 + fish.bob) * 3;
}

// Move the world on by `dt` seconds. Everything goes by time, not by frames,
// so it moves the same at any frame rate. Returns what ended the round
// ("Splash!" or "Bonk!"), or null while it goes on.
export function step(game, dt) {
  game.time += dt;
  game.speed = Math.min(TOP_SPEED, START_SPEED + game.time * SPEED_UP);
  const move = game.speed * dt;
  game.dist += move;
  game.far += move * 0.15;
  game.near += move * 0.4;
  for (const list of [game.gaps, game.blocks, game.fishes]) for (const thing of list) thing.x -= move;
  game.gaps = game.gaps.filter((gap) => gap.x + gap.w > -10);
  game.blocks = game.blocks.filter((block) => block.x + block.w > -10);
  game.fishes = game.fishes.filter((fish) => fish.x > -30 && !fish.caught);
  game.next -= move;
  if (game.next <= 0) spawn(game);

  const floor = floorY(game);
  const wasAbove = game.y <= floor + 1;
  game.vy += (game.holding && game.vy < 0 ? GRAVITY_HELD : GRAVITY) * dt;
  game.y += game.vy * dt;
  // It lands only from above: once in a crack, the ice sliding past can't
  // lift it out.
  if (game.y >= floor && wasAbove && onIce(game, game.x)) {
    game.y = floor;
    game.vy = 0;
  }
  if (game.y > game.height) return end(game, "Splash!");
  const { w, h } = PENGUIN_SIZE;
  for (const block of game.blocks) {
    if (game.x + w - 6 > block.x && game.x + 6 < block.x + block.w && game.y + h > game.ground - block.h + 3) {
      return end(game, "Bonk!");
    }
  }
  for (const fish of game.fishes) {
    if (Math.abs(fish.x + 10 - (game.x + w / 2)) < 20 && Math.abs(fishY(game, fish) + 4 - (game.y + h / 2)) < 24) {
      fish.caught = true;
      if (fish.gold) game.golden += 1;
      else game.fish += 1;
    }
  }
  return null;
}

function end(game, how) {
  game.how = how;
  game.holding = false;
  return how;
}

export function metres(game) {
  return Math.floor(game.dist / PX_PER_M);
}

export function points(game) {
  return metres(game) + game.fish * FISH_POINTS + game.golden * GOLDEN_POINTS;
}

// The sky moves from day to evening (250 m) to night (600 m), each step
// blending in slowly over the 120 metres before it.
const SKIES = [
  { at: 0, sky: "#eef4fb", far: "#d7e6f7", near: "#c3d9f2", text: "#1b2a4a" },
  { at: 250, sky: "#f6e9e0", far: "#e8d6d6", near: "#d6c3cf", text: "#1b2a4a" },
  { at: 600, sky: "#2b3557", far: "#3a466b", near: "#4a5880", text: "#eef4fb" },
];
const BLEND = 120;

function mix(a, b, t) {
  const parts = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [from, to] = [parts(a), parts(b)];
  return `rgb(${from.map((v, i) => Math.round(v + (to[i] - v) * t)).join(",")})`;
}

export function skyAt(m) {
  let i = SKIES.length - 1;
  while (i > 0 && m < SKIES[i].at) i -= 1;
  const a = SKIES[i];
  const b = SKIES[i + 1] ?? a;
  const t = b === a ? 0 : Math.max(0, Math.min(1, (m - (b.at - BLEND)) / BLEND));
  return {
    sky: mix(a.sky, b.sky, t),
    far: mix(a.far, b.far, t),
    near: mix(a.near, b.near, t),
    text: t < 0.5 ? a.text : b.text,
  };
}

// The round in a few words, for the end panel.
export function summary(game) {
  const golden = game.golden ? ` and ${game.golden} golden` : "";
  return golden ? `${metres(game)} m, ${game.fish} fish${golden}` : `${metres(game)} m and ${game.fish} fish`;
}

// The small boxes at the top: metres and fish on the left, points on the right.
export function scoreBoxes(game) {
  return [
    { value: `${metres(game)}`, word: "m" },
    { icon: "fish", value: `${game.fish}` },
    { value: `${points(game)}`, word: "points", right: true },
  ];
}

export const PENGUIN_BREAK = {
  id: "penguin",
  title: "Penguin break",
  how: ["Space or a click to jump, hold to jump higher.", "Fish are 10 points, golden ones 50."],
  newGame,
  press,
  release,
  step,
  resize,
  points,
  summary,
  scoreBoxes,
};
