// What the notes list (#12, #123) and ⋯ This note (#67, #121) list, as plain
// data with the hover texts. Pure, so it can be tested with node --test; the
// sidebar only turns each part into elements and wires the clicks.
//
// The notes list is a list of parts:
//   { kind: "heading", text, hint }       a small heading
//   { kind: "notes", titles, current? }   note rows, `current` the open one
//   { kind: "collectionsHeading", text, add } "Collections" with its "+ New"
//   { kind: "folder", key, label, hint, icon, count, open, renamable, menu, parts, course?, archived?, page?, titles? }
//                                  a foldable folder: a Collection (with `course`,
//                                  `renamable` by ✎), "Not in a collection", a Page
//                                  group (with `page`), the Archive or a Collection
//                                  inside it (`archived`). `menu` is what its ⋯
//                                  offers, or null; `parts` are drawn under it
//                                  while it is `open`
//   { kind: "newInCollection", label, hint, course } the faint row ending an open Collection
//   { kind: "line" }                      the line before the Archive
//   { kind: "empty", text }               a quiet line when nothing is listed
//   { kind: "newNamed", label, title }    "New note “…”" when a search finds nothing
//   { kind: "result", title, titleMark, snippet }           a search result
//   { kind: "pair", notes: [{ title, label }] }   a Conflict Copy and its original
import { COLLECTIONS_HINT } from "./guidance.mjs";
import { alsoDeletedFrom } from "./notes-home.mjs";
import { normalizeSource } from "./notebook.mjs";
import { shortDate } from "./note-details.mjs";

const CONFLICT_SUFFIX = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;
const ARCHIVE_HINT = "Notes you hid from your lists. Open one to bring it back";
const SEVERAL_VERSIONS_HINT =
  "These notes were changed in two places before they synced, so Glacier kept every version. Open one, copy what you want to keep into the original, then delete or archive the others.";
const PAGE_NOTES_HINT = "Every note for this page, the latest first";
const NOT_IN_A_COLLECTION = "Not in a collection";

function heading(text, hint = null) {
  return { kind: "heading", text, hint };
}

// The notes list: search results while there is a query, else the notes for
// the open note's page, recent notes, the Collections and the Archive.
// `opened` holds the keys of the folders opened by a click; the expanded
// view (`wide`) opens every folder.
export function notebookMenu(notebook, query, openNote = null, { opened = new Set(), wide = false } = {}) {
  if (query.trim()) return searchResults(notebook, query);
  return browse(notebook, openNote, (key) => wide || opened.has(key));
}

// Every note for the open note's page, newest first, once the page has more
// than one.
function notesForThisPage(notebook, openNote) {
  if (!openNote?.source) return [];
  const titles = notebook.notesForPage(openNote.source).map((note) => note.title);
  if (titles.length < 2) return [];
  return [heading("For this page", PAGE_NOTES_HINT), { kind: "notes", titles, current: openNote.title }];
}

