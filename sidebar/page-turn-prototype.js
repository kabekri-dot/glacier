// PROTOTYPE, throw away: three page turns (curl, lift, notepad) on Glacier's paper.

const PAGES = [
  ["Trip to Lisbon", "Tram 28 early, before the crowds.", "Pastéis de Belém, the queue moves fast.", "Miradouro da Graça at sunset.", "", "Ask Rita about the fado bar."],
  ["Packing", "Light jacket, it gets windy at night.", "Good shoes, the hills are steep.", "Adapter? No, same plugs.", "", "Camera battery charged."],
  ["Money", "Hotel paid, 3 nights.", "Lisboa Card for 48 hours.", "Keep coins for the tram.", "", "Split dinners with Sam."],
];

const stage = document.getElementById("stage");
const params = new URLSearchParams(location.search);
let variant = params.get("variant") || "curl";
let index = 0;
let busy = false;
let slow = false;

function makePage(i) {
  const el = document.createElement("div");
  el.className = "page";
  const [title, ...lines] = PAGES[i];
  el.innerHTML = `<span class="no">${i + 1} of ${PAGES.length}</span><h1>${title}</h1>` + lines.map((l) => `<p>${l || "&nbsp;"}</p>`).join("");
  return el;
}

function show(i) {
  stage.replaceChildren(makePage(i));
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function animate(ms, draw) {
  return new Promise((done) => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      draw(ease(t));
      if (t < 1) requestAnimationFrame(frame);
      else done();
    }
    requestAnimationFrame(frame);
  });
}

// Curl: the bottom right corner peels over to the left. The fold is the line
// halfway between the corner and where the corner has been pulled to.
function clip(poly, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ka = keep(a);
    const kb = keep(b);
    if (ka >= 0) out.push(a);
    if (ka * kb < 0) {
      const s = ka / (ka - kb);
      out.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  }
  return out;
}

const pts = (poly) => poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

function curlFrame(sheet, svg, t, W, H) {
  const C = [W, H];
  const P = [W - t * 2.05 * W, H - Math.sin(Math.PI * t) * H * 0.35];
  const n = [C[0] - P[0], C[1] - P[1]];
  const len = Math.hypot(n[0], n[1]);
  if (len < 0.5) {
    sheet.style.clipPath = "none";
    svg.innerHTML = "";
    return;
  }
  const u = [n[0] / len, n[1] / len];
  const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
  const side = (X) => (X[0] - M[0]) * u[0] + (X[1] - M[1]) * u[1];
  const rect = [[0, 0], [W, 0], [W, H], [0, H]];
  const front = clip(rect, (X) => -side(X));
  const flap = clip(rect, side).map((X) => {
    const d = side(X);
    return [X[0] - 2 * d * u[0], X[1] - 2 * d * u[1]];
  });
  sheet.style.clipPath = front.length ? `polygon(${front.map(([x, y]) => `${x}px ${y}px`).join(",")})` : "polygon(0 0,0 0,0 0)";
  const shadeEnd = [M[0] - u[0] * 60, M[1] - u[1] * 60];
  const backEnd = [M[0] + u[0] * -len * 0.5, M[1] + u[1] * -len * 0.5];
  svg.innerHTML = `
    <defs>
      <linearGradient id="shade" gradientUnits="userSpaceOnUse" x1="${M[0]}" y1="${M[1]}" x2="${shadeEnd[0]}" y2="${shadeEnd[1]}">
        <stop offset="0" stop-color="#1b2a4a" stop-opacity="0.22"/><stop offset="1" stop-color="#1b2a4a" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="back" gradientUnits="userSpaceOnUse" x1="${M[0]}" y1="${M[1]}" x2="${backEnd[0]}" y2="${backEnd[1]}">
        <stop offset="0" stop-color="#c9d8ea"/><stop offset="0.18" stop-color="#f4f8fd"/><stop offset="0.7" stop-color="#e6eef8"/><stop offset="1" stop-color="#d6e2f0"/>
      </linearGradient>
      <filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="-4" dy="3" stdDeviation="7" flood-color="#1b2a4a" flood-opacity="0.28"/></filter>
    </defs>
    ${front.length ? `<polygon points="${pts(front)}" fill="url(#shade)"/>` : ""}
    ${flap.length ? `<polygon points="${pts(flap)}" fill="url(#back)" filter="url(#drop)"/>` : ""}`;
}

