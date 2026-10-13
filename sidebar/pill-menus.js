// The small menus beside the ▾ in the pill bar: the ← box with your last
// notes (#81), the + menu for a new note (#68) and the ⋯ "This note" menu
// (#63). What each offers comes from src/menu-contents.mjs and
// src/new-note-choices.mjs; this draws them. Each opens under its button,
// and Esc or a second click on the button closes it. `beforeOpen()` closes
// whatever else is open, so only one shows at a time (#83).
import { lastNotesBox, noteMenu } from "../src/menu-contents.mjs";
import { newNoteChoices } from "../src/new-note-choices.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { menuButton, originIcon } from "./settings-view.js";

// Show `box` under `button`, or take it away, keeping aria-expanded in step.
function shown(box, button, open) {
  box.hidden = !open;
  if (!open) box.replaceChildren();
  button.setAttribute("aria-expanded", String(open));
}

// Esc closes the box while it is open.
function closeOnEscape(box, close) {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || box.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    true,
  );
}

// ← goes back to the note before in one click (`onBack`). Like the
// browser's back button, a right-click or holding it opens a small box with
// the last notes you were on, newest first (#81). A click on one opens it.
// Esc or a click outside closes the box, and ↑/↓ and Enter work too.
const HOLD_MS = 500;

export function createBackBox({ button, box, screen, notebook, openNote, onBack, beforeOpen }) {
  const close = () => shown(box, button, false);

  function open() {
    beforeOpen();
    box.replaceChildren();
    for (const { title, origin } of lastNotesBox(screen, notebook)) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "menu-item";
      item.append(originIcon(origin), title);
      item.addEventListener("click", () => {
        close();
        const found = notebook.note(title);
        if (found) openNote(found, { byPage: isOpenedByPage(found) });
      });
      box.append(item);
    }
    shown(box, button, true);
    box.querySelector("button")?.focus();
  }

  // A hold opens the box; the click that ends the hold doesn't also go back.
  let holdTimer = null;
  let held = false;
  button.addEventListener("pointerdown", () => {
    held = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      held = true;
      open();
    }, HOLD_MS);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
    button.addEventListener(type, () => clearTimeout(holdTimer));
  }
  button.addEventListener("click", () => {
    if (held) {
      held = false;
      return;
    }
    if (!box.hidden) close();
    else onBack();
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    clearTimeout(holdTimer);
    if (box.hidden) open();
    else close();
  });
  document.addEventListener("click", (event) => {
    if (!box.hidden && !event.target.closest(".back-box, .pill-back")) close();
  });
  closeOnEscape(box, close);
  document.addEventListener(
    "keydown",
    (event) => {
      if (box.hidden || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      event.preventDefault();
      const items = [...box.querySelectorAll("button")];
      const at = items.indexOf(document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    },
    true,
  );

  return { close };
}

// + opens a small menu: New note (blank) always, and on a website New note
// for this page (#68). `onWebsite()` says whether the tab is a website;
// `onPick(kind)` gets "page" or "blank".
export function createNewMenu({ button, box, onWebsite, onPick, beforeOpen }) {
  const close = () => shown(box, button, false);

  async function open() {
    beforeOpen();
    const choices = newNoteChoices({ onWebsite: await onWebsite() });
    box.replaceChildren();
    for (const choice of choices) {
      box.appendChild(
        menuButton(choice.label, choice.hint, () => {
          close();
          onPick(choice.kind);
        }),
      );
    }
    shown(box, button, true);
    box.querySelector("button").focus();
  }

  button.addEventListener("click", () => {
    if (!box.hidden) close();
    else open();
  });
  closeOnEscape(box, close);

  return { close };
}

// The ⋯ "This note" menu (#63): the actions for the open note only, under the
// note's name. What it offers is decided by noteMenu; `onAction(kind)` does it.
export function createNoteMenu({ button, box, screen, onAction, beforeOpen }) {
  const close = () => shown(box, button, false);

  function open() {
    const menu = noteMenu(screen.note(), { pinned: screen.pinned() });
    if (!menu) return;
    beforeOpen();
    screen.flush();
    box.replaceChildren();
    const heading = document.createElement("p");
    heading.className = "note-menu-heading";
    heading.textContent = menu.heading;
    box.appendChild(heading);
    for (const action of menu.actions) {
      box.appendChild(
        menuButton(action.label, action.hint, () => {
          close();
          onAction(action.kind);
        }),
      );
    }
    shown(box, button, true);
    box.querySelector("button").focus();
  }

  button.addEventListener("click", () => {
    if (!box.hidden) close();
    else open();
  });
  closeOnEscape(box, close);

  return {
    close,

    // The ⋯ shows only while a note is open.
    update() {
      button.hidden = !screen.note();
      if (!screen.note()) close();
    },
  };
}
