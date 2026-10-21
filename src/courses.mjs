// Courses (#126): a Collection marked for learning, whose notes are its
// lessons. Nothing about it is kept apart from the notes: each lesson has
// `lesson: <number>` (its place in the course) and, once finished,
// `done: true`, so a course syncs with its notes and Obsidian can read it.
// A Collection is a course while any of its listed notes has a number.
// Part of the Notebook core (src/notebook.mjs): no screen code.
import { sameCollection } from "./note-file.mjs";

export function createCourses({ storage }) {
  // The listed notes of one Collection, in any capitals.
  function notesOf(course) {
    return storage.allNotes().filter((note) => !note.archived && note.course && sameCollection(note.course, course));
  }

  function isCourse(course) {
    return Boolean(course) && notesOf(course).some((note) => note.lesson);
  }

  // A note outside the course: no number and no done.
  function withoutLesson(note) {
    const { lesson, done, ...rest } = note;
    return rest;
  }

  // The lessons in order: by number, then by when they were made. A note
  // put in the course without a number (in Obsidian, say) comes last.
  function ordered(course) {
    return notesOf(course).sort(
      (a, b) => (a.lesson ?? Infinity) - (b.lesson ?? Infinity) || (a.created ?? "").localeCompare(b.created ?? ""),
    );
  }

  // The number after the highest one, archived lessons included, so a
  // lesson coming back from the Archive keeps a place of its own.
  function nextNumber(course) {
    const numbers = storage
      .allNotes()
      .filter((note) => note.course && sameCollection(note.course, course) && note.lesson)
      .map((note) => note.lesson);
    return Math.max(0, ...numbers) + 1;
  }

  // Each lesson's number and done, by title, so Undo can put them back.
  function places(titles) {
    const kept = {};
    for (const title of titles) {
      const { lesson, done } = storage.getNote(title) ?? {};
      if (lesson) kept[title] = { lesson, ...(done && { done }) };
    }
    return kept;
  }

  function lessons(course) {
    return ordered(course).map((note) => ({ title: note.title, lesson: note.lesson, done: Boolean(note.done) }));
  }

  return {
    isCourse,
    lessons,
    nextNumber,
    withoutLesson,

    // Make a Collection a course: its notes are numbered by when they were
    // made, oldest first. Returns the titles in order.
    makeCourse(course) {
      const notes = notesOf(course).sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
      notes.forEach((note, i) => storage.putNote({ ...note, lesson: i + 1 }));
      return notes.map((note) => note.title);
    },

    // "Not a course any more": every note of the Collection, archived ones
    // too, loses its number and done. Returns them, for putPlaces (Undo).
    unmakeCourse(course) {
      const lessonsHere = storage.allNotes().filter((note) => note.course && sameCollection(note.course, course) && note.lesson);
      const kept = places(lessonsHere.map((note) => note.title));
      for (const note of lessonsHere) storage.putNote(withoutLesson(note));
      return kept;
    },

    // Where a lesson is in its course: `at` counts from 1, `previous` and
    // `next` are titles or null at the ends. Null for a note in no course.
    lessonOf(title) {
      const note = storage.getNote(title);
      if (!note || note.archived || !isCourse(note.course)) return null;
      const list = lessons(note.course);
      const at = list.findIndex((lesson) => lesson.title === title);
      return {
        course: note.course,
        at: at + 1,
        count: list.length,
        done: list[at].done,
        doneCount: list.filter((lesson) => lesson.done).length,
        previous: list[at - 1]?.title ?? null,
        next: list[at + 1]?.title ?? null,
        lessons: list,
      };
    },

    // Mark a lesson done, or with `done` false not done again. Not an edit:
    // the page keeps opening the note it opened.
    markDone(title, done = true) {
      const note = storage.getNote(title);
      if (!note || !isCourse(note.course)) return;
      const lesson = note.lesson ?? nextNumber(note.course);
      storage.putNote(done ? { ...note, lesson, done: true } : { ...withoutLesson(note), lesson });
    },

    places,

    putPlaces(places = {}) {
      for (const [title, place] of Object.entries(places)) {
        const note = storage.getNote(title);
        if (note) storage.putNote({ ...withoutLesson(note), ...place });
      }
    },
  };
}
