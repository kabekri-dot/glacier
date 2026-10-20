// The Notebook core: all note, Link, title, search, file-format and sync
// logic lives here as later slices add it. It has no screen code and no
// browser APIs; storage and GitHub (the remote) are plugged in from outside
// (ADR 0003), so the core can be tested with in-memory stand-ins.

import { fewAtATime } from "./few-at-a-time.mjs";
import { findLinks } from "./editor-model.mjs";
import { zipFiles, unzipFiles } from "./zip.mjs";
import { readShapes, shapesSvg, sketchLook } from "./sketch-model.mjs";
import { newPasscode, openPasscode, sealText, readSealed, openSealed } from "./secret.mjs";

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
//
// A secret note (#109, ADR 0012) also has `secret: true`, and its body is one
// encrypted block, in the file as in the browser.

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
  if (note.secret) text += "secret: true\n";
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
  if (fields.secret === "true") note.secret = true;
  note.body = body;
  if (archived) note.archived = true;
  return note;
}

// --- Sketch files (#101, ADR 0007) ------------------------------------------
//
// A Sketch is kept inside its note as `note.sketches`, numbered from 1:
// `{ 1: { width, height, shapes } }`, the shapes as src/sketch-model.mjs
// describes them. In the Notes Home and in an Export each one is an `.svg`
// file next to the note's file, `<Title> – sketch <n>.svg`, which GitHub,
// Obsidian and any
// browser show as a picture. The shapes are kept as JSON in the file's
// `<metadata>`, so Glacier reads its own drawing back unchanged. The note's
// text holds the embed line `![[<Title> – sketch <n>.svg]]` where it sits.

// The en dash ADR 0007 puts in a sketch's file name.
const SKETCH_DASH = "\u2013";
const SKETCH_NAME = new RegExp(`^(.*) ${SKETCH_DASH} sketch (\\d+)\\.svg$`);
const SKETCH_LINE = new RegExp(`^!\\[\\[(.*) ${SKETCH_DASH} sketch (\\d+)\\.svg\\]\\]$`);
// The pen the picture is drawn with outside Glacier, on a light page.
const SKETCH_INK = "#2b2b2b";
// The size given to a sketch file that doesn't say its own.
const SKETCH_SIZE = 160;

function sketchFileName(stem, n) {
  return `${stem} ${SKETCH_DASH} sketch ${n}.svg`;
}

// The embed line that shows a note's sketch number `n`.
export function sketchEmbed(title, n) {
  return `![[${sketchFileName(safeName(title), n)}]]`;
}

// The file name and number an embed line points at, or null for any other
// line: `{ stem, n }`.
export function sketchInLine(line) {
  const match = SKETCH_LINE.exec((line ?? "").trim());
  return match ? { stem: match[1], n: Number(match[2]) } : null;
}

