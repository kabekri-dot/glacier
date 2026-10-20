// Notes as pages (#108): the ‹ 1 of 3 › bar at the top of the paper, on
// the right of the note's header line, with a small delete, and the
// pixel-art page turn. Which lines make a page is src/pages.mjs; this
// only draws.
//
//   createPageView({ onTurn, onNewPage, onDelete })
//                                          onTurn(-1 or 1) for ‹ and ›;
//                                          onNewPage() for › on the last page;
//                                          onDelete() once "Delete" is confirmed
//   .bar                                   the bar, for the panel to place
//   .update({ index, count } or null)      redraw, or hide it
//   .turnFor(index, count, noteEl)         before a redraw: a turn to play once
//                                          page `index` of `count` is drawn, or
//                                          null
//   .forget()                              the next page drawn turns nothing

import { turnFrames } from "../src/page-turn.mjs";

// The turn: fourteen frames, 70 ms each (about a second, to enjoy it), in
// pixels of 8 px.
const FRAME_MS = 70;
const TURN = { count: 14, pixel: 8 };

// An outline of points as a clip-path; nothing shows for an empty one.
function clip(points) {
  return points.length ? `polygon(${points.map(([x, y]) => `${x}px ${y}px`).join(", ")})` : "polygon(0 0, 0 0, 0 0)";
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

export function createPageView({ onTurn, onNewPage, onDelete }) {
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
  const question = element("span", "page-bar-question");
  const ask = element("span", "page-bar-ask");
  const yes = button("page-bar-turn page-bar-yes", "Delete", "Delete the page and everything on it");
  const no = button("page-bar-turn", "Keep", "Keep the page");
  question.append(ask, yes, no);
  question.hidden = true;
  bar.append(back, count, next, remove, question);

  let last = false;
  let pageNumber = 1;
  back.addEventListener("click", () => onTurn(-1));
  next.addEventListener("click", () => (last ? onNewPage() : onTurn(1)));

  function asking(on) {
    question.hidden = !on;
    for (const el of [back, count, next, remove]) el.hidden = on;
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

  // The page folds up from the bottom right corner and over to the left in
  // eight frames drawn in big pixels (src/page-turn.mjs), its back casting a
  // hard pixel shadow (panel.css). Turning back runs the frames the other
  // way: the page before comes down over the one that was there.
  function play(old, forward, noteEl) {
    const turn = element("div", "page-turn");
    turn.setAttribute("aria-hidden", "true");
    const curl = element("div", "page-turn-curl");
    const back = element("div", "page-turn-back");
    curl.append(back);
    const moving = sheet("page-turn-sheet", forward ? old : stillCopy(noteEl));
    if (forward) turn.append(moving, curl);
    else turn.append(sheet("page-turn-under", old), moving, curl);
    const frames = turnFrames(window.innerWidth, window.innerHeight, TURN);
    if (!forward) frames.reverse();
    let at = 0;
    const show = () => {
      moving.style.clipPath = clip(frames[at].sheet);
      back.style.clipPath = clip(frames[at].back);
    };
    const done = () => {
      clearInterval(timer);
      turn.remove();
      if (playing === done) playing = null;
    };
    const timer = setInterval(() => {
      at += 1;
      if (at < frames.length) show();
      else done();
    }, FRAME_MS);
    show();
    playing = done;
    document.body.append(turn);
  }

  return {
    bar,

    update(pages) {
      bar.hidden = !pages;
      if (!pages) return;
      const { index, count: total } = pages;
      if (index + 1 !== pageNumber) asking(false);
      pageNumber = index + 1;
      count.textContent = `${index + 1} of ${total}`;
      remove.hidden = total < 2 || !question.hidden;
      back.disabled = index === 0;
      last = index === total - 1;
      next.textContent = last ? "+ New page" : "›";
      next.title = last ? "New page" : "Next page";
      next.setAttribute("aria-label", next.title);
      next.classList.toggle("is-new", last);
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
