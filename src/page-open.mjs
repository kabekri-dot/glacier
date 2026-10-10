// When the page behind the sidebar changes — a tab switch, or the active tab
// navigating — Glacier decides what the sidebar shows (issues #29, #50). The rule:
//
//   - A website (http/https) always wins: the sidebar shows its Lesson Note, or
//     the "+ Lesson note" form for it, whatever note was open and however it
//     was opened (page, pill menu, Link, made by hand).
//   - A browser-internal page (new tab, settings, a PDF) is never a lesson, so
//     a note that's open is kept; only an empty panel offers the by-hand form.
//   - The old rule stays reachable behind `keepUserOpenedNotes`: a note the
//     user opened themselves is never thrown away, only a page-opened note, or
//     an empty panel, follows the page. A later setting will switch it on.
//
// This is the whole decision, kept pure so it can be tested with node --test
// (ADR 0002). panel.js draws the result and makes sure only the latest page
// change is applied, so two quick switches can't land on the tab you left.
//
// `current` is the open note or null; `openedByPage` says that note was opened
// by the page (only matters with `keepUserOpenedNotes`). `page` is the
// active tab's { url, title } or null for a browser-internal page.
// `lessonNoteForSource(url)` returns the Lesson Note for a Source, or null.
export function decidePageOpen({
  current,
  openedByPage,
  page,
  lessonNoteForSource,
  keepUserOpenedNotes = false,
}) {
  if (keepUserOpenedNotes && current && !openedByPage) return { type: "keep" };

  if (!page) {
    // Nothing on a browser-internal page to open. Keep an open note rather than
    // replacing it with a by-hand form; only offer the form on an empty panel.
    return current ? { type: "keep" } : { type: "newNoteForm" };
  }

  const existing = lessonNoteForSource(page.url);
  if (existing) return { type: "open", note: existing };
  return { type: "lessonForm", page };
}

// Whether a note counts as opened by the page: a Lesson Note has a Source, so
// it follows tab switches; a note made by hand has none and stays put.
export function isOpenedByPage(note) {
  return Boolean(note.source);
}
