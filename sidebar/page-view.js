// Notes as pages (#108, #122): the line under the top bar with ‹ 1 of 3 ›,
// a small delete and + New page, shown from two pages on; the faint New page
// at the end of the paper of a note of one page, with a × that hides it; and
// the page turn, a corner curling over. Which lines make a page and which
// controls show is src/pages.mjs; this only draws.
//
//   createPageView({ onTurn, onNewPage, onDelete, onHideEnd })
//                                          onTurn(-1 or 1) for ‹ and ›;
//                                          onNewPage() for either New page;
//                                          onDelete() once "Delete" is confirmed;
//                                          onHideEnd() for the × on the end button
//   .bar                                   the bar, for the panel to place
//   .end                                   the end button, for the panel to place
//   .update({ index, count } or null)      redraw, or hide it
//   .showEnd(lastEl or null, rowHeight)    the end button one row under lastEl,
//                                          or hidden
//   .turnFor(index, count, noteEl)         before a redraw: a turn to play once
//                                          page `index` of `count` is drawn, or
//                                          null
//   .forget()                              the next page drawn turns nothing

import { curlAt, easeTurn } from "../src/page-turn.mjs";

// The turn takes a second, gently in and out, to enjoy it.
const TURN_MS = 1000;
const SVG = "http://www.w3.org/2000/svg";

// An outline of points as a clip-path; nothing shows for an empty one.
function clip(outline) {
  return outline.length ? `polygon(${outline.map(([x, y]) => `${x}px ${y}px`).join(", ")})` : "polygon(0 0, 0 0, 0 0)";
}

