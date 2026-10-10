// The Notebook core: all note, Link, title, search, file-format and sync
// logic lives here as later slices add it. It has no screen code and no
// browser APIs; storage (and later GitHub) is plugged in from outside
// (ADR 0003), so the core can be tested with an in-memory stand-in.

import { findLinks } from "./editor-model.mjs";

// Query parameters that only record where a click came from, never which
// lesson it is, so they're dropped before matching a Source (CONTEXT.md).
// Kept short and in one place on purpose — extend it by adding names here.
// `utm_*` is matched by prefix; the rest are exact.
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "ref"]);

function isTrackingParam(key) {
  return key.startsWith("utm_") || TRACKING_PARAMS.has(key);
}

// A Source is a lesson's web address compared without its `#fragment` and
// without known tracking parameters (CONTEXT.md). Every other query parameter
// stays, because on sites like YouTube (`watch?v=…`) it identifies the lesson.
// Parameters are sorted so their order on the page doesn't matter, and the
// result is itself a valid Source (idempotent), so stored and live addresses
// compare the same way.
export function normalizeSource(url) {
  if (typeof url !== "string") {
    // A note may carry no Source (half-created or imported); there's nothing
    // to normalize and nothing it can match, so hand it straight back.
    return url;
  }
  try {
    const u = new URL(url);
    const kept = [...u.searchParams.entries()].filter(
      ([key]) => !isTrackingParam(key),
    );
    kept.sort(([ka, va], [kb, vb]) =>
      ka === kb ? va.localeCompare(vb) : ka.localeCompare(kb),
    );
    const params = new URLSearchParams();
    for (const [key, value] of kept) {
      params.append(key, value);
    }
    const query = params.toString();
    return u.origin + u.pathname + (query ? `?${query}` : "");
  } catch {
    // Not a parseable absolute URL (e.g. a bare path): at least drop the
    // #fragment and keep the rest, so the comparison is still stable.
    return url.split("#")[0];
  }
}

// The text with every Link to `oldTitle` pointing at `newTitle` instead.
function rewriteLinks(body, oldTitle, newTitle) {
  if (!body) {
    return body;
  }
  let result = "";
  let from = 0;
  for (const link of findLinks(body)) {
    if (link.title === oldTitle) {
      result += body.slice(from, link.start) + `[[${newTitle}]]`;
      from = link.end;
    }
  }
  return result + body.slice(from);
}

