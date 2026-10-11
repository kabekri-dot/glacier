// What the pill's + menu offers (issues #52, #68), and the hover texts that
// tell the two choices apart. Pure, so it can be tested with node --test.
export const NEW_NOTE_HINT = "A blank note, not tied to any page.";
export const PAGE_NOTE_HINT = "A note for the page you're on. It opens again when you visit the page.";

// There is one kind of note (ADR 0010): a blank one is always offered, and on
// a website a note for the page as well.
export function newNoteChoices({ onWebsite }) {
  const choices = [{ kind: "blank", label: "New note", hint: NEW_NOTE_HINT }];
  if (onWebsite) choices.push({ kind: "page", label: "New note for this page", hint: PAGE_NOTE_HINT });
  return choices;
}
