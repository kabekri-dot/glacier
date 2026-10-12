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

// --- Note files (ADR 0005, #13) ---------------------------------------------
//
// In the Notes Repo and in an Export every note is a Markdown file named after
// its title: `collections/<Collection>/<Title>.md` for a note in a Collection
// and `notes/<Title>.md` for every other note (ADR 0010). A small YAML
// frontmatter keeps `collection`, `source` (the page), `pageTitle` (that
// page's title when the note was made, #92), `created` and `edited`, then the
// Markdown body follows. Files written before ADR 0010 also had a
// `type` line and a `concepts/` folder, and before #73 Collections were called
// Courses (`course:` and `courses/`); all of these are still read.
//
// Inside the Notebook a note's Collection is still kept as `note.course`, so
// notes already stored in the browser need no change (#73).

// Characters Windows, macOS or Obsidian refuse in a file or folder name.
const UNSAFE_IN_NAMES = /[\\/:*?"<>|]/g;
// Keys written in this order; any other key in a file (an old `type`) is
// ignored when it is read.
const FRONTMATTER_KEYS = ["title", "collection", "source", "pageTitle", "created", "edited"];

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
  return note.course ? `collections/${safeName(note.course)}` : "notes";
}

// An archived note keeps its path below `archive/`, so Unarchive knows where it
// goes back to (#58). Obsidian still reads it as a normal note.
const ARCHIVE_FOLDER = "archive/";

