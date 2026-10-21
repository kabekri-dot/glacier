// The Home layout (#127): the start screen that shows where the empty page
// would, as plain data. Pure, so it can be tested with node --test;
// sidebar/home-view.js draws it.
import { plainText } from "./notebook.mjs";
import { sameCollection } from "./note-file.mjs";
import { shortDate } from "./note-details.mjs";
import { PAGE_BREAK } from "./pages.mjs";
import { isSketchLine } from "./sketch-file.mjs";

const RECENT_SHOWN = 5;

const editedAt = (note) => note.edited ?? note.created ?? "";

// The first line with words in it, without its Markdown marks. A first
// line that only repeats the title is skipped.
function firstLine(note) {
  if (note.locked) return "";
  for (const line of (note.body ?? "").split("\n")) {
    if (line.trim() === PAGE_BREAK || isSketchLine(line)) continue;
    const text = plainText(line).trim();
    if (text && text !== note.title) return text;
  }
  return "";
}

function resumeCard(note, now) {
  return {
    label: "Continue where you left off",
    title: note.title,
    collection: note.course ?? "",
    when: `edited ${shortDate(editedAt(note), now).replace(/^(Today|Yesterday)$/, (word) => word.toLowerCase())}`,
    firstLine: firstLine(note),
    locked: note.locked === true,
  };
}

// Where a course carries on: the first lesson not done, or the last one.
function courseCard(notebook, course) {
  const lessons = notebook.lessons(course);
  const done = lessons.filter((lesson) => lesson.done).length;
  const next = lessons.find((lesson) => !lesson.done) ?? lessons[lessons.length - 1];
  return { course, text: `${done} of ${lessons.length} lessons done · next: ${next.title}`, progress: { done, of: lessons.length }, open: next.title };
}

function collectionCard(listed, name) {
  const notes = listed.filter((note) => sameCollection(note.course, name));
  const text = notes.length === 0 ? "No notes yet" : notes.length === 1 ? "1 note" : `${notes.length} notes`;
  return { name, text, open: notes[0]?.title ?? null };
}

export function homeView(notebook, { now = new Date() } = {}) {
  const listed = notebook
    .notes()
    .filter((note) => !note.archived)
    .sort((a, b) => editedAt(b).localeCompare(editedAt(a)));
  const last = listed[0];
  const names = notebook.courses();
  return {
    resume: last ? resumeCard(last, now) : null,
    empty: last ? null : { text: "No notes yet.", button: "Start writing" },
    labels: { courses: "Your courses", collections: "Collections", recent: "Recent" },
    courses: names.filter((name) => notebook.isCourse(name)).map((name) => courseCard(notebook, name)),
    collections: names.filter((name) => !notebook.isCourse(name)).map((name) => collectionCard(listed, name)),
    newCollection: { label: "+ New", text: "collection", hint: "Make a new collection" },
    recent: notebook
      .recentNotes(RECENT_SHOWN + 1)
      .filter((note) => note.title !== last?.title)
      .slice(0, RECENT_SHOWN)
      .map((note) => ({ title: note.title, collection: note.course ?? "" })),
  };
}
