// The hidden games' frame (#129): a canvas over the whole sidebar that plays
// the game of the paper in use. The round itself (ready, play, pause, over,
// the panels' words and the top 5) is src/game-frame.mjs; each game's view
// draws its own world. This runs the loop at the screen's frame rate, draws
// the score boxes and the panels in the game's paper colours with stepped
// pixel frames, and forwards the keys. Space, ↑, a click or a tap goes to the
// game; P pauses, and so does leaving the tab or window; Esc goes straight
// back to the note. Each round's points go into the Notebook's top 5, which
// syncs with the notes.
//
//   createGameFrame({ canvas, notebook, views, onScoreKept, onClose })
//     views           the built games' views by id: { game, colors, icon, boxIcons, draw }
//     onScoreKept()   a round's points were kept, so sync can send them
//     onClose()       the game went away: put the caret back in the note
//   .open(paper)   .isOpen()
import { gameFor, newFrame, press, release, togglePause, pause, tick, resize, panel, seededRandom } from "../src/game-frame.mjs";

// Frames further apart than this (a stall) don't jump the world ahead.
const LONGEST_FRAME = 0.033;

// The medals for places 1 to 3: gold, silver and bronze.
const MEDAL = ["..MM..", ".MMMM.", "MMLMMM", "MMMMMM", ".MMMM.", "..MM.."];
const MEDAL_COLORS = { gold: "#e2b33a", silver: "#b9c2cc", bronze: "#c98a52" };

// The colours every game shares, made from its paper: ink, soft, accent and
// rule, with a panel fill and a highlight for the new score.
export function paperColors(p) {
  return {
    chip: p.chip ?? "rgba(255,255,255,0.85)",
    chipEdge: p.chipEdge ?? p.rule,
    chipInk: p.ink,
    chipSoft: p.soft,
    panel: p.panel ?? "#ffffff",
    panelEdge: p.panelEdge ?? p.rule,
    panelInk: p.ink,
    panelSoft: p.soft,
    panelAccent: p.accent,
    highlight: p.highlight ?? "rgba(0,0,0,0.06)",
  };
}

// The drawing helpers a game's view gets: pixel art and text.
function drawingKit(ctx) {
  function sprite(rows, x, y, palette, px = 3) {
    rows.forEach((row, j) => {
      [...row].forEach((c, i) => {
        if (c === "." || !palette[c]) return;
        ctx.fillStyle = palette[c];
        ctx.fillRect(Math.round(x) + i * px, Math.round(y) + j * px, px, px);
      });
    });
  }
  function text(words, x, y, size, color, align = "center", weight = 700) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(words, x, y);
  }
  const spriteSize = (rows, px = 3) => ({ w: rows[0].length * px, h: rows.length * px });
  return { ctx, sprite, text, spriteSize };
}

