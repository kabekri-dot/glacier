// When the page behind the sidebar changes — a tab switch, or the active tab
// navigating — Glacier decides what the sidebar shows (issues #29, #50). The rule:
//
//   - A website (http/https) always wins: the sidebar shows its most recently
//     edited note (#68), or a fresh page for it that becomes its note when you
//     type (#61), whatever note was open and however it was opened (page, pill
//     menu, Link, made by hand).
//   - A browser-internal page (new tab, settings, a PDF) is never a website,
//     so a note that's open is kept; only an empty panel offers a blank fresh
//     page.
//   - The old rule stays reachable behind `keepUserOpenedNotes`: a note the
//     user opened themselves is never thrown away, only a page-opened note, or
//     an empty panel, follows the page. The "Tabs and notes" settings switch it on (#53).
//
// This is the whole decision, kept pure so it can be tested with node --test
// (ADR 0002). panel.js draws the result and makes sure only the latest page
// change is applied, so two quick switches can't land on the tab you left.
//
// `current` is the open note or null; `openedByPage` says that note was opened
// by the page (only matters with `keepUserOpenedNotes`). `page` is the
// active tab's { url, title } or null for a browser-internal page.
// `noteForPage(url)` returns the page's most recently edited note, or null.
// `lastNote` is the note last opened in this browser, or null: a fresh sidebar
// on a browser-internal page shows it instead of an empty page (#88).
export function decidePageOpen({
  current,
  openedByPage,
  page,
  noteForPage,
  lastNote = null,
  keepUserOpenedNotes = false,
  onNonWebsite = "keep",
}) {
  if (keepUserOpenedNotes && current && !openedByPage) return { type: "keep" };

  if (!page) {
    // Nothing on a browser-internal page to open. Keep an open note rather than
    // replacing it with a fresh page; only offer one on an empty panel. The
    // "Tabs and notes" setting can ask for it even then (#53). With nothing
    // open yet, the note you were last on opens rather than an empty page.
    if (!current && lastNote && onNonWebsite !== "newNoteForm") {
      return { type: "open", note: lastNote, byPage: false };
    }
    return current && onNonWebsite !== "newNoteForm" ? { type: "keep" } : { type: "blankDraft" };
  }

  const existing = noteForPage(page.url);
  if (existing) return { type: "open", note: existing };
  return { type: "pageDraft", page };
}

// Whether a note counts as opened by the page: a note with a page (Source)
// follows tab switches; a blank note has none and stays put.
export function isOpenedByPage(note) {
  return Boolean(note.source);
}
