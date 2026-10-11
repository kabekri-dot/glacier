// What the ▾ Notebook and ⋯ This note menus list (#67), as plain data with
// the hover texts. Pure, so it can be tested with node --test; the sidebar
// only turns each part into elements and wires the clicks.
//
// The ▾ menu is a list of parts:
//   { kind: "heading", text, hint }       a small heading
//   { kind: "notes", titles }             note buttons
//   { kind: "group", label, hint, open, archive, titles }   a foldable group
//   { kind: "empty", text }               a quiet line when nothing is listed
//   { kind: "result", title, titleMark, snippet }           a search result
//   { kind: "pair", notes: [{ title, label }] }             a Conflict Copy and its original
import { LESSON_NOTE_HINT, CONCEPT_NOTE_HINT } from "./new-note-choices.mjs";

const ARCHIVE_HINT = "Notes you hid from your lists. Open one to bring it back";

function heading(text, hint = null) {
  return { kind: "heading", text, hint };
}

// The ▾ menu: search results while there is a query, else recent notes and
// the Notebook.
export function notebookMenu(notebook, query) {
  return query.trim() ? searchResults(notebook, query) : browse(notebook);
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

// Recent notes, then the Notebook: Courses with their Lesson Notes, Lesson
// Notes without a Course, Concepts, and the folded Archive last.
function browse(notebook) {
  const parts = [];
  const recent = notebook.recentNotes();
  if (recent.length > 0) {
    parts.push(heading("Recent"), { kind: "notes", titles: recent.map((note) => note.title) });
  }
  const outline = notebook.outline();
  parts.push(heading("Notebook"));
  if (outline.courses.length + outline.uncategorised.length + outline.concepts.length === 0) {
    parts.push({ kind: "empty", text: "No notes yet" });
  }
  for (const { course, titles } of outline.courses) {
    parts.push({ kind: "group", label: course, hint: LESSON_NOTE_HINT, open: true, archive: false, titles });
  }
  if (outline.uncategorised.length > 0) {
    parts.push(heading("No Course", LESSON_NOTE_HINT), { kind: "notes", titles: outline.uncategorised });
  }
  if (outline.concepts.length > 0) {
    parts.push(heading("Concepts", CONCEPT_NOTE_HINT), { kind: "notes", titles: outline.concepts });
  }
  const archived = notebook.archivedNotes();
  if (archived.length > 0) {
    parts.push({
      kind: "group",
      label: `Archive (${archived.length})`,
      hint: ARCHIVE_HINT,
      open: false,
      archive: true,
      titles: archived.map((note) => note.title),
    });
  }
  return parts;
}

// Show them (#59): only the Conflict Copies, each next to its original when
// that is still there.
export function conflictMenu(notebook) {
  return [
    heading("Changed in two places"),
    ...notebook.conflictCopyPairs().map(({ copy, original }) => ({
      kind: "pair",
      notes: [
        { title: copy, label: copy },
        ...(original ? [{ title: original, label: `Original: ${original}` }] : []),
      ],
    })),
  ];
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
