// The notes list (#12, #123), opened by ☰ Notes (#121): the search on top,
// then the notes for this page, recent notes, the Collections as folders and
// the Archive. What to list and what a search matches comes from
// src/menu-contents.mjs; this draws its parts, wires the ✎ and ⋯ of each row
// and asks the questions right in the row.
//
// The sidebar (panel.js) plugs in the Notebook, the Screen and these:
//   el, button        the list's box and the Notes button that opens it
//   noteEl            the paper, where the question before deleting the open note shows
//   draw(view)        draws what a Screen action returned
//   render()          redraws the open note with the caret in it
//   openNote(note, options), showSearchMatch(query) (a search inside notes
//   opens on the page of its match, #108), changed() (for Sync),
//   notice(text, ms, action),
//   notesHome() (the Notes Home's id, which the delete questions name), downloads
//   (see downloads.js) and beforeOpen(), which closes whatever else is open.
import {
  notebookMenu, noteRowMenu, moveChoices, editedLine, archivedNotice, deleteNoteQuestion, deleteCollectionChoice,
  deletedNotice, deletedCollectionNotice, deletedKeptNotesNotice, madeCollectionNotice, collectionTakenText,
  renamedCollectionNotice, movedNotice, noteOrigin, secretMark,
} from "../src/menu-contents.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { originIcon, askFormat } from "./settings-view.js";
import { lockIcon } from "./secret-view.js";
import { removeQuestion } from "./cards.js";
import { menuRow, pixelIcon } from "./pill-menus.js";

const NOTICE_MS = 6000;

