// The Notebook core: all note, Link, title, search, file-format and sync
// logic lives here as later slices add it. It has no screen code and no
// browser APIs; storage (and later GitHub) is plugged in from outside
// (ADR 0003), so the core can be tested with an in-memory stand-in.

// A Source is a lesson's web address compared without its query string or
// #fragment (CONTEXT.md), so the same lesson matches one Lesson Note even
// when the address carries extra bits like `?utm=…` or `#section-2`.
export function normalizeSource(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split("#")[0].split("?")[0];
  }
}

export function createNotebook({ storage }) {
  if (!storage) {
    throw new Error("createNotebook needs a storage plug-in");
  }

  // The Course a Lesson Note was last filed under, so the Course picker can
  // preselect it. It is kept in storage (not just memory) so it survives a
  // browser restart (ADR 0003), alongside the notes themselves.
  const LAST_COURSE = "lastCourse";

  function titleTaken(title) {
    return storage.getNote(title) !== undefined;
  }

  // Titles are unique across the whole Notebook (ADR 0005). On a clash we add
  // the Course, e.g. "Introduction (TOP Foundations)"; if that is taken too we
  // add a number so the new note still lands on a free title.
  function uniqueTitle(title, course) {
    if (!titleTaken(title)) {
      return title;
    }
    const withCourse = `${title} (${course})`;
    if (!titleTaken(withCourse)) {
      return withCourse;
    }
    let n = 2;
    while (titleTaken(`${withCourse} ${n}`)) {
      n += 1;
    }
    return `${withCourse} ${n}`;
  }

  return {
    // Every Note currently in the Notebook.
    notes() {
      return storage.allNotes();
    },
    isEmpty() {
      return storage.allNotes().length === 0;
    },

    // One note by its (unique) title, or undefined if there is none.
    note(title) {
      return storage.getNote(title);
    },

    lastCourse() {
      return storage.getMeta(LAST_COURSE);
    },

    // The Lesson Note for the page you're on, matched by Source, or undefined
    // when the page has none yet (the "+ Lesson note" prompt).
    lessonNoteForSource(url) {
      const key = normalizeSource(url);
      return storage
        .allNotes()
        .find(
          (note) =>
            note.type === "lesson" && normalizeSource(note.source) === key,
        );
    },

    // Start a Lesson Note for the page you're on: it takes the page title
    // (made unique) and remembers the page as its Source. The chosen Course
    // becomes the last-used one.
    createLessonNote({ title, source, course, created }) {
      const note = {
        type: "lesson",
        title: uniqueTitle(title, course),
        course,
        source: normalizeSource(source),
        created: created ?? new Date().toISOString(),
        body: "",
      };
      storage.putNote(note);
      storage.putMeta(LAST_COURSE, course);
      return note;
    },

    // Save the note's Markdown body. The editor calls this as you type, so
    // there is no save button (the write-through storage keeps IndexedDB in
    // step). Unknown titles are ignored rather than creating a stray note.
    saveBody(title, body) {
      const note = storage.getNote(title);
      if (!note) {
        return undefined;
      }
      const updated = { ...note, body };
      storage.putNote(updated);
      return updated;
    },
  };
}
