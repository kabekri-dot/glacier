// The ▾ menu (#12): search, the notes for this page, recent notes, the
// Notebook with its Collections and Page groups, and the Archive. What to list
// and what a search matches comes from src/menu-contents.mjs; this draws its
// parts, wires their hover icons and asks the questions before deleting.
//
// The sidebar (panel.js) plugs in the Notebook, the Screen and these:
//   el, button        the menu's box and the ▾ that opens it
//   noteEl            the paper, where the question before deleting a note shows
//   draw(view)        draws what a Screen action returned
//   render()          redraws the open note with the caret in it
//   openNote(note, options), showSearchMatch(query) (a search inside notes
//   opens on the page of its match, #108), startNoteForPage(), moveNote()
//   (the ⋯ "Move to collection…"), changed() (for Sync), notice(text, ms, action), downloads
//   (see downloads.js) and beforeOpen(), which closes whatever else is open.
import { notebookMenu, rowActions, archivedNotice, deleteCollectionQuestion, deletedNotice, deletedCollectionNotice, noteOrigin, secretMark } from "../src/menu-contents.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { NEW_NOTE_HINT } from "../src/new-note-choices.mjs";
import { menuButton, iconButton, originIcon, askFormat } from "./settings-view.js";
import { lockIcon } from "./secret-view.js";
import { removeQuestion } from "./cards.js";