// Each result has its title, with the match marked either in the title
// (titleMark) or in a snippet of the text (snippet). No match offers a note
// with the words searched for as its title.
function searchResults(notebook, query) {
  const results = notebook.search(query);
  const needle = query.trim();
  if (results.length === 0) {
    const title = needle.replace(/^\/\//, "").trim();
    return [
      { kind: "empty", text: `No notes match “${needle}”.` },
      ...(title ? [{ kind: "newNamed", label: `New note “${title}”`, title }] : []),
    ];
  }
  return results.map((result) => ({
    kind: "result",
    title: result.title,
    titleMark: result.snippet ? null : markIn(result.title, needle),
    snippet: result.snippet ?? null,
  }));
}

function markIn(text, needle) {
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  const end = at + needle.length;
  return { before: text.slice(0, at), match: text.slice(at, end), after: text.slice(end) };
}

function notesPart(titles) {
  return titles.length > 0 ? [{ kind: "notes", titles }] : [];
}

// Several versions, the notes for this page and recent notes, then the
// Collections, each a folder, the notes without one in their own folder, and
// the Archive after a line. `isOpen(key)` says which folders are open.
function browse(notebook, openNote, isOpen) {
  const parts = [...twoVersions(notebook), ...notesForThisPage(notebook, openNote)];
  const recent = notebook.recentNotes();
  if (recent.length > 0) {
    parts.push(heading("Recent"), { kind: "notes", titles: recent.map((note) => note.title) });
  }
  const outline = notebook.outline();
  parts.push({ kind: "collectionsHeading", text: "Collections", add: { label: "+ New", hint: "Make a new collection" } });
  if (outline.courses.length === 0) parts.push({ kind: "empty", text: COLLECTIONS_HINT });
  for (const { course, titles } of outline.courses) parts.push(collectionFolder(notebook, course, titles, isOpen));
  if (outline.uncategorised.length > 0) {
    parts.push(folder({
      key: "loose",
      label: NOT_IN_A_COLLECTION,
      hint: "Notes not in any collection",
      count: outline.uncategorised.length,
      parts: withPageGroups(notebook, outline.uncategorised, isOpen),
    }, isOpen));
  } else if (outline.courses.length === 0) {
    parts.push({ kind: "empty", text: "No notes yet. Just start writing on a page, or press + for a new note." });
  }
  const archived = notebook.archivedNotes();
  if (archived.length > 0) parts.push({ kind: "line" }, archiveFolder(notebook, archived, isOpen));
  return parts;
}

function folder({ key, label, hint, icon = "folder", count, renamable = false, menu = null, parts, ...more }, isOpen) {
  return { kind: "folder", key, label, hint, icon, count, open: isOpen(key), renamable, ...more, menu, parts };
}

function collectionFolder(notebook, course, titles, isOpen) {
  return folder({
    key: `collection:${course}`,
    label: course,
    hint: "Notes in this collection",
    count: titles.length,
    course,
    renamable: true,
    menu: collectionRowMenu(course, titles.length, notebook.isCourse(course)),
    parts: [
      ...notesPart(titles),
      { kind: "newInCollection", label: `+ New note in ${course}`, hint: `Make a note in ${course}`, course },
    ],
  }, isOpen);
}

// The Archive: a folder for each Collection in it, then the notes without one.
function archiveFolder(notebook, archived, isOpen) {
  const { courses, uncategorised } = notebook.archivedOutline();
  const inside = courses.map(({ course, titles }) => folder({
    key: `archive:${course}`,
    label: course,
    hint: "Archived notes in this collection",
    count: titles.length,
    course,
    archived: true,
    menu: archivedCollectionMenu(course, titles.length),
    parts: notesPart(titles),
  }, isOpen));
  return folder({
    key: "archive",
    label: "Archive",
    hint: ARCHIVE_HINT,
    icon: "archive",
    count: archived.length,
    parts: [...inside, ...notesPart(uncategorised)],
  }, isOpen);
}

// The notes without a Collection (#92): a website with two or more of them is
// its own folder, named after the page, with its notes newest first; every
// other note is a plain row. Folders and rows stand in one list sorted by name.
function withPageGroups(notebook, titles, isOpen) {
  const byPage = new Map();
  for (const title of titles) {
    const source = notebook.note(title)?.source;
    if (!source) continue;
    const key = normalizeSource(source);
    if (!byPage.has(key)) byPage.set(key, { source, titles: [] });
    byPage.get(key).titles.push(title);
  }
  const grouped = new Set();
  const entries = titles.map((title) => ({ name: title, title }));
  for (const { source, titles: own } of byPage.values()) {
    if (own.length < 2) continue;
    const notes = notebook.notesForPage(source).filter((note) => own.includes(note.title));
    const label = notes.find((note) => note.pageTitle)?.pageTitle ?? shortAddress(source);
    for (const title of own) grouped.add(title);
    entries.push({ name: label, group: pageGroup(label, source, notes.map((note) => note.title), isOpen) });
  }
  const parts = [];
  for (const entry of entries.filter((entry) => !grouped.has(entry.title)).sort((a, b) => a.name.localeCompare(b.name))) {
    const last = parts.at(-1);
    if (entry.group) parts.push(entry.group);
    else if (last?.kind === "notes") last.titles.push(entry.title);
    else parts.push({ kind: "notes", titles: [entry.title] });
  }
  return parts;
}

function pageGroup(label, page, titles, isOpen) {
  return folder({
    key: `page:${page}`,
    label,
    hint: "Notes for this website",
    icon: "globe",
    count: titles.length,
    page,
    titles,
    menu: [{ kind: "move", label: "Move to collection…", icon: "folder", hint: `Move the notes for “${label}” to a collection` }],
    parts: notesPart(titles),
  }, isOpen);
}

// A page without a remembered title: its site and the last part of its path,
// e.g. "example.com/loose".
function shortAddress(source) {
  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./, "");
    const last = url.pathname.split("/").filter(Boolean).at(-1);
    return last ? `${host}/${last}` : host;
  } catch {
    return source;
  }
}

