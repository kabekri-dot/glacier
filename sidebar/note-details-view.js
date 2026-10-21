// Note details (#122): a drawer that slides in from the right over the paper,
// opened from ⋯. It shows the open note's Collection (a click lists the
// Collections right there to move it), whether it is secret (a click makes
// it secret or not, with the passcode flow of #109), its page (a click opens
// it), the notes that link here (each opens on a click), then its words and
// dates, and Done. Esc or a click beside the drawer closes it too. What it
// says is src/note-details.mjs; this only draws it.
//
// The sidebar (panel.js) plugs in the drawer (`el`), the dim layer beside it
// (`veilEl`), the Notebook, the Screen and these:
//   draw(view), render()      draw what a Screen action returned; the paper
//                             again with the caret in it
//   openNote(note, options), openSource(url)
//   makeSecret(), makeNotSecret()  the passcode flow (sidebar/secret-view.js)
//   notice(text, ms, action)  a short message, with Undo after a move
//   beforeOpen()              closes whatever else is open
import { noteDetails } from "../src/note-details.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { menuRow } from "./pill-menus.js";

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createNoteDetailsView({ el, veilEl, notebook, screen, draw, render, openNote, openSource, makeSecret, makeNotSecret, notice, beforeOpen }) {
  const isOpen = () => !el.hidden;

  function close({ redraw = true } = {}) {
    if (!isOpen()) return;
    el.hidden = true;
    veilEl.hidden = true;
    el.replaceChildren();
    if (redraw && screen.note()) render();
  }

  // Close first, then act: what comes next shows on the paper.
  const thenClose = (act) => () => {
    close({ redraw: false });
    act();
  };

  function label(text) {
    return element("h3", "details-label", text);
  }

  function fill() {
    const note = screen.note();
    if (!note) return close();
    const details = noteDetails(notebook, note, { locked: notebook.isLocked(note.title) });
    const head = element("div", "details-head");
    head.append(element("span", "details-label", "Note details"), element("strong", "details-title", details.title));

    const collection = menuRow(
      { icon: "folder", label: details.collection.label, under: details.collection.under, hint: details.collection.under },
      () => pickCollection(collection, details.collection.course),
    );

    const { secret } = details;
    const secretRow = menuRow(
      { icon: "lock", label: secret.label, under: secret.under, hint: secret.under },
      thenClose(secret.on ? makeNotSecret : makeSecret),
    );
    secretRow.classList.add("is-wrapping");

    const page = details.page.source
      ? menuRow(
        { icon: "globe", label: details.page.label, under: details.page.under, hint: details.page.source },
        thenClose(() => openSource(details.page.source)),
      )
      : element("p", "details-empty", details.page.empty);

    const linked = details.linkedFrom.titles.length
      ? details.linkedFrom.titles.map((title) =>
        menuRow({ icon: "page", label: title, hint: `Open “${title}”` }, thenClose(() => {
          const other = notebook.note(title);
          if (other) openNote(other, { byPage: isOpenedByPage(other) });
        })))
      : [element("p", "details-empty", details.linkedFrom.empty)];

    const stats = element("dl", "details-stats");
    for (const { label: name, value } of details.stats) stats.append(element("dt", "", name), element("dd", "", value));

    const done = element("button", "card-button details-done", "Done");
    done.type = "button";
    done.addEventListener("click", () => close());

    el.replaceChildren(
      head,
      label("Collection"),
      collection,
      label("Secret"),
      secretRow,
      label("Page"),
      page,
      label("Linked from"),
      ...linked,
      element("hr", "bar-line"),
      stats,
      done,
    );
  }

  // The Collections right under the Collection row: "No collection" when the
  // note has one, each Collection (the last used first) and "+ New
  // collection", which turns into a field. A second click folds it again.
  function pickCollection(row, current) {
    const open = el.querySelector(".details-collections");
    if (open) {
      open.remove();
      return;
    }
    const list = element("div", "details-collections");
    const choice = (text, onPick) => {
      const button = element("button", "bar-item details-choice", text);
      button.type = "button";
      button.addEventListener("click", onPick);
      return button;
    };
    if (current) list.append(choice("No collection", () => move(current, "")));
    for (const course of notebook.courseChoices()) {
      if (course !== current) list.append(choice(course, () => move(current, course)));
    }
    const fresh = choice("+ New collection", () => {
      const input = element("input", "details-new-collection");
      input.type = "text";
      input.placeholder = "New collection";
      input.setAttribute("aria-label", "New collection");
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || !input.value.trim()) return;
        event.preventDefault();
        move(current, input.value);
      });
      fresh.replaceWith(input);
      input.focus();
    });
    fresh.classList.add("is-new");
    list.append(fresh);
    row.after(list);
    list.querySelector("button").focus();
  }

  function moveTo(course) {
    draw(course ? screen.moveToCourse(course) : screen.removeFromCourse());
  }

  // Move the open note, say so, and offer to move it back.
  function move(from, to) {
    moveTo(to);
    fill();
    const now = screen.note()?.course;
    notice(now ? `Moved to ${now}.` : "Taken out of its collection.", 6000, {
      label: "Undo",
      run: () => {
        moveTo(from);
        if (isOpen()) fill();
      },
    });
  }

  veilEl.addEventListener("mousedown", (event) => {
    event.preventDefault();
    close();
  });

  // Esc folds an open Collection list first, then closes the drawer.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !isOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      const list = el.querySelector(".details-collections");
      if (list) list.remove();
      else close();
    },
    true,
  );

  return {
    isOpen,
    close,

    open() {
      if (!screen.note()) return;
      beforeOpen();
      screen.flush();
      fill();
      el.hidden = false;
      veilEl.hidden = false;
      el.querySelector("button")?.focus();
    },
  };
}
