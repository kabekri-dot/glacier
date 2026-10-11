// What the ▾ Notebook and ⋯ This note menus list (#67), as plain data with
// the hover texts. Pure, so it can be tested with node --test; the sidebar
// only turns each part into elements and wires the clicks.
//
// The ▾ menu is a list of parts:
//   { kind: "heading", text, hint }       a small heading
//   { kind: "notes", titles, current? }   note buttons, `current` the open one
//   { kind: "newForPage", label, hint }   "+ New note for this page"
//   { kind: "group", label, hint, open, archive, titles, course?, actions?, sections? }
//                                  a foldable group; a Collection's has `course` and
//                                  `actions` (its hover icons); the Archive has `sections`,
//                                  one per Collection: { course, titles, actions }
//   { kind: "empty", text }               a quiet line when nothing is listed
//   { kind: "result", title, titleMark, snippet }           a search result
//   { kind: "pair", notes: [{ title, label, actions }] }   a Conflict Copy and its original, with the row icons
import { PAGE_NOTE_HINT } from "./new-note-choices.mjs";

const CONFLICT_SUFFIX = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;
const ARCHIVE_HINT = "Notes you hid from your lists. Open one to bring it back";
const SEVERAL_VERSIONS_HINT =
  "These notes were changed in two places before they synced, so Glacier kept every version. Open one, copy what you want to keep into the original, then delete or archive the others.";
const PAGE_NOTES_HINT = "Every note for this page, the latest first";

function heading(text, hint = null) {
  return { kind: "heading", text, hint };
}

// The ▾ menu: search results while there is a query, else the notes for the
// open note's page, recent notes and the Notebook.
export function notebookMenu(notebook, query, openNote = null) {
  return query.trim() ? searchResults(notebook, query) : browse(notebook, openNote);
}

// "1 of 3" in the pill (#68): where the open note stands among the notes for
// its page, newest first. Only when the page has more than one note.
export function pageNoteCount(notebook, note) {
  if (!note?.source) return null;
  const titles = notebook.notesForPage(note.source).map((other) => other.title);
  const at = titles.indexOf(note.title);
  return titles.length > 1 && at !== -1 ? `${at + 1} of ${titles.length}` : null;
}

// Every note for the open note's page, newest first, and a way to add one.
function notesForThisPage(notebook, openNote) {
  if (!openNote?.source) return [];
  const titles = notebook.notesForPage(openNote.source).map((note) => note.title);
  return [
    heading("Notes for this page", PAGE_NOTES_HINT),
    { kind: "notes", titles, current: openNote.title },
    { kind: "newForPage", label: "+ New note for this page", hint: PAGE_NOTE_HINT },
  ];
}

// Each result has its title, with the match marked either in the title
// (titleMark) or in a snippet of the text (snippet).
function searchResults(notebook, query) {
  const results = notebook.search(query);
  if (results.length === 0) return [{ kind: "empty", text: "No notes match" }];
  const needle = query.trim();
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

// The notes for this page, recent notes, then the Notebook: Collections with
// their notes, the notes without a Collection, and the folded Archive last.
function browse(notebook, openNote) {
  const parts = [...twoVersions(notebook), ...notesForThisPage(notebook, openNote)];
  const recent = notebook.recentNotes();
  if (recent.length > 0) {
    parts.push(heading("Recent"), { kind: "notes", titles: recent.map((note) => note.title) });
  }
  const outline = notebook.outline();
  parts.push(heading("Notebook"));
  if (outline.courses.length + outline.uncategorised.length === 0) {
    parts.push({ kind: "empty", text: "No notes yet" });
  }
  for (const { course, titles } of outline.courses) {
    parts.push({ kind: "group", label: course, hint: "Notes in this Collection", open: true, archive: false, titles, course, actions: collectionActions(course, titles.length) });
  }
  if (outline.uncategorised.length > 0) {
    parts.push(heading("No Collection", "Notes not in any Collection"), { kind: "notes", titles: outline.uncategorised });
  }
  const archived = notebook.archivedNotes();
  if (archived.length > 0) {
    const archivedOutline = notebook.archivedOutline();
    parts.push({
      kind: "group",
      label: `Archive (${archived.length})`,
      hint: ARCHIVE_HINT,
      open: false,
      archive: true,
      titles: archived.map((note) => note.title),
      sections: archivedOutline.courses.map(({ course, titles }) => ({
        course,
        titles,
        actions: collectionActions(course, titles.length, true),
      })),
    });
  }
  return parts;
}

// Several versions (n), at the top of the ▾ menu only while there are any (#75):
// each original with its second version (Conflict Copy) under it. The
// original is left out when it is gone.
function versionRow(title) {
  return { title, label: title, actions: rowActions(title) };
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

// The ⋯ "This note" menu (#63): the open note's name and its actions. No note
// open means no menu.
export function noteMenu(note) {
  if (!note) return null;
  return {
    heading: note.title,
    actions: [
      { kind: "download", label: "Download as a file", hint: "Save this note as a Markdown file" },
      note.archived
        ? { kind: "unarchive", label: "Unarchive", hint: "Put this note back in your lists" }
        : { kind: "archive", label: "Archive", hint: "Hide this note from your lists. You can bring it back any time" },
      { kind: "delete", label: "Delete", hint: "Remove this note for good" },
    ],
  };
}

// The hover icons on a note row (#71): Download, Archive (Unarchive in the
// Archive section) and Delete, each with a hover text naming the note.
export function rowActions(title, archived = false) {
  return [
    { kind: "download", hint: `Download '${title}'` },
    archived ? { kind: "unarchive", hint: `Unarchive '${title}'` } : { kind: "archive", hint: `Archive '${title}'` },
    { kind: "delete", hint: `Delete '${title}'` },
  ];
}

function noteCount(count) {
  return count === 1 ? "1 note" : `${count} notes`;
}

// The hover icons on a Collection heading (#74): Download, Archive (Unarchive
// in the Archive section) and Delete, each naming the Collection and its notes.
export function collectionActions(course, count, archived = false) {
  const notes = noteCount(count);
  const named = `'${course}', ${notes}`;
  return [
    { kind: "download", hint: `Download '${course}', ${notes}` },
    archived ? { kind: "unarchive", hint: `Unarchive ${named}` } : { kind: "archive", hint: `Archive ${named}` },
    ...(archived ? [] : [{ kind: "delete", hint: `Delete ${named}` }]),
  ];
}

// The notice after archiving a whole Collection, and the question before
// deleting one.
export function archivedNotice(count) {
  return count === 1 ? "Archived 1 note." : `Archived ${count} notes.`;
}

export function deleteCollectionQuestion(course, count) {
  return `Delete the collection '${course}' and its ${noteCount(count)}? They're also removed from your Notes repo.`;
}

// The small icon before a note's title (#81): a globe for a note that belongs
// to a website, a pencil for one you made yourself.
export function noteOrigin(notebook, title) {
  return notebook.note(title)?.source
    ? { kind: "website", hint: "From a website" }
    : { kind: "own", hint: "Your own note" };
}

export const BACK_BUTTON_HINT = "Your last notes";

// The box under ← (#81): the last notes you were on, newest first.
export function lastNotesBox(screen, notebook) {
  return screen.lastNotes().map((title) => ({ title, origin: noteOrigin(notebook, title) }));
}
