// The Course layout (#126): what the sidebar draws around the open note, as
// plain data. Pure, so it can be tested with node --test; panel.js draws it.
// Which notes are lessons, and in what order, is the Notebook core's
// (src/courses.mjs).
import { sourceLabel } from "./notebook.mjs";

// The layouts in Settings, How your notes look, each with its one line.
export const LAYOUTS = [
  { id: "zen", name: "Zen", hint: "Only the paper and your note." },
  { id: "course", name: "Course", hint: "For learning. A collection you mark as a course shows its notes as lessons." },
];

// Null when the note looks as in Zen: in Zen, with no note or an archived
// one, or a note in no Collection. `{ kind: "ask" }` is the card over the
// paper of a note whose Collection isn't a course; `{ kind: "lesson" }` is
// a lesson with its course on top, its tabs and the row at the bottom.
export function courseView(notebook, note, layout) {
  if (layout !== "course" || !note || note.archived) return null;
  const lesson = notebook.lessonOf(note.title);
  if (!lesson) {
    if (!note.course) return null;
    return {
      kind: "ask",
      course: note.course,
      heading: `${note.course} isn't a course.`,
      text: "Make it one to see its notes as lessons, with your progress and Next lesson.",
      button: `Make ${note.course} a course`,
    };
  }
  const { course, at, count, done, doneCount, previous, next, lessons } = lesson;
  return {
    kind: "lesson",
    course,
    place: `Lesson ${at} of ${count}`,
    doneText: `${doneCount} done`,
    progress: { done: doneCount, of: count },
    tabs: lessons.map((one, i) => ({
      title: one.title,
      label: one.done ? "✓" : String(i + 1),
      open: one.title === note.title,
      done: one.done,
      hint: `Lesson ${i + 1}: ${one.title}${one.done ? ", done" : ""}`,
    })),
    newTab: { label: "+", hint: "New lesson at the end" },
    previous: { label: "‹ Previous", title: previous, hint: previous ? `Previous lesson: ${previous}` : "This is the first lesson" },
    doneButton: done
      ? { label: "✓ Done", pressed: true, hint: "Done. Click to mark it not done" }
      : { label: "Mark as done", pressed: false, hint: "Mark this lesson as done" },
    next: { label: "Next lesson ›", title: next, hint: next ? `Next lesson: ${next}` : "This is the last lesson" },
    pageLink: note.source ? { label: `Lesson page: ${sourceLabel(note.source)} ↗`, source: note.source } : null,
  };
}

export function madeCourseNotice(course) {
  return `${course} is a course now. Its notes are its lessons, in this order.`;
}

export function notCourseNotice(course) {
  return `${course} isn't a course any more. Its notes stay in it.`;
}

// After Mark as done, from the lesson as it is now.
export function doneNotice({ course, doneCount, count, next }) {
  if (doneCount === count) return `Every lesson of ${course} is done.`;
  return next ? "Lesson done. Next lesson is one click away." : "Lesson done.";
}
