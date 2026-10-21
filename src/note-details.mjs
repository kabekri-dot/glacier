// Note details (#122): everything about the open note, for the drawer that
// ⋯ "Note details" slides over the paper. Its Collection, whether it is
// secret, the page it belongs to, the notes that link here (Backlinks) and a
// few numbers. Pure, so node --test can check it; the sidebar only draws it.
import { sourceLabel } from "./notebook.mjs";
import { isFence } from "./editor-model.mjs";
import { PAGE_BREAK } from "./pages.mjs";
import { isSketchLine } from "./sketch-file.mjs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// A list or checkbox mark at the start of a line, which is no word.
const LINE_MARK = /^\s*(?:[-*+]\s+\[[ xX]\]\s|[-*+]\s|\d+[.)]\s)/;

// The words a person wrote: a page break, a sketch and a code fence are no
// words, and neither is a mark such as `#`, `-` or `[ ]` on its own.
export function wordCount(body) {
  let count = 0;
  for (const line of (body ?? "").split("\n")) {
    if (line.trim() === PAGE_BREAK || isSketchLine(line) || isFence(line)) continue;
    const words = line.replace(LINE_MARK, " ").split(/\s+/);
    count += words.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  }
  return count;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Today", "Yesterday", "2 October", or "30 December 2025" in another year.
export function shortDate(iso, now = new Date()) {
  const date = new Date(iso ?? "");
  if (!iso || Number.isNaN(date.getTime())) return "Not known";
  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

// What the drawer shows for `note`, each part under its small label.
// `locked` is true while a secret note's text is hidden behind the passcode.
export function noteDetails(notebook, note, { now = new Date(), locked = false } = {}) {
  const secret = notebook.isSecret(note.title);
  const linking = notebook.backlinks(note.title).map((other) => other.title);
  return {
    title: note.title,
    collection: note.course
      ? { label: note.course, under: "Click to move it to another collection", course: note.course }
      : { label: "No collection", under: "Click to put it in a collection", course: "" },
    secret: secret
      ? { on: true, label: "On", under: "Its text is locked with your Glacier passcode. Click to make it plain text again." }
      : { on: false, label: "Off", under: "Anyone using this browser can read it. Click to lock it with your passcode." },
    page: note.source
      ? { label: note.pageTitle || sourceLabel(note.source), under: sourceLabel(note.source), source: note.source, empty: null }
      : { label: null, under: null, source: null, empty: "This note doesn't belong to a website." },
    linkedFrom: {
      titles: linking,
      empty: linking.length ? null : `No notes link here yet. Type [[${note.title}]] in another note to link it.`,
    },
    stats: [
      { label: "Words", value: locked ? "Locked" : String(wordCount(note.body)) },
      { label: "Created", value: shortDate(note.created, now) },
      { label: "Edited", value: shortDate(note.edited ?? note.created, now) },
    ],
  };
}
