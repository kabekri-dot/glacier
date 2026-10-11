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

export function createNoteSession({ notebook, onSaveError, onCreate, ...timers }) {
  let openTitle = null;
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

  // Turn the fresh page into a note. A note for a page takes the last used
  // Collection; a blank note has no page and no Collection (#68).
  function createFromDraft(title) {
    const { source } = draft;
    draft = null;
    const course = source ? notebook.lastCourse() : undefined;
    const note = notebook.createNote({ title, source, course });
    openTitle = note.title;
    onCreate?.(note);
    return note;
  }

  return {
    open(note) {
      flush();
      draft = null;
      openTitle = note.title;
    },
    openDraft({ title = "", source }) {
      flush();
      openTitle = null;
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
        createFromDraft(draft.title.trim() || titleFromText(body));
      }
      if (openTitle === null) {
        return;
      }
      scheduler.schedule({ title: openTitle, body });
    },
    close() {
      flush();
      draft = null;
      openTitle = null;
    },
    flush,
  };
}