export function createMenuView({ notebook, screen, el, button: menuButtonEl, noteEl, draw, render, openNote, showSearchMatch, startNoteForPage, moveNote, changed, notice, downloads, beforeOpen }) {
  // The search box and the list under it, while the menu is open.
  let search = null;
  let body = null;

  // What a hover icon or a ⋯ entry does (#71, #74, #92): one map for a note,
  // a Collection heading and a Page group. Each gets what it acts on and the
  // button that was clicked.
  const actions = {
    note: {
      download: ({ title }, anchor) => askFormat(anchor, (format) => downloads.downloadNote(title, format)),
      archive: ({ title }) => archiveNote(title),
      unarchive: ({ title }) => unarchiveNote(title),
      delete: ({ title }) => deleteNote(title),
      move: () => moveNote(),
    },
    collection: {
      download: ({ course, archived }, anchor) => askFormat(anchor, (format) => downloads.downloadCourse(course, format, { archived })),
      archive: ({ course }) => archiveCollection(course),
      unarchive: ({ course }) => unarchiveCollection(course),
      delete: ({ course, group }) => askDeleteCollection(course, group),
    },
    page: {
      move: ({ page, titles }, anchor) => pickCollection(anchor, (course) => movePage(page, titles, course)),
    },
  };

  // `on` is "note", "collection" or "page".
  function act(on, kind, target, anchor) {
    actions[on][kind](target, anchor);
  }

  // The hover icons for a row or a heading, in a span with `className`.
  function actionIcons(className, on, list, target) {
    const icons = document.createElement("span");
    icons.className = className;
    for (const action of list) {
      icons.append(iconButton(action.kind, action.hint, (clicked) => act(on, action.kind, target, clicked)));
    }
    return icons;
  }

  // --- Note actions --------------------------------------------------------

  // Archive at once, with a short notice that puts the note back.
  function archiveNote(title) {
    if (screen.note()?.title === title) draw(screen.archive());
    else {
      notebook.archiveNote(title);
      changed();
    }
    refresh();
    notice("Archived.", 6000, {
      label: "Undo",
      run: () => undoArchive([title]),
    });
  }

  function unarchiveNote(title) {
    if (screen.note()?.title === title) draw(screen.unarchive());
    else {
      notebook.unarchiveNote(title);
      changed();
    }
    refresh();
  }

  // Undo an archive: the notes come back, and the open note if it was closed.
  function undoArchive(titles) {
    draw(screen.undoArchive(titles));
    refresh();
  }

  function deleteNote(title) {
    close();
    const note = notebook.note(title);
    if (screen.note()?.title !== title) openNote(note, { byPage: isOpenedByPage(note) });
    askDeleteNote();
  }

  // Delete the open note (#57): a short question in the sidebar, not a browser
  // dialog. Keep or Esc puts the note back as it was. Delete removes it, the
  // Opening flow decides what the sidebar shows next, and a notice offers
  // Undo (#116).
  function askDeleteNote() {
    const doomed = screen.note();
    screen.flush();
    noteEl.replaceChildren();
    const { card, keep } = removeQuestion({
      text: `Delete “${doomed.title}”? It is also removed from your Notes repo.`,
      action: "Delete",
      onAction: () => {
        const { kept, view } = screen.delete();
        draw(view);
        offerUndoDelete(deletedNotice(doomed.title), kept);
      },
      onKeep: () => draw(screen.reopen()),
    });
    noteEl.appendChild(card);
    keep.focus();
  }

  // The notice after a delete, like Archived. (#116): Undo puts back what
  // went, and the note the delete closed opens again.
  function offerUndoDelete(text, kept) {
    notice(text, 6000, {
      label: "Undo",
      run: () => {
        draw(screen.undoDelete(kept));
        refresh();
      },
    });
  }

  // --- Collection and Page group actions -----------------------------------

  function archiveCollection(course) {
    const { titles, view } = screen.archiveCollection(course);
    draw(view);
    refresh();
    notice(archivedNotice(titles.length), 6000, {
      label: "Undo",
      run: () => undoArchive(titles),
    });
  }

  function unarchiveCollection(course) {
    notebook.unarchiveCollection(course);
    changed();
    refresh();
  }

  // Delete a whole Collection (#74): the question replaces the group's notes
  // right in the menu, with Delete and Keep. Esc is Keep. A notice offers
  // Undo (#116).
  function askDeleteCollection(course, group) {
    group.querySelector(".delete-question")?.remove();
    const count = notebook.outline().courses.find((entry) => entry.course === course)?.titles.length ?? 0;
    const { card, keep } = removeQuestion({
      text: deleteCollectionQuestion(course, count),
      action: "Delete",
      onAction: () => {
        card.remove();
        const { kept, view } = screen.deleteCollection(course);
        draw(view);
        refresh();
        offerUndoDelete(deletedCollectionNotice(course, kept.notes.length), kept);
      },
      onKeep: () => card.remove(),
    });
    group.querySelector("summary").after(card);
    keep.focus();
  }

  // The Collections to pick from, right where the move icon was clicked, and
  // "+ New collection", which turns into a text field. Esc or a click
  // anywhere else closes it.
  function pickCollection(anchor, onPick) {
    document.querySelector(".collection-choice")?.remove();
    const box = document.createElement("div");
    box.className = "format-choice collection-choice";
    const close = () => {
      box.remove();
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOutside = (event) => {
      if (!box.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const pick = (course) => {
      close();
      onPick(course);
    };
    for (const course of notebook.courseChoices()) {
      box.append(menuButton(course, `Move to '${course}'`, () => pick(course)));
    }
    const fresh = menuButton("+ New collection", "Make a collection and move the notes there", () => {
      const input = newCollectionInput();
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (input.value.trim()) pick(input.value);
      });
      fresh.replaceWith(input);
      input.focus();
    });
    box.append(fresh);
    const rect = anchor.getBoundingClientRect();
    box.style.top = `${rect.bottom + 2}px`;
    box.style.right = `${Math.max(4, window.innerWidth - rect.right)}px`;
    document.body.append(box);
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    box.querySelector("button").focus();
  }

  function newCollectionInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "menu-new-collection-input";
    input.placeholder = "New collection";
    input.setAttribute("aria-label", "New collection");
    return input;
  }

  // Move every note of a page to a Collection; the open note goes through the
  // Screen so it stays on screen as it is.
  function movePage(page, titles, course) {
    if (titles.includes(screen.note()?.title)) draw(screen.moveToCourse(course));
    notebook.movePageToCollection(page, course);
    changed();
    if (screen.note()) render();
    refresh();
  }

  // --- The menu's parts ----------------------------------------------------

  function noteButton(title, className = "menu-item") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.addEventListener("click", () => {
      const note = notebook.note(title);
      if (note) openNote(note, { byPage: isOpenedByPage(note) });
    });
    return button;
  }

  // The globe or pencil before a note's title, then a pixel lock when it
  // is secret (#109).
  function titleIcons(title) {
    const mark = secretMark(notebook, title);
    return [originIcon(noteOrigin(notebook, title)), ...(mark ? [lockIcon(mark)] : [])];
  }

  function menuHeading(text, hint) {
    const heading = document.createElement("h2");
    heading.className = "menu-heading";
    if (hint) heading.title = hint;
    heading.textContent = text;
    return heading;
  }

  // A note button with the hover icons on its right (#71).
  function noteRow(button, title, archived = false) {
    const row = document.createElement("div");
    row.className = "menu-row";
    row.append(button, actionIcons("row-icons", "note", rowActions(title, archived), { title }));
    return row;
  }

  function titleList(titles, current = null, archived = false) {
    const list = document.createElement("div");
    for (const title of titles) {
      const button = noteButton(title);
      button.textContent = title;
      button.prepend(...titleIcons(title));
      if (title === current) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "true");
      }
      list.appendChild(noteRow(button, title, archived));
    }
    return list;
  }

  // A highlighted match: { before, match, after } as text with a <mark>.
  function marked(element, { before, match, after }) {
    const mark = document.createElement("mark");
    mark.textContent = match;
    element.append(before, mark, after);
    return element;
  }

  function snippetPieces(element, pieces) {
    for (const { text, match } of pieces) {
      if (match) {
        const mark = document.createElement("mark");
        mark.textContent = text;
        element.append(mark);
      } else {
        element.append(text);
      }
    }
    return element;
  }

  function searchResult({ title, titleMark, snippet }) {
    const button = noteButton(title, "menu-item menu-result");
    const titleEl = document.createElement("span");
    titleEl.className = "menu-result-title";
    button.append(...titleIcons(title));
    if (titleMark) {
      button.append(marked(titleEl, titleMark));
      return noteRow(button, title);
    }
    titleEl.textContent = title;
    const query = search.value;
    button.addEventListener("click", () => showSearchMatch(query));
    const snippetEl = document.createElement("span");
    snippetEl.className = "menu-snippet";
    button.append(titleEl, snippetPieces(snippetEl, snippet));
    return noteRow(button, title);
  }

  // A Collection heading with its hover icons (#74). `group` holds the
  // heading and its notes, where the question before deleting shows.
  function collectionSummary(course, list, group, { archived = false, tag = "summary" } = {}) {
    const summary = document.createElement(tag);
    summary.textContent = course;
    summary.append(actionIcons("collection-icons", "collection", list, { course, archived, group }));
    return summary;
  }

  // A website's own group under No collection (#92): a globe, the page's
  // title and one hover icon that moves all its notes to a Collection.
  function pageSummary({ label, page, titles, actions: list }) {
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "page-group-name";
    name.append(originIcon({ kind: "website", hint: "From a website" }), label);
    summary.append(name, actionIcons("collection-icons", "page", list, { page, titles }));
    return summary;
  }

  function menuGroup({ label, hint, open, archive, titles, actions: list, sections, page }) {
    const details = document.createElement("details");
    details.className = archive ? "menu-archive" : "menu-course";
    details.open = open;
    if (page) {
      const summary = pageSummary({ label, page, titles, actions: list });
      summary.title = hint;
      details.classList.add("page-group");
      details.append(summary, titleList(titles));
      return details;
    }
    if (sections) {
      const summary = document.createElement("summary");
      summary.textContent = label;
      summary.title = hint;
      details.append(summary);
      for (const section of sections) {
        const inner = document.createElement("div");
        inner.className = "menu-course";
        const heading = collectionSummary(section.course, section.actions, inner, { archived: true, tag: "div" });
        heading.className = "menu-course-heading";
        heading.title = "Notes in this collection";
        inner.append(heading, titleList(section.titles, null, true));
        details.append(inner);
      }
      const loose = titles.filter((title) => !sections.some((section) => section.titles.includes(title)));
      details.append(titleList(loose, null, true));
      return details;
    }
    const summary = list ? collectionSummary(label, list, details, { archived: archive }) : document.createElement("summary");
    if (!list) summary.textContent = label;
    summary.title = hint;
    details.append(summary, titleList(titles, null, archive));
    return details;
  }

  // "+ New collection" under the Notebook heading turns into a text field.
  // Enter makes an empty Collection; Esc or an empty field changes nothing.
  function newCollectionButton({ label, hint }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-new menu-new-collection";
    button.textContent = label;
    button.title = hint;
    button.addEventListener("click", () => {
      const input = newCollectionInput();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          notebook.newCollection(input.value);
          refresh();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          refresh();
        }
      });
      button.replaceWith(input);
      input.focus();
    });
    return button;
  }

  function conflictPair({ notes }) {
    const row = document.createElement("div");
    row.className = "conflict-pair";
    for (const { title, label } of notes) {
      const button = noteButton(title);
      button.textContent = label;
      button.prepend(...titleIcons(title));
      row.append(noteRow(button, title));
    }
    return row;
  }

  function newForPageButton({ label, hint }) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-new menu-new-for-page";
    button.textContent = label;
    button.title = hint;
    button.addEventListener("click", () => {
      close();
      startNoteForPage();
    });
    return button;
  }

  // Draw the parts src/menu-contents.mjs lists for the ▾ menu.
  function drawMenuParts(container, parts) {
    container.replaceChildren();
    for (const part of parts) {
      if (part.kind === "heading") container.append(menuHeading(part.text, part.hint));
      else if (part.kind === "notes") container.append(titleList(part.titles, part.current));
      else if (part.kind === "newForPage") container.append(newForPageButton(part));
      else if (part.kind === "newCollection") container.append(newCollectionButton(part));
      else if (part.kind === "group") container.append(menuGroup(part));
      else if (part.kind === "result") container.append(searchResult(part));
      else if (part.kind === "pair") container.append(conflictPair(part));
      else {
        const none = document.createElement("p");
        none.className = "menu-empty";
        none.textContent = part.text;
        container.append(none);
      }
    }
  }

  // --- Opening and closing -------------------------------------------------

  function isOpen() {
    return !el.hidden;
  }

  // Draw the list again after a change, while the menu is open.
  function refresh() {
    if (body) drawMenuParts(body, notebookMenu(notebook, search.value, screen.note()));
  }

  // The keyboard in the menu: Enter in the search opens the first note
  // found, ↓ and ↑ walk the notes shown (a folded group's are skipped), and
  // ↑ from the first goes back to the search. Enter on a note opens it.
  function shownNotes() {
    return [...body.querySelectorAll(".menu-item")].filter((button) => button.getClientRects().length > 0);
  }

  function searchKey(event) {
    if (event.isComposing) return;
    if (event.key === "Enter" && search.value.trim()) {
      event.preventDefault();
      shownNotes()[0]?.click();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      shownNotes()[0]?.focus();
    }
  }

  function listKey(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const notes = shownNotes();
    const at = notes.indexOf(document.activeElement);
    if (at === -1) return;
    event.preventDefault();
    const next = at + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.focus();
    else notes[Math.min(next, notes.length - 1)].focus();
  }

  function open() {
    if (isOpen()) {
      search.focus();
      return;
    }
    beforeOpen();
    // Flush the line being edited so the menu sees its latest text.
    screen.flush();
    el.replaceChildren();

    search = document.createElement("input");
    search.type = "search";
    search.className = "menu-search";
    search.placeholder = "Search titles, or // to search inside notes";
    search.title = "Search titles, or // to search inside notes";
    search.setAttribute("aria-label", "Search notes");

    body = document.createElement("div");
    body.className = "menu-body";
    search.addEventListener("input", refresh);
    search.addEventListener("keydown", searchKey);
    body.addEventListener("keydown", listKey);
    refresh();

    const buttons = document.createElement("div");
    buttons.className = "menu-actions";
    const newNote = menuButton("+ New note", NEW_NOTE_HINT, () => {
      draw(screen.startFreshPage({ title: search.value.trim(), editTitle: true }));
    });
    buttons.append(newNote);

    el.append(search, buttons, body);
    el.hidden = false;
    menuButtonEl.setAttribute("aria-expanded", "true");
    search.focus();
  }

  function close() {
    if (!isOpen()) return;
    el.hidden = true;
    el.replaceChildren();
    search = null;
    body = null;
    menuButtonEl.setAttribute("aria-expanded", "false");
  }

  return {
    open,
    close,
    refresh,
    isOpen,

    // Close the menu and put the caret back in the note.
    dismiss() {
      if (!isOpen()) return;
      close();
      if (screen.note() || screen.freshPage()) render();
    },

    // Scroll back to the top, where Several versions is listed.
    scrollToTop() {
      if (body) body.scrollTop = 0;
    },

    act,
    askDeleteNote,
  };
}
