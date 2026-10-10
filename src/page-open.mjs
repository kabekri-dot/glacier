// When the page behind the sidebar changes — a tab switch, or the active tab
// navigating — Glacier decides whether to follow it (issue #29). The rule:
//
//   - A note the user navigated to themselves (a Concept Note reached through a
//     Link, or any note opened by following a Link) is never thrown away.
//   - A page-opened Lesson Note, or an empty panel, follows the page: it shows
//     the new page's Lesson Note, or the "+ Lesson note" form for it.
//   - A browser-internal page (new tab, settings, a PDF) is never a lesson, so
//     a note that's open is kept; only an empty panel offers the by-hand form.
//
// This is the whole decision, kept pure so it can be tested with node --test
// (ADR 0002). panel.js draws the result and makes sure only the latest page
// change is applied, so two quick switches can't land on the tab you left.
//
// `current` is the open note or null; `openedByPage` says that note was opened
// by the page (so it may be replaced by another page change). `page` is the
// active tab's { url, title } or null for a browser-internal page.
// `lessonNoteForSource(url)` returns the Lesson Note for a Source, or null.
export function decidePageOpen({
  current,
  openedByPage,
  page,
  lessonNoteForSource,
}) {
  // A note the user navigated to themselves stays put.
  if (current && !openedByPage) return { type: "keep" };

  if (!page) {
    // Nothing on a browser-internal page to open. Keep an open note rather than
    // replacing it with a by-hand form; only offer the form on an empty panel.
    return current ? { type: "keep" } : { type: "newNoteForm" };
  }

  const existing = lessonNoteForSource(page.url);
  if (existing) return { type: "open", note: existing };
  return { type: "lessonForm", page };
}
