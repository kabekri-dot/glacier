// Find in the open note (#111): every match of a query in the note's lines,
// ignoring capitals, on the text as you see it. Sketch lines are skipped, and
// the lines of a code block are matched as they are written. Pure, so
// node --test can check it.
import { blockRanges, isFence, isSketchLine, visibleText } from "./editor-model.mjs";

// Each match is { line, from, to, rawFrom, rawTo }: `from` and `to` count the
// characters you see (what the drawn line holds), `rawFrom` and `rawTo` count
// the Markdown of the line (where the caret goes).
export function findMatches(lines, query) {
  const wanted = (query ?? "").toLowerCase();
  if (wanted === "") return [];
  const found = [];
  for (const range of blockRanges(lines)) {
    const code = isFence(lines[range.start]);
    for (let line = range.start; line < range.end; line++) {
      if (isSketchLine(lines[line])) continue;
      if (code && (line === range.start || (line === range.end - 1 && isFence(lines[line])))) continue;
      const { text, rawAt } = code
        ? { text: lines[line], rawAt: [...lines[line]].map((_, i) => i) }
        : visibleText(lines[line]);
      const lower = text.toLowerCase();
      if (lower.length !== text.length) continue;
      for (let at = lower.indexOf(wanted); at !== -1; at = lower.indexOf(wanted, at + wanted.length)) {
        const to = at + wanted.length;
        found.push({ line, from: at, to, rawFrom: rawAt[at], rawTo: rawAt[to - 1] + 1 });
      }
    }
  }
  return found;
}

// The match to start on: the first one at or after the caret, or the first
// one when the caret is past them all. -1 when there are none.
export function firstMatchFrom(matches, line, col) {
  if (matches.length === 0) return -1;
  const at = matches.findIndex((m) => m.line > line || (m.line === line && m.rawTo > col));
  return at === -1 ? 0 : at;
}

// The next (step 1) or previous (step -1) match, going round at the ends.
export function stepMatch(count, current, step) {
  if (count === 0) return -1;
  return (current + step + count) % count;
}

// "2 of 5", or "No match" when the query found nothing. Nothing while empty.
export function findStatus(query, count, current) {
  if (!query) return "";
  return count === 0 ? "No match" : `${current + 1} of ${count}`;
}
