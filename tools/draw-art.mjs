// Draws Glacier's pixel art once (#19), so the extension only ships the
// finished files:
// - icons/glacier.svg and icons/glacier-<size>.png: the glacier on smooth sky
//   and water, used as the toolbar icon, the round settings button and the
//   settings header.
// - art/<name>.svg: one panorama per Nature paper, a strip of smooth sky and
//   water with pixel subjects, read left to right, that fades out upwards.
//
// A developer tool, never loaded by the extension. Run it again after
// changing the art:  node tools/draw-art.mjs
// The random numbers are seeded, so every run draws the same pictures.

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PAPERS } from "../src/look.mjs";

const out = (file) => new URL(`../${file}`, import.meta.url);

// ---------------------------------------------------------------- the icon

// 16 by 16 art pixels. "." is the smooth sky or water behind.
const ICON = [
  "................",
  "................",
  "................",
  "..........W.....",
  ".........WWb....",
  "....W...WWWbb...",
  "...WWb.WWWWWbb..",
  "..WWWbbWWWWWWbb.",
  ".WWWWWbWWWWWWWbb",
  "WWWWWWWWWWWWWWWb",
  "CWcWCWcWWcWCWcWc",
  "cccccccccccccccc",
  "................",
  "...ff......ff...",
  "........ff......",
  "................",
];
const ICON_COLOURS = { W: "#f4fbff", b: "#9ccbee", C: "#dcedfa", c: "#b7d9f3", f: "#e3f1fb" };
const ICON_SKY = ["#a9d4f5", "#e3f1fb"];
const ICON_WATER = ["#4a86cf", "#2c5d9e"];
// The sky ends and the water starts at this row.
const ICON_HORIZON = 10;

