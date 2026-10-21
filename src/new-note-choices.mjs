// What the top bar's + offers (issues #52, #68, #121), and the hover texts
// that tell the two choices apart. Pure, so it can be tested with node --test.
export const NEW_NOTE_HINT = "A blank note, not tied to any page.";
export const PAGE_NOTE_HINT = "A note for the page you're on. It opens again when you visit the page.";

// There is one kind of note (ADR 0010). On a website (`website` is { title },
// the title null when it can't be read yet) + offers a note for that page,
// picked already so + then Enter makes it, and a blank note. Anywhere else a
// blank note is the only choice, so + makes it at once.
export function newNoteChoices({ website }) {
  const blank = { kind: "blank", label: "Blank note", under: null, hint: NEW_NOTE_HINT, icon: "page", picked: !website };
  if (!website) return [blank];
  const label = website.title ? `Note for “${website.title}”` : "Note for this page";
  return [{ kind: "page", label, under: "linked to this page", hint: PAGE_NOTE_HINT, icon: "globe", picked: true }, blank];
}