export function createGameFrame({ canvas, notebook, views, onScoreKept = () => {}, onClose = () => {} }) {
  const ctx = canvas.getContext("2d");
  const kit = drawingKit(ctx);
  const { sprite, text, spriteSize } = kit;
  let frame = null;
  let view = null;
  let running = false;
  let last = 0;

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

  // The game of `paper`, or Penguin break while that paper's isn't built.
  function open(paper) {
    if (running) return;
    view = views[gameFor(paper, Object.keys(views))];
    canvas.hidden = false;
    canvas.setAttribute("aria-label", `${view.game.title}. Space to start, P to pause, Escape to go back to your note.`);
    document.activeElement?.blur();
    const { width, height } = size();
    frame = newFrame({ game: view.game, width, height, random: seededRandom(Date.now()), keepScore: notebook.keepScore });
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function close() {
    running = false;
    canvas.hidden = true;
    frame = null;
    onClose();
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(LONGEST_FRAME, (now - last) / 1000 || 0);
    last = now;
    if (tick(frame, dt)) onScoreKept();
    draw();
    requestAnimationFrame(loop);
  }

  // --- Drawing ---------------------------------------------------------------

  function draw() {
    view.draw(kit, frame.world);
    scoreBoxes();
    const shown = panel(frame);
    if (shown) drawPanel(shown);
  }

  // A box with stepped pixel corners, the frame for every score and panel.
  function pixelBox(x, y, w, h, fill, edge, step = 3) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = edge;
    ctx.fillRect(x + step, y, w - 2 * step, h);
    ctx.fillRect(x, y + step, w, h - 2 * step);
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2 * step, y + step, w - 4 * step, h - 2 * step);
    ctx.fillRect(x + step, y + 2 * step, w - 2 * step, h - 4 * step);
  }

  // The small boxes at the top: down the left, and one on the right.
  function scoreBoxes() {
    let left = 14;
    for (const box of frame.game.scoreBoxes(frame.world)) {
      if (box.right) scoreBox(frame.width - 14, 14, box, true);
      else {
        scoreBox(14, left, box, false);
        left += 36;
      }
    }
  }

  // One box: the game's pixel icon or nothing, a value and its word.
  function scoreBox(x, y, { icon, value, word }, alignRight) {
    const c = view.colors;
    const art = icon ? view.boxIcons[icon] : null;
    ctx.font = "700 16px Montserrat, system-ui, sans-serif";
    const valueWidth = ctx.measureText(value).width;
    ctx.font = "600 10px Montserrat, system-ui, sans-serif";
    const wordWidth = word ? ctx.measureText(word).width : 0;
    const iconWidth = art ? spriteSize(art.rows, 2).w + 8 : 0;
    const w = Math.ceil(16 + iconWidth + valueWidth + (word ? wordWidth + 6 : 0));
    const boxLeft = alignRight ? x - w : x;
    pixelBox(boxLeft, y, w, 30, c.chip, c.chipEdge);
    if (art) sprite(art.rows, boxLeft + 9, y + 15 - spriteSize(art.rows, 2).h / 2, art.palette, 2);
    text(value, boxLeft + 8 + iconWidth, y + 21, 16, c.chipInk, "left");
    if (word) text(word, boxLeft + 8 + iconWidth + valueWidth + 5, y + 20, 10, c.chipSoft, "left", 600);
  }

  // The start, pause and end panels, in the game's paper colours.
  function drawPanel({ icon, title, lines, top, footer }) {
    const c = view.colors;
    const { width, height } = frame;
    const middle = width / 2;
    const iconSize = icon ? spriteSize(view.icon.rows, 4) : null;
    const w = Math.min(304, width - 36);
    const h = top ? 150 + top.length * 26 + 34 : 70 + lines.length * 22 + (iconSize ? iconSize.h + 8 : 0);
    const x = (width - w) / 2;
    const y = Math.max(70, (height - h) / 2 - 40);
    pixelBox(x, y, w, h, c.panel, c.panelEdge, 4);
    let at = y + 26;
    if (iconSize) {
      sprite(view.icon.rows, middle - iconSize.w / 2, at - 6, view.icon.palette, 4);
      at += iconSize.h + 8;
    }
    text(title, middle, at + 14, 21, c.panelAccent);
    lines.forEach((line, i) => text(line, middle, at + 42 + i * 22, 13, c.panelSoft, "center", 600));
    if (!top) return;
    const listTop = at + 42 + lines.length * 22 + 14;
    text("Your top 5", middle, listTop, 13, c.panelInk);
    top.forEach((row, i) => {
      const rowTop = listTop + 14 + i * 26;
      if (row.mine) {
        ctx.fillStyle = c.highlight;
        ctx.fillRect(x + 18, rowTop, w - 36, 22);
      }
      if (row.medal) sprite(MEDAL, x + 28, rowTop + 3, { M: MEDAL_COLORS[row.medal], L: "#ffffff" }, 3);
      else text(`${row.place}`, x + 37, rowTop + 16, 12, c.panelSoft);
      text(`${row.score}`, x + 58, rowTop + 16, 14, c.panelInk, "left", row.mine ? 800 : 600);
      const scoreWidth = ctx.measureText(`${row.score}`).width;
      text(row.word, x + 58 + scoreWidth + 5, rowTop + 16, 10, c.panelSoft, "left", 500);
      text(row.date, x + w - 28, rowTop + 16, 11, c.panelSoft, "right", 500);
    });
    text(footer, middle, y + h - 14, 11, c.panelSoft, "center", 500);
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
      else if (event.key === "p" || event.key === "P") togglePause(frame);
      else if ((event.key === " " || event.key === "ArrowUp") && !event.repeat) press(frame);
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (!running) return;
      event.stopPropagation();
      if (event.key === " " || event.key === "ArrowUp") release(frame);
    },
    true,
  );
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    press(frame);
  });
  window.addEventListener("pointerup", () => {
    if (running) release(frame);
  });
  document.addEventListener("visibilitychange", () => {
    if (running && document.hidden) pause(frame);
  });
  window.addEventListener("blur", () => {
    if (running) pause(frame);
  });
  window.addEventListener("resize", () => {
    if (!running) return;
    const { width, height } = size();
    resize(frame, width, height);
  });

  return { open, isOpen };
}
