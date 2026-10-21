// The table of contents (#107), shown under the note's title (#121): the
// headings of a note's body, in order, with their level (1 to 3) and the
// number of the line they are on. A `#` inside a fenced code block is code,
// not a heading. Pure, so node --test can check it.
import { linesOutsideCode, splitIntoLines } from "./editor-model.mjs";

export function headingsOf(body) {
  const lines = splitIntoLines(body ?? "");
  const found = [];
  for (const line of linesOutsideCode(lines)) {
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(lines[line]);
    if (heading) found.push({ level: heading[1].length, text: heading[2], line });
  }
  return found;
}

// The small menu under the note's title (#121): its headings to jump to, or
// a line that says how to make one. A locked secret note shows none.
export function titleHeadings({ body, locked = false }) {
  if (locked) return { headings: [], empty: "This note is locked. Type your passcode to see its headings." };
  const headings = headingsOf(body);
  return { headings, empty: headings.length ? null : "No headings yet. Start a line with # to make one." };
}