function escapeXml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function unescapeXml(text) {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

// A sketch as its svg file's text.
export function sketchToSvg(sketch) {
  const { width, height, shapes } = sketch;
  const look = sketchLook(sketch);
  const data = escapeXml(JSON.stringify({ glacier: "sketch", width, height, shapes, ...(look === "clean" && { look }) }));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<metadata>${data}</metadata>\n` +
    `<g fill="none" stroke="${SKETCH_INK}" color="${SKETCH_INK}" stroke-width="2" stroke-linejoin="round">\n` +
    shapesSvg(shapes, look) +
    "</g>\n</svg>\n"
  );
}

// A sketch from its svg file's text, or undefined when the file isn't one
// of Glacier's sketches. Only plain numbers and known shapes are kept.
export function sketchFromSvg(text) {
  const match = /<metadata>([\s\S]*?)<\/metadata>/.exec(text ?? "");
  if (!match) return undefined;
  try {
    const data = JSON.parse(unescapeXml(match[1]));
    if (data?.glacier !== "sketch" || !Array.isArray(data.shapes)) return undefined;
    const size = (value) => (Number.isFinite(value) && value > 0 ? value : SKETCH_SIZE);
    const sketch = { width: size(data.width), height: size(data.height), shapes: readShapes(data.shapes) };
    if (data.look === "clean") sketch.look = "clean";
    return sketch;
  } catch {
    return undefined;
  }
}

// The note's sketch numbers, in order.
function sketchNumbers(note) {
  return Object.keys(note.sketches ?? {}).map(Number).sort((a, b) => a - b);
}

function nextSketchNumber(note) {
  return (sketchNumbers(note).at(-1) ?? 0) + 1;
}

// The note with another title, its embed lines pointing at its sketch files
// under that title.
function withTitle(note, title) {
  const renamed = { ...note, title };
  if (note.sketches && note.body) {
    renamed.body = note.body.replaceAll(`![[${safeName(note.title)} ${SKETCH_DASH} sketch `, `![[${safeName(title)} ${SKETCH_DASH} sketch `);
  }
  return renamed;
}

// A note's files: its Markdown file, then one svg file per sketch in the
// same folder, `{ path, text, sketch }` with the sketch's number.
function noteFiles(note, stem = safeName(note.title)) {
  const file = fileFor(note, stem);
  const folder = file.path.slice(0, file.path.lastIndexOf("/") + 1);
  return [
    file,
    ...sketchNumbers(note).map((n) => ({
      path: folder + sketchFileName(stem, n),
      text: sketchToSvg(note.sketches[n]),
      sketch: n,
    })),
  ];
}

// For a sketch file's path: the path of its note's Markdown file and the
// sketch's number, or null when the file is no sketch.
function sketchFilePath(path) {
  const at = path.lastIndexOf("/") + 1;
  const match = SKETCH_NAME.exec(path.slice(at));
  return match ? { notePath: `${path.slice(0, at)}${match[1]}.md`, n: Number(match[2]) } : null;
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

// Note files for these notes, with their sketch files, zipped. Two titles
// that only differ in characters a filename can't hold get a number, and their
// frontmatter keeps the title.
function zipNotes(notes) {
  const taken = new Set();
  const files = [];
  for (const note of notes) {
    const base = safeName(note.title);
    let stem = base;
    for (let n = 2; taken.has(fileFor(note, stem).path.toLowerCase()); n++) {
      stem = `${base} ${n}`;
    }
    taken.add(fileFor(note, stem).path.toLowerCase());
    files.push(...noteFiles(note, stem).map(({ path, text }) => ({ path, text })));
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
export function syncErrorMessage(error, repo, place = "GitHub") {
  if (place === "Google Drive") return driveErrorMessage(error);
  if (place === "your notes folder") return folderErrorMessage(error);
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

// The same for Google Drive (#95), where only signing in can go wrong.
function driveErrorMessage(error) {
  switch (error?.reason) {
    case "unauthorized":
    case "forbidden":
      return "Google Drive didn't let Glacier in. Sign in with Google again under Where your notes live.";
    case "offline":
      return "Couldn't reach Google Drive. Check your connection and try again.";
    default:
      return "Something went wrong talking to Google Drive. Please try again in a moment.";
  }
}

// The same for a folder on this computer (#97).
function folderErrorMessage(error) {
  switch (error?.reason) {
    case "unauthorized":
      return "Chrome needs your OK to write to your notes folder again.";
    case "not-found":
      return "Couldn't find your notes folder. Choose it again under Where your notes live.";
    default:
      return "Something went wrong writing to your notes folder. Please try again in a moment.";
  }
}

// Only Markdown files in the note folders are notes (`concepts/` from before
// ADR 0010 and `courses/` from before #73 too); a README, an `.obsidian`
// folder or pictures in the Notes Repo are left alone.
function isNoteFile(path) {
  return /^(archive\/)?(collections|courses|notes|concepts)\/.+\.md$/i.test(path);
}

// A sketch file sits in the same folders and is named after its note
// (#101). Any other picture there is not Glacier's.
function isSketchFile(path) {
  return /^(archive\/)?(collections|notes)\/.+\.svg$/i.test(path) && sketchFilePath(path) !== null;
}

function isNotebookFile(path) {
  return isNoteFile(path) || isSketchFile(path);
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
  // Where the notes live (ADR 0011): "browser" or a place such as "github".
  // Kept per browser in its own storage, never synced. Unset until chosen.
  const NOTES_HOME = "notesHome";
  // "Title (conflict 2026-10-11)", with a number after it for a second one.
  const CONFLICT_TITLE = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;
  // How much text to show on each side of a match in a search snippet.
  const SNIPPET_SIDE = 30;
  // Secret notes (#109, ADR 0012). The passcode's record `{ salt, check }` is
  // kept in storage, never the passcode. While unlocked, the key (`current`,
  // with its record), the keys of any older salts the same passcode opened,
  // and the opened notes' `{ body, sketches }` by title live only in memory.
  const PASSCODE = "secretPasscode";
  let current = null;
  const keys = new Map();
  const unlocked = new Map();
  // Encrypting is asynchronous: each change waits its turn here, so the last
  // one typed is the one kept.
  let writing = Promise.resolve();

  // A note as the Notebook reads it. An unlocked secret note has its text
  // and sketches; a locked one has neither, and says so.
  function reveal(note) {
    if (!note?.secret) return note;
    const open = unlocked.get(note.title);
    if (open) return { ...note, ...open };
    return { ...note, body: "", locked: true };
  }

  function readable(title) {
    return reveal(storage.getNote(title));
  }

  function readableNotes() {
    return storage.allNotes().map(reveal);
  }

  // Keep a note's new text or sketches. A secret note keeps them in memory at
  // once and is encrypted into storage just after.
  function store(note) {
    if (!note.secret) {
      storage.putNote(note);
      return note;
    }
    const { body, sketches, locked, ...rest } = note;
    unlocked.set(note.title, { body, ...(sketches && { sketches }) });
    storage.putNote({ ...rest, body: storage.getNote(note.title)?.body ?? "" });
    seal(note.title);
    return readable(note.title);
  }

  // Encrypt an unlocked secret note's text into storage, after the changes
  // before it. The text and key are taken now, so a lock meanwhile loses nothing.
  function seal(title) {
    const open = unlocked.get(title);
    const { key, record } = current;
    writing = writing
      .then(async () => {
        const body = await sealText(key, record, JSON.stringify(open));
        const stored = storage.getNote(title);
        if (stored?.secret) storage.putNote({ ...stored, body });
      })
      .catch(() => {});
  }

  // The passcode records found in secret notes, the latest edited first.
  function secretRecords() {
    return storage
      .allNotes()
      .filter((note) => note.secret)
      .sort((a, b) => lastEdited(b).localeCompare(lastEdited(a)))
      .map((note) => readSealed(note.body)?.record)
      .filter(Boolean);
  }

  // Open the secret notes not opened yet with the keys held, after
  // forgetting the ones that `changed` (pulled or restored) or went.
  async function reopenSecrets(changed = []) {
    for (const title of changed) unlocked.delete(title);
    for (const title of [...unlocked.keys()]) {
      if (!storage.getNote(title)?.secret) unlocked.delete(title);
    }
    if (!current) return;
    for (const note of storage.allNotes()) {
      if (!note.secret || unlocked.has(note.title)) continue;
      const sealed = readSealed(note.body);
      const key = sealed && keys.get(sealed.record.salt);
      const text = key ? await openSealed(key, sealed) : null;
      if (text !== null) unlocked.set(note.title, JSON.parse(text));
    }
  }

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
    if (secret && current) return store({ ...note, secret: true });
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
    // A note moved to another folder (another Collection) comes in under a
    // new path: what its old file said tells whether it changed here since.
    const movedFrom = !known && Object.keys(synced).find((other) => !synced[other].sketch && synced[other].title === incoming.title);
    if (local && known?.text === text) {
      // Same text as last synced, only a new version (a folder synced by
      // OneDrive, or Drive, can do that): nothing changed there.
      synced[path] = { ...known, version };
    } else if (!local) {
      const note = { ...incoming, title: uniqueTitle(incoming.title) };
      storage.putNote(note);
      result.pulled.push(note.title);
      synced[path] = { title: note.title, version, text };
    } else if (
      unchangedSince(local, { text }, path) ||
      (known ? unchangedSince(local, known, path) : sameNote(local, incoming, { ignoreArchived: true })) ||
      (movedFrom && unchangedSince(local, synced[movedFrom], movedFrom))
    ) {
      if (local.title !== incoming.title) storage.deleteNote(local.title);
      // The note's file holds no drawings: its sketches stay as they are here
      // and come with their own files.
      storage.putNote(local.sketches ? { ...incoming, sketches: local.sketches } : incoming);
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
    const moved = Object.keys(synced).some(
      (other) => other !== path && synced[other].title === title && !synced[other].sketch,
    );
    if (local && !moved && unchangedSince(local, synced[path], path)) {
      storage.deleteNote(local.title);
      result.pulled.push(local.title);
    }
    delete synced[path];
  }

  // The note whose Markdown file is at this path, or undefined.
  function noteAtPath(path) {
    return storage.allNotes().find((note) => noteToFile(note).path === path);
  }

  // Put a sketch from a file into its note (#101). One the note doesn't have
  // yet, or has unchanged since `known` (the file's text when last synced),
  // is taken as it is. One that changed here as well is never overwritten
  // (ADR 0004): the incoming drawing becomes a new sketch below the note's
  // text. One whose file still says what it said when last synced is kept as
  // it is here. Returns "same", "taken" or "both".
  function adoptSketch(note, n, incoming, known) {
    const local = note.sketches?.[n];
    const localText = local && sketchToSvg(local);
    const incomingText = sketchToSvg(incoming);
    // Same text as last synced, only a new version (Drive does that to a
    // picture file): nothing changed there, what is here gets pushed.
    if (localText === incomingText || (local && incomingText === known)) return "same";
    if (!local || (known !== undefined && localText === known)) {
      storage.putNote({ ...note, sketches: { ...note.sketches, [n]: incoming } });
      return "taken";
    }
    const free = nextSketchNumber(note);
    const body = `${note.body ?? ""}\n${sketchEmbed(note.title, free)}`;
    storage.putNote({ ...note, body, sketches: { ...note.sketches, [free]: incoming } });
    return "both";
  }

  // Bring one changed or new sketch file into its note. A file whose note
  // isn't here is left for a later sync.
  function pullSketch(path, version, text, synced, result) {
    const { notePath, n } = sketchFilePath(path);
    const note = noteAtPath(notePath);
    const incoming = sketchFromSvg(text);
    if (!note || !incoming) return;
    const outcome = adoptSketch(note, n, incoming, synced[path]?.text);
    if (outcome !== "same" && !result.pulled.includes(note.title)) result.pulled.push(note.title);
    if (outcome === "both") result.conflicts += 1;
    synced[path] = { title: note.title, sketch: n, version, text };
  }

  // A sketch file gone from the Notes Repo takes the sketch with it, unless
  // it changed here since or only moved with its note to another folder.
  function pullSketchDeletion(path, synced, result) {
    const { title, sketch: n, text } = synced[path];
    const moved = Object.keys(synced).some(
      (other) => other !== path && synced[other].title === title && synced[other].sketch === n,
    );
    const note = storage.getNote(title);
    const local = note?.sketches?.[n];
    if (!moved && local && sketchToSvg(local) === text) {
      const { [n]: gone, ...sketches } = note.sketches;
      storage.putNote({ ...note, sketches });
      if (!result.pulled.includes(title)) result.pulled.push(title);
    }
    delete synced[path];
  }

  // Pull what changed in the Notes Repo since this browser last synced it.
  // Changed files are all downloaded before any note changes, so a lost
  // connection while pulling leaves the Notebook as it was.
  async function pull(remote, synced, result) {
    const listed = (await remote.listFiles()).filter(({ path }) => isNotebookFile(path));
    const changed = [];
    const toRead = listed.filter(({ path, version }) => synced[path]?.version !== version);
    await fewAtATime(toRead, async ({ path }, at) => {
      changed[at] = { path, ...(await remote.readFile(path)) };
    });
    // Notes first, so each sketch finds its note where it now is.
    for (const { path, version, text } of changed) {
      if (isNoteFile(path)) pullFile(path, version, text, synced, result);
    }
    for (const { path, version, text } of changed) {
      if (isSketchFile(path)) pullSketch(path, version, text, synced, result);
    }
    const listedPaths = new Set(listed.map(({ path }) => path));
    for (const path of Object.keys(synced)) {
      if (listedPaths.has(path)) continue;
      if (synced[path].sketch) pullSketchDeletion(path, synced, result);
      else pullDeletion(path, synced, result);
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
      for (const { path, text, sketch } of noteFiles(note)) {
        wanted.set(path, { title: note.title, text, sketch });
      }
    }
    const writes = [];
    for (const [path, { title, text, sketch }] of wanted) {
      const known = synced[path];
      if (known && known.title === title && known.text === text) continue;
      writes.push({ path, title, text, sketch, version: known?.version });
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
    for (const { path, title, text, sketch } of writes) {
      synced[path] = { title, version: versions[path], text, ...(sketch && { sketch }) };
    }
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
    return readableNotes().filter((note) => !note.archived);
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
      if (titleTaken(title)) {
        return { ok: false, suggestion: uniqueTitle(title, note.course) };
      }
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
      unlocked.delete(oldTitle);
      storage.putNote({ ...stored, title });
      const renamed = before.locked ? readable(title) : store(withTitle(before, title));
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
      unlocked.delete(title);
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

    hasSketches(title) {
      return sketchNumbers(storage.getNote(title) ?? {}).length > 0;
    },

    // --- Secret notes (#109, ADR 0012) ---

    // Whether a Glacier passcode exists: set here, or brought in with secret
    // notes from the Notes Home or a backup. Then it is asked for, not set.
    hasPasscode() {
      return Boolean(storage.getMeta(PASSCODE)) || storage.allNotes().some((note) => note.secret);
    },

    isUnlocked() {
      return current !== null;
    },

    isSecret(title) {
      return Boolean(storage.getNote(title)?.secret);
    },

    // A secret note whose text can't be read now.
    isLocked(title) {
      return readable(title)?.locked === true;
    },

    // Set the Glacier passcode the first time; it unlocks at once. False when
    // there already is one.
    async setPasscode(passcode) {
      if (this.hasPasscode()) return false;
      const made = await newPasscode(passcode);
      storage.putMeta(PASSCODE, made.record);
      current = made;
      keys.set(made.record.salt, made.key);
      return true;
    },

    // Open the secret notes with the passcode. It is checked against the
    // records in the secret notes, the latest first, then this browser's,
    // so a passcode changed in another browser works once its notes are
    // here. False, with nothing changed, when it is the wrong one.
    async unlock(passcode) {
      const records = [];
      for (const record of [...secretRecords(), storage.getMeta(PASSCODE)]) {
        if (record && !records.some((seen) => seen.salt === record.salt)) records.push(record);
      }
      const opened = new Map();
      for (const record of records) {
        const key = await openPasscode(passcode, record);
        if (key) opened.set(record.salt, { key, record });
      }
      if (opened.size === 0) return false;
      current = opened.values().next().value;
      for (const [salt, { key }] of opened) keys.set(salt, key);
      if (storage.getMeta(PASSCODE)?.salt !== current.record.salt) storage.putMeta(PASSCODE, current.record);
      await reopenSecrets();
      return true;
    },

    // Forget the key and every opened text: the secret notes are locked.
    lock() {
      current = null;
      keys.clear();
      unlocked.clear();
    },

    // Make a note secret: its text and sketches are encrypted together.
    // Needs the passcode open; undefined otherwise.
    async makeSecret(title) {
      const note = storage.getNote(title);
      if (!note || note.secret || !current) return undefined;
      const { sketches, ...rest } = note;
      const open = { body: note.body ?? "", ...(sketches && { sketches }) };
      const body = await sealText(current.key, current.record, JSON.stringify(open));
      // Typed into meanwhile: start again with the newer text.
      if (storage.getNote(title) !== note) return this.makeSecret(title);
      storage.putNote({ ...rest, secret: true, body });
      unlocked.set(title, open);
      return readable(title);
    },

    // Make an unlocked secret note a plain note again.
    async makeNotSecret(title) {
      const note = readable(title);
      if (!note?.secret || note.locked) return undefined;
      const { secret, ...plain } = note;
      unlocked.delete(title);
      storage.putNote(plain);
      return plain;
    },

    // Change the passcode (#109): every secret note this passcode opens is
    // encrypted again under the new one. There is no recovery, so the
    // current passcode is needed. `locked` counts the secret notes it didn't
    // open, which keep their old passcode.
    async changePasscode(passcode, next) {
      if (!(await this.unlock(passcode))) return { ok: false };
      const made = await newPasscode(next);
      storage.putMeta(PASSCODE, made.record);
      current = made;
      keys.set(made.record.salt, made.key);
      for (const title of unlocked.keys()) seal(title);
      await writing;
      return { ok: true, locked: storage.allNotes().filter((note) => note.secret && !unlocked.has(note.title)).length };
    },

    // Waits until every change to a secret note is encrypted into storage.
    settled() {
      return writing;
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
    // or a Collection's notes one after another. A locked secret note is left
    // out (#109).
    notesToPrint(title) {
      const note = readable(title);
      return note && !note.locked ? [{ title: note.title, body: note.body ?? "" }] : [];
    },

    notesOfCourse(course, { archived = false } = {}) {
      return notesIn(course, archived)
        .map(reveal)
        .filter((note) => !note.locked)
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((note) => ({ title: note.title, body: note.body ?? "" }));
    },

    // One note with its sketch files, zipped (#101).
    exportNoteZip(title) {
      return zipNotes([storage.getNote(title)]);
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
      const paths = (await remote.listFiles()).map(({ path }) => path).filter(isNotebookFile);
      const notePaths = paths.filter(isNoteFile);
      const downloaded = [];
      const sketchFiles = [];
      onProgress({ step: "downloading", done: 0, total: notePaths.length });
      let done = 0;
      await fewAtATime(paths, async (path, at) => {
        const { text, version } = await remote.readFile(path);
        if (isSketchFile(path)) {
          sketchFiles.push({ path, version, text });
          return;
        }
        downloaded[at] = { path, version, text, note: noteFromFile(path, text) };
        done += 1;
        onProgress({ step: "downloading", done, total: notePaths.length });
      });
      onProgress({ step: "linking" });
      const synced = {};
      for (const { path, version, text, note } of downloaded.filter(Boolean)) {
        const existing = storage.getNote(note.title);
        if (!existing) {
          storage.putNote(note);
        } else if (!sameNote(existing, note)) {
          conflictCopy(note);
        }
        synced[path] = { title: note.title, version, text };
      }
      for (const { path, version, text } of sketchFiles) {
        pullSketch(path, version, text, synced, { pulled: [], conflicts: 0 });
      }
      storage.putMeta(SYNCED, synced);
      storage.putMeta(LAST_SYNCED, new Date().toISOString());
      mergeCollectionCases();
      await reopenSecrets();
      onProgress({ step: "ready", notes: notePaths.length });
      return { notes: notePaths.length };
    },

    // Where the notes live (#94): "browser", a place such as "github", or
    // null before anything was chosen.
    notesHome() {
      return storage.getMeta(NOTES_HOME) ?? null;
    },

    // Switch the Notes Home (#94, ADR 0011). A new place is combined with
    // this browser like a first sync, then everything here is pushed to it,
    // so the notes end up in both; a note that differs gets two versions
    // (ADR 0004) and nothing is deleted. The old place is never touched.
    // "browser" just stops syncing. A place that can't be reached keeps the
    // place there was. Once combined the place is chosen; if the push then
    // fails (`pushed` is false), the next sync sends the notes.
    async switchNotesHome(place, remote, onProgress = () => {}) {
      if (place === "browser") {
        storage.putMeta(NOTES_HOME, "browser");
        return { notes: 0 };
      }
      let ready = null;
      const result = await this.firstSync(remote, (progress) => {
        if (progress.step === "ready") ready = progress;
        else onProgress(progress);
      });
      storage.putMeta(NOTES_HOME, place);
      try {
        await this.sync(remote);
      } catch {
        return { ...result, pushed: false };
      }
      onProgress(ready);
      return { ...result, pushed: true };
    },

    // Sync (#15): pull what changed in the Notes Repo since this browser
    // last synced, then push what changed here as one commit (#17).
    // `pulled` lists the notes that came in, changed or went, so the screen
    // can redraw them. With the notes living only in this browser there is
    // nothing to sync.
    async sync(remote) {
      if (storage.getMeta(NOTES_HOME) === "browser") return { pulled: [], pushed: 0, conflicts: 0 };
      await writing;
      await remote.connect();
      const synced = { ...storage.getMeta(SYNCED) };
      const result = { pulled: [], pushed: 0, conflicts: 0 };
      await pull(remote, synced, result);
      await push(remote, synced, result);
      storage.putMeta(LAST_SYNCED, new Date().toISOString());
      await reopenSecrets(result.pulled);
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
        if (note && sketch) adoptSketch(note, where.n, sketch);
      }
      mergeCollectionCases();
      await reopenSecrets();
      return result;
    },
  };
}
