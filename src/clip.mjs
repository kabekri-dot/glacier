// Clipping (#100): highlighted text from a web page becomes a quote with its
// source link, added at the end of a note. Pure text, no browser APIs.

// "> line" for each line, then "> From [Page title](url)" (no dash: the copy
// rules). A page with no title uses its address as the link text.
export function clipQuote(text, pageTitle, url) {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const quoted = lines.map((line) => (line.trim() === "" ? ">" : `> ${line.trimEnd()}`));
  const name = (pageTitle ?? "").replace(/[\[\]]/g, "").trim() || url;
  return [...quoted, `> From [${name}](${url})`].join("\n");
}

// The note's text with the clip at its end, after a blank line.
export function appendClip(body, quote) {
  const existing = (body ?? "").replace(/\s+$/, "");
  return existing === "" ? quote : `${existing}\n\n${quote}`;
}