function iconSvg() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="128" height="128">`,
    `<defs>`,
    gradient("sky", ICON_SKY),
    gradient("water", ICON_WATER),
    `</defs>`,
    `<rect width="16" height="${ICON_HORIZON}" fill="url(#sky)"/>`,
    `<rect y="${ICON_HORIZON}" width="16" height="${16 - ICON_HORIZON}" fill="url(#water)"/>`,
    `<g shape-rendering="crispEdges">${pixelPaths(gridFromRows(ICON, ICON_COLOURS))}</g>`,
    `</svg>`,
  ].join("\n");
}

// The same picture as a PNG of size by size pixels, for the toolbar (Chrome
// takes no SVG there). Each art pixel becomes a square; the sky and water
// stay smooth.
function iconPng(size) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const at = (y + 0.5) / size * 16;
    const behind = at < ICON_HORIZON
      ? mix(ICON_SKY[0], ICON_SKY[1], at / ICON_HORIZON)
      : mix(ICON_WATER[0], ICON_WATER[1], (at - ICON_HORIZON) / (16 - ICON_HORIZON));
    for (let x = 0; x < size; x++) {
      const key = ICON[Math.floor(at)][Math.floor((x * 16) / size)];
      const colour = ICON_COLOURS[key] ? hexToRgb(ICON_COLOURS[key]) : behind;
      pixels.set([...colour, 255], (y * size + x) * 4);
    }
  }
  return png(size, size, pixels);
}

// ----------------------------------------------------------- the panoramas

// In art pixels; each art pixel is shown 3 CSS pixels wide, so the strip is
// 2100 by 108 pixels, wider than any sidebar.
const WIDTH = 700;
const HEIGHT = 36;
const PIXEL = 3;

// Each Nature paper's landscape: the smooth colours behind (sky top to
// bottom, then water or sand), where the horizon is, and what stands on it.
const LANDSCAPES = {
  glacier: { sky: ["#cfe5f8", "#eaf4fc"], ground: ["#8fb9e3", "#6a9bd2"], horizon: 27, draw: drawGlaciers },
  forest: { sky: ["#d9ead0", "#eef5e8"], ground: ["#9ec3c0", "#7aa8a6"], horizon: 28, draw: drawForest },
  ocean: { sky: ["#cfeaf3", "#ecf7fa"], ground: ["#79bccb", "#3f8fa6"], horizon: 22, draw: drawOcean },
  desert: { sky: ["#f6dfb8", "#fbefd9"], ground: ["#e9c896", "#dcb37c"], horizon: 27, draw: drawDesert },
  volcano: { sky: ["#ddd3cd", "#efe9e5"], ground: ["#b9aaa1", "#9d8b81"], horizon: 28, draw: drawVolcanoes },
  aurora: { sky: ["#0b1329", "#1a2848"], ground: ["#0d172e", "#08101f"], horizon: 27, draw: drawAurora },
};

function panoramaSvg(paper) {
  const land = LANDSCAPES[paper.art];
  const random = seeded(paper.name);
  const grid = emptyGrid(WIDTH, HEIGHT);
  const smooth = [];
  land.draw({ grid, random, horizon: land.horizon, smooth });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH * PIXEL}" height="${HEIGHT * PIXEL}">`,
    `<defs>`,
    gradient("sky", land.sky),
    gradient("ground", land.ground),
    // Opaque at the bottom, gone at the top, so the strip melts into the paper.
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/>`,
    `<stop offset="0.55" stop-color="#fff" stop-opacity="1"/>`,
    `</linearGradient>`,
    `<mask id="up" maskUnits="userSpaceOnUse" x="0" y="0" width="${WIDTH}" height="${HEIGHT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/>`,
    `</mask>`,
    ...smooth.filter((part) => part.defs).map((part) => part.defs),
    `</defs>`,
    `<g mask="url(#up)">`,
    // The paper itself first, so the ruled lines stop behind the picture,
    // then the picture at half strength, so it stays faint.
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${paper.paper}"/>`,
    `<g opacity="0.5">`,
    `<rect width="${WIDTH}" height="${land.horizon}" fill="url(#sky)"/>`,
    `<rect y="${land.horizon}" width="${WIDTH}" height="${HEIGHT - land.horizon}" fill="url(#ground)"/>`,
    ...smooth.map((part) => part.shape),
    `<g shape-rendering="crispEdges">${pixelPaths(grid)}</g>`,
    `</g>`,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

// Glacier: a far range of ice, glaciers of every size breaking off into the
// water, ice floes and the odd bird. The icon's glacier comes first.
function drawGlaciers({ grid, random, horizon }) {
  const far = ridge(random, horizon - 9, 4);
  for (let x = 0; x < WIDTH; x++) column(grid, x, far[x], horizon, "#d6e8f7");
  stamp(grid, ICON.slice(3, 12), ICON_COLOURS, 6, horizon - 7);
  for (let x = 40; x < WIDTH - 20; x += 25 + Math.floor(random() * 70)) {
    const width = 10 + Math.floor(random() * 34);
    const height = 4 + Math.floor(random() * (width / 3));
    peak(grid, random, x, width, height, horizon, { light: "#f4fbff", shade: "#a9d2f0" });
    for (let i = 0; i < width; i += 2 + Math.floor(random() * 3)) {
      set(grid, x + i, horizon - 1, random() < 0.5 ? "#c4e0f6" : "#e6f3fc");
    }
    run(grid, x + 2, horizon, width - 4, "#cfe5f8");
  }
  scatter(grid, random, WIDTH / 9, horizon + 2, HEIGHT - 1, (x, y) => run(grid, x, y, 2 + Math.floor(random() * 5), "#e6f3fc"));
  birds(grid, random, 9, 3, horizon - 14, "#7d9cbc");
}

