// Notes as pages (#108): a line `%%page%%` in a note's Markdown is a page
// break. Obsidian hides `%%` comments, so the file stays readable there, and
// the note stays one file: pages are only how it is shown and split. A
// `%%page%%` inside a fenced code block is code, not a break. Pure, so
// node --test can check it.
import { linesOutsideCode } from "./editor-model.mjs";

export const PAGE_BREAK = "%%page%%";

// The line numbers of the page breaks, in order.
export function pageBreaks(lines) {
  return linesOutsideCode(lines).filter((line) => lines[line].trim() === PAGE_BREAK);
}

// Is line `index` a page break (and not a line of code)?
export function isPageBreak(lines, index) {
  return pageBreaks(lines).includes(index);
}

// The pages as line spans { start, end } (end exclusive), break lines left
// out. A break with nothing after it, or two in a row, make no empty page; a
// note without breaks is one page.
export function pagesOf(lines) {
  const pages = [];
  let start = 0;
  for (const end of [...pageBreaks(lines), lines.length]) {
    if (end > start) pages.push({ start, end });
    start = end + 1;
  }
  if (pages.length === 0) pages.push({ start: 0, end: lines.length });
  return pages;
}

// The page (counting from 0) a line is on. A break line belongs to the page
// it starts, or to the last page when no page follows it.
export function pageOfLine(lines, line) {
  const pages = pagesOf(lines);
  const index = pages.findIndex((page) => line < page.end);
  return index === -1 ? pages.length - 1 : index;
}

// The lines with the break on line `index` taken out, joining its two pages.
export function removePageBreak(lines, index) {
  return [...lines.slice(0, index), ...lines.slice(index + 1)];
}

// Delete page `index` (counting from 0) with everything on it, and the
// break before it (for the first page, the one after it and any above it).
// Returns the lines and the line the caret goes to (the start of the page
// before, or of the new first page), or null for a note of one page.
export function removePage(lines, index) {
  const pages = pagesOf(lines);
  const page = pages[index];
  if (pages.length < 2 || !page) return null;
  const from = index === 0 ? 0 : page.start - 1;
  const to = index === 0 ? page.end + 1 : page.end;
  const next = [...lines.slice(0, from), ...lines.slice(to)];
  return { lines: next, line: index === 0 ? 0 : pages[index - 1].start };
}

// "+ New page": a break and an empty line at the end, and the line the caret
// goes to.
export function addPage(lines) {
  const next = [...lines, PAGE_BREAK, ""];
  return { lines: next, line: next.length - 1 };
}

// Where a search result opens: for a search inside notes (`//words`, #69),
// the first line holding one of the words, so the right page shows; the top
// of the note otherwise.
export function lineOfSearch(lines, query) {
  const text = (query ?? "").trim();
  if (!text.startsWith("//")) return 0;
  const words = text.slice(2).toLowerCase().split(/\s+/).filter(Boolean);
  const line = lines.findIndex((l) => words.some((word) => l.toLowerCase().includes(word)));
  return Math.max(line, 0);
}

// Which page controls show (#122), with notes as pages on. One page: a faint
// New page at the end of the paper, unless it was hidden (`endHidden`), and
// nothing under the bar. From two pages on, the line under the bar shows
// ‹ 1 of 2 › and + New page, and the end of the paper stays empty.
export function pageControls({ pagesOn, count, endHidden }) {
  if (!pagesOn) return { strip: false, endButton: false };
  return { strip: count > 1, endButton: count === 1 && !endHidden };
}

// The notices after hiding New page at the end (with Show again), and after
// showing it again.
export const END_HIDDEN_NOTICE = "Hidden. Type / and pick New page to add a page.";
export const END_SHOWN_NOTICE = "New page shows at the end of notes again.";
