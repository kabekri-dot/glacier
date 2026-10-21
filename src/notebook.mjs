// The Notebook core: notes, Links, titles, search, Collections and the
// Archive. Note files are src/note-file.mjs, secret notes
// src/sealed-notes.mjs and sync src/notes-sync.mjs. It has no screen code and
// no browser APIs; storage and the remote are plugged in from outside
// (ADR 0003), so the core can be tested with in-memory stand-ins.

import { findLinks } from "./editor-model.mjs";
import { unzipFiles } from "./zip.mjs";
import { sketchFilePath, sketchFromSvg, sketchInLine } from "./sketch-file.mjs";
import { createSealedNotes } from "./sealed-notes.mjs";
import { createNotesSync } from "./notes-sync.mjs";
import { nextSketchNumber, noteFromFile, noteToFile, safeName, sameCollection, sameNote, sketchEmbed, sketchNumbers, withTitle, zipNotes } from "./note-file.mjs";

// The note file format, as the Notebook has always offered it.
export { noteFromFile, noteToFile, sketchEmbed } from "./note-file.mjs";

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

// The link to the lesson is labelled with its site (#61): the domain without
// `www.`, e.g. "youtube.com".
export function sourceLabel(source) {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
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

// A note as the print layout takes it: its text and its sketches.
function printable(note) {
  return { title: note.title, body: note.body ?? "", ...(note.sketches && { sketches: note.sketches }) };
}

// A note's text without its Markdown marks, for search snippets: headings,
// quotes, bullets and code fences lose their marks, links show their title.
export function plainText(markdown) {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*(```|~~~)/.test(line))
    .map((line) => line.replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/, ""))
    .join("\n")
    .replace(/!?\[\[([^\]|]+)(\|([^\]]*))?\]\]/g, (_, target, bar, label) => label ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`|\*)/g, "");
}

// What a Restore did, in one short sentence for the screen.
export function importSummary({ added, unchanged, copies }) {
  const notes = (n) => (n === 1 ? "1 note" : `${n} notes`);
  const parts = [`Restored ${notes(added)}`];
  if (unchanged > 0) parts.push(`${unchanged} already here`);
  if (copies > 0) parts.push(`${copies} kept as a copy next to yours`);
  return parts.join(", ") + ".";
}

