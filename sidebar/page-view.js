// Notes as pages (#108): the ‹ 1 of 3 › bar at the bottom of the paper and
// the pixel-art page turn. Which lines make a page is src/pages.mjs; this
// only draws.
//
//   createPageView({ onTurn, onNewPage })  onTurn(-1 or 1) for ‹ and ›;
//                                          onNewPage() for › on the last page
//   .bar                                   the bar, for the panel to place
//   .update({ index, count } or null)      redraw, or hide it
//   .turnFor(index, count, noteEl)         before a redraw: a turn to play once
//                                          page `index` of `count` is drawn, or
//                                          null
//   .forget()                              the next page drawn turns nothing

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

export function createPageView({ onTurn, onNewPage }) {
  const bar = element("nav", "page-bar");
  bar.setAttribute("aria-label", "Pages");
  bar.hidden = true;
  const back = button("page-bar-turn", "‹", "Page before");
  const count = element("span", "page-bar-count");
  const next = button("page-bar-turn", "›", "Next page");
  bar.append(back, count, next);

  let last = false;
  back.addEventListener("click", () => onTurn(-1));
  next.addEventListener("click", () => (last ? onNewPage() : onTurn(1)));

  // The page on screen and how many there were, or null before the first
  // page of a note is drawn.
  let shown = null;
  let shownCount = 0;
  let playing = null;

  // The page curls up from the bottom right corner and over to the left in
  // eight stepped frames, its back casting a hard pixel shadow (panel.css).
  // Turning back runs it the other way: the page before comes down over the
  // one that was there.
  function play(old, forward, noteEl) {
    const turn = element("div", forward ? "page-turn" : "page-turn is-back");
    turn.setAttribute("aria-hidden", "true");
    const curl = element("div", "page-turn-curl");
    curl.append(element("div", "page-turn-back"));
    if (forward) turn.append(sheet("page-turn-sheet", old), curl);
    else turn.append(sheet("page-turn-under", old), sheet("page-turn-sheet", stillCopy(noteEl)), curl);
    const done = () => {
      clearTimeout(timer);
      turn.remove();
      if (playing === done) playing = null;
    };
    const timer = setTimeout(done, 800);
    turn.addEventListener("animationend", done, { once: true });
    playing = done;
    document.body.append(turn);
  }

  return {
    bar,

    update(pages) {
      bar.hidden = !pages;
      if (!pages) return;
      const { index, count: total } = pages;
      count.textContent = `${index + 1} of ${total}`;
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
