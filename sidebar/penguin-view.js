// Penguin break's view (#128, #129): draws the Glacier paper's game world
// (the sky, the hills, the ice, the cracks, the blocks, the fish and the
// penguin) for the shared frame in sidebar/game-frame.js, which draws the
// score boxes and panels over it. The game itself is src/penguin-game.mjs.
import { PENGUIN_BREAK, fishY, metres, skyAt, PENGUIN, FISH, GOLD, BLOCK_LOW, BLOCK_TALL, PX } from "../src/penguin-game.mjs";
import { paperColors } from "./game-frame.js";

// Flat colours only, from the Glacier paper.
const C = {
  ice: "#f7fbff",
  iceEdge: "#cfe1f6",
  iceSide: "#b9d3ef",
  water: "#3f78c4",
  waterDeep: "#2f5f9f",
  ink: "#1b2a4a",
};
const PALETTE = {
  K: C.ink,
  W: "#ffffff",
  E: C.ink,
  O: "#f0a33a",
  F: "#e8833a",
  G: "#e9b93c",
  B: "#a9c8ec",
  L: "#dbeafa",
  H: "#ffffff",
  D: "#bcd5f0",
};

// Hills repeat every `step` pixels, so the offset wraps at `step`.
function hills(ctx, game, offset, color, height, step) {
  ctx.fillStyle = color;
  for (let x = -(offset % step); x < game.width + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, game.ground);
    ctx.lineTo(x + step / 2, game.ground - height);
    ctx.lineTo(x + step, game.ground);
    ctx.fill();
  }
}

function ice(ctx, game) {
  const { width, height, ground } = game;
  ctx.fillStyle = C.water;
  ctx.fillRect(0, ground, width, height - ground);
  let x = 0;
  const gaps = [...game.gaps].sort((a, b) => a.x - b.x);
  for (const gap of [...gaps, { x: width + 50, w: 0 }]) {
    if (gap.x > x) {
      ctx.fillStyle = C.ice;
      ctx.fillRect(x, ground, gap.x - x, height - ground);
      ctx.fillStyle = C.iceEdge;
      ctx.fillRect(x, ground, gap.x - x, 4);
      ctx.fillStyle = C.iceSide;
      ctx.fillRect(x, ground + 4, gap.x - x, 10);
    }
    ctx.fillStyle = C.waterDeep;
    ctx.fillRect(gap.x, ground + 30, gap.w, height - ground - 30);
    x = Math.max(x, gap.x + gap.w);
  }
}

function draw({ ctx, sprite }, game) {
  const sky = skyAt(metres(game));
  ctx.fillStyle = sky.sky;
  ctx.fillRect(0, 0, game.width, game.height);
  hills(ctx, game, game.far, sky.far, 120, 200);
  hills(ctx, game, game.near, sky.near, 60, 110);
  ice(ctx, game);
  for (const block of game.blocks) sprite(block.tall ? BLOCK_TALL : BLOCK_LOW, block.x, game.ground - block.h, PALETTE, PX);
  for (const fish of game.fishes) sprite(fish.gold ? GOLD : FISH, fish.x, fishY(game, fish), PALETTE, PX);
  sprite(PENGUIN, game.x, game.y, PALETTE, PX);
}

export const penguinView = {
  game: PENGUIN_BREAK,
  colors: paperColors({ ink: "#1b2a4a", soft: "#5b6b88", accent: "#3f78c4", rule: "#c7dcf2", panel: "#fbfdff", highlight: "#dceaf9" }),
  icon: { rows: PENGUIN, palette: PALETTE },
  boxIcons: { fish: { rows: FISH, palette: PALETTE } },
  draw,
};