// Forest: soft hills, then pines in clumps and clearings, a cabin and a deer
// now and then, and the trees mirrored in a lake.
function drawForest({ grid, random, horizon }) {
  const hills = ridge(random, horizon - 7, 4);
  for (let x = 0; x < WIDTH; x++) column(grid, x, hills[x], horizon, "#c3d8b6");
  let x = 2;
  while (x < WIDTH) {
    const clump = 3 + Math.floor(random() * 10);
    for (let i = 0; i < clump && x < WIDTH; i++) {
      const height = 7 + Math.floor(random() * 13);
      pine(grid, x + 3, height, horizon, random() < 0.5 ? "#4f7a4a" : "#3d6440");
      x += 4 + Math.floor(random() * 4);
    }
    const clearing = 6 + Math.floor(random() * 30);
    if (clearing > 20 && random() < 0.4) stamp(grid, CABIN, CABIN_COLOURS, x + 4, horizon - CABIN.length);
    else if (clearing > 12 && random() < 0.5) stamp(grid, DEER, DEER_COLOURS, x + 3, horizon - DEER.length);
    x += clearing;
  }
  for (let x = 0; x < WIDTH; x++) {
    if (grid[horizon - 2][x] && random() < 0.6) set(grid, x, horizon + 1 + Math.floor(random() * 2), "#5f8a64");
  }
  scatter(grid, random, WIDTH / 14, horizon + 3, HEIGHT - 1, (x, y) => run(grid, x, y, 3 + Math.floor(random() * 4), "#c8e0dc"));
  birds(grid, random, 6, 3, horizon - 18, "#6d8a62");
}

// Ocean: open sea with sailboats big and small, islands with a palm, a
// lighthouse, wave crests and gulls.
function drawOcean({ grid, random, horizon }) {
  stamp(grid, LIGHTHOUSE, LIGHTHOUSE_COLOURS, 8, horizon - LIGHTHOUSE.length + 1);
  for (let x = 40; x < WIDTH - 30; x += 35 + Math.floor(random() * 90)) {
    if (random() < 0.45) {
      const width = 12 + Math.floor(random() * 20);
      peak(grid, random, x, width, 2 + Math.floor(random() * 3), horizon + 1, { light: "#e9d9aa", shade: "#d6c18c" });
      stamp(grid, PALM, PALM_COLOURS, x + Math.floor(width / 2) - 2, horizon - PALM.length + 1 - 2);
    } else {
      const boat = random() < 0.5 ? SAILBOAT : SMALL_BOAT;
      const y = horizon + 1 + Math.floor(random() * (HEIGHT - horizon - boat.length - 1));
      stamp(grid, boat, BOAT_COLOURS, x, y - boat.length + 5);
    }
  }
  scatter(grid, random, WIDTH / 4, horizon + 1, HEIGHT - 1, (x, y) => run(grid, x, y, 2 + Math.floor(random() * 4), "#d8f0f5"));
  birds(grid, random, 14, 2, horizon - 6, "#5f8d9c");
}

// Desert: mesas far off, rolling dunes, cacti of all sizes, a camel, an
// oasis and a pixel sun.
function drawDesert({ grid, random, horizon }) {
  stamp(grid, SUN, { o: "#f6c56b", y: "#f9dc95" }, 30, 3);
  for (let x = 0; x < WIDTH; x += 60 + Math.floor(random() * 120)) {
    const width = 14 + Math.floor(random() * 26);
    const top = horizon - 6 - Math.floor(random() * 6);
    for (let i = 0; i < width; i++) {
      const edge = i < 2 || i >= width - 2 ? 2 : 0;
      column(grid, x + i, top + edge, horizon, i < width / 3 ? "#d99a72" : "#e3ac84");
    }
  }
  const dunes = ridge(random, horizon - 2, 3);
  for (let x = 0; x < WIDTH; x++) {
    column(grid, x, dunes[x], horizon + 2, "#e8c48c");
    set(grid, x, dunes[x], "#f2d6a4");
  }
  for (let x = 12; x < WIDTH; x += 18 + Math.floor(random() * 50)) {
    const base = dunes[x] + 1;
    const roll = random();
    if (roll < 0.12) stamp(grid, CAMEL, CAMEL_COLOURS, x, base - CAMEL.length);
    else if (roll < 0.2) stamp(grid, OASIS, OASIS_COLOURS, x, horizon + 4);
    else cactus(grid, random, x, base, 4 + Math.floor(random() * 9));
  }
  scatter(grid, random, WIDTH / 10, horizon + 3, HEIGHT - 1, (x, y) => run(grid, x, y, 2 + Math.floor(random() * 6), "#efd3a6"));
}

