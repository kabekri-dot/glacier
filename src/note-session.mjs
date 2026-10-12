// The Note session owns saving the open note. Each edit is bound to the note it
// was typed in, so a delayed save always lands there, even if another note has
// been opened since. Opening another note, closing, or flush() (the Screen
// calls it when the sidebar hides) writes a pending edit straight away.
//
// The save scheduler (one write per typing pause, issue #25) is an internal
// detail. Timers are injected for tests. No browser APIs here.
//
// A new note starts as a fresh page (openDraft, #61): nothing is made until
// the first character is typed or the title is confirmed, so a click alone or
// leaving without typing leaves nothing behind. `onCreate(note)` tells the
// Screen the moment the note exists. It lives behind the Screen (#65).

import { createSaveScheduler } from "./save-scheduler.mjs";

// A few words of the first line, Markdown marks left out, for a note that was
// written on before it was given a title.
function titleFromText(body) {
  const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
  const words = firstLine
    .replace(/\[\[|\]\]/g, "")
    .replace(/[#*_`>~\[\]|\\\/:]/g, " ")
    .replace(/^\s*-\s+/, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 5).join(" ") || "New note";
}

export function createNoteSession({ notebook, onSaveError, onCreate, onRetitle, ...timers }) {
  let openTitle = null;
  // True while a note that was named from its first line is still being
  // written on that line: its title follows what is typed (#80).
  let following = false;
  // The fresh page on screen: { title, source }, `source` only for a page.
  let draft = null;

  const scheduler = createSaveScheduler({
    save: ({ title, body }) => {
      try {
        notebook.saveBody(title, body);
      } catch (error) {
        onSaveError?.(error);
      }
    },
    ...timers,
  });

  function flush() {
    scheduler.flush();
  }

  // Turn the fresh page into a note; only a page gives it a source. A note
  // joins a Collection only when you put it there (#92): the one exception is
  // a new note for a page whose other notes you already put in one.
  function createFromDraft(title, { named = true } = {}) {
    const { source, title: pageTitle } = draft;
    draft = null;
    const siblings = source ? notebook.notesForPage(source) : [];
    const course = siblings.find((note) => note.course)?.course;
    const note = notebook.createNote({ title, source, pageTitle, course });
    openTitle = note.title;
    following = !named;
    onCreate?.(note);
    return note;
  }

  // Give the note the title of the first line as typed so far. A clash gets
  // the free name the Notebook suggests. Stops following once a second line
  // exists.
  function followFirstLine(body) {
    if (body.trimStart().includes("\n")) following = false;
    const wanted = titleFromText(body);
    if (wanted === openTitle) return;
    flush();
    const result = notebook.renameNote(openTitle, wanted);
    const note = result.ok ? result.note : result.suggestion && notebook.renameNote(openTitle, result.suggestion).note;
    if (!note || note.title === openTitle) return;
    openTitle = note.title;
    onRetitle?.(note);
  }

  return {
    open(note) {
      flush();
      draft = null;
      following = false;
      openTitle = note.title;
    },
    openDraft({ title = "", source }) {
      flush();
      openTitle = null;
      following = false;
      draft = { title, source };
    },
    // The title typed in the pill, confirmed with Enter. An empty title is
    // refused (null), so the pill can ask for one.
    confirmTitle(title) {
      const name = (title ?? "").trim();
      if (!draft || !name) return null;
      return createFromDraft(name);
    },
    edit(body) {
      if (draft && body !== "") {
        const typedTitle = draft.title.trim();
        createFromDraft(typedTitle || titleFromText(body), { named: Boolean(typedTitle) });
      } else if (following) {
        followFirstLine(body);
      }
      if (openTitle === null) {
        return;
      }
      scheduler.schedule({ title: openTitle, body });
    },
    // The caret left the first line (Enter, an arrow key, a click elsewhere).
    leaveFirstLine() {
      following = false;
    },
    close() {
      flush();
      following = false;
      draft = null;
      openTitle = null;
    },
    flush,
  };
}
