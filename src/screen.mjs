// The Screen: what the sidebar shows (#65). It holds the note on screen (or
// none), whether the page opened it, the fresh page (#61) and the note that
// was on screen before it, the ← history (#52), and the Note session that
// saves what is typed (#39). panel.js only listens to events, calls one action
// and draws the description the action returns. No DOM, no browser APIs.
//
// The Opening flow (#40) still decides *which* view a page change leads to;
// its views are handed to show(). Each action returns one of:
//
//   { type: "note", note, reload, changed? }  the note on screen. `reload`
//       puts its text in the editor with the caret at the top; without it the
//       text stays as typed and only the pill, Collection line and Backlinks change.
//   { type: "freshPage", title, source, editTitle }  an empty page that
//       becomes a note at the first character or a confirmed title.
//   { type: "startPrompt" } or { type: "permissionCard" }
//   { type: "followPage", newForPage? }  no note any more: the Opening flow
//       decides (`newForPage` is the "New note for this page" click).
//   { type: "pageChanged" }  a pulled note may belong to this page.
//   { type: "backlinks" }    only the Backlinks may have changed.
//   { type: "titleRefused", suggestion? }  the title in the pill is refused.
//   { type: "welcome" }      the welcome shows over whatever is on screen.
//   { type: "welcomeGone" }  the welcome went; what was under it stays.
//
// The welcome (#85, #89, #91) shows on the first start until it is seen, and
// again from "How Glacier works". Opening a note, typing or Start writing
// hides it and counts it as seen: `onWelcomeSeen()` is called to remember that.
//
// `changed: true` means the Notebook changed, for Sync. `beforeLeave()` is
// called just before the note on screen is left, so the editor can take an
// untouched `/` back out before it is saved (#28). Timers are injected.
import { createNoteSession, titleFromText } from "./note-session.mjs";
import { createNoteHistory } from "./note-history.mjs";
import { isOpenedByPage } from "./page-open.mjs";
import { clipQuote, appendClip } from "./clip.mjs";

const LAST_NOTES_SHOWN = 3;

