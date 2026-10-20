// The table of contents (#107): the headings of a note's body, in order, with
// their level (1 to 3) and the number of the line they are on. A `#` inside a
// fenced code block is code, not a heading. Pure, so node --test can check it.
import { blockRanges, isFence, splitIntoLines } from "./editor-model.mjs";

export function headingsOf(body) {
  const lines = splitIntoLines(body ?? "");
  const found = [];
  for (const range of blockRanges(lines)) {
    if (isFence(lines[range.start])) continue;
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(lines[range.start]);
    if (heading) found.push({ level: heading[1].length, text: heading[2], line: range.start });
  }
  return found;
}
