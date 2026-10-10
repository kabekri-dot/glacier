// What the pill's + menu offers (issue #52), and the hover explanations for
// the two kinds of note. Pure, so it can be tested with node --test.
export const LESSON_NOTE_HINT =
  "Notes for one lesson. Opens by itself when you visit that page.";
export const CONCEPT_NOTE_HINT =
  "An idea that isn't tied to one page. Link to it from any note with [[ ]].";

// On a website a Lesson note belongs to the page; on any other page a Lesson
// note can only be made by hand ("byHand").
export function newNoteChoices({ onWebsite }) {
  return [
    onWebsite
      ? { kind: "lesson", label: "Lesson note for this page", hint: LESSON_NOTE_HINT }
      : { kind: "byHand", label: "New note", hint: LESSON_NOTE_HINT },
    { kind: "concept", label: "Concept note", hint: CONCEPT_NOTE_HINT },
  ];
}
