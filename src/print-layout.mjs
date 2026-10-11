// The notes laid out for the browser's print window (#71). Glacier has no PDF
// library (ADR 0002), so "PDF" means a clean page the user prints with "Save
// as PDF". Pure: notes in, one HTML string out.

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// `notes` is a list of { title, body }. Each note is its own section and
// starts on a new page.
export function printHtml(notes) {
  const sections = notes
    .map(
      ({ title, body }) =>
        `<section><h1>${escapeHtml(title)}</h1><div class="text">${escapeHtml(body ?? "")}</div></section>`,
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
section + section { page-break-before: always; break-before: page; }
</style>
</head>
<body>
${sections}
</body>
</html>
`;
}
