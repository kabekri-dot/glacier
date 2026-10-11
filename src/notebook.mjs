// The Notebook core: all note, Link, title, search, file-format and sync
// logic lives here as later slices add it. It has no screen code and no
// browser APIs; storage and GitHub (the remote) are plugged in from outside
// (ADR 0003), so the core can be tested with in-memory stand-ins.

import { findLinks } from "./editor-model.mjs";
import { zipFiles, unzipFiles } from "./zip.mjs";

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

// --- Note files (ADR 0005, #13) ---------------------------------------------
//
// In the Notes Repo and in an Export every note is a Markdown file named after
// its title: `courses/<Course>/<Title>.md` for a Lesson Note and
// `concepts/<Title>.md` for a Concept Note. A small YAML frontmatter keeps
// `type`, `course`, `source` and `created`, then the Markdown body follows.

// Characters Windows, macOS or Obsidian refuse in a file or folder name.
const UNSAFE_IN_NAMES = /[\\/:*?"<>|]/g;
// Keys written in this order; any other key in a file is ignored on Import.
const FRONTMATTER_KEYS = ["type", "title", "course", "source", "created"];

function safeName(name) {
  return name.replace(UNSAFE_IN_NAMES, "-");
}

// A value is written bare when YAML can only read it back as the same text,
// and in double quotes (a JSON string is valid YAML) otherwise.
function yamlValue(value) {
  const plain = /^[A-Za-z][A-Za-z0-9 ._()&,+-]*$/.test(value) && !value.endsWith(" ");
  const word = /^(true|false|yes|no|on|off|null)$/i.test(value);
  const date = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value);
  return (plain && !word) || date ? value : JSON.stringify(value);
}

function readYamlValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function folderFor(note) {
  if (note.type === "concept") return "concepts";
  if (note.course) return `courses/${safeName(note.course)}`;
  return "courses";
}

function fileFor(note, stem) {
  // The title only goes into the frontmatter when the filename can't hold it
  // as it is (e.g. it has a `/`), so the round trip still gives it back.
  const fields = { ...note, title: stem === note.title ? undefined : note.title };
  let text = "---\n";
  for (const key of FRONTMATTER_KEYS) {
    if (fields[key]) {
      text += `${key}: ${yamlValue(fields[key])}\n`;
    }
  }
  text += "---\n" + (note.body ?? "");
  return { path: `${folderFor(note)}/${stem}.md`, text };
}

// A note as its file: `{ path, text }`.
export function noteToFile(note) {
  return fileFor(note, safeName(note.title));
}

// Split a file into its frontmatter fields and its body. A file that doesn't
// start with a `---` line has no frontmatter and is all body.
function splitFrontmatter(text) {
  const open = text.match(/^---\r?\n/);
  if (!open) {
    return { fields: {}, body: text };
  }
  const close = /^---[ \t]*(\r?\n|$)/m;
  const rest = text.slice(open[0].length);
  const match = close.exec(rest);
  if (!match) {
    return { fields: {}, body: text };
  }
  const fields = {};
  for (const line of rest.slice(0, match.index).split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) {
      fields[line.slice(0, at).trim()] = readYamlValue(line.slice(at + 1));
    }
  }
  return { fields, body: rest.slice(match.index + match[0].length) };
}

// A note from its file. The frontmatter wins; without it the folder tells the
// kind of note and its Course, and the filename gives the title. A file that
// isn't in a Course folder becomes a Concept Note.
export function noteFromFile(path, text) {
  const parts = path.split("/");
  const stem = parts.at(-1).replace(/\.md$/i, "");
  const parent = parts.at(-2);
  const grandparent = parts.at(-3);
  const { fields, body } = splitFrontmatter(text);
  const inCourse = grandparent === "courses" || parent === "courses";
  let type = inCourse ? "lesson" : "concept";
  if (fields.type === "lesson" || fields.type === "concept") type = fields.type;
  const note = { type, title: fields.title || stem };
  const course = fields.course || (grandparent === "courses" ? parent : undefined);
  if (type === "lesson" && course) note.course = course;
  if (type === "lesson" && fields.source) note.source = fields.source;
  note.created = fields.created || new Date().toISOString();
  note.body = body;
  return note;
}