// Several versions (n), at the top of the notes list only while there are any (#75):
// each original with its second version (Conflict Copy) under it. The
// original is left out when it is gone.
function versionRow(title) {
  return { title, label: title };
}

function twoVersions(notebook) {
  const pairs = notebook.conflictCopyPairs();
  if (pairs.length === 0) return [];
  return [
    heading(`Several versions (${pairs.length})`, SEVERAL_VERSIONS_HINT),
    ...pairs.map(({ copy, original }) => ({
      kind: "pair",
      notes: [...(original ? [versionRow(original)] : []), versionRow(copy)],
    })),
  ];
}

// The short bar above the text of a note involved in a conflict (#70, #80): a
// second version (`deleteLabel` set) or an original that has one. Null for any
// other note. `original` is the other note to open, or null when it was
// renamed or removed.
export function secondVersionBar(notebook, note) {
  if (!note) return null;
  const pairs = notebook.conflictCopyPairs();
  const pair = pairs.find(({ copy }) => copy === note.title);
  if (pair) {
    const name = note.title.replace(CONFLICT_SUFFIX, "");
    return {
      text: `This is a second version of '${name}'. Copy what you want to keep into '${name}', then delete this version.`,
      original: pair.original,
      openLabel: pair.original ? `Open '${pair.original}'` : null,
      deleteLabel: "Delete this version",
    };
  }
  const copies = pairs.filter(({ original }) => original === note.title);
  if (copies.length === 0) return null;
  const other = copies[0].copy;
  return {
    text: copies.length === 1
      ? `This note has a second version, '${other}'. Copy what you want to keep from it into this note, then delete it.`
      : `This note has ${copies.length} second versions. Copy what you want to keep from them into this note, then delete them.`,
    original: other,
    openLabel: `Open '${other}'`,
    deleteLabel: null,
  };
}

// Help in ⋯ opens this page in a new tab (#121).
export const HELP_URL = "https://github.com/kabekri-dot/glacier/blob/main/docs/help.md";