export function createNotebook({ storage }) {
  if (!storage) {
    throw new Error("createNotebook needs a storage plug-in");
  }

  // The Course a Lesson Note was last filed under, so the Course picker can
  // preselect it. It is kept in storage (not just memory) so it survives a
  // browser restart (ADR 0003), alongside the notes themselves.
  const LAST_COURSE = "lastCourse";
  // Titles of the notes opened lately, newest first, kept in storage too.
  const RECENT = "recentNotes";
  const RECENT_KEPT = 20;
  // How much text to show on each side of a match in a search snippet.
  const SNIPPET_SIDE = 30;

  // The text around the first match, cut to a short stretch on each side.
  function snippetAround(body, at, length) {
    const from = Math.max(0, at - SNIPPET_SIDE);
    const to = Math.min(body.length, at + length + SNIPPET_SIDE);
    const flat = (text) => text.replace(/\s+/g, " ");
    return {
      before: (from > 0 ? "…" : "") + flat(body.slice(from, at)),
      match: body.slice(at, at + length),
      after: flat(body.slice(at + length, to)) + (to < body.length ? "…" : ""),
    };
  }

  function titleTaken(title) {
    return storage.getNote(title) !== undefined;
  }

  // Titles are unique across the whole Notebook (ADR 0005). On a clash we add
  // the Course, e.g. "Introduction (TOP Foundations)"; if that is taken too we
  // add a number so the new note still lands on a free title. A Concept Note
  // has no Course, so there we fall straight back to a number.
  function uniqueTitle(title, course) {
    if (!titleTaken(title)) {
      return title;
    }
    const base = course ? `${title} (${course})` : title;
    if (course && !titleTaken(base)) {
      return base;
    }
    let n = 2;
    while (titleTaken(`${base} ${n}`)) {
      n += 1;
    }
    return `${base} ${n}`;
  }

  // A Concept Note captures one idea, independent of any Course, so it carries
  // no Course and no Source (CONTEXT.md). Its title is made unique like any
  // note's. Following a Missing Link is the main way one is born.
  function makeConceptNote({ title, created }) {
    const note = {
      type: "concept",
      title: uniqueTitle(title, undefined),
      created: created ?? new Date().toISOString(),
      body: "",
    };
    storage.putNote(note);
    return note;
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

    // Every Course that has at least one Lesson Note, each once, sorted so the
    // "+ Lesson note" picker can offer them (the last-used one preselected).
    // Concept Notes have no Course and add nothing.
    courses() {
      const seen = new Set();
      for (const note of storage.allNotes()) {
        if (note.type === "lesson" && note.course) {
          seen.add(note.course);
        }
      }
      return [...seen].sort((a, b) => a.localeCompare(b));
    },

    // The Lesson Note for the page you're on, matched by Source, or undefined
    // when the page has none yet (the "+ Lesson note" prompt).
    lessonNoteForSource(url) {
      const key = normalizeSource(url);
      return storage
        .allNotes()
        .find(
          (note) =>
            note.type === "lesson" &&
            note.source &&
            normalizeSource(note.source) === key,
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

    // Make a Concept Note with the given title (made unique). Concept Notes
    // have no Course, so one idea can be linked from lessons of many Courses.
    createConceptNote({ title, created } = {}) {
      return makeConceptNote({ title, created });
    },

    // The titles this note links to, in order of first appearance and without
    // repeats, read from its `[[Title]]` Links. An unknown note, or one with no
    // body, has none.
    outgoingLinks(title) {
      const note = storage.getNote(title);
      if (!note || !note.body) {
        return [];
      }
      const seen = new Set();
      const titles = [];
      for (const { title: target } of findLinks(note.body)) {
        if (!seen.has(target)) {
          seen.add(target);
          titles.push(target);
        }
      }
      return titles;
    },

    // The notes that link to this title, each once (a Backlink, CONTEXT.md).
    // A note's own Link to itself doesn't count.
    backlinks(title) {
      return storage
        .allNotes()
        .filter(
          (note) =>
            note.title !== title && this.outgoingLinks(note.title).includes(title),
        );
    },

    // A Missing Link is a Link whose title matches no note yet (CONTEXT.md),
    // so following it would create the note rather than open an existing one.
    isMissingLink(title) {
      return storage.getNote(title) === undefined;
    },

    // Follow a `[[Title]]` Link: open the note it names, or — when it is a
    // Missing Link — create a Concept Note with that title and open that. The
    // note to show is returned either way.
    openLink(title) {
      const existing = storage.getNote(title);
      if (existing) {
        return existing;
      }
      return makeConceptNote({ title });
    },

    // Simple substring search over titles and text, ignoring case. Notes whose
    // title matches come first; a text match carries a snippet around the
    // first match, split so the screen can highlight `match`.
    search(query) {
      const needle = (query ?? "").trim().toLowerCase();
      if (!needle) {
        return [];
      }
      const inTitle = [];
      const inText = [];
      for (const note of storage.allNotes()) {
        if (note.title.toLowerCase().includes(needle)) {
          inTitle.push({ title: note.title, type: note.type });
          continue;
        }
        const body = note.body ?? "";
        const at = body.toLowerCase().indexOf(needle);
        if (at !== -1) {
          inText.push({
            title: note.title,
            type: note.type,
            snippet: snippetAround(body, at, needle.length),
          });
        }
      }
      return [...inTitle, ...inText];
    },

    // The Notebook as the menu lists it: Courses (sorted) with their Lesson
    // Notes (sorted), Lesson Notes that have no Course, and the Concept Notes.
    outline() {
      const byCourse = new Map();
      const uncategorised = [];
      const concepts = [];
      for (const note of storage.allNotes()) {
        if (note.type === "concept") {
          concepts.push(note.title);
        } else if (note.course) {
          if (!byCourse.has(note.course)) {
            byCourse.set(note.course, []);
          }
          byCourse.get(note.course).push(note.title);
        } else {
          uncategorised.push(note.title);
        }
      }
      const sorted = (titles) => titles.sort((a, b) => a.localeCompare(b));
      return {
        courses: [...byCourse.keys()]
          .sort((a, b) => a.localeCompare(b))
          .map((course) => ({ course, titles: sorted(byCourse.get(course)) })),
        uncategorised: sorted(uncategorised),
        concepts: sorted(concepts),
      };
    },

    // Remember that a note was opened, for the menu's recent notes.
    markOpened(title) {
      const rest = (storage.getMeta(RECENT) ?? []).filter((t) => t !== title);
      storage.putMeta(RECENT, [title, ...rest].slice(0, RECENT_KEPT));
    },

    // The notes opened lately, newest first, without any that are gone.
    recentNotes(limit = 8) {
      return (storage.getMeta(RECENT) ?? [])
        .map((title) => storage.getNote(title))
        .filter(Boolean)
        .slice(0, limit);
    },

    // Change a note's title and rewrite every `[[Old Title]]` in every note to
    // `[[New Title]]`, so no connection breaks (ADR 0005). Only exact Links are
    // touched: `[[Old Title 2]]` stays. A title that is already taken is
    // refused with a free alternative to offer instead.
    renameNote(oldTitle, newTitle) {
      const note = storage.getNote(oldTitle);
      const title = (newTitle ?? "").trim();
      if (!note || !title) {
        return { ok: false };
      }
      if (title === oldTitle) {
        return { ok: true, note };
      }
      if (titleTaken(title)) {
        return { ok: false, suggestion: uniqueTitle(title, note.course) };
      }
      for (const other of storage.allNotes()) {
        const body = rewriteLinks(other.body, oldTitle, title);
        if (body !== other.body) {
          storage.putNote({ ...other, body });
        }
      }
      const renamed = { ...storage.getNote(oldTitle), title };
      storage.deleteNote(oldTitle);
      storage.putNote(renamed);
      const recent = storage.getMeta(RECENT);
      if (recent) {
        storage.putMeta(RECENT, recent.map((t) => (t === oldTitle ? title : t)));
      }
      return { ok: true, note: renamed };
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
