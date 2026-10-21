// The small menus of the top bar (#121): the headings under the title, the
// + choice for a new note (#68) and the ⋯ quick actions for the open note
// (#63). What each offers comes from src/contents.mjs, src/new-note-choices.mjs
// and src/menu-contents.mjs; this draws them. Each opens under its button;
// Esc, a click outside or a second click on the button closes it, and up and
// down walk its rows. `beforeOpen()` closes whatever else is open, so only
// one shows at a time (#83).
import { titleHeadings } from "../src/contents.mjs";
import { newNoteChoices } from "../src/new-note-choices.mjs";
import { noteMenu, deleteNoteQuestion } from "../src/menu-contents.mjs";

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function pixelIcon(name, className = "bar-icon") {
  return Object.assign(element("img", className), { src: `../art/icon-${name}.svg`, alt: "" });
}

// One row of a menu: a pixel icon, the label with an optional quiet line
// under it, and the shortcut on the right, faint.
function menuRow({ icon, label, under = null, keys = null, hint }, onClick) {
  const button = element("button", "bar-item");
  button.type = "button";
  button.title = hint;
  const words = element("span", "bar-item-words", label);
  if (under) words.append(element("span", "bar-item-under", under));
  button.append(pixelIcon(icon), words);
  if (keys) button.append(element("span", "bar-item-keys", keys));
  button.addEventListener("click", onClick);
  return button;
}

// What every bar menu shares: open under `button`, close on Esc, on a click
// outside and on a second click, and walk the rows with up and down.
function barMenu({ button, box, beforeOpen, onClose = () => {} }) {
  const isOpen = () => !box.hidden;

  function close() {
    if (!isOpen()) return;
    box.hidden = true;
    box.replaceChildren();
    button.setAttribute("aria-expanded", "false");
    onClose();
  }

  function show(children) {
    beforeOpen();
    box.replaceChildren(...children);
    box.hidden = false;
    button.setAttribute("aria-expanded", "true");
    (box.querySelector(".is-picked") ?? box.querySelector("button"))?.focus();
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (!isOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const rows = [...box.querySelectorAll("button")];
        const at = rows.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        rows[(at + step + rows.length) % rows.length]?.focus();
      }
    },
    true,
  );
  document.addEventListener("mousedown", (event) => {
    if (isOpen() && !box.contains(event.target) && !button.contains(event.target)) close();
  });

  return { isOpen, close, show };
}

// The title's menu: the open note's headings, a click on one jumps there. With
// none, one line says how to make one. `body()` is the note's text now,
// `locked()` whether its text is hidden behind the passcode.
export function createHeadingsMenu({ button, box, body, locked, jumpToLine, beforeOpen }) {
  const menu = barMenu({ button, box, beforeOpen });

  function open() {
    const { headings, empty } = titleHeadings({ body: body(), locked: locked() });
    if (empty) return menu.show([element("p", "title-menu-empty", empty)]);
    menu.show(
      headings.map(({ level, text, line }) => {
        const item = element("button", `title-menu-item title-menu-level-${level}`, text);
        item.type = "button";
        item.addEventListener("click", () => {
          menu.close();
          jumpToLine(line);
        });
        return item;
      }),
    );
  }

  return {
    toggle: () => (menu.isOpen() ? menu.close() : open()),
    close: menu.close,
  };
}

// + (#68, #121): on a website a note for that page, picked already so Enter
// makes it, and a blank note. Anywhere else + makes a blank note at once.
// `website()` resolves to { title } or null; `onPick(kind)` gets "page" or
// "blank".
export function createNewMenu({ button, box, website, onPick, beforeOpen }) {
  const menu = barMenu({ button, box, beforeOpen });

  async function open() {
    const choices = newNoteChoices({ website: await website() });
    if (choices.length === 1) {
      beforeOpen();
      onPick(choices[0].kind);
      return;
    }
    menu.show(
      choices.map((choice) => {
        const row = menuRow(choice, () => {
          menu.close();
          onPick(choice.kind);
        });
        row.classList.toggle("is-picked", choice.picked);
        return row;
      }),
    );
  }

  button.addEventListener("click", () => (menu.isOpen() ? menu.close() : open()));

  return { close: menu.close };
}

// ⋯ (#63, #121): three big icons with words, Delete on its own, Keyboard
// shortcuts and Help, then the actions that move later. Delete asks right
// there in the menu, with Delete and Keep, like every delete in Glacier.
// `notesHome()` names where else the note goes from; `onAction(kind, anchor)`
// does the rest, `onDelete()` deletes the open note.
export function createNoteMenu({ button, box, screen, notesHome, onAction, onDelete, beforeOpen }) {
  // The question while it is asked. Esc on it is Keep and the menu stays
  // open, so this listens before the menu's own Esc.
  let question = null;
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !question?.isConnected) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      keepIt();
    },
    true,
  );

  const menu = barMenu({ button, box, beforeOpen });

  const run = (kind) => () => {
    menu.close();
    onAction(kind, button);
  };

  function bigIcon(action) {
    const big = element("button", "bar-big");
    big.type = "button";
    big.title = action.hint;
    big.append(pixelIcon(action.icon, "bar-big-icon"), element("span", "", action.label));
    big.addEventListener("click", run(action.kind));
    return big;
  }

  async function askDelete(row) {
    const note = screen.note();
    if (!note) return;
    const text = deleteNoteQuestion(note.title, await notesHome());
    if (!row.isConnected) return;
    question = element("div", "bar-question");
    const buttons = element("div", "perm-buttons");
    const yes = element("button", "card-button", "Delete");
    yes.type = "button";
    yes.addEventListener("click", () => {
      menu.close();
      onDelete();
    });
    const keep = element("button", "perm-cancel", "Keep");
    keep.type = "button";
    keep.addEventListener("click", keepIt);
    buttons.append(yes, keep);
    question.append(element("p", "", text), buttons);
    question.row = row;
    row.replaceWith(question);
    keep.focus();
  }

  function keepIt() {
    if (!question) return;
    const { row } = question;
    question.replaceWith(row);
    question = null;
    row.focus();
  }

  function open() {
    const actions = noteMenu(screen.note(), { pinned: screen.pinned() });
    if (!actions) return;
    screen.flush();
    question = null;
    const big = element("div", "bar-big-row");
    big.append(...actions.big.map(bigIcon));
    const deleteRow = menuRow(actions.delete, () => askDelete(deleteRow));
    deleteRow.classList.add("is-danger");
    const line = () => element("hr", "bar-line");
    menu.show([
      big,
      line(),
      deleteRow,
      line(),
      ...actions.help.map((action) => menuRow(action, run(action.kind))),
      line(),
      ...actions.later.map((action) => menuRow(action, run(action.kind))),
    ]);
  }

  button.addEventListener("click", () => (menu.isOpen() ? menu.close() : open()));

  return {
    close: menu.close,

    // The ⋯ shows only while a note is open.
    update() {
      button.hidden = !screen.note();
      if (!screen.note()) menu.close();
    },
  };
}