export function createScreen({ notebook, onSaveError, beforeLeave = () => {}, welcomeSeen = true, onWelcomeSeen = () => {}, ...timers }) {
  let note = null;
  let welcome = !welcomeSeen;
  // Whether the page opened the note, so a later page change may replace it
  // (only with the "keep a note I opened myself" setting, ADR 0009).
  let openedByPage = false;
  // The fresh page on screen: { title, source }, `source` only for a page.
  let freshPage = null;
  // The note on screen when a fresh page took its place, so Esc can go back.
  let before = null;
  let created = null;
  // The note after its title followed the first line (#80).
  let retitled = null;
  // The title of the note an archive just closed, for Undo (#87).
  let closedByArchive = null;
  const history = createNoteHistory();
  const session = createNoteSession({
    notebook,
    onSaveError,
    onCreate: (made) => (created = made),
    onRetitle: (renamed) => (retitled = renamed),
    ...timers,
  });

  function hideWelcome() {
    if (!welcome) return;
    welcome = false;
    onWelcomeSeen();
  }

  function showNote(next, { byPage = false, fromHistory = false } = {}) {
    hideWelcome();
    beforeLeave();
    session.open(next);
    notebook.markOpened(next.title);
    freshPage = null;
    before = null;
    note = next;
    closedByArchive = null;
    openedByPage = byPage;
    if (!fromHistory) history.visit(next.title);
    return { type: "note", note, reload: true };
  }

  function showNothing() {
    session.close();
    note = null;
    openedByPage = false;
    freshPage = null;
  }

  function rememberNoteBefore() {
    if (note) before = { note, openedByPage };
  }

  // A fresh page with a `source` becomes a note for that page; without one it
  // becomes a blank note. `editTitle` asks for the title in the pill to be
  // edited at once.
  function startFreshPage({ title = "", source, editTitle = false }) {
    rememberNoteBefore();
    beforeLeave();
    session.openDraft({ title, source });
    note = null;
    openedByPage = false;
    freshPage = { title, source };
    return { type: "freshPage", title, source, editTitle };
  }

  // The Note session made the note on the fresh page: from here it is a
  // normal note, with its text as typed.
  function freshPageBecameNote() {
    hideWelcome();
    const made = created;
    created = null;
    freshPage = null;
    before = null;
    note = made;
    openedByPage = isOpenedByPage(made);
    history.visit(made.title);
    notebook.markOpened(made.title);
    return { type: "note", note, reload: false, changed: true };
  }

  // Walk ← back to the newest note that is still there and `usable`, and
  // show it; null when there is none. Notes that have gone are skipped.
  function showNoteBefore(usable = () => true) {
    for (let title = history.back(); title !== null; title = history.back()) {
      const found = notebook.note(title);
      if (found && usable(found)) return showNote(found, { byPage: isOpenedByPage(found), fromHistory: true });
    }
    return null;
  }

  // The open note was archived or deleted: show the note you were on before
  // (#83), or leave the choice to the page when there is none.
  function leaveRemovedNote() {
    const shown = showNoteBefore((found) => !found.archived);
    if (shown) return { ...shown, changed: true };
    showNothing();
    return { type: "followPage", changed: true };
  }

  return {
    note: () => note,
    freshPage: () => freshPage,
    welcome: () => welcome,

    // "How Glacier works" (#91): the welcome again, over the open note.
    showWelcome() {
      welcome = true;
      return { type: "welcome" };
    },

    // Start writing: back to the note or fresh page under the welcome, or a
    // fresh page when there was nothing.
    startWriting() {
      hideWelcome();
      if (!note && !freshPage) return startFreshPage({});
      return { type: "welcomeGone" };
    },
    // For the Opening flow's decision.
    onScreen: () => ({ current: note, openedByPage }),
    // The title ← would open, or null.
    previous: () => history.previous(),
    // The last notes you were on, newest first, for the ← box (#81). Notes
    // that have since gone are left out.
    lastNotes: () => history.recent(Infinity).filter((title) => notebook.note(title)).slice(0, LAST_NOTES_SHOWN),
    flush: () => session.flush(),

    // A view the Opening flow decided on.
    show(view) {
      switch (view.type) {
        case "open":
          return showNote(view.note, { byPage: view.byPage ?? true });
        case "pageDraft":
          return startFreshPage({
            title: view.page.title,
            source: view.page.url,
            editTitle: view.editTitle,
          });
        case "blankDraft":
          return startFreshPage({});
        default:
          showNothing();
          return { type: view.type };
      }
    },

    // A note the user opened: from the menu, a Link, the recent notes. A
    // menu entry passes `byPage` for a note with a page.
    open(next, { byPage = false } = {}) {
      return showNote(next, { byPage });
    },

    startFreshPage,

    // "New note for this page": the Opening flow reads the page for a fresh
    // page, or asks for the permission first.
    startNoteForPage() {
      rememberNoteBefore();
      showNothing();
      return { type: "followPage", newForPage: true };
    },

    // The text changed. The first character on a fresh page makes the note.
    edit(body) {
      hideWelcome();
      session.edit(body);
      if (created) return freshPageBecameNote();
      if (!retitled) return null;
      note = retitled;
      retitled = null;
      history.rename(note.title);
      notebook.markOpened(note.title);
      return { type: "note", note, reload: false, changed: true };
    },

    // The caret left the first line: a new note's title stops following it.
    leaveFirstLine() {
      session.leaveFirstLine();
    },

    // The title typed in the pill on a fresh page, confirmed with Enter.
    confirmTitle(title) {
      session.confirmTitle(title);
      return created ? freshPageBecameNote() : { type: "titleRefused" };
    },

    // Esc on a fresh page: back to the note from before, if it's still there.
    cancel() {
      const back = before;
      before = null;
      const stillThere = back && notebook.note(back.note.title);
      if (stillThere) return showNote(stillThere, { byPage: back.openedByPage });
      return { type: "followPage" };
    },

    // ← opens the note that was on screen before. A note that has since gone
    // is skipped, so it never lands nowhere; null when there is none.
    back() {
      return showNoteBefore();
    },

    rename(title) {
      session.flush();
      const result = notebook.renameNote(note.title, title);
      if (!result.ok) return { type: "titleRefused", suggestion: result.suggestion };
      return { ...showNote(result.note, { byPage: openedByPage }), changed: true };
    },

    // Extract to a new note (#99): the text becomes a note named after its
    // first line (a free name when that is taken), on the same page and in the
    // same Collection as the open note. It does not open. Returns its title.
    extract(text) {
      if (!note) return null;
      session.flush();
      const { source, pageTitle, course } = note;
      const made = notebook.createNote({ title: titleFromText(text), source, pageTitle, course });
      notebook.saveBody(made.title, text);
      return made.title;
    },

    // Clip text from a web page (#100): a quote with its source link goes at
    // the end of the open note. With no note open it starts the note for that
    // page, in the page's Collection if its other notes are in one. Nothing
    // is clipped from an empty selection (null).
    clip({ text, title, url }) {
      if (!text || text.trim() === "" || !url) return null;
      const quote = clipQuote(text, title, url);
      if (note) {
        session.flush();
        notebook.saveBody(note.title, appendClip(notebook.note(note.title)?.body, quote));
        return { ...showNote(notebook.note(note.title), { byPage: openedByPage }), changed: true };
      }
      const course = notebook.notesForPage(url).find((other) => other.course)?.course;
      const made = notebook.createNote({ title: (title ?? "").trim() || titleFromText(text), source: url, pageTitle: title, course });
      notebook.saveBody(made.title, quote);
      return { ...showNote(notebook.note(made.title), { byPage: true }), changed: true };
    },

    moveToCourse(course) {
      session.flush();
      note = notebook.moveToCourse(note.title, course);
      return { type: "note", note, reload: false, changed: true };
    },

    removeFromCourse() {
      session.flush();
      note = notebook.removeFromCourse(note.title);
      return { type: "note", note, reload: false, changed: true };
    },

    archive() {
      session.flush();
      closedByArchive = note.title;
      notebook.archiveNote(note.title);
      return leaveRemovedNote();
    },

    // Archive every note of a Collection (#87). The open note, if it is one of
    // them, is closed like any archived note. Returns the titles, for Undo.
    archiveCollection(course) {
      session.flush();
      const openTitle = note?.title;
      const titles = notebook.archiveCollection(course);
      if (openTitle && titles.includes(openTitle)) {
        closedByArchive = openTitle;
        return { titles, view: { ...leaveRemovedNote(), changed: true } };
      }
      return { titles, view: { type: "backlinks", changed: true } };
    },

    // Undo an archive: the notes come back, and so does the open note if the
    // archive closed it and nothing else has been opened since.
    undoArchive(titles) {
      titles.forEach((title) => notebook.unarchiveNote(title));
      const reopened = closedByArchive !== null && titles.includes(closedByArchive) && !note && !freshPage ? notebook.note(closedByArchive) : undefined;
      if (reopened) {
        return { ...showNote(reopened, { byPage: isOpenedByPage(reopened) }), changed: true };
      }
      return { type: "backlinks", changed: true };
    },

    unarchive() {
      session.flush();
      notebook.unarchiveNote(note.title);
      note = notebook.note(note.title);
      return { type: "note", note, reload: false, changed: true };
    },

    delete() {
      session.flush();
      notebook.deleteNote(note.title);
      return leaveRemovedNote();
    },

    // The note on screen again, as stored (Keep after the delete question).
    reopen() {
      return showNote(notebook.note(note.title) ?? note, { byPage: openedByPage, fromHistory: true });
    },

    // A pull changed these notes.
    pulled(titles) {
      if (!note) {
        const pageNoteCameIn = titles.some((title) => notebook.note(title)?.source);
        return pageNoteCameIn ? { type: "pageChanged" } : null;
      }
      if (!titles.includes(note.title)) return { type: "backlinks" };
      const found = notebook.note(note.title);
      if (found) return showNote(found, { byPage: openedByPage, fromHistory: true });
      showNothing();
      return { type: "followPage" };
    },
  };
}
