// The notes laid out for the browser's print window (#71). Glacier has no PDF
// library (ADR 0002), so "PDF" means a clean page the user prints with "Save
// as PDF". Pure: notes in, one HTML string out.

import { sketchInLine, sketchToSvg } from "./notebook.mjs";
import { pageBreaks } from "./pages.mjs";

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// The note's text for the page: a sketch line becomes its drawing and a page
// break line a real page break. A sketch line with no sketch is left out.
function bodyHtml(body, sketches) {
  const lines = body.split("\n");
  const breaks = new Set(pageBreaks(lines));
  const parts = [];
  let text = [];
  const flush = () => {
    if (text.length) parts.push(`<div class="text">${text.join("\n")}</div>`);
    text = [];
  };
  lines.forEach((line, index) => {
    const embed = sketchInLine(line);
    if (breaks.has(index)) {
      flush();
      parts.push('<div class="page-break"></div>');
    } else if (embed) {
      flush();
      const sketch = sketches?.[embed.n];
      if (sketch) parts.push(`<div class="sketch">${sketchToSvg(sketch)}</div>`);
    } else {
      text.push(escapeHtml(line));
    }
  });
  flush();
  return parts.join("\n");
}

// `notes` is a list of { title, body, sketches }. Each note is its own section and
// starts on a new page.
export function printHtml(notes) {
  const sections = notes
    .map(
      ({ title, body, sketches }) =>
        `<section><h1>${escapeHtml(title)}</h1>${bodyHtml(body ?? "", sketches)}</section>`,
    )
    .join("\n");
  const name = notes.length === 1 ? notes[0].title : "Glacier notes";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(name)}</title>
<style>
body { font-family: Georgia, serif; line-height: 1.5; margin: 2rem; color: #000; }
h1 { font-size: 1.6rem; margin: 0 0 1rem; }
.text { white-space: pre-wrap; }
.sketch svg { max-width: 100%; height: auto; }
.page-break { break-before: page; page-break-before: always; }
section + section { page-break-before: always; break-before: page; }
</style>
</head>
<body>
${sections}
</body>
</html>
`;
}
