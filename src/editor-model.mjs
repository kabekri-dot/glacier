// The editor model: pure functions on one note's Markdown text, with no DOM.
// Live-preview editing (ADR 0006) splits the text into lines, renders every
// line except the one holding the cursor, and joins the lines back exactly.
//
// Later slices add Enter/Backspace handling, the `/` command menu, raw-offset
// mapping and copying as Markdown. For now just the lossless line split/join
// that everything else builds on.

export function splitIntoLines(text) {
  return text.split("\n");
}

export function linesToText(lines) {
  return lines.join("\n");
}