// An outline of points as an SVG points list.
function points(outline) {
  return outline.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function svgElement(tag, attributes = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  return el;
}

// A gradient stop; the colour is a style so the paper's CSS colours apply.
function stop(offset, color, opacity = 1) {
  const el = svgElement("stop", { offset });
  el.style.stopColor = color;
  el.style.stopOpacity = opacity;
  return el;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(className, text, label) {
  const el = element("button", className, text);
  el.type = "button";
  el.title = label;
  el.setAttribute("aria-label", label);
  return el;
}

// A still copy of the paper, for the turn to show while the real one has
// already changed. Nothing in it can be typed in or clicked.
function stillCopy(noteEl) {
  const copy = noteEl.cloneNode(true);
  copy.removeAttribute("aria-label");
  for (const el of copy.querySelectorAll("[contenteditable]")) el.removeAttribute("contenteditable");
  return { copy, top: noteEl.getBoundingClientRect().top };
}

// One sheet of the turn: a paper with a copy of a page where it stood.
function sheet(className, { copy, top }) {
  const el = element("div", className);
  el.style.setProperty("--page-top", `${top}px`);
  copy.classList.add("page-turn-copy");
  copy.style.top = `${top}px`;
  el.append(copy);
  return el;
}

// The faint New page at the end of the paper, with its pixel page and the ×
// that hides it, which only shows on hover.
function endButton(onNewPage, onHideEnd) {
  const end = element("div", "page-end");
  end.hidden = true;
  const add = element("button", "page-end-add");
  add.type = "button";
  add.title = "Start a fresh page in this note";
  add.append(Object.assign(element("img", "page-end-icon"), { src: "../art/icon-page.svg", alt: "" }), "New page");
  add.addEventListener("click", onNewPage);
  const hide = button("page-end-hide", "×", "Hide this button");
  hide.addEventListener("click", onHideEnd);
  end.append(add, hide);
  return end;
}

export function createPageView({ onTurn, onNewPage, onDelete, onHideEnd }) {
  const end = endButton(onNewPage, onHideEnd);
  const bar = element("nav", "page-bar");
  bar.setAttribute("aria-label", "Pages");
  bar.hidden = true;
  const back = button("page-bar-turn", "‹", "Page before");
  const count = element("span", "page-bar-count");
  const next = button("page-bar-turn", "›", "Next page");
  const remove = button("page-bar-turn page-bar-delete", "", "Delete this page");
  remove.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M3 4.5 H13 M6.5 4.5 V3 H9.5 V4.5 M4.5 4.5 L5.3 13.5 H10.7 L11.5 4.5"/></svg>';
  // The quiet question before a page goes: its text and two small answers,
  // in the bar's place until answered.
  const add = button("page-bar-turn page-bar-new", "+ New page", "Start a fresh page at the end of this note");
  const question = element("span", "page-bar-question");
  const ask = element("span", "page-bar-ask");
  const yes = button("page-bar-turn page-bar-yes", "Delete", "Delete the page and everything on it");
  const no = button("page-bar-turn", "Keep", "Keep the page");
  question.append(ask, yes, no);
  question.hidden = true;
  bar.append(back, count, next, remove, add, question);

  let pageNumber = 1;
  back.addEventListener("click", () => onTurn(-1));
  next.addEventListener("click", () => onTurn(1));
  add.addEventListener("click", onNewPage);

  function asking(on) {
    question.hidden = !on;
    for (const el of [back, count, next, remove, add]) el.hidden = on;
  }
  remove.addEventListener("click", () => {
    ask.textContent = `Delete page ${pageNumber}?`;
    asking(true);
    no.focus();
  });
  no.addEventListener("click", () => asking(false));
  yes.addEventListener("click", () => {
    asking(false);
    onDelete();
  });

  // The page on screen and how many there were, or null before the first
  // page of a note is drawn.
  let shown = null;
  let shownCount = 0;
  let playing = null;

  // The bottom right corner curls up and over to the left (src/page-turn.mjs),
  // drawn smoothly on every screen frame: the flat part is a clip-path on a
  // still copy of the page, the folded back an SVG shape in the paper's own
  // colours, shaded at the crease, with a soft shadow on the page below, and
  // the flat page darkens a little toward the fold. Turning back plays it the
  // other way: the page before comes down over the one that was there.
  function play(old, forward, noteEl) {
    const turn = element("div", "page-turn");
    turn.setAttribute("aria-hidden", "true");
    const moving = sheet("page-turn-sheet", forward ? old : stillCopy(noteEl));
    const curl = svgElement("svg", { class: "page-turn-curl" });
    const defs = svgElement("defs");
    const shadeFill = svgElement("linearGradient", { id: "page-turn-shade", gradientUnits: "userSpaceOnUse" });
    shadeFill.append(stop(0, "var(--ink)", 0.2), stop(1, "var(--ink)", 0));
    const backFill = svgElement("linearGradient", { id: "page-turn-back", gradientUnits: "userSpaceOnUse" });
    backFill.append(
      stop(0, "color-mix(in srgb, var(--paper) 78%, var(--ink))"),
      stop(0.18, "color-mix(in srgb, var(--paper) 60%, white)"),
      stop(0.7, "var(--paper)"),
      stop(1, "color-mix(in srgb, var(--paper) 88%, var(--ink))"),
    );
    defs.append(shadeFill, backFill);
    const shade = svgElement("polygon", { fill: "url(#page-turn-shade)" });
    const back = svgElement("polygon", { class: "page-turn-back", fill: "url(#page-turn-back)" });
    curl.append(defs, shade, back);
    if (forward) turn.append(moving, curl);
    else turn.append(sheet("page-turn-under", old), moving, curl);
    const width = window.innerWidth;
    const height = window.innerHeight;
    curl.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const line = (el, [x1, y1], [x2, y2]) => {
      for (const [name, value] of Object.entries({ x1, y1, x2, y2 })) el.setAttribute(name, value.toFixed(1));
    };
    const show = (t) => {
      const { sheet: flat, back: folded, fold } = curlAt(width, height, easeTurn(forward ? t : 1 - t));
      moving.style.clipPath = clip(flat);
      shade.setAttribute("points", points(flat));
      back.setAttribute("points", points(folded));
      if (!fold) return;
      const { at, toward } = fold;
      // The crease's shadow on the flat page reaches 60 px; the back is
      // lit from the crease out to its far edge.
      const reach = Math.hypot(width, height) * 0.25;
      line(shadeFill, at, [at[0] - toward[0] * 60, at[1] - toward[1] * 60]);
      line(backFill, at, [at[0] - toward[0] * reach, at[1] - toward[1] * reach]);
    };
    let frame;
    const done = () => {
      cancelAnimationFrame(frame);
      turn.remove();
      if (playing === done) playing = null;
    };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / TURN_MS);
      if (t < 1) {
        show(t);
        frame = requestAnimationFrame(step);
      } else done();
    };
    show(0);
    frame = requestAnimationFrame(step);
    playing = done;
    document.body.append(turn);
  }

  return {
    bar,
    end,

    update(pages) {
      bar.hidden = !pages;
      if (!pages) return;
      const { index, count: total } = pages;
      if (index + 1 !== pageNumber) asking(false);
      pageNumber = index + 1;
      count.textContent = `${index + 1} of ${total}`;
      remove.hidden = total < 2 || !question.hidden;
      back.disabled = index === 0;
      next.disabled = index === total - 1;
    },

    // In the page, one row under the last line drawn, so it scrolls with
    // the text.
    showEnd(lastEl, rowHeight) {
      end.hidden = !lastEl;
      if (!lastEl) return;
      end.style.top = `${lastEl.getBoundingClientRect().bottom + window.scrollY + rowHeight}px`;
    },

    turnFor(index, count, noteEl) {
      const before = shown;
      const countBefore = shownCount;
      shown = index;
      shownCount = count;
      // Two pages joined by taking out a break is no turn.
      if (before === null || before === index || count < countBefore) return null;
      playing?.();
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
      const old = stillCopy(noteEl);
      return { play: (el) => play(old, index > before, el) };
    },

    forget() {
      shown = null;
    },
  };
}
