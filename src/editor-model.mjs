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

// Turn what the editable note holds into the body we save. The panel reads the
// surface with `innerText`, which keeps the line breaks Enter creates (`<div>`
// in Chrome, `<br>` in Firefox) that `textContent` would drop (issue #24).
// Platform line endings are folded to a plain `\n`, so the body is identical
// across browsers and matches the Markdown on disk (ADR 0005); empty lines are
// left untouched.
export function editorTextToBody(text) {
  return text.replace(/\r\n?/g, "\n");
}