export function createMenuView({ notebook, screen, el, button: menuButtonEl, noteEl, draw, render, openNote, showSearchMatch, changed, notice, notesHome, downloads, beforeOpen }) {
  // The search box and the list under it, while the list is open.
  let search = null;
  let body = null;
  // The expanded view (#123): the list over the whole sidebar.
  let wide = false;
  // The folders opened by a click, by their key; kept while the sidebar is.
  const opened = new Set();
  // Puts back the row a ✎ field, a ⋯ menu or a question took over, so Esc
  // closes that first and the list stays open.
  let undoRow = null;

  document.addEventListener(
    "keydown",
    (event) => {
      // The Download choice closes on its own first.
      if (event.key !== "Escape" || !undoRow || !isOpen() || document.querySelector(".format-choice")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      undoRow();
    },
    true,
  );

  function element(tag, className, text) {
    const made = document.createElement(tag);
    if (className) made.className = className;
    if (text !== undefined) made.textContent = text;
    return made;
  }

  function smallButton(className, text, hint, onClick) {
    const button = element("button", className, text);
    button.type = "button";
    button.title = hint;
    button.setAttribute("aria-label", hint);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(button);
    });
    return button;
  }

  // What ⋯ in This note asks of the open note (#121): Download, Archive and
  // Unarchive work the same from a row.
  const noteActions = {
    download: ({ title }, anchor) => askFormat(anchor, (format) => downloads.downloadNote(title, format)),
    archive: ({ title }) => archiveNote(title),
    unarchive: ({ title }) => unarchiveNote(title),
  };

  function act(on, kind, target, anchor) {
    if (on === "note") noteActions[kind](target, anchor);
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
    notice("Archived.", NOTICE_MS, {
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

  // Delete the open note (#57), from the bar above a second version: a short
  // question on the paper, not a browser dialog. Keep or Esc puts the note
  // back as it was.
  async function askDeleteNote() {
    const home = await notesHome();
    const doomed = screen.note();
    if (!doomed) return;
    screen.flush();
    noteEl.replaceChildren();
    const { card, keep } = removeQuestion({
      text: deleteNoteQuestion(doomed.title, home),
      action: "Delete",
      onAction: deleteOpenNote,
      onKeep: () => draw(screen.reopen()),
    });
    noteEl.appendChild(card);
    keep.focus();
  }

  // Delete the open note now, once the question was answered: in ⋯ (#121) or
  // on the paper.
  function deleteOpenNote() {
    if (screen.note()) deleteNote(screen.note().title);
  }

  // Delete a note, the open one or any other (#123). The Opening flow decides
  // what the sidebar shows next when it was open, and a notice offers Undo
  // (#116).
  function deleteNote(title) {
    const { kept, view } = screen.delete(title);
    draw(view);
    refresh();
    offerUndoDelete(deletedNotice(title), kept);
  }

  // The notice after a delete, like Archived (#116): Undo puts back what
  // went, and the note the delete closed opens again.
  function offerUndoDelete(text, kept) {
    notice(text, NOTICE_MS, {
      label: "Undo",
      run: () => {
        draw(screen.undoDelete(kept));
        refresh();
      },
    });
  }

  // Put a note in a Collection, or with "" take it out of one; the open note
  // goes through the Screen so it stays on screen as it is. Undo puts it
  // back where it was.
  function moveNote(title, course) {
    const before = notebook.note(title)?.course ?? "";
    if (course === before) return;
    placeNote(title, course);
    refresh();
    notice(movedNotice(title, course), NOTICE_MS, {
      label: "Undo",
      run: () => {
        placeNote(title, before);
        refresh();
      },
    });
  }

  function placeNote(title, course) {
    if (screen.note()?.title === title) {
      draw(course ? screen.moveToCourse(course) : screen.removeFromCourse());
      return;
    }
    if (course) notebook.moveToCourse(title, course);
    else notebook.removeFromCourse(title);
    changed();
  }

  // Rename a note right in its row. Returns the line to show under the field
  // when the name is refused, or null once it is renamed.
  function renameNote(title, wanted) {
    const open = screen.note();
    if (open?.title === title) {
      screen.flush();
      const before = notebook.note(title)?.body;
      const view = screen.rename(wanted);
      if (view.type === "renameLocked") return "This secret note is locked. Open it and type your passcode to rename it.";
      if (view.type === "titleRefused") return view.suggestion ? `That name is taken. Try “${view.suggestion}”.` : "Type a name for this note.";
      // The paper only loads again (closing the list) when the rename
      // changed the text, such as its sketch lines.
      draw(view.note.body === before ? { ...view, reload: false } : view);
      return null;
    }
    screen.flush();
    const openBody = open && notebook.note(open.title)?.body;
    const result = notebook.renameNote(title, wanted);
    if (result.locked) return "This secret note is locked. Open it and type your passcode to rename it.";
    if (!result.ok) return result.suggestion ? `That name is taken. Try “${result.suggestion}”.` : "Type a name for this note.";
    changed();
    // The open note's Links to it were rewritten: show its text as stored.
    if (open && notebook.note(open.title)?.body !== openBody) draw(screen.reopen());
    return null;
  }

  // --- Collection and Page group actions -----------------------------------

  function archiveCollection(course) {
    const { titles, view } = screen.archiveCollection(course);
    draw(view);
    refresh();
    notice(archivedNotice(titles.length), NOTICE_MS, {
      label: "Undo",
      run: () => undoArchive(titles),
    });
  }

  function unarchiveCollection(course) {
    notebook.unarchiveCollection(course);
    changed();
    refresh();
  }

  // The open note shows its Collection as the Notebook has it now.
  function noteFollowsCollection() {
    if (screen.note()) draw(screen.refreshNote());
  }

  function renameCollection(from, wanted) {
    if (wanted.trim() === from) {
      undoRow?.();
      return null;
    }
    screen.flush();
    const result = notebook.renameCollection(from, wanted);
    if (result.taken) return collectionTakenText(result.taken);
    if (!result.ok) return "Type a name for the collection.";
    if (opened.delete(`collection:${from}`)) opened.add(`collection:${result.name}`);
    changed();
    noteFollowsCollection();
    refresh();
    notice(renamedCollectionNotice(result.name), NOTICE_MS);
    return null;
  }

  // "Delete, keep notes": the notes stay, in Not in a collection. Undo puts
  // them back in it.
  function deleteCollectionKeepNotes(course) {
    screen.flush();
    const kept = notebook.deleteCollectionKeepNotes(course);
    changed();
    noteFollowsCollection();
    refresh();
    notice(deletedKeptNotesNotice(course, kept.titles.length), NOTICE_MS, {
      label: "Undo",
      run: () => {
        notebook.putBackCollection(kept);
        changed();
        noteFollowsCollection();
        refresh();
      },
    });
  }

  // "Delete all", or Delete on an empty Collection: it goes with its notes.
  function deleteCollection(course) {
    const { kept, view } = screen.deleteCollection(course);
    draw(view);
    refresh();
    offerUndoDelete(deletedCollectionNotice(course, kept.notes.length), kept);
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

  // A new note in a Collection: a fresh page whose note is made in it (#123).
  function newNoteIn(course) {
    close();
    draw(screen.startFreshPage({ course, editTitle: true }));
  }

  // --- In a row: a field, a small menu, a question ---------------------------

  // `shown` takes the place of `row` until undoRow() puts the row back.
  function takeOver(row, shown) {
    undoRow?.();
    row.replaceWith(shown);
    undoRow = () => {
      undoRow = null;
      if (shown.isConnected) shown.replaceWith(row);
      row.querySelector("button")?.focus();
    };
  }

  // A text field in a row (✎ and + New): Enter saves with `onSave(value)`,
  // which returns a line to show under the field when it can't, or null.
  // Esc puts the row back.
  function rowField(row, { value = "", placeholder, label, onSave }) {
    const box = element("div", "menu-field");
    const input = element("input", "menu-row-input");
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", label);
    const hint = element("p", "menu-field-hint");
    hint.hidden = true;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      if (!input.value.trim()) return;
      const refused = onSave(input.value);
      if (!refused) return;
      hint.textContent = refused;
      hint.hidden = false;
      input.focus();
    });
    box.append(input, hint);
    takeOver(row, box);
    input.focus();
    input.select();
  }

  // The quiet question in a row, like Delete in ⋯ (#121): the words, the
  // action buttons and Keep. Keep and Esc put the row back.
  function rowQuestion(row, text, actions) {
    const question = element("div", "bar-question menu-question");
    const buttons = element("div", "perm-buttons");
    for (const { label, hint, run } of actions) {
      const button = element("button", "card-button", label);
      button.type = "button";
      if (hint) button.title = hint;
      button.addEventListener("click", () => {
        undoRow = null;
        run();
      });
      buttons.append(button);
    }
    const keep = element("button", "perm-cancel", "Keep");
    keep.type = "button";
    keep.addEventListener("click", () => undoRow?.());
    buttons.append(keep);
    question.append(element("p", "", text), buttons);
    takeOver(row, question);
    keep.focus();
  }

  // The small menu under a row's ⋯ (#123). `items` are { label, icon, hint,
  // run(button) } rows, or a line of text under `heading`. A second click on
  // the ⋯ closes it.
  function toggleRowMenu(row, dots, fill) {
    if (row.nextElementSibling?.classList.contains("row-menu")) {
      undoRow?.();
      return;
    }
    const box = element("div", "row-menu");
    const holder = element("div", "menu-row-holder");
    takeOver(row, holder);
    holder.append(row, box);
    row.classList.add("is-held");
    dots.setAttribute("aria-expanded", "true");
    const putBack = undoRow;
    undoRow = () => {
      row.classList.remove("is-held");
      dots.setAttribute("aria-expanded", "false");
      putBack();
    };
    fill(box);
    box.querySelector("button")?.focus();
  }

  function fillItems(box, items) {
    box.replaceChildren();
    for (const item of items) {
      const button = menuRow(item, () => item.run(button));
      if (item.kind === "delete") button.classList.add("is-danger");
      box.append(button);
    }
    box.querySelector("button")?.focus();
  }

  // Move to collection…, right there in the small menu: the Collections to
  // pick, the one the note is in marked.
  function fillMoveChoices(box, heading, current, onPick) {
    const { choices, empty } = moveChoices(notebook, current);
    box.replaceChildren(element("p", "menu-label", heading));
    if (empty) box.append(element("p", "menu-empty", empty));
    for (const choice of choices) {
      const button = menuRow({ icon: "folder", label: choice.label, hint: choice.course ? `Move to ${choice.label}` : "Take it out of its collection" }, () => {
        undoRow?.();
        onPick(choice.course);
      });
      if (choice.current) button.classList.add("is-current");
      box.append(button);
    }
    box.querySelector("button")?.focus();
  }

  // --- A note's row --------------------------------------------------------

  function noteButton(title, className = "menu-item") {
    const button = element("button", className);
    button.type = "button";
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

  // A note's row: its button, then ✎ and ⋯ on hover (#123).
  function noteRow(button, title) {
    const row = element("div", "menu-row");
    const pen = smallButton("row-button", "", `Rename “${title}”`, () => startRenameNote(row, title));
    pen.append(pixelIcon("pencil", "row-button-icon"));
    const dots = smallButton("row-button", "⋯", `More for “${title}”`, () => openNoteMenu(row, dots, title));
    dots.setAttribute("aria-expanded", "false");
    const icons = element("span", "row-icons");
    icons.append(pen, dots);
    row.append(button, icons);
    return row;
  }

  function startRenameNote(row, title) {
    rowField(row, {
      value: title,
      placeholder: "Title",
      label: `New title for “${title}”`,
      onSave: (value) => {
        if (value.trim() === title) {
          undoRow?.();
          return null;
        }
        const refused = renameNote(title, value);
        if (!refused) refresh();
        return refused;
      },
    });
  }

  function openNoteMenu(row, dots, title) {
    toggleRowMenu(row, dots, (box) => {
      const note = notebook.note(title);
      if (!note) return;
      const run = {
        move: () => fillMoveChoices(box, `Move “${title}” to`, note.course, (course) => moveNote(title, course)),
        download: (button) => noteActions.download({ title }, button),
        archive: () => archiveNote(title),
        unarchive: () => unarchiveNote(title),
        delete: () => askDeleteInRow(row, title),
      };
      fillItems(box, noteRowMenu(title, Boolean(note.archived)).map((item) => ({ ...item, run: run[item.kind] })));
    });
  }

  // Delete asks right in the row (#123): Delete or Keep, then the Undo notice.
  async function askDeleteInRow(row, title) {
    undoRow?.();
    const text = deleteNoteQuestion(title, await notesHome());
    if (!row.isConnected) return;
    rowQuestion(row, text, [{ label: "Delete", run: () => deleteNote(title) }]);
  }

  function titleList(titles, current = null) {
    const list = element("div", "menu-notes");
    for (const title of titles) {
      const button = noteButton(title);
      const name = element("span", "menu-note-title", title);
      button.append(...titleIcons(title), name);
      if (wide) {
        const note = notebook.note(title);
        if (note) button.append(element("span", "menu-note-under", editedLine(note)));
      }
      if (title === current) {
        button.classList.add("is-current");
        button.setAttribute("aria-current", "true");
      }
      list.appendChild(noteRow(button, title));
    }
    return list;
  }

  // --- Search results ------------------------------------------------------

  // A highlighted match: { before, match, after } as text with a <mark>.
  function marked(target, { before, match, after }) {
    target.append(before, element("mark", "", match), after);
    return target;
  }

  function snippetPieces(target, pieces) {
    for (const { text, match } of pieces) target.append(match ? element("mark", "", text) : text);
    return target;
  }

  function searchResult({ title, titleMark, snippet }) {
    const button = noteButton(title, "menu-item menu-result");
    const titleEl = element("span", "menu-result-title");
    button.append(...titleIcons(title));
    if (titleMark) {
      button.append(marked(titleEl, titleMark));
      return noteRow(button, title);
    }
    titleEl.textContent = title;
    const query = search.value;
    button.addEventListener("click", () => showSearchMatch(query));
    button.append(titleEl, snippetPieces(element("span", "menu-snippet"), snippet));
    return noteRow(button, title);
  }

  // --- Folders: the Collections, Not in a collection, page groups, Archive --

  function folderRow(part) {
    const row = element("div", "menu-row menu-folder-row");
    const fold = element("button", "menu-item menu-fold");
    fold.type = "button";
    fold.title = part.hint;
    fold.setAttribute("aria-expanded", String(part.open));
    fold.append(
      element("span", "menu-fold-caret", part.open ? "▾" : "▸"),
      pixelIcon(part.icon, "menu-fold-icon"),
      element("span", "menu-fold-label", part.label),
      element("span", "menu-fold-count", String(part.count)),
    );
    fold.addEventListener("click", () => {
      if (opened.has(part.key)) opened.delete(part.key);
      else opened.add(part.key);
      refresh();
    });
    row.append(fold);
    const icons = element("span", "row-icons");
    if (part.renamable) {
      const pen = smallButton("row-button", "", `Rename “${part.label}”`, () => startRenameCollection(row, part.course));
      pen.append(pixelIcon("pencil", "row-button-icon"));
      icons.append(pen);
    }
    if (part.menu) {
      const dots = smallButton("row-button", "⋯", `More for “${part.label}”`, () => openFolderMenu(row, dots, part));
      dots.setAttribute("aria-expanded", "false");
      icons.append(dots);
    }
    if (icons.childElementCount > 0) row.append(icons);
    return row;
  }

  function startRenameCollection(row, course) {
    rowField(row, {
      value: course,
      placeholder: "Collection name",
      label: `New name for the collection “${course}”`,
      onSave: (value) => {
        return renameCollection(course, value);
      },
    });
  }

  function openFolderMenu(row, dots, part) {
    toggleRowMenu(row, dots, (box) => {
      const { course, archived, page, titles } = part;
      const run = {
        newNote: () => newNoteIn(course),
        download: (button) => askFormat(button, (format) => downloads.downloadCourse(course, format, { archived: Boolean(archived) })),
        archive: () => archiveCollection(course),
        unarchive: () => unarchiveCollection(course),
        delete: () => askDeleteCollection(row, course, part.count),
        move: () => fillMoveChoices(box, `Move the notes for “${part.label}” to`, undefined, (to) => movePage(page, titles, to)),
      };
      fillItems(box, part.menu.map((item) => ({ ...item, run: run[item.kind] })));
    });
  }

  // Delete a Collection (#123), asked right in its row: its notes can stay,
  // without a Collection, or go with it. Undo in the notice either way.
  async function askDeleteCollection(row, course, count) {
    undoRow?.();
    const choice = deleteCollectionChoice(course, count, await notesHome());
    if (!row.isConnected) return;
    const actions = [];
    if (choice.keepNotes) actions.push({ ...choice.keepNotes, run: () => deleteCollectionKeepNotes(course) });
    actions.push({ ...choice.all, run: () => deleteCollection(course) });
    rowQuestion(row, choice.text, actions);
  }

  function menuFolder(part) {
    const box = element("div", `menu-folder${part.open ? " is-open" : ""}`);
    box.append(folderRow(part));
    if (part.open) {
      const inside = element("div", "menu-folder-body");
      drawMenuParts(inside, part.parts);
      box.append(inside);
    }
    return box;
  }

  // "Collections" with its small "+ New", which opens a name field right
  // there (#123). Enter makes the Collection, already open; a name already
  // taken, in any capitals, says so and keeps the field. Esc cancels.
  function collectionsHeading({ text, add }) {
    const row = element("div", "menu-label-row");
    const plus = smallButton("menu-add-collection", add.label, add.hint, () => {
      const placeholder = element("div");
      row.after(placeholder);
      rowField(placeholder, {
        placeholder: "Name the collection, then Enter",
        label: "Name of the new collection",
        onSave: (value) => {
          const taken = notebook.collectionNamed(value);
          if (taken) return collectionTakenText(taken);
          const name = notebook.newCollection(value);
          opened.add(`collection:${name}`);
          refresh();
          notice(madeCollectionNotice(name), NOTICE_MS);
          return null;
        },
      });
    });
    row.append(element("h2", "menu-heading", text), plus);
    return row;
  }

  // The faint last row of an open Collection.
  function newInCollectionRow({ label, hint, course }) {
    const button = element("button", "menu-item menu-add-note", label);
    button.type = "button";
    button.title = hint;
    button.addEventListener("click", () => newNoteIn(course));
    return button;
  }

  // "New note “…”" when a search finds nothing.
  function newNamedButton({ label, title }) {
    const button = element("button", "menu-item menu-new-named", label);
    button.type = "button";
    button.title = "Make a note with this title";
    button.addEventListener("click", () => {
      close();
      draw(screen.startFreshPage({ title, editTitle: true }));
    });
    return button;
  }

  function conflictPair({ notes }) {
    const row = element("div", "conflict-pair");
    for (const { title, label } of notes) {
      const button = noteButton(title);
      button.append(...titleIcons(title), element("span", "menu-note-title", label));
      row.append(noteRow(button, title));
    }
    return row;
  }

  function menuHeading(text, hint) {
    const heading = element("h2", "menu-heading", text);
    if (hint) heading.title = hint;
    return heading;
  }

  // Draw the parts src/menu-contents.mjs lists.
  function drawMenuParts(container, parts) {
    container.replaceChildren();
    for (const part of parts) {
      if (part.kind === "heading") container.append(menuHeading(part.text, part.hint));
      else if (part.kind === "notes") container.append(titleList(part.titles, part.current));
      else if (part.kind === "collectionsHeading") container.append(collectionsHeading(part));
      else if (part.kind === "folder") container.append(menuFolder(part));
      else if (part.kind === "newInCollection") container.append(newInCollectionRow(part));
      else if (part.kind === "line") container.append(element("hr", "bar-line"));
      else if (part.kind === "newNamed") container.append(newNamedButton(part));
      else if (part.kind === "result") container.append(searchResult(part));
      else if (part.kind === "pair") container.append(conflictPair(part));
      else container.append(element("p", "menu-empty", part.text));
    }
  }

  // --- Opening and closing -------------------------------------------------

  function isOpen() {
    return !el.hidden;
  }

  // Draw the list again after a change, while it is open. A field, menu or
  // question in a row goes with the old rows.
  function refresh() {
    if (!body) return;
    undoRow = null;
    drawMenuParts(body, notebookMenu(notebook, search.value, screen.note(), { opened, wide }));
  }

  // The keyboard in the list: Enter in the search opens the first note
  // found, ↓ and ↑ walk the rows shown, and ↑ from the first goes back to
  // the search. Enter on a row clicks it.
  function shownRows() {
    return [...body.querySelectorAll(".menu-item")];
  }

  function searchKey(event) {
    if (event.isComposing) return;
    if (event.key === "Enter" && search.value.trim()) {
      event.preventDefault();
      shownRows()[0]?.click();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      shownRows()[0]?.focus();
    }
  }

  function listKey(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = shownRows();
    const at = rows.indexOf(document.activeElement);
    if (at === -1) return;
    event.preventDefault();
    const next = at + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.focus();
    else rows[Math.min(next, rows.length - 1)].focus();
  }

  // The search, then ⤢ (or ⤡ and × in the expanded view).
  function topRow() {
    const top = element("div", "menu-top");
    top.append(search);
    const hint = wide ? "Make the list small again" : "Spread the list over the whole sidebar";
    top.append(smallButton("menu-top-button", wide ? "⤡" : "⤢", hint, () => setWide(!wide)));
    if (wide) top.append(smallButton("menu-top-button", "×", "Close the list", () => dismiss()));
    return top;
  }

  function setWide(on) {
    wide = on;
    el.classList.toggle("is-wide", wide);
    el.firstElementChild.replaceWith(topRow());
    refresh();
    search.focus();
  }

  function open() {
    if (isOpen()) {
      search.focus();
      return;
    }
    beforeOpen();
    // Flush the line being edited so the list sees its latest text.
    screen.flush();
    el.replaceChildren();

    search = element("input", "menu-search");
    search.type = "search";
    search.placeholder = "Search titles, or // to search inside notes";
    search.title = "Search titles, or // to search inside notes";
    search.setAttribute("aria-label", "Search notes");

    body = element("div", "menu-body");
    search.addEventListener("input", refresh);
    search.addEventListener("keydown", searchKey);
    body.addEventListener("keydown", listKey);
    refresh();

    el.append(topRow(), body);
    el.hidden = false;
    menuButtonEl.setAttribute("aria-expanded", "true");
    search.focus();
  }

  function close() {
    if (!isOpen()) return;
    el.hidden = true;
    el.replaceChildren();
    wide = false;
    el.classList.remove("is-wide");
    search = null;
    body = null;
    undoRow = null;
    menuButtonEl.setAttribute("aria-expanded", "false");
  }

  // Close the list and put the caret back in the note.
  function dismiss() {
    if (!isOpen()) return;
    close();
    if (screen.note() || screen.freshPage()) render();
  }

  return {
    open,
    close,
    refresh,
    isOpen,
    dismiss,

    // Scroll back to the top, where Several versions is listed.
    scrollToTop() {
      if (body) body.scrollTop = 0;
    },

    act,
    askDeleteNote,
    deleteOpenNote,
  };
}