// Pixel curl, drawn the way a pixel artist would: the turning page is painted
// on a coarse grid (one art pixel = S screen pixels) in a small palette. The
// page rolls over a cylinder at the fold, the ruled lines bend round the roll,
// a one pixel outline sits where the page lies over another, the shadow is an
// ordered dither, and it plays on twelve frames a second, not sixty.
const S = 3;
const PAL = {
  outline: [111, 141, 181],
  shade3: [160, 184, 216],
  shade2: [196, 214, 236],
  base: [228, 237, 248],
  light: [243, 248, 254],
  hi: [255, 255, 255],
  back: [233, 240, 249],
  rule: [218, 229, 243],
  ink: [27, 42, 74],
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const RULE_TOP = 52; // 3.25rem, where the first row starts
const LINE = 29;

function pixelArtFrame(sheet, canvas, t, W, H) {
  const gw = canvas.width;
  const gh = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(gw, gh);
  const C = [W, H];
  const P = [W - t * 2.15 * W, H - Math.sin(Math.PI * t) * H * 0.35];
  const n = [C[0] - P[0], C[1] - P[1]];
  const len = Math.hypot(n[0], n[1]);
  if (len < 0.5) {
    sheet.style.clipPath = "none";
    ctx.clearRect(0, 0, gw, gh);
    return;
  }
  const u = [n[0] / len, n[1] / len];
  const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
  // The roll is widest mid-turn and tightens as the page settles.
  const r = S * (3 + 9 * Math.sin(Math.PI * Math.min(1, t * 1.3)));
  const inPage = (x, y) => x >= 0 && x <= W && y >= 0 && y <= H;
  const ruleAt = (y) => {
    const k = (y - RULE_TOP) % LINE;
    return y > RULE_TOP && k >= LINE - 6 - S && k < LINE - 6;
  };
  // What each art pixel shows: 0 the page below, 1 the flat front of the
  // turning page (the real page, drawn by the browser), 2 front of the roll,
  // 3 back of the roll, 4 the flat back laid over.
  const kind = new Uint8Array(gw * gh);
  const col = new Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = (i + 0.5) * S;
      const y = (j + 0.5) * S;
      const d = (x - M[0]) * u[0] + (y - M[1]) * u[1];
      const at = (s) => [x + (s - d) * u[0], y + (s - d) * u[1]];
      const idx = j * gw + i;
      // Topmost first: the flat back, then the roll's back, then its front.
      if (d <= 0) {
        const s = Math.PI * r - d;
        const [ox, oy] = at(s);
        if (inPage(ox, oy)) {
          kind[idx] = 4;
          col[idx] = ruleAt(oy) ? PAL.rule : PAL.back;
          continue;
        }
      }
      if (d >= 0 && d <= r) {
        const sb = Math.PI * r - r * Math.asin(d / r);
        const [bx, by] = at(sb);
        if (inPage(bx, by)) {
          const a = sb / r; // pi/2 .. pi
          kind[idx] = 3;
          col[idx] = a < 1.75 ? PAL.shade3 : a < 2.05 ? PAL.shade2 : a < 2.35 ? PAL.hi : a < 2.75 ? PAL.light : ruleAt(by) ? PAL.rule : PAL.back;
          continue;
        }
        const sf = r * Math.asin(d / r);
        const [fx, fy] = at(sf);
        if (inPage(fx, fy)) {
          const a = sf / r; // 0 .. pi/2
          kind[idx] = 2;
          const c = a < 0.55 ? PAL.base : a < 1.0 ? PAL.shade2 : a < 1.35 ? PAL.shade3 : PAL.outline;
          col[idx] = c;
          continue;
        }
      }
      kind[idx] = d < 0 ? 1 : 0;
    }
  }
  const put = (idx, c, a = 255) => {
    img.data.set([c[0], c[1], c[2], a], idx * 4);
  };
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const idx = j * gw + i;
      const k = kind[idx];
      const nb = (di, dj) => {
        const ii = i + di;
        const jj = j + dj;
        return ii < 0 || jj < 0 || ii >= gw || jj >= gh ? -1 : kind[jj * gw + ii];
      };
      if (k >= 2) {
        // Outline only where the turning page lies over another page.
        const edge = [nb(1, 0), nb(-1, 0), nb(0, 1), nb(0, -1)].some((m) => m === 0 || (k >= 3 && m === 1));
        put(idx, edge ? PAL.outline : col[idx]);
      } else {
        // Shadow: light from the top left, so it falls down and right, as
        // an ordered dither that thins out with distance.
        let near = 0;
        for (let s = 1; s <= 4; s++) {
          if (nb(-s, -s) >= 2 || nb(-s, 0) >= 2 || nb(0, -s) >= 2) {
            near = 5 - s;
            break;
          }
        }
        if (near && BAYER[(j % 4) * 4 + (i % 4)] < near * 3) put(idx, PAL.ink, 40);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  // The browser draws the flat front with its real text; clip it to its part.
  const rect = [[0, 0], [W, 0], [W, H], [0, H]];
  const side = (X) => (X[0] - M[0]) * u[0] + (X[1] - M[1]) * u[1];
  const front = clip(rect, (X) => -side(X));
  sheet.style.clipPath = front.length ? `polygon(${front.map(([x, y]) => `${x}px ${y}px`).join(",")})` : "polygon(0 0,0 0,0 0)";
}