function sameNote(a, b) {
  return ["type", "course", "source", "body"].every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

// Note files for these notes, zipped. Two titles that only differ in
// characters a filename can't hold get a number, and their frontmatter keeps
// the title.
function zipNotes(notes) {
  const taken = new Set();
  const files = [];
  for (const note of notes) {
    const base = safeName(note.title);
    let file = fileFor(note, base);
    for (let n = 2; taken.has(file.path.toLowerCase()); n++) {
      file = fileFor(note, `${base} ${n}`);
    }
    taken.add(file.path.toLowerCase());
    files.push(file);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return zipFiles(files);
}

// What an Import did, in one short sentence for the screen.
export function importSummary({ added, unchanged, copies }) {
  const notes = (n) => (n === 1 ? "1 note" : `${n} notes`);
  const parts = [`Imported ${notes(added)}`];
  if (unchanged > 0) parts.push(`${notes(unchanged)} already here`);
  if (copies > 0) parts.push(`${notes(copies)} kept as a copy next to yours`);
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

// What went wrong talking to the Notes Repo, in one sentence for the screen.
// A remote marks its errors with a `reason`; anything else is unexpected.
export function syncErrorMessage(error, repo) {
  switch (error?.reason) {
    case "unauthorized":
      return "GitHub didn't accept this token. Check that you pasted all of it, or make a new one.";
    case "not-found":
      return `Couldn't find ${repo} on GitHub. Check the name, and that the token is made for this repo.`;
    case "forbidden":
      return `This token can't open ${repo}. Give it Contents access, read and write, on this repo.`;
    case "offline":
      return "Couldn't reach GitHub. Check your connection and try again.";
    default:
      return "Something went wrong talking to GitHub. Please try again in a moment.";
  }
}

// Only Markdown files in the two note folders are notes; a README, an
// `.obsidian` folder or pictures in the Notes Repo are left alone.
function isNoteFile(path) {
  return /^(courses|concepts)\/.+\.md$/i.test(path);
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
  // What each Notes Repo file held when this browser last synced it, keyed by
  // path: `{ title, version, text }`. Comparing a note's file with it tells
  // which side changed since (#15).
  const SYNCED = "syncedFiles";
  const LAST_SYNCED = "lastSynced";
  // "Title (conflict 2026-10-11)", with a number after it for a second one.
  const CONFLICT_TITLE = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;
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

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function conflictCopy(note) {
    const copy = { ...note, title: uniqueTitle(`${note.title} (conflict ${today()})`) };
    storage.putNote(copy);
    return copy;
  }

  // Whether this note is still as it was when its file was last synced.
  function unchangedSince(note, entry, path) {
    const file = noteToFile(note);
    return file.path === path && file.text === entry.text;
  }

  // Bring one changed or new Notes Repo file into this browser. A note that
  // changed here too is never overwritten (ADR 0004): the incoming version
  // becomes a Conflict Copy, and this browser's text is pushed over the file.
  function pullFile(path, version, text, synced, result) {
    const known = synced[path];
    const incoming = noteFromFile(path, text);
    const local = storage.getNote(known ? known.title : incoming.title);
    if (!local) {
      const note = { ...incoming, title: uniqueTitle(incoming.title) };
      storage.putNote(note);
      result.pulled.push(note.title);
      synced[path] = { title: note.title, version, text };
    } else if (
      unchangedSince(local, { text }, path) ||
      (known ? unchangedSince(local, known, path) : sameNote(local, incoming))
    ) {
      if (local.title !== incoming.title) storage.deleteNote(local.title);
      storage.putNote(incoming);
      if (!sameNote(local, incoming) || local.title !== incoming.title) result.pulled.push(incoming.title);
      synced[path] = { title: incoming.title, version, text };
    } else {
      result.pulled.push(conflictCopy(incoming).title);
      result.conflicts += 1;
      synced[path] = { title: local.title, version, text };
    }
  }

  // A file gone from the Notes Repo (deleted, or renamed in another browser)
  // takes its note with it, unless the note changed here since: then it is
  // kept and pushed back.
  function pullDeletion(path, synced, result) {
    const local = storage.getNote(synced[path].title);
    if (local && unchangedSince(local, synced[path], path)) {
      storage.deleteNote(local.title);
      result.pulled.push(local.title);
    }
    delete synced[path];
  }

  // A write or delete named a version the Notes Repo no longer has: the
  // file changed in another browser since this one listed it. Pull it again,
  // so a note changed in both places becomes a Conflict Copy (ADR 0004).
  async function pullAgain(remote, path, synced, result) {
    const listed = (await remote.listFiles()).find((file) => file.path === path);
    if (!listed) {
      if (synced[path]) pullDeletion(path, synced, result);
    } else {
      const { text, version } = await remote.readFile(path);
      pullFile(path, version, text, synced, result);
    }
    storage.putMeta(SYNCED, { ...synced });
  }

  // Write every note whose file differs from what was last synced, then
  // delete the files no note has any more (a rename writes the new file
  // first). What is known is saved after each step, so a lost connection
  // halfway leaves the rest for the next sync. Returns false when a stale
  // version was refused and pulled again, so the push starts over.
  async function pushRound(remote, synced, result) {
    const wanted = new Map();
    for (const note of storage.allNotes()) {
      const file = noteToFile(note);
      wanted.set(file.path, { title: note.title, text: file.text });
    }
    // The file being written or deleted, for when it is refused as stale.
    let path;
    try {
      for (const [wantedPath, { title, text }] of wanted) {
        path = wantedPath;
        const known = synced[path];
        if (known && known.title === title && known.text === text) continue;
        const version = await remote.writeFile(path, text, known?.version);
        synced[path] = { title, version, text };
        storage.putMeta(SYNCED, { ...synced });
        result.pushed += 1;
      }
      for (const syncedPath of Object.keys(synced)) {
        if (wanted.has(syncedPath)) continue;
        path = syncedPath;
        await remote.deleteFile(path, synced[path].version);
        delete synced[path];
        storage.putMeta(SYNCED, { ...synced });
        result.pushed += 1;
      }
      return true;
    } catch (error) {
      if (error?.reason !== "conflict") throw error;
      await pullAgain(remote, path, synced, result);
      return false;
    }
  }

  // A few rounds are plenty: each one takes in what the other browser wrote.
  // If files keep changing under us, the next sync carries on.
  async function push(remote, synced, result) {
    for (let round = 0; round < 3; round += 1) {
      if (await pushRound(remote, synced, result)) return;
    }
    throw Object.assign(new Error("The Notes repo kept changing during sync"), { reason: "conflict" });
  }

  // The Conflict Copies still in the Notebook, by their dated titles.
  function conflictCopies() {
    return storage
      .allNotes()
      .map((note) => note.title)
      .filter((title) => CONFLICT_TITLE.test(title));
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

    // Export (#13): the whole Notebook as a zip of note files, ready to open
    // as an Obsidian vault.
    exportZip() {
      return zipNotes(storage.allNotes());
    },

    // The same zip with only one Course's Lesson Notes.
    exportCourseZip(course) {
      return zipNotes(storage.allNotes().filter((note) => note.type === "lesson" && note.course === course));
    },

    // One note as its single Markdown file, `{ path, text }`.
    exportNote(title) {
      return noteToFile(storage.getNote(title));
    },

    // The first sync (#14): bring every note in the Notes Repo into this
    // browser. All files are downloaded before anything changes, so a wrong
    // token or a lost connection leaves the Notebook as it was. A note that is
    // already here is never overwritten (ADR 0004): if the Notes Repo's text
    // differs, it is kept next to it as a Conflict Copy. Nothing is written
    // to the Notes Repo. `onProgress` hears each step, for the progress screen.
    async firstSync(remote, onProgress = () => {}) {
      onProgress({ step: "connecting" });
      await remote.connect();
      const paths = (await remote.listFiles()).map(({ path }) => path).filter(isNoteFile);
      const downloaded = [];
      onProgress({ step: "downloading", done: 0, total: paths.length });
      for (const path of paths) {
        const { text, version } = await remote.readFile(path);
        downloaded.push({ path, version, text, note: noteFromFile(path, text) });
        onProgress({ step: "downloading", done: downloaded.length, total: paths.length });
      }
      onProgress({ step: "linking" });
      const synced = {};
      for (const { path, version, text, note } of downloaded) {
        const existing = storage.getNote(note.title);
        if (!existing) {
          storage.putNote(note);
        } else if (!sameNote(existing, note)) {
          conflictCopy(note);
        }
        synced[path] = { title: note.title, version, text };
      }
      storage.putMeta(SYNCED, synced);
      storage.putMeta(LAST_SYNCED, new Date().toISOString());
      onProgress({ step: "ready", notes: downloaded.length });
      return { notes: downloaded.length };
    },

    // Sync (#15): pull what changed in the Notes Repo since this browser
    // last synced, then push what changed here. Changed files are all
    // downloaded before any note changes, so a lost connection while pulling
    // leaves the Notebook as it was. `pulled` lists the notes that came in,
    // changed or went, so the screen can redraw them.
    async sync(remote) {
      await remote.connect();
      const synced = { ...storage.getMeta(SYNCED) };
      const listed = (await remote.listFiles()).filter(({ path }) => isNoteFile(path));
      const changed = [];
      for (const { path, version } of listed) {
        if (synced[path]?.version === version) continue;
        const file = await remote.readFile(path);
        changed.push({ path, ...file });
      }
      const result = { pulled: [], pushed: 0, conflicts: 0 };
      for (const { path, version, text } of changed) {
        pullFile(path, version, text, synced, result);
      }
      const listedPaths = new Set(listed.map(({ path }) => path));
      for (const path of Object.keys(synced)) {
        if (!listedPaths.has(path)) pullDeletion(path, synced, result);
      }
      storage.putMeta(SYNCED, { ...synced });
      await push(remote, synced, result);
      storage.putMeta(LAST_SYNCED, new Date().toISOString());
      return result;
    },

    conflictCopies,

    // When the last sync finished (an ISO date), or undefined before any.
    lastSynced() {
      return storage.getMeta(LAST_SYNCED);
    },

    // Import (#13): turn such a zip back into notes. A note the Notebook
    // doesn't have is added; one it has with the same text is left alone; one
    // whose text differs is never overwritten (ADR 0004): the imported version
    // is added next to it under a free title. Files that aren't `.md` (an
    // `.obsidian` folder, pictures) are skipped. A broken zip is refused before
    // anything changes.
    async importZip(bytes) {
      const files = (await unzipFiles(bytes)).filter(({ path }) => /\.md$/i.test(path));
      const today = new Date().toISOString().slice(0, 10);
      const result = { added: 0, unchanged: 0, copies: 0 };
      for (const { path, text } of files) {
        const note = noteFromFile(path, text);
        const existing = storage.getNote(note.title);
        if (!existing) {
          storage.putNote(note);
          result.added += 1;
        } else if (sameNote(existing, note)) {
          result.unchanged += 1;
        } else {
          storage.putNote({ ...note, title: uniqueTitle(`${note.title} (imported ${today})`) });
          result.copies += 1;
        }
      }
      return result;
    },
  };
}