// The ⋯ menu (#63, #121, #122) for the open note: a row of three big pixel
// icons with words (`big`), Delete on its own (`delete`, which asks right
// there), then Note details, Keyboard shortcuts and Help (`help`). Each
// action has its `kind`, `label`, `hint`, pixel `icon` (art/icon-<icon>.svg)
// and, when it has one, a quiet line `under` its label. No note open means
// no menu.
export function noteMenu(note) {
  if (!note) return null;
  return {
    big: [
      { kind: "rename", label: "Rename", icon: "pencil", hint: "Change the title of this note" },
      { kind: "download", label: "Download", icon: "download", hint: "Save this note as Markdown or PDF, or print it" },
      note.archived
        ? { kind: "unarchive", label: "Unarchive", icon: "archive", hint: "Put this note back in your lists" }
        : { kind: "archive", label: "Archive", icon: "archive", hint: "Hide this note from your lists. You can bring it back any time" },
    ],
    delete: { kind: "delete", label: "Delete", icon: "trash", hint: "Remove this note for good" },
    help: [
      { kind: "details", label: "Note details", icon: "info", under: "Collection, secret, page, links", hint: "Its collection, secret, page, the notes that link here and its numbers" },
      { kind: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard", hint: "Every key and Markdown mark Glacier knows" },
      { kind: "help", label: "Help", icon: "help", hint: "Answers to the most common questions, in a new tab" },
    ],
  };
}

// The pushpin in the top right corner of the paper (#122): what a click does,
// and the notice once it was clicked and the note is `pinned` or not.
export function pushpin(pinned) {
  return pinned
    ? { label: "Unpin this note", hint: "Unpin this note. Glacier follows your tabs again", notice: "Pinned. This note stays open when you change tabs." }
    : { label: "Pin this note", hint: "Pin this note. It stays open when you change tabs", notice: "Unpinned. Glacier follows your tabs again." };
}

// Hovering ← (#121).
export function backButtonHint(title) {
  return `Back to ${title}`;
}

function noteCount(count) {
  return count === 1 ? "1 note" : `${count} notes`;
}

// What ⋯ on a note's row offers (#123), in the small menu under the row:
// Move to collection…, Download, Archive (Unarchive in the Archive) and Delete.
export function noteRowMenu(title, archived = false) {
  return [
    { kind: "move", label: "Move to collection…", icon: "folder", hint: `Put “${title}” in a collection` },
    { kind: "download", label: "Download", icon: "download", hint: "Save this note as Markdown or PDF, or print it" },
    archived
      ? { kind: "unarchive", label: "Unarchive", icon: "archive", hint: "Put this note back in your lists" }
      : { kind: "archive", label: "Archive", icon: "archive", hint: "Hide this note from your lists. You can bring it back any time" },
    { kind: "delete", label: "Delete", icon: "trash", hint: "Remove this note for good" },
  ];
}

// What ⋯ on a Collection's row offers (#123). An empty one only has a new
// note in it and Delete collection. One with notes can be made a course, or
// stop being one (#126).
function collectionRowMenu(course, count, isCourse) {
  const newNote = { kind: "newNote", label: `New note in ${course}`, icon: "page", hint: `Make a note in ${course}` };
  const remove = { kind: "delete", label: "Delete collection", icon: "trash", hint: `Delete “${course}”, keeping its notes or not` };
  if (count === 0) return [newNote, remove];
  return [
    newNote,
    isCourse
      ? { kind: "notCourse", label: "Not a course any more", icon: "notebooks", hint: `Its notes stay in “${course}”, without lesson numbers or progress` }
      : { kind: "course", label: "Make it a course", icon: "notebooks", hint: `See the notes of “${course}” as lessons, with your progress and Next lesson` },
    { kind: "download", label: "Download all", icon: "download", hint: `Download the ${noteCount(count)} in “${course}” as one zip` },
    { kind: "archive", label: "Archive all", icon: "archive", hint: `Archive the ${noteCount(count)} in “${course}”` },
    remove,
  ];
}

// A Collection inside the Archive: its notes downloaded or put back at once.
function archivedCollectionMenu(course, count) {
  return [
    { kind: "download", label: "Download all", icon: "download", hint: `Download the ${noteCount(count)} in “${course}” as one zip` },
    { kind: "unarchive", label: "Unarchive all", icon: "archive", hint: `Put the ${noteCount(count)} in “${course}” back in your lists` },
  ];
}

// Move to collection… (#123): every Collection, the note's own marked, and
// Not in a collection for a note that is in one. Without any Collection it
// says how to make one.
export function moveChoices(notebook, current) {
  const courses = notebook.courses();
  if (courses.length === 0) return { choices: [], empty: "No collections yet. Make one with + New next to Collections." };
  const choices = courses.map((course) => ({ course, label: course, current: course === current }));
  if (current) choices.push({ course: "", label: NOT_IN_A_COLLECTION, current: false });
  return { choices, empty: null };
}

// The second line of a note in the expanded view (#123).
export function editedLine(note, now = new Date()) {
  const when = shortDate(note.edited ?? note.created, now);
  const day = when === "Today" || when === "Yesterday" ? when.toLowerCase() : when;
  return note.course ? `Edited ${day}, in ${note.course}` : `Edited ${day}`;
}

// The notices and the line under a field for a Collection's row (#123).
export function madeCollectionNotice(course) {
  return `Made the collection “${course}”. Move notes into it from their ⋯.`;
}

export function collectionTakenText(course) {
  return `There is already a collection “${course}”.`;
}

export function renamedCollectionNotice(course) {
  return `Renamed the collection to “${course}”.`;
}

export function deletedKeptNotesNotice(course, count) {
  return `Deleted the collection “${course}”. Its ${noteCount(count)} ${count === 1 ? "is" : "are"} in ${NOT_IN_A_COLLECTION}.`;
}

export function movedNotice(title, course) {
  return course ? `Moved “${title}” to ${course}.` : `Took “${title}” out of its collection.`;
}

// The notice after archiving a whole Collection.
export function archivedNotice(count) {
  return count === 1 ? "Archived 1 note." : `Archived ${count} notes.`;
}

// The notices after a delete, each with an Undo (#116).
export function deletedNotice(title) {
  return `Deleted “${title}”.`;
}

export function deletedCollectionNotice(course, count) {
  if (count === 0) return `Deleted the empty collection “${course}”.`;
  return `Deleted the collection “${course}” and its ${noteCount(count)}.`;
}

// The questions before deleting name where else the notes go from, by the
// Notes Home's id (#117). A note's is asked right where Delete was clicked (#121).
export function deleteNoteQuestion(title, home) {
  const place = alsoDeletedFrom(home);
  const question = `Delete “${title}” for good?`;
  return place ? `${question} It is also removed from ${place}.` : question;
}

// A Collection's, right in its row (#123): its notes can stay, without a
// Collection ("Delete, keep notes"), or go with it ("Delete all"). An empty
// one only has Delete.
export function deleteCollectionChoice(course, count, home) {
  if (count === 0) {
    return { text: `Delete the empty collection “${course}”?`, keepNotes: null, all: { label: "Delete", hint: "Delete the empty collection" } };
  }
  const place = alsoDeletedFrom(home);
  const all = `Delete the collection and its ${noteCount(count)} for good.`;
  return {
    text: `Delete the collection “${course}”? Its ${noteCount(count)} can stay, without a collection.`,
    keepNotes: { label: "Delete, keep notes", hint: `Delete the collection. Its notes go to ${NOT_IN_A_COLLECTION}` },
    all: { label: "Delete all", hint: place ? `${all} They're also removed from ${place}.` : all },
  };
}

// The small icon before a note's title (#81): a globe for a note that belongs
// to a website, a pencil for one you made yourself.
export function noteOrigin(notebook, title) {
  return notebook.note(title)?.source
    ? { kind: "website", hint: "From a website" }
    : { kind: "own", hint: "Your own note" };
}

// The small pixel lock before a secret note's title (#109), or null.
export function secretMark(notebook, title) {
  return notebook.isSecret(title) ? { hint: "Secret note" } : null;
}

// The title in the top bar (#83, #121). A click on an open note's title shows
// its headings, and the pen beside it renames. With no note open it is a
// quiet "Glacier" that does nothing; a fresh page offers to name its note.
export function pillTitle({ note, freshPage }) {
  if (note) return { text: note.title, hint: `${note.title}\nClick to see its headings`, renamable: true, draft: false };
  if (freshPage) return { text: freshPage.title || "Title", hint: "Click to name this note", renamable: true, draft: true };
  return { text: "Glacier", hint: "", renamable: false, draft: false };
}