function fileFor(note, stem) {
  // The title only goes into the frontmatter when the filename can't hold it
  // as it is (e.g. it has a `/`), so the round trip still gives it back.
  const fields = { ...note, title: stem === note.title ? undefined : note.title, collection: note.course };
  let text = "---\n";
  for (const key of FRONTMATTER_KEYS) {
    if (fields[key]) {
      text += `${key}: ${yamlValue(fields[key])}\n`;
    }
  }
  text += "---\n" + (note.body ?? "");
  return { path: `${note.archived ? ARCHIVE_FOLDER : ""}${folderFor(note)}/${stem}.md`, text };
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
// Collection, and the filename gives the title. The page and the Collection
// are both optional, so a file in `notes/` or an old `concepts/` file is a
// note without a Collection.
export function noteFromFile(path, text) {
  const archived = path.startsWith(ARCHIVE_FOLDER);
  const parts = (archived ? path.slice(ARCHIVE_FOLDER.length) : path).split("/");
  const stem = parts.at(-1).replace(/\.md$/i, "");
  const parent = parts.at(-2);
  const grandparent = parts.at(-3);
  const { fields, body } = splitFrontmatter(text);
  const note = { title: fields.title || stem };
  const inFolder = grandparent === "collections" || grandparent === "courses";
  const course = fields.collection || fields.course || (inFolder ? parent : undefined);
  if (course) note.course = course;
  if (fields.source) note.source = fields.source;
  if (fields.source && fields.pageTitle) note.pageTitle = fields.pageTitle;
  note.created = fields.created || new Date().toISOString();
  if (fields.edited) note.edited = fields.edited;
  note.body = body;
  if (archived) note.archived = true;
  return note;
}

// Collection names ignore capital letters (#73), so "Testing Test" and
// "Testing test" are the same Collection.
function sameCollection(a, b) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

function sameNote(a, b, { ignoreArchived = false } = {}) {
  return (
    sameCollection(a.course, b.course) &&
    ["source", "body"].every((key) => (a[key] ?? "") === (b[key] ?? "")) &&
    (ignoreArchived || Boolean(a.archived) === Boolean(b.archived))
  );
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

// Only Markdown files in the note folders are notes (`concepts/` from before
// ADR 0010 and `courses/` from before #73 too); a README, an `.obsidian`
// folder or pictures in the Notes Repo are left alone.
function isNoteFile(path) {
  return /^(archive\/)?(collections|courses|notes|concepts)\/.+\.md$/i.test(path);
}

// When a note was last written in, for "the page opens its most recently
// edited note" (#68). A note nobody has written in yet counts from when it
// was made.
function lastEdited(note) {
  return note.edited ?? note.created ?? "";
}

export function createNotebook({ storage }) {
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
  // What each Notes Repo file held when this browser last synced it, keyed by
  // path: `{ title, version, text }`. Comparing a note's file with it tells
  // which side changed since (#15).
  const SYNCED = "syncedFiles";
  const LAST_SYNCED = "lastSynced";
  // "Title (conflict 2026-10-11)", with a number after it for a second one.
  const CONFLICT_TITLE = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;
  // How much text to show on each side of a match in a search snippet.
  const SNIPPET_SIDE = 30;

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

  function titleTaken(title) {
    return storage.getNote(title) !== undefined;
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
  // last used one.
  function makeNote({ title, source, pageTitle, course: typed, created }) {
    const made = created ?? new Date().toISOString();
    const course = typed && existingCollection(typed);
    const note = { title: uniqueTitle(title, course) };
    if (course) note.course = course;
    if (source) note.source = normalizeSource(source);
    if (source && pageTitle) note.pageTitle = pageTitle;
    Object.assign(note, { created: made, edited: made, body: "" });
    storage.putNote(note);
    if (course) storage.putMeta(LAST_COURSE, course);
    return note;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
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

  function conflictCopy(note) {
    const copy = { ...note, title: uniqueTitle(`${note.title} (conflict ${today()})`) };
    storage.putNote(copy);
    return copy;
  }

  // Whether this note is still as it was when its file was last synced. The
  // note is compared with what the file said, not with its text, so a file
  // only written the old way (ADR 0010) still counts as unchanged.
  function unchangedSince(note, entry, path) {
    const was = noteFromFile(path, entry.text);
    return note.title === was.title && sameNote(note, was);
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
      (known ? unchangedSince(local, known, path) : sameNote(local, incoming, { ignoreArchived: true }))
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
    const title = synced[path].title;
    const local = storage.getNote(title);
    // A file only moved to another folder (another browser moved courses/ to
    // collections/, #73) already came in under its new path: keep the note.
    const moved = Object.keys(synced).some((other) => other !== path && synced[other].title === title);
    if (local && !moved && unchangedSince(local, synced[path], path)) {
      storage.deleteNote(local.title);
      result.pulled.push(local.title);
    }
    delete synced[path];
  }

  // Pull what changed in the Notes Repo since this browser last synced it.
  // Changed files are all downloaded before any note changes, so a lost
  // connection while pulling leaves the Notebook as it was.
  async function pull(remote, synced, result) {
    const listed = (await remote.listFiles()).filter(({ path }) => isNoteFile(path));
    const changed = [];
    for (const { path, version } of listed) {
      if (synced[path]?.version === version) continue;
      const file = await remote.readFile(path);
      changed.push({ path, ...file });
    }
    for (const { path, version, text } of changed) {
      pullFile(path, version, text, synced, result);
    }
    const listedPaths = new Set(listed.map(({ path }) => path));
    for (const path of Object.keys(synced)) {
      if (!listedPaths.has(path)) pullDeletion(path, synced, result);
    }
    storage.putMeta(SYNCED, { ...synced });
    mergeCollectionCases();
  }

  // Send every note whose file differs from what was last synced, and delete
  // the files no note has any more, as one commit (ADR 0005): a rename's new
  // file, its old file and every rewritten Link land together or not at all.
  // Returns false when the Notes Repo refused a stale version: then what
  // changed there is pulled again (a note changed in both places becomes a
  // Conflict Copy, ADR 0004) and the push starts over.
  async function pushRound(remote, synced, result) {
    const wanted = new Map();
    for (const note of storage.allNotes()) {
      const file = noteToFile(note);
      wanted.set(file.path, { title: note.title, text: file.text });
    }
    const writes = [];
    for (const [path, { title, text }] of wanted) {
      const known = synced[path];
      if (known && known.title === title && known.text === text) continue;
      writes.push({ path, title, text, version: known?.version });
    }
    const deletes = Object.keys(synced)
      .filter((path) => !wanted.has(path))
      .map((path) => ({ path, version: synced[path].version }));
    if (writes.length === 0 && deletes.length === 0) return true;
    let versions;
    try {
      versions = await remote.commit({
        writes: writes.map(({ path, text, version }) => ({ path, text, version })),
        deletes,
      });
    } catch (error) {
      if (error?.reason !== "conflict") throw error;
      await pull(remote, synced, result);
      return false;
    }
    for (const { path, title, text } of writes) synced[path] = { title, version: versions[path], text };
    for (const { path } of deletes) delete synced[path];
    storage.putMeta(SYNCED, { ...synced });
    result.pushed += writes.length + deletes.length;
    return true;
  }

  // A few rounds are plenty: each one takes in what the other browser wrote.
  // If files keep changing under us, the next sync carries on.
  async function push(remote, synced, result) {
    for (let round = 0; round < 3; round += 1) {
      if (await pushRound(remote, synced, result)) return;
    }
    throw Object.assign(new Error("The Notes repo kept changing during sync"), { reason: "conflict" });
  }

  // The Conflict Copies still listed in the Notebook, by their dated titles.
  // An archived copy is put away, so it no longer counts.
  function conflictCopies() {
    return storage
      .allNotes()
      .filter((note) => !note.archived)
      .map((note) => note.title)
      .filter((title) => CONFLICT_TITLE.test(title));
  }

  // Each Conflict Copy next to its original, which is null when the original
  // was renamed or removed since.
  function conflictCopyPairs() {
    return conflictCopies().map((copy) => {
      const original = copy.replace(CONFLICT_TITLE, "");
      const found = storage.getNote(original);
      return { copy, original: found && !found.archived ? original : null };
    });
  }

  // The notes the lists, search and the page lookup show: not the archived ones.
  function listed() {
    return storage.allNotes().filter((note) => !note.archived);
  }

  // One Collection's notes, in any capitals (#73): the listed ones, or with
  // `archived` the ones in the Archive.
  function notesIn(course, archived = false) {
    return storage.allNotes().filter((note) => Boolean(note.archived) === archived && note.course && sameCollection(note.course, course));
  }

  // Notes saved before #73 may hold one Collection in different capitals.
  mergeCollectionCases();

  return {
    // Every Note currently in the Notebook, archived ones too.
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
      return moved;
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
      return moved;
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
    createNote({ title, source, pageTitle, course, created } = {}) {
      return makeNote({ title, source, pageTitle, course, created });
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

    // Follow a `[[Title]]` Link: open the note it names, or, when it is a
    // Missing Link, create a note with that title (no page, no Collection) and
    // open that. The note to show is returned either way.
    openLink(title) {
      const existing = storage.getNote(title);
      if (existing) {
        return existing;
      }
      return makeNote({ title });
    },

    // Search (#69). Plain text matches titles only, ignoring case. A query
    // starting with `//` searches the text of every note instead: a note
    // matches when it holds every word after the `//`, in any order. Text
    // matches carry a snippet (see snippetAround). Archived notes are left out.
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
        .map((title) => storage.getNote(title))
        .filter((note) => note && !note.archived)
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

    // Delete a note for good (#57). Links to it stay in other notes' text and
    // become Missing Links. Its file leaves the Notes Repo on the next sync,
    // which sees a synced file that no note has any more.
    deleteNote(title) {
      if (!storage.getNote(title)) return;
      storage.deleteNote(title);
      const recent = storage.getMeta(RECENT);
      if (recent) storage.putMeta(RECENT, recent.filter((t) => t !== title));
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
    deleteCollection(course) {
      storage.putMeta(EMPTY_COURSES, emptyCollections().filter((name) => !sameCollection(name, course)));
      listed()
        .filter((note) => sameCollection(note.course, course))
        .forEach((note) => this.deleteNote(note.title));
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
    saveBody(title, body) {
      const note = storage.getNote(title);
      if (!note) {
        return undefined;
      }
      if ((note.body ?? "") === body) {
        return note;
      }
      const updated = { ...note, body, edited: new Date().toISOString() };
      storage.putNote(updated);
      return updated;
    },

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
    // or a Collection's notes one after another.
    notesToPrint(title) {
      const note = storage.getNote(title);
      return note ? [{ title: note.title, body: note.body ?? "" }] : [];
    },

    notesOfCourse(course, { archived = false } = {}) {
      return notesIn(course, archived)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((note) => ({ title: note.title, body: note.body ?? "" }));
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
      mergeCollectionCases();
      onProgress({ step: "ready", notes: downloaded.length });
      return { notes: downloaded.length };
    },

    // Sync (#15): pull what changed in the Notes Repo since this browser
    // last synced, then push what changed here as one commit (#17).
    // `pulled` lists the notes that came in, changed or went, so the screen
    // can redraw them.
    async sync(remote) {
      await remote.connect();
      const synced = { ...storage.getMeta(SYNCED) };
      const result = { pulled: [], pushed: 0, conflicts: 0 };
      await pull(remote, synced, result);
      await push(remote, synced, result);
      storage.putMeta(LAST_SYNCED, new Date().toISOString());
      return result;
    },

    conflictCopies,
    conflictCopyPairs,

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
        } else if (sameNote(existing, note, { ignoreArchived: true })) {
          result.unchanged += 1;
        } else {
          storage.putNote({ ...note, title: uniqueTitle(`${note.title} (imported ${today})`) });
          result.copies += 1;
        }
      }
      mergeCollectionCases();
      return result;
    },
  };
}
