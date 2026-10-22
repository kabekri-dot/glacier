// Penguin break (#128): the hidden game drawn on a canvas over the whole
// sidebar. The game itself (the world, collisions, scoring) is
// src/penguin-game.mjs; this draws it at the screen's frame rate and forwards
// the keys. Space, ↑, a click or a tap jumps; P pauses, and so does leaving
// the tab or window; Esc goes straight back to the note. Each round's points
// go into the Notebook's top 5, which syncs with the notes.
//
//   createPenguinBreak({ canvas, notebook, onScoreKept, onClose })
//     onScoreKept()   a round's points were kept, so sync can send them
//     onClose()       the game went away: put the caret back in the note
//   .open()   .isOpen()
import {
  newGame,
  press,
  release,
  togglePause,
  pause,
  step,
  resize,
  fishY,
  metres,
  points,
  skyAt,
  seededRandom,
  resultLines,
  READY_LINES,
  PAUSED_LINES,
  AGAIN_LINE,
  PENGUIN,
  FISH,
  GOLD,
  BLOCK_LOW,
  BLOCK_TALL,
  PX,
} from "../src/penguin-game.mjs";

// The game's name in the top 5.
const GAME = "penguin";

// Flat colours only, from the Glacier paper.
const C = {
  ice: "#f7fbff",
  iceEdge: "#cfe1f6",
  iceSide: "#b9d3ef",
  water: "#3f78c4",
  waterDeep: "#2f5f9f",
  ink: "#1b2a4a",
  soft: "#5b6b88",
  card: "#fbfdff",
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
// Frames further apart than this (a stall) don't jump the world ahead.
const LONGEST_FRAME = 0.033;

export function createPenguinBreak({ canvas, notebook, onScoreKept = () => {}, onClose = () => {} }) {
  const ctx = canvas.getContext("2d");
  let game = null;
  let running = false;
  let last = 0;
  // The round's end as kept in the top 5: { top, best, score }.
  let result = null;

  function isOpen() {
    return running;
  }

  function size() {
    const box = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: box.width, height: box.height };
  }

  function open() {
    if (running) return;
    canvas.hidden = false;
    document.activeElement?.blur();
    const { width, height } = size();
    game = newGame({ width, height, random: seededRandom(Date.now()) });
    result = null;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function close() {
    running = false;
    canvas.hidden = true;
    game = null;
    onClose();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(LONGEST_FRAME, (now - last) / 1000 || 0);
    last = now;
    const before = game.mode;
    step(game, dt);
    if (before === "play" && game.mode === "over") keepRound();
    draw();
    requestAnimationFrame(frame);
  }

  function keepRound() {
    const score = points(game);
    result = { ...notebook.keepScore(GAME, score), score };
    onScoreKept();
  }

  function jump() {
    if (game.mode === "over") result = null;
    press(game);
  }

  // --- Drawing ---------------------------------------------------------------

  function sprite(rows, x, y) {
    rows.forEach((row, j) => {
      [...row].forEach((c, i) => {
        if (c === ".") return;
        ctx.fillStyle = PALETTE[c];
        ctx.fillRect(Math.round(x) + i * PX, Math.round(y) + j * PX, PX, PX);
      });
    });
  }

  // Hills repeat every `step` pixels, so the offset wraps at `step`.
  function hills(offset, color, height, step) {
    ctx.fillStyle = color;
    for (let x = -(offset % step); x < game.width + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, game.ground);
      ctx.lineTo(x + step / 2, game.ground - height);
      ctx.lineTo(x + step, game.ground);
      ctx.fill();
    }
  }

  function text(words, x, y, size, color = C.ink, align = "center", bold = true) {
    ctx.fillStyle = color;
    ctx.font = `${bold ? 700 : 400} ${size}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(words, x, y);
  }

  function ice() {
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

  function draw() {
    const sky = skyAt(metres(game));
    ctx.fillStyle = sky.sky;
    ctx.fillRect(0, 0, game.width, game.height);
    hills(game.far, sky.far, 120, 200);
    hills(game.near, sky.near, 60, 110);
    ice();
    for (const block of game.blocks) sprite(block.tall ? BLOCK_TALL : BLOCK_LOW, block.x, game.ground - block.h);
    for (const fish of game.fishes) sprite(fish.gold ? GOLD : FISH, fish.x, fishY(game, fish));
    sprite(PENGUIN, game.x, game.y);
    // Metres on the left with the fish under them, points on the right.
    text(`${metres(game)} m`, 16, 32, 18, sky.text, "left");
    sprite(FISH, 16, 44);
    text(`${game.fish}`, 42, 55, 13, sky.text, "left");
    text(`${points(game)}`, game.width - 16, 32, 18, sky.text, "right");
    text("points", game.width - 16, 50, 11, sky.text, "right", false);

    if (game.mode === "ready") card(READY_LINES);
    if (game.mode === "pause") card(PAUSED_LINES);
    if (game.mode === "over" && result) card(resultLines(game, result.best), result.top);
  }

  function card(lines, top = null) {
    const w = Math.min(300, game.width - 40);
    const h = top ? 120 + top.length * 22 + 40 : 96 + lines.length * 22;
    const x = (game.width - w) / 2;
    const y = 90;
    const middle = game.width / 2;
    ctx.fillStyle = C.card;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.iceEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    text(lines[0], middle, y + 36, 20);
    lines.slice(1).forEach((line, i) => text(line, middle, y + 64 + i * 22, 13, C.soft, "center", false));
    if (!top) return;
    text("Your top 5", middle, y + 116, 13);
    let marked = false;
    top.forEach((entry, i) => {
      const mine = !marked && entry.score === result.score;
      if (mine) marked = true;
      const row = y + 142 + i * 22;
      text(`${i + 1}.  ${entry.score} points`, x + 40, row, 13, mine ? C.water : C.ink, "left", mine);
      text(entry.date, x + w - 40, row, 12, C.soft, "right", false);
    });
    text(AGAIN_LINE, middle, y + h - 14, 11, C.soft, "center", false);
  }

  // --- Keys and pointer --------------------------------------------------------
  //
  // While the game is open every key is its own: on the window, in the
  // capture phase, so no sidebar shortcut runs under it.

  window.addEventListener(
    "keydown",
    (event) => {
      if (!running) return;
      event.stopPropagation();
      // A redraw behind the game may have put the caret back in the note;
      // no key may type into it.
      if (!event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
      if (event.key === "Escape") close();
      else if (event.key === "p" || event.key === "P") togglePause(game);
      else if ((event.key === " " || event.key === "ArrowUp") && !event.repeat) jump();
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (!running) return;
      event.stopPropagation();
      if (event.key === " " || event.key === "ArrowUp") release(game);
    },
    true,
  );
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    jump();
  });
  window.addEventListener("pointerup", () => {
    if (running) release(game);
  });
  document.addEventListener("visibilitychange", () => {
    if (running && document.hidden) pause(game);
  });
  window.addEventListener("blur", () => {
    if (running) pause(game);
  });
  window.addEventListener("resize", () => {
    if (!running) return;
    const { width, height } = size();
    resize(game, width, height);
  });

  return { open, isOpen };
}