// --- The Notes Repo (#14, ADR 0003) -----------------------------------------
//
// The Notes Repo is a GitHub repository, named "owner/name". People often
// paste its address instead, so that is accepted too.
export function notesRepoName(input) {
  const name = (input ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
  return /^[\w.-]+\/[\w.-]+$/.test(name) ? name : undefined;
}

// When a note was last written in, for "the page opens its most recently
// edited note" (#68). A note nobody has written in yet counts from when it
// was made.
function lastEdited(note) {
  return note.edited ?? note.created ?? "";
}

// `onSaveError(error)` hears of a secret note's text that couldn't be
// encrypted into storage, so the sidebar can say the save failed (#25).
export function createNotebook({ storage, onSaveError = () => {} }) {
  if (!storage) {
    throw new Error("createNotebook needs a storage plug-in");
  }

  // The Collection a note was last filed under, so the Collection line can offer it
  // first. It is kept in storage (not just memory) so it survives a
  // browser restart (ADR 0003), alongside the notes themselves.
  const LAST_COURSE = "lastCourse";
  // Collections made from the ▾ menu that have no notes yet (#82). One stays
  // listed until a note is put in it or it is deleted.
  const EMPTY_COURSES = "emptyCollections";
  // Titles of the notes opened lately, newest first, kept in storage too.
  const RECENT = "recentNotes";
  const RECENT_KEPT = 20;
  // How much text to show on each side of a match in a search snippet.
  const SNIPPET_SIDE = 30;
  // Secret notes (#109, ADR 0012): every read and write of a note's text
  // goes through them, so a locked note is never read or written into.
  const sealed = createSealedNotes({ storage, onSaveError });
  const { reveal, readable, readableNotes, store } = sealed;

  // The text around the earliest match of any word, cut to a short stretch on
  // each side, as pieces in order: `{ text, match }`, with `match` true for
  // the pieces the screen should highlight.
  function snippetAround(rawBody, words) {
    const plain = plainText(rawBody);
    const body = words.every((word) => plain.toLowerCase().includes(word)) ? plain : rawBody;
    const lower = body.toLowerCase();
    const found = words.map((word) => ({ at: lower.indexOf(word), length: word.length }));
    const first = found.filter((hit) => hit.at !== -1).sort((a, b) => a.at - b.at)[0];
    const from = Math.max(0, first.at - SNIPPET_SIDE);
    const to = Math.min(body.length, first.at + first.length + SNIPPET_SIDE);
    const window =
      (from > 0 ? "…" : "") + body.slice(from, to).replace(/\s+/g, " ") + (to < body.length ? "…" : "");
    const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Splitting on a group puts the matches at the odd places.
    return window
      .split(new RegExp(`(${escaped.join("|")})`, "i"))
      .map((text, i) => ({ text, match: i % 2 === 1 }))
      .filter((piece) => piece.text !== "");
  }

  // Titles that differ only in capitals count as the same (#118): Windows
  // and macOS would put both notes in one file. `except` is the note being
  // renamed, which may take its own title in other capitals.
  function titleTaken(title, except) {
    const lower = title.toLowerCase();
    return storage.allNotes().some((note) => note.title !== except && note.title.toLowerCase() === lower);
  }

  // Titles are unique across the whole Notebook (ADR 0005). On a clash we add
  // the Collection, e.g. "Introduction (TOP Foundations)"; if that is taken too we
  // add a number so the new note still lands on a free title. A note without a
  // Collection falls straight back to a number.
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

  // Every note is just a Note (ADR 0010): its page (Source) and its Collection are
  // both optional. The title is made unique, and a Collection given becomes the
  // last used one. A `secret` note (one extracted from a secret note) is
  // secret from the start, while the passcode is open.
  function makeNote({ title, source, pageTitle, course: typed, created, secret }) {
    const made = created ?? new Date().toISOString();
    const course = typed && existingCollection(typed);
    const note = { title: uniqueTitle(title, course) };
    if (course) note.course = course;
    if (source) note.source = normalizeSource(source);
    if (source && pageTitle) note.pageTitle = pageTitle;
    Object.assign(note, { created: made, edited: made, body: "" });
    storage.putNote(note);
    if (course) storage.putMeta(LAST_COURSE, course);
    if (secret && sealed.isUnlocked()) return store({ ...note, secret: true });
    return note;
  }

  // The empty Collections that still have no note (#82).
  function emptyCollections() {
    return (storage.getMeta(EMPTY_COURSES) ?? []).filter(
      (name) => !storage.allNotes().some((note) => sameCollection(note.course, name)),
    );
  }

  // The spelling the Notebook already uses for this Collection name, in any
  // capitals (#73), or the name as typed when it is a new Collection.
  function existingCollection(name) {
    const found = storage.allNotes().find((note) => sameCollection(note.course, name));
    if (found) return found.course;
    return emptyCollections().find((empty) => sameCollection(empty, name)) ?? name;
  }

  // When notes carry one Collection in different capitals, they all take one
  // spelling (#73): the one with the most notes, or on a tie the one with the
  // oldest note. So they show as one, and their files move into one folder on
  // the next sync, together with everything else that sync sends.
  function mergeCollectionCases() {
    const groups = new Map();
    for (const note of storage.allNotes()) {
      if (!note.course) continue;
      const key = note.course.toLowerCase();
      if (!groups.has(key)) groups.set(key, new Map());
      const spellings = groups.get(key);
      const created = note.created ?? "";
      const seen = spellings.get(note.course) ?? { count: 0, oldest: created };
      spellings.set(note.course, { count: seen.count + 1, oldest: created < seen.oldest ? created : seen.oldest });
    }
    const chosen = new Map();
    for (const [key, spellings] of groups) {
      if (spellings.size < 2) continue;
      const [[best]] = [...spellings].sort(
        ([, a], [, b]) => b.count - a.count || a.oldest.localeCompare(b.oldest),
      );
      chosen.set(key, best);
    }
    if (chosen.size === 0) return;
    for (const note of storage.allNotes()) {
      const best = note.course && chosen.get(note.course.toLowerCase());
      if (best && note.course !== best) storage.putNote({ ...note, course: best });
    }
    const last = storage.getMeta(LAST_COURSE);
    const lastBest = last && chosen.get(last.toLowerCase());
    if (lastBest && lastBest !== last) storage.putMeta(LAST_COURSE, lastBest);
  }

  // The notes the lists, search and the page lookup show: not the archived ones.
  function listed() {
    return readableNotes().filter((note) => !note.archived);
  }

  // One Collection's notes, in any capitals (#73): the listed ones, or with
  // `archived` the ones in the Archive.
  function notesIn(course, archived = false) {
    return storage.allNotes().filter((note) => Boolean(note.archived) === archived && note.course && sameCollection(note.course, course));
  }

  // Give a note a new, free title and rewrite every exact Link to it in
  // every note that can be read (ADR 0005), keeping it in the recent notes.
  function retitle(oldTitle, title) {
    for (const other of readableNotes()) {
      if (other.locked) continue;
      const body = rewriteLinks(other.body, oldTitle, title);
      if (body !== other.body) {
        store({ ...other, body });
      }
    }
    const before = readable(oldTitle);
    const stored = storage.getNote(oldTitle);
    storage.deleteNote(oldTitle);
    sealed.forget(oldTitle);
    storage.putNote({ ...stored, title });
    const renamed = before.locked ? readable(title) : store(withTitle(before, title));
    const recent = storage.getMeta(RECENT);
    if (recent) {
      storage.putMeta(RECENT, recent.map((t) => (t === oldTitle ? title : t)));
    }
    return renamed;
  }

  // Notes saved before #118 may have titles that differ only in capitals.
  // All but one in each group get a number, Links to them following, so each
  // has its own file. The one kept is a note in `synced` (its file is already
  // there), or else the oldest. A locked secret note can't be renamed until
  // it is opened, so it waits for a later turn.
  function numberTitleCases(synced = new Set()) {
    const groups = new Map();
    for (const note of storage.allNotes()) {
      const key = note.title.toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), note]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort(
        (a, b) => synced.has(b.title) - synced.has(a.title) || (a.created ?? "").localeCompare(b.created ?? ""),
      );
      for (const note of group.slice(1)) {
        if (readable(note.title).locked) continue;
        retitle(note.title, uniqueTitle(note.title));
      }
    }
  }

  // Notes saved before #73 may hold one Collection in different capitals.
  mergeCollectionCases();
  numberTitleCases();

  const notesSync = createNotesSync({ storage, sealed, uniqueTitle, mergeCollectionCases, numberTitleCases });

  return {
    // Every Note currently in the Notebook, archived ones too.
    notes() {
      return readableNotes();
    },
    isEmpty() {
      return storage.allNotes().length === 0;
    },

    // One note by its (unique) title, or undefined if there is none.
    note(title) {
      return readable(title);
    },

    lastCourse() {
      return storage.getMeta(LAST_COURSE);
    },

    // Every Collection that has at least one note, each once, sorted. Notes
    // without a Collection add nothing.
    courses() {
      const seen = new Set();
      for (const note of listed()) {
        if (note.course) {
          seen.add(note.course);
        }
      }
      return [...seen, ...emptyCollections()].sort((a, b) => a.localeCompare(b));
    },

    // The Collections for the list on the line above the text (#61): the last
    // used one first, then the rest as courses() sorts them.
    courseChoices() {
      const last = storage.getMeta(LAST_COURSE);
      const rest = this.courses().filter((course) => course !== last);
      return last && this.courses().includes(last) ? [last, ...rest] : rest;
    },

    // Make an empty Collection from the ▾ menu (#82). A name that exists in
    // other capitals picks the existing one (#73). Returns the name.
    newCollection(course) {
      const typed = (course ?? "").trim();
      if (!typed) return undefined;
      const name = existingCollection(typed);
      if (!this.courses().includes(name)) {
        storage.putMeta(EMPTY_COURSES, [...emptyCollections(), name]);
      }
      return name;
    },

    // Take a note out of its Collection (#82). The last used Collection stays.
    removeFromCourse(title) {
      const note = storage.getNote(title);
      if (!note) return note;
      const { course, ...moved } = note;
      storage.putNote(moved);
      return reveal(moved);
    },

    // Move a note to another Collection, picked or typed on the line above the
    // text (#61). It becomes the last used Collection, and the note's file moves
    // to the Collection's folder on the next sync, like a rename. A name typed
    // in other capitals picks the existing Collection (#73).
    moveToCourse(title, course) {
      const note = storage.getNote(title);
      const typed = (course ?? "").trim();
      if (!note || !typed) return note;
      const name = existingCollection(typed);
      const moved = { ...note, course: name };
      storage.putNote(moved);
      storage.putMeta(LAST_COURSE, name);
      return reveal(moved);
    },

    // Put every note of this page's group (the ones in no Collection) in a
    // Collection at once (#92). Returns the titles that moved.
    movePageToCollection(url, course) {
      return this.notesForPage(url)
        .filter((note) => !note.course)
        .map((note) => this.moveToCourse(note.title, course).title);
    },

    // Every note for this page, matched by Source, the most recently edited
    // first (#68). Archived notes are left out.
    notesForPage(url) {
      const key = normalizeSource(url);
      return listed()
        .filter((note) => note.source && normalizeSource(note.source) === key)
        .sort((a, b) => lastEdited(b).localeCompare(lastEdited(a)));
    },

    // The note a page opens: its most recently edited one, or undefined when
    // the page has none yet (the empty paper, #61).
    noteForPage(url) {
      return this.notesForPage(url)[0];
    },

    // Make a note. `source` (the page), its `pageTitle` and `course` are all
    // optional: a note for a page remembers it as the Source, with the page's
    // title for its page group (#92); a blank note has neither.
    createNote({ title, source, pageTitle, course, created, secret } = {}) {
      return reveal(makeNote({ title, source, pageTitle, course, created, secret }));
    },

    // The titles this note links to, in order of first appearance and without
    // repeats, read from its `[[Title]]` Links. An unknown note, or one with no
    // body, has none.
    outgoingLinks(title) {
      const note = readable(title);
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
    // A note's own Link to itself doesn't count, and a locked secret note
    // shows none (#109).
    backlinks(title) {
      if (readable(title)?.locked) return [];
      return readableNotes()
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

    // Follow a `[[Title]]` Link: open the note it names, or, when it is a
    // Missing Link, create a note with that title (no page, no Collection) and
    // open that. The note to show is returned either way.
    openLink(title) {
      const existing = readable(title);
      if (existing) {
        return existing;
      }
      return makeNote({ title });
    },

    // Search (#69). Plain text matches titles only, ignoring case. A query
    // starting with `//` searches the text of every note instead: a note
    // matches when it holds every word after the `//`, in any order. Text
    // matches carry a snippet (see snippetAround). Archived notes are left
    // out, and a locked secret note's text is not looked in (#109).
    search(query) {
      const text = (query ?? "").trim();
      if (text.startsWith("//")) {
        const words = text.slice(2).toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          return [];
        }
        return listed()
          .filter((note) => {
            const body = (note.body ?? "").toLowerCase();
            return words.every((word) => body.includes(word));
          })
          .map((note) => ({ title: note.title, snippet: snippetAround(note.body, words) }));
      }
      const needle = text.toLowerCase();
      if (!needle) {
        return [];
      }
      return listed()
        .filter((note) => note.title.toLowerCase().includes(needle))
        .map((note) => ({ title: note.title }));
    },

    // The Notebook as the menu lists it: Collections (sorted) with their notes
    // (sorted), then the notes that have no Collection.
    outline() {
      const byCourse = new Map();
      const uncategorised = [];
      for (const note of listed()) {
        if (note.course) {
          if (!byCourse.has(note.course)) {
            byCourse.set(note.course, []);
          }
          byCourse.get(note.course).push(note.title);
        } else {
          uncategorised.push(note.title);
        }
      }
      const sorted = (titles) => titles.sort((a, b) => a.localeCompare(b));
      for (const course of emptyCollections()) byCourse.set(course, []);
      return {
        courses: [...byCourse.keys()]
          .sort((a, b) => a.localeCompare(b))
          .map((course) => ({ course, titles: sorted(byCourse.get(course)) })),
        uncategorised: sorted(uncategorised),
      };
    },

    // Remember that a note was opened, for the menu's recent notes.
    markOpened(title) {
      const rest = (storage.getMeta(RECENT) ?? []).filter((t) => t !== title);
      storage.putMeta(RECENT, [title, ...rest].slice(0, RECENT_KEPT));
    },

    // The notes opened lately, newest first, without any that are gone.
    recentNotes(limit = 5) {
      return (storage.getMeta(RECENT) ?? [])
        .map((title) => readable(title))
        .filter((note) => note && !note.archived)
        .slice(0, limit);
    },

    // Change a note's title and rewrite every `[[Old Title]]` in every note to
    // `[[New Title]]`, so no connection breaks (ADR 0005). Only exact Links are
    // touched: `[[Old Title 2]]` stays. A title that is already taken is
    // refused with a free alternative to offer instead. The Links inside a
    // locked secret note can't be read, so they stay as they are (ADR 0012).
    // A locked secret note itself is not renamed ({ ok: false, locked: true }):
    // its sketch lines inside the encrypted text name the old title and can't
    // be rewritten until it is opened.
    renameNote(oldTitle, newTitle) {
      const note = storage.getNote(oldTitle);
      const title = (newTitle ?? "").trim();
      if (!note || !title) {
        return { ok: false };
      }
      if (title === oldTitle) {
        return { ok: true, note: reveal(note) };
      }
      if (readable(oldTitle).locked) {
        return { ok: false, locked: true };
      }
      if (titleTaken(title, oldTitle)) {
        return { ok: false, suggestion: uniqueTitle(title, note.course) };
      }
      return { ok: true, note: retitle(oldTitle, title) };
    },

    // Delete a note for good (#57). Links to it stay in other notes' text and
    // become Missing Links. Its file leaves the Notes Repo on the next sync,
    // which sees a synced file that no note has any more. Returns what was
    // taken, for undoDelete; null when there was no such note.
    deleteNote(title) {
      const stored = storage.getNote(title);
      if (!stored) return null;
      const recent = storage.getMeta(RECENT) ?? [];
      const taken = { note: stored, open: sealed.opened(title), recentAt: recent.indexOf(title) };
      storage.deleteNote(title);
      sealed.forget(title);
      if (taken.recentAt !== -1) storage.putMeta(RECENT, recent.filter((t) => t !== title));
      return { notes: [taken], emptyCollections: [] };
    },

    // Undo a delete (#116): put back each note exactly as it was stored, open
    // again if it was open and the passcode still is, at its place in the
    // recent notes. A note whose title was taken since is not put back.
    // Returns the titles put back. The next sync sends their files again.
    undoDelete(kept) {
      if (!kept) return [];
      storage.putMeta(EMPTY_COURSES, [...emptyCollections(), ...kept.emptyCollections]);
      const back = [];
      for (const { note, open, recentAt } of kept.notes) {
        if (titleTaken(note.title)) continue;
        storage.putNote(note);
        sealed.putBack(note.title, open);
        if (recentAt !== -1) {
          const recent = (storage.getMeta(RECENT) ?? []).filter((t) => t !== note.title);
          recent.splice(recentAt, 0, note.title);
          storage.putMeta(RECENT, recent.slice(0, RECENT_KEPT));
        }
        back.push(note.title);
      }
      return back;
    },

    // Archive (#58): hide a note from the lists, search, recent notes and the
    // page lookup, but keep it. Links to it still open it. Its file moves under
    // `archive/` on the next sync, as one commit like a rename.
    archiveNote(title) {
      const note = storage.getNote(title);
      if (note && !note.archived) storage.putNote({ ...note, archived: true });
    },

    // Put an archived note back where it was: same Collection, same page.
    unarchiveNote(title) {
      const note = storage.getNote(title);
      if (!note || !note.archived) return;
      const { archived, ...rest } = note;
      storage.putNote(rest);
    },

    // Archive every note of a Collection (#74). Returns their titles, so Undo
    // can put back exactly those.
    archiveCollection(course) {
      const titles = listed().filter((note) => sameCollection(note.course, course)).map((note) => note.title);
      titles.forEach((title) => this.archiveNote(title));
      return titles;
    },

    // Unarchive every archived note of a Collection (#74).
    unarchiveCollection(course) {
      const titles = storage
        .allNotes()
        .filter((note) => note.archived && sameCollection(note.course, course))
        .map((note) => note.title);
      titles.forEach((title) => this.unarchiveNote(title));
      return titles;
    },

    // Delete a Collection and the notes in it for good (#74). The archived
    // notes of the same name are not in the Collection's list, so they stay.
    // Returns what was taken, for undoDelete.
    deleteCollection(course) {
      const empty = emptyCollections();
      storage.putMeta(EMPTY_COURSES, empty.filter((name) => !sameCollection(name, course)));
      const notes = listed()
        .filter((note) => sameCollection(note.course, course))
        .flatMap((note) => this.deleteNote(note.title).notes);
      return { notes, emptyCollections: empty.filter((name) => sameCollection(name, course)) };
    },

    // The Archive as the menu lists it: by Collection, then the notes without one.
    archivedOutline() {
      const courses = new Map();
      const uncategorised = [];
      for (const { title, course } of this.archivedNotes()) {
        if (!course) uncategorised.push(title);
        else if (courses.has(course)) courses.get(course).push(title);
        else courses.set(course, [title]);
      }
      return {
        courses: [...courses.keys()].sort((a, b) => a.localeCompare(b)).map((course) => ({ course, titles: courses.get(course) })),
        uncategorised,
      };
    },

    // The archived notes, sorted by title, for the menu's Archive section.
    archivedNotes() {
      return storage
        .allNotes()
        .filter((note) => note.archived)
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    // Save the note's Markdown body. The editor calls this as you type, so
    // there is no save button (the write-through storage keeps IndexedDB in
    // step). Unknown titles are ignored rather than creating a stray note.
    // New text marks the note as just edited, so its page opens it first.
    // A locked secret note is never written into (#109).
    saveBody(title, body) {
      const note = readable(title);
      if (!note || note.locked) {
        return undefined;
      }
      if ((note.body ?? "") === body) {
        return note;
      }
      return store({ ...note, body, edited: new Date().toISOString() });
    },

    // Sketches (#101, ADR 0007). Start a new, empty sketch in a note, as wide
    // as the text it sits in. Returns its number and the embed line for the
    // editor to put in the text, or undefined for an unknown note.
    addSketch(title, { width = 320, height = 160 } = {}) {
      const note = readable(title);
      if (!note || note.locked) return undefined;
      const n = nextSketchNumber(note);
      const sketches = { ...note.sketches, [n]: { width, height, shapes: [] } };
      store({ ...note, sketches, edited: new Date().toISOString() });
      return { n, line: sketchEmbed(title, n) };
    },

    // One sketch of a note, `{ width, height, shapes }`, or undefined.
    sketch(title, n) {
      return readable(title)?.sketches?.[n];
    },

    // The sketch an embed line shows, `{ title, n, sketch }`, or null when the
    // line is no embed or its note or sketch isn't here. A Conflict Copy's
    // line still points at its original's sketch, so that one shows.
    sketchForLine(line) {
      const embed = sketchInLine(line);
      if (!embed) return null;
      const note = readableNotes().find((one) => safeName(one.title) === embed.stem && one.sketches?.[embed.n]);
      return note ? { title: note.title, n: embed.n, sketch: note.sketches[embed.n] } : null;
    },

    // Save a sketch as it is drawn. Like the text, it marks the note as just
    // edited, and Sync sends its file.
    saveSketch(title, n, sketch) {
      const note = readable(title);
      if (!note?.sketches?.[n]) return undefined;
      const sketches = { ...note.sketches, [n]: sketch };
      return store({ ...note, sketches, edited: new Date().toISOString() });
    },

    // Take out the note's sketches that have no shape, and their embed
    // lines (#104): an empty sketch left empty is not kept. Returns true when
    // the note changed.
    dropEmptySketches(title) {
      const note = readable(title);
      const empty = sketchNumbers(note ?? {}).filter((n) => note.sketches[n].shapes.length === 0);
      if (empty.length === 0) return false;
      const sketches = { ...note.sketches };
      for (const n of empty) delete sketches[n];
      const isEmptyEmbed = (line) => {
        const embed = sketchInLine(line);
        return embed !== null && embed.stem === safeName(title) && empty.includes(embed.n);
      };
      const body = (note.body ?? "").split("\n").filter((line) => !isEmptyEmbed(line)).join("\n");
      store({ ...note, body, sketches, edited: new Date().toISOString() });
      return true;
    },

    // Delete a note that is completely empty (#119): no text, no sketch, no
    // Collection, not secret or archived. Returns true when it went. The
    // Screen only asks for a note whose title nobody typed.
    dropEmptyNote(title) {
      const note = readable(title);
      const empty = note && !note.secret && !note.archived && !note.course && (note.body ?? "").trim() === "" && sketchNumbers(note).length === 0;
      if (!empty) return false;
      this.deleteNote(title);
      return true;
    },

    hasSketches(title) {
      return sketchNumbers(storage.getNote(title) ?? {}).length > 0;
    },

    // --- Secret notes (#109, ADR 0012), in src/sealed-notes.mjs ---
    hasPasscode: sealed.hasPasscode,
    isUnlocked: sealed.isUnlocked,
    isSecret: sealed.isSecret,
    isLocked: sealed.isLocked,
    setPasscode: sealed.setPasscode,
    unlock: sealed.unlock,
    lock: sealed.lock,
    makeSecret: sealed.makeSecret,
    makeNotSecret: sealed.makeNotSecret,
    changePasscode: sealed.changePasscode,
    settled: sealed.settled,

    // Export (#13): the whole Notebook as a zip of note files, ready to open
    // as an Obsidian vault.
    exportZip() {
      return zipNotes(storage.allNotes());
    },

    // The same zip with only one Collection's notes; `archived` gives the
    // ones in the Archive instead, for its Download icon.
    exportCourseZip(course, { archived = false } = {}) {
      return zipNotes(notesIn(course, archived));
    },

    // The same zip with only the archived notes.
    exportArchiveZip() {
      return zipNotes(storage.allNotes().filter((note) => note.archived));
    },

    // The notes to lay out for printing (#71), as { title, body }: one note,
    // or a Collection's notes one after another. A locked secret note is left
    // out (#109).
    notesToPrint(title) {
      const note = readable(title);
      return note && !note.locked ? [printable(note)] : [];
    },

    notesOfCourse(course, { archived = false } = {}) {
      return notesIn(course, archived)
        .map(reveal)
        .filter((note) => !note.locked)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(printable);
    },

    // One note with its sketch files, zipped (#101).
    exportNoteZip(title) {
      return zipNotes([storage.getNote(title)]);
    },

    // One note as its single Markdown file, `{ path, text }`.
    exportNote(title) {
      return noteToFile(storage.getNote(title));
    },

    // --- Sync (#14, #15), in src/notes-sync.mjs ---
    firstSync: notesSync.firstSync,
    notesHome: notesSync.notesHome,
    switchNotesHome: notesSync.switchNotesHome,
    sync: notesSync.sync,
    conflictCopies: notesSync.conflictCopies,
    conflictCopyPairs: notesSync.conflictCopyPairs,
    lastSynced: notesSync.lastSynced,

    // Import (#13): turn such a zip back into notes. A note the Notebook
    // doesn't have is added; one it has with the same text is left alone; one
    // whose text differs is never overwritten (ADR 0004): the imported version
    // is added next to it under a free title. A note's sketch files come
    // back into it (#101). Other files (an `.obsidian` folder, pictures) are
    // skipped. A broken zip is refused before anything changes.
    async importZip(bytes) {
      const files = await unzipFiles(bytes);
      const today = new Date().toISOString().slice(0, 10);
      const result = { added: 0, unchanged: 0, copies: 0 };
      // Which note each Markdown file became, so its sketch files follow it.
      const landed = new Map();
      for (const { path, text } of files.filter(({ path }) => /\.md$/i.test(path))) {
        const note = noteFromFile(path, text);
        const existing = storage.getNote(note.title);
        if (!existing) {
          storage.putNote(note);
          result.added += 1;
          landed.set(path, note.title);
        } else if (sameNote(existing, note, { ignoreArchived: true })) {
          result.unchanged += 1;
          landed.set(path, note.title);
        } else {
          const copy = withTitle({ ...note, sketches: {} }, uniqueTitle(`${note.title} (imported ${today})`));
          storage.putNote(copy);
          result.copies += 1;
          landed.set(path, copy.title);
        }
      }
      for (const { path, text } of files.filter(({ path }) => /\.svg$/i.test(path))) {
        const where = sketchFilePath(path);
        const note = where && storage.getNote(landed.get(where.notePath));
        const sketch = sketchFromSvg(text);
        if (note && sketch) notesSync.adoptSketch(note, where.n, sketch);
      }
      mergeCollectionCases();
      await sealed.reopen();
      return result;
    },
  };
}
