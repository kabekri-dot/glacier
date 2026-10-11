// The Note session owns saving the open note. Each edit is bound to the note it
// was typed in, so a delayed save always lands there, even if another note has
// been opened since. Opening another note, closing, or flush() (the panel
// calls it when the sidebar hides) writes a pending edit straight away.
//
// The save scheduler (one write per typing pause, issue #25) is an internal
// detail. Timers are injected for tests. No browser APIs here.
//
// A new note starts as a fresh page (openDraft, #61): nothing is made until
// the first character is typed or the title is confirmed, so a click alone or
// leaving without typing leaves nothing behind. `onCreate(note)` tells the
// panel the moment the note exists.

import { createSaveScheduler } from "./save-scheduler.mjs";

export function createNoteSession({ notebook, onSaveError, onCreate, ...timers }) {
  let openTitle = null;
  // The fresh page on screen: { type: "lesson" | "concept", title, source }.
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

  // Turn the fresh page into a note. A Lesson note takes the last used Course;
  // one made by hand has no Source.
  function createFromDraft(title) {
    const { type, source } = draft;
    draft = null;
    const note =
      type === "concept"
        ? notebook.createConceptNote({ title })
        : notebook.createLessonNote({ title, source, course: notebook.lastCourse() });
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
    openDraft({ type, title = "", source }) {
      flush();
      openTitle = null;
      draft = { type, title, source };
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
        createFromDraft(draft.title.trim() || "Untitled");
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