// Volcano: cones of every size, some smoking, with lava running down them
// and glowing rivers across the ash plain.
function drawVolcanoes({ grid, random, horizon }) {
  const far = ridge(random, horizon - 6, 3);
  for (let x = 0; x < WIDTH; x++) column(grid, x, far[x], horizon, "#cbbfb8");
  for (let x = 10; x < WIDTH - 20; x += 30 + Math.floor(random() * 80)) {
    const width = 16 + Math.floor(random() * 30);
    const height = 6 + Math.floor(random() * (width / 2.5));
    const middle = x + Math.floor(width / 2);
    const crater = horizon - height;
    peak(grid, random, x, width, height, horizon, { light: "#8c7f78", shade: "#6f6460", flat: 3 });
    run(grid, middle - 1, crater, 3, "#e0601f");
    let flow = middle;
    for (let y = crater + 1; y < horizon; y++) {
      flow += random() < 0.5 ? 0 : random() < 0.5 ? -1 : 1;
      set(grid, flow, y, y % 3 ? "#e0601f" : "#f2994a");
    }
    if (random() < 0.6) {
      for (let puff = 0; puff < 4; puff++) {
        const y = crater - 2 - puff * 3;
        run(grid, middle - 1 + puff, y, 2 + puff, "#b4aaa4");
        run(grid, middle + puff, y - 1, 1 + puff, "#c8c0bb");
      }
    }
  }
  scatter(grid, random, WIDTH / 16, horizon + 2, HEIGHT - 1, (x, y) => {
    run(grid, x, y, 4 + Math.floor(random() * 8), "#e0601f");
    run(grid, x + 2, y, 2, "#f2c14a");
  });
}

// Aurora: stars, a smooth ribbon of light across the night, dark mountains
// with snowy tops and the light mirrored in the lake.
function drawAurora({ grid, random, horizon, smooth }) {
  smooth.push({
    defs: [
      `<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">`,
      `<stop offset="0" stop-color="#9b7bf0" stop-opacity="0"/>`,
      `<stop offset="0.5" stop-color="#5fe0a0" stop-opacity="0.85"/>`,
      `<stop offset="1" stop-color="#5fe0a0" stop-opacity="0"/>`,
      `</linearGradient>`,
    ].join(""),
    shape: `<path d="${ribbon(random, 4, horizon - 12, 8)}" fill="url(#glow)"/>`,
  });
  scatter(grid, random, WIDTH / 5, 0, horizon - 10, (x, y) => set(grid, x, y, random() < 0.3 ? "#ffffff" : "#b9c6e6"));
  const foothills = ridge(random, horizon - 4, 3);
  for (let x = 0; x < WIDTH; x++) column(grid, x, foothills[x], horizon, "#1f2b48");
  for (let x = -10; x < WIDTH; x += 20 + Math.floor(random() * 45)) {
    const width = 18 + Math.floor(random() * 40);
    peak(grid, random, x, width, 6 + Math.floor(random() * (width / 3)), horizon, { light: "#33456c", shade: "#26365a" });
  }
  snow(grid, horizon - 11, "#c9d4ec");
  scatter(grid, random, WIDTH / 6, horizon + 1, HEIGHT - 1, (x, y) => run(grid, x, y, 2 + Math.floor(random() * 5), "#2f7f68"));
}

// ------------------------------------------------------- the small subjects

