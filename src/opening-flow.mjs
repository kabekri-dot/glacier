// The Opening flow: what the sidebar shows for the page behind it (issue #40).
//
// It decides between the start prompt, the permission card (ADR 0008), the
// page's note, a fresh page that becomes a note when you write (#61),
// or keeping the open note (decidePageOpen, #29, #50): the sidebar always shows
// the note of the website tab you are on, and a non-website page keeps the
// open note. It owns
// "is this a website" (http or https only) and the latest-change-wins rule
// for quick tab switches.
//
// The browser is plugged in as a small "browser page" port, so tests can use a
// fake page and panel.js only draws what the flow shows:
//   page.currentPage()       -> { url, title } of the active tab, or null
//   page.hasPermission()     -> whether the optional `tabs` permission is granted
//   page.requestPermission() -> asks for it; must be called straight from a click
//   page.onPageChange(fn)    -> calls fn when the active tab or its address changes
//
// `getOpenNote()` returns { current, openedByPage, pinned? } for the note on screen,
// `noteForPage(url)` returns the page's most recently edited note or null,
// `getLastNote()` the note last opened in this browser or null (#88),
// and `show(view)` draws one of: { type: "startPrompt" },
// { type: "permissionCard" }, { type: "open", note },
// { type: "pageDraft", page, editTitle? } (a fresh page for a note for the
// website) or { type: "blankDraft" } (a fresh page for a blank note, #68).
//
// `getTabSettings()` returns the "Tabs and notes" settings (#53), read on every
// page change so a changed setting works at once: `keepUserOpenedNotes` is the
// old rule (notes the user opened themselves stay put when the page changes),
// `onNonWebsite` is "keep" or "newNoteForm" (a blank fresh page) for a page
// that isn't a website.
import { decidePageOpen } from "./page-open.mjs";

export function createOpeningFlow({
  page,
  getOpenNote,
  noteForPage,
  getLastNote = () => null,
  show,
  getTabSettings = () => ({}),
}) {
  // Only http and https pages are websites; anything else (chrome://,
  // file://, a new tab) counts as no page.
  async function readWebsite() {
    const tab = await page.currentPage();
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return null;
    return { url: tab.url, title: tab.title || tab.url };
  }

  // Each page read is stamped; a result is dropped if a newer read has started
  // since, so the sidebar ends on the latest page, never the tab you left.
  let latestRead = 0;

  async function followCurrentPage() {
    const read = (latestRead += 1);
    const website = await readWebsite();
    if (read !== latestRead) return;
    const { current, openedByPage, pinned } = getOpenNote();
    const decision = decidePageOpen({
      current,
      openedByPage,
      pinned,
      page: website,
      noteForPage,
      lastNote: getLastNote(),
      ...getTabSettings(),
    });
    if (decision.type !== "keep") show(decision);
  }

  return {
    // The sidebar opened: follow the page if allowed, else the start prompt.
    async start() {
      if (await page.hasPermission()) await followCurrentPage();
      else show({ type: "startPrompt" });
    },

    // "New note for this page" (#68): always a fresh page for the website,
    // even when it has notes already, with the title ready to edit. Without
    // the permission the card asks for it first.
    async newNoteForPage() {
      if (!(await page.hasPermission())) {
        show({ type: "permissionCard" });
        return;
      }
      const read = (latestRead += 1);
      const website = await readWebsite();
      if (read !== latestRead) return;
      show(website ? { type: "pageDraft", page: website, editTitle: true } : { type: "blankDraft" });
    },

    // "Allow" on the permission card. The request starts before any await
    // because both browsers require it to follow a click.
    async allow() {
      const granted = await page.requestPermission();
      if (granted) await followCurrentPage();
      else show({ type: "blankDraft" });
    },

    // "Not now" on the permission card.
    decline() {
      show({ type: "blankDraft" });
    },

    // The page behind the sidebar changed. Without the permission there is
    // nothing to read, so the change is ignored.
    async pageChanged() {
      if (!(await page.hasPermission())) return;
      await followCurrentPage();
    },

    // The website behind the sidebar, for the + menu (#121): { url, title },
    // or null for a new tab or a browser page. With no permission the page
    // can't be read, so it is taken as a website with no known title, and
    // its choice leads to the permission card.
    async website() {
      if (!(await page.hasPermission())) return { url: null, title: null };
      return readWebsite();
    },

    // Start listening for page changes from the port.
    listen() {
      page.onPageChange(() => this.pageChanged());
    },
  };
}