async function pixelCurl(dir, W, H, ms) {
  const turning = dir > 0 ? index : index - 1;
  const under = dir > 0 ? index + 1 : index;
  const sheet = makePage(turning);
  const canvas = document.createElement("canvas");
  canvas.className = "overlay pixel-canvas";
  canvas.width = Math.ceil(W / S);
  canvas.height = Math.ceil(H / S);
  canvas.style.width = `${canvas.width * S}px`;
  canvas.style.height = `${canvas.height * S}px`;
  stage.replaceChildren(makePage(under), sheet, canvas);
  // Twelve frames a second: only redraw when the frame number changes.
  const frames = Math.max(8, Math.round(ms / 83));
  let last = -1;
  await animate(ms, (t) => {
    const f = Math.round(t * frames);
    if (f === last) return;
    last = f;
    const q = f / frames;
    pixelArtFrame(sheet, canvas, dir > 0 ? q : 1 - q, W, H);
  });
}

async function curl(dir, W, H, ms) {
  // Forward: the old page curls away over the new one. Back: the page before
  // curls back down over the current one (the same frames, played backwards).
  const turning = dir > 0 ? index : index - 1;
  const under = dir > 0 ? index + 1 : index;
  const sheet = makePage(turning);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("overlay");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  stage.replaceChildren(makePage(under), sheet, svg);
  await animate(ms, (t) => curlFrame(sheet, svg, dir > 0 ? t : 1 - t, W, H));
}

// Lift: the page lifts off the pad with a soft shadow and slides away to the left.
async function lift(dir, W, H, ms) {
  const turning = dir > 0 ? index : index - 1;
  const under = dir > 0 ? index + 1 : index;
  const below = makePage(under);
  const dim = Object.assign(document.createElement("div"), { className: "overlay" });
  dim.style.background = "#1b2a4a";
  const sheet = makePage(turning);
  sheet.style.transformOrigin = "0% 100%";
  stage.replaceChildren(below, dim, sheet);
  const frames = [
    { transform: "translate(0,0) rotate(0) scale(1)", boxShadow: "0 0 0 rgba(27,42,74,0)" },
    { transform: "translate(-4px,-10px) rotate(-1deg) scale(1.015)", boxShadow: "6px 14px 28px rgba(27,42,74,0.25)", offset: 0.3 },
    { transform: `translate(${-W * 1.15}px,-30px) rotate(-8deg) scale(1.02)`, boxShadow: "10px 20px 40px rgba(27,42,74,0.15)" },
  ];
  const dims = [{ opacity: 0.12 }, { opacity: 0.08, offset: 0.3 }, { opacity: 0 }];
  const opts = { duration: ms, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards", direction: dir > 0 ? "normal" : "reverse" };
  await Promise.all([sheet.animate(frames, opts).finished, dim.animate(dims, opts).finished]);
}

// Notepad: the page flips up over the top edge, as on a pad bound at the top.
async function flip(dir, W, H, ms) {
  const turning = dir > 0 ? index : index - 1;
  const under = dir > 0 ? index + 1 : index;
  const below = makePage(under);
  const dim = Object.assign(document.createElement("div"), { className: "overlay" });
  dim.style.background = "linear-gradient(#1b2a4a, transparent 40%)";
  const sheet = document.createElement("div");
  sheet.className = "overlay";
  sheet.style.transformOrigin = "50% 0";
  sheet.style.transformStyle = "preserve-3d";
  const front = makePage(turning);
  front.classList.add("face");
  const shade = Object.assign(document.createElement("div"), { className: "overlay" });
  shade.style.background = "linear-gradient(transparent, #1b2a4a)";
  front.append(shade);
  const back = Object.assign(document.createElement("div"), { className: "face back-face" });
  sheet.append(front, back);
  stage.replaceChildren(below, dim, sheet);
  const opts = { duration: ms, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards", direction: dir > 0 ? "normal" : "reverse" };
  await Promise.all([
    sheet.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(178deg)" }], opts).finished,
    shade.animate([{ opacity: 0 }, { opacity: 0.25 }], opts).finished,
    dim.animate([{ opacity: 0.18 }, { opacity: 0 }], opts).finished,
  ]);
}

const TURNS = { curl: [curl, 1000], pixel: [pixelCurl, 1000], lift: [lift, 750], flip: [flip, 850] };

async function turn(dir) {
  if (busy) return;
  if (dir > 0 && index >= PAGES.length - 1) return;
  if (dir < 0 && index <= 0) return;
  busy = true;
  const [play, ms] = TURNS[variant];
  await play(dir, stage.clientWidth, stage.clientHeight, slow ? ms * 3 : ms);
  index += dir;
  show(index);
  busy = false;
}

function pick(v) {
  variant = v;
  history.replaceState(null, "", `?variant=${v}`);
  document.querySelectorAll("[data-variant]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.variant === v)));
}

document.querySelectorAll("[data-variant]").forEach((b) => b.addEventListener("click", () => pick(b.dataset.variant)));
document.getElementById("next").addEventListener("click", () => turn(1));
document.getElementById("back").addEventListener("click", () => turn(-1));
document.getElementById("slow").addEventListener("click", (e) => {
  slow = !slow;
  e.currentTarget.setAttribute("aria-pressed", String(slow));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "PageDown") turn(1);
  if (e.key === "ArrowLeft" || e.key === "PageUp") turn(-1);
});

pick(TURNS[variant] ? variant : "curl");
show(index);