const CABIN = ["...r....", "..rrr...", ".rrrrr..", "rrrrrrr.", ".wwdww..", ".wwdww.."];
const CABIN_COLOURS = { r: "#8a4a3a", w: "#b98a5e", d: "#5a3a2a" };
const DEER = ["...b.b", "....bb", "....bb", "bbbbb.", "b...b."];
const DEER_COLOURS = { b: "#8a6a4a" };
const LIGHTHOUSE = ["..y..", ".rrr.", ".www.", ".rrr.", ".www.", ".rrr.", ".www.", "sssss"];
const LIGHTHOUSE_COLOURS = { y: "#f6d26b", r: "#d9584a", w: "#f8f8f4", s: "#9a8f80" };
const PALM = ["gg.gg", ".ggg.", "g.t.g", "..t..", "..t..", "..t.."];
const PALM_COLOURS = { g: "#4f9a6a", t: "#8a6a4a" };
const SAILBOAT = ["...w....", "...ww...", "...www..", "...wwww.", "...m....", "hhhhhhhh", ".hhhhhh."];
const SMALL_BOAT = ["..w...", "..ww..", "..m...", "hhhhhh", ".hhhh."];
const BOAT_COLOURS = { w: "#fbfbf6", m: "#6a5040", h: "#a85a3c" };
const SUN = [".oooo.", "oyyyyo", "oyyyyo", "oyyyyo", "oyyyyo", ".oooo."];
const CAMEL = [".....hh", "..bb.h.", ".bbbbb.", "bbbbbb.", ".l.l.l.", ".l.l.l."];
const CAMEL_COLOURS = { h: "#a8743f", b: "#b88550", l: "#8d6034" };
const OASIS = ["..wwwww..", ".wwwwwww.", "..wwwww.."];
const OASIS_COLOURS = { w: "#7fc0cc" };

// ------------------------------------------------------- drawing on a grid

// Each cell holds a colour, or null where the smooth sky and water show.
function emptyGrid(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(null));
}

function gridFromRows(rows, colours) {
  const grid = emptyGrid(rows[0].length, rows.length);
  stamp(grid, rows, colours, 0, 0);
  return grid;
}

function set(grid, x, y, colour) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = colour;
}

function run(grid, x, y, length, colour) {
  for (let i = 0; i < length; i++) set(grid, x + i, y, colour);
}

function column(grid, x, top, bottom, colour) {
  for (let y = top; y < bottom; y++) set(grid, x, y, colour);
}

function stamp(grid, rows, colours, left, top) {
  rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      if (colours[key]) set(grid, left + x, top + y, colours[key]);
    });
  });
}

// A mountain, glacier or island: stepped sides up to a peak, lit on the left
// and shaded on the right. "flat" leaves a crater on top.
function peak(grid, random, left, width, height, base, { light, shade, flat = 0 }) {
  const middle = width / 2;
  for (let i = 0; i < width; i++) {
    const slope = Math.max(0, 1 - Math.abs(i + 0.5 - middle) / middle);
    const top = base - Math.max(1, Math.round(Math.min(1, slope * 1.15) * height) - (Math.abs(i + 0.5 - middle) < flat / 2 ? 1 : 0));
    const lit = i + 0.5 < middle + (random() < 0.3 ? 1 : 0);
    column(grid, left + i, top, base, lit ? light : shade);
  }
}

// A pine of tiers that widen downwards, on a one pixel trunk.
function pine(grid, x, height, base, colour) {
  set(grid, x, base - 1, "#6b4a32");
  const crown = height - 1;
  for (let i = 0; i < crown; i++) {
    const half = Math.min(3, Math.floor((i % 4) / 2) + Math.floor(i / 4));
    run(grid, x - half, base - 1 - crown + i, half * 2 + 1, colour);
  }
}

// Snow on every top that reaches above the snow line.
function snow(grid, line, colour) {
  for (let x = 0; x < grid[0].length; x++) {
    const top = grid.findIndex((row) => row[x]);
    if (top >= 0 && top < line) column(grid, x, top, Math.min(line, top + 2), colour);
  }
}

