// Note files: how a note and its sketches are written as files for the Notes
// Home and an Export, and read back. Pure, so it can be tested with node --test.
import { zipFiles } from "./zip.mjs";
import { renameEmbeds, sketchFileName, sketchFilePath, sketchToSvg } from "./sketch-file.mjs";

// Note files (ADR 0005, #13).
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

export function safeName(name) {
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

// The embed line that shows a note's sketch number `n`.
export function sketchEmbed(title, n) {
  return `![[${sketchFileName(safeName(title), n)}]]`;
}

// The note's sketch numbers, in order.
export function sketchNumbers(note) {
  return Object.keys(note.sketches ?? {}).map(Number).sort((a, b) => a - b);
}

export function nextSketchNumber(note) {
  return (sketchNumbers(note).at(-1) ?? 0) + 1;
}

// The note with another title, its embed lines pointing at its sketch files
// under that title.
export function withTitle(note, title) {
  const renamed = { ...note, title };
  if (note.sketches && note.body) {
    renamed.body = renameEmbeds(note.body, safeName(note.title), safeName(title));
  }
  return renamed;
}

// A note's files: its Markdown file, then one svg file per sketch in the
// same folder, `{ path, text, sketch }` with the sketch's number.
export function noteFiles(note, stem = safeName(note.title)) {
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

// Collection names ignore capital letters (#73), so "Testing Test" and
// "Testing test" are the same Collection.
export function sameCollection(a, b) {
  return (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
}

export function sameNote(a, b, { ignoreArchived = false } = {}) {
  return (
    sameCollection(a.course, b.course) &&
    ["source", "body"].every((key) => (a[key] ?? "") === (b[key] ?? "")) &&
    (ignoreArchived || Boolean(a.archived) === Boolean(b.archived))
  );
}

// Note files for these notes, with their sketch files, zipped. Two titles
// that only differ in characters a filename can't hold get a number, and their
// frontmatter keeps the title.
export function zipNotes(notes) {
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

// Only Markdown files in the note folders are notes (`concepts/` from before
// ADR 0010 and `courses/` from before #73 too); a README, an `.obsidian`
// folder or pictures in the Notes Repo are left alone.
export function isNoteFile(path) {
  return /^(archive\/)?(collections|courses|notes|concepts)\/.+\.md$/i.test(path);
}

// A sketch file sits in the same folders and is named after its note
// (#101). Any other picture there is not Glacier's.
export function isSketchFile(path) {
  return /^(archive\/)?(collections|notes)\/.+\.svg$/i.test(path) && sketchFilePath(path) !== null;
}

export function isNotebookFile(path) {
  return isNoteFile(path) || isSketchFile(path);
}