function cactus(grid, random, x, base, height) {
  const green = random() < 0.5 ? "#6f9a5a" : "#5d8a4a";
  column(grid, x, base - height, base, green);
  if (height > 6) {
    const arm = base - 2 - Math.floor(random() * 3);
    run(grid, x - 2, arm, 2, green);
    column(grid, x - 2, arm - 3, arm, green);
    run(grid, x + 1, arm - 2, 2, green);
    column(grid, x + 2, arm - 4, arm - 2, green);
  }
}

function birds(grid, random, count, top, bottom, colour) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(random() * (WIDTH - 4));
    const y = top + Math.floor(random() * (bottom - top));
    set(grid, x, y, colour);
    set(grid, x + 1, y + 1, colour);
    set(grid, x + 2, y, colour);
  }
}

function scatter(grid, random, count, top, bottom, draw) {
  for (let i = 0; i < count; i++) {
    draw(Math.floor(random() * WIDTH), top + Math.floor(random() * (bottom - top + 1)));
  }
}

// The top edge of a range of hills: a few slow waves added together, so it
// wanders without repeating. One whole row per column, so it stays pixel art.
function ridge(random, middle, height) {
  const waves = Array.from({ length: 4 }, (_, i) => ({
    length: 20 + random() * 90 / (i + 1),
    shift: random() * 100,
    size: height / (i + 1),
  }));
  return Array.from({ length: WIDTH + 1 }, (_, x) =>
    Math.round(middle - waves.reduce((sum, w) => sum + w.size * Math.sin((x + w.shift) / w.length), 0)),
  );
}

// A smooth wavy band across the sky, for the aurora.
function ribbon(random, top, bottom, thickness) {
  const point = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const wave = (x, shift) => top + (bottom - top) * (0.5 + 0.5 * Math.sin(x / 47 + shift) * Math.cos(x / 113));
  const shift = random() * 6;
  const upper = [];
  const lower = [];
  for (let x = 0; x <= WIDTH; x += 10) {
    upper.push(point(x, wave(x, shift)));
    lower.unshift(point(x, wave(x, shift) + thickness * (0.6 + 0.4 * Math.sin(x / 31))));
  }
  return `M${upper.join(" L")} L${lower.join(" L")} Z`;
}

// Every run of same coloured cells in a row becomes one rectangle, grouped
// into one path per colour, so the files stay small.
function pixelPaths(grid) {
  const byColour = new Map();
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const colour = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === colour) end++;
      if (colour) {
        if (!byColour.has(colour)) byColour.set(colour, []);
        byColour.get(colour).push(`M${x} ${y}h${end - x}v1h${x - end}z`);
      }
      x = end;
    }
  });
  return [...byColour].map(([colour, parts]) => `<path fill="${colour}" d="${parts.join("")}"/>`).join("\n");
}

function gradient(id, [top, bottom]) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
}

// ---------------------------------------------------------------- helpers

// The same "random" numbers on every run, different for each name.
function seeded(name) {
  let state = [...name].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function mix(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return a.map((value, i) => Math.round(value + (b[i] - value) * amount));
}

// A minimal PNG writer: 8 bit RGBA, one zlib stream, no filters.
function png(width, height, pixels) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------ write them

mkdirSync(out("icons"), { recursive: true });
mkdirSync(out("art"), { recursive: true });
writeFileSync(out("icons/glacier.svg"), iconSvg() + "\n");
for (const size of [16, 32, 48, 128]) writeFileSync(out(`icons/glacier-${size}.png`), iconPng(size));
for (const paper of PAPERS.filter((p) => p.art)) {
  writeFileSync(out(`art/${paper.art}.svg`), panoramaSvg(paper) + "\n");
}
console.log("Drew the glacier icon and", PAPERS.filter((p) => p.art).length, "panoramas.");
