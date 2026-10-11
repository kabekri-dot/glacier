// The Opening flow: what the sidebar shows for the page behind it (issue #40).
//
// It decides between the start prompt, the permission card (ADR 0008), the
// page's Lesson Note, a fresh page that becomes a note when you write (#61),
// or keeping the open note (decidePageOpen, #29, #50): the sidebar always shows
// the note of the website tab you are on, and a non-website page keeps the
// open note. It owns
// "is this a lesson page" (http or https only) and the latest-change-wins rule
// for quick tab switches.
//
// The browser is plugged in as a small "browser page" port, so tests can use a
// fake page and panel.js only draws what the flow shows:
//   page.currentPage()       -> { url, title } of the active tab, or null
//   page.hasPermission()     -> whether the optional `tabs` permission is granted
//   page.requestPermission() -> asks for it; must be called straight from a click
//   page.onPageChange(fn)    -> calls fn when the active tab or its address changes
//
// `getOpenNote()` returns { current, openedByPage } for the note on screen,
// `lessonNoteForSource(url)` returns a Lesson Note or null, and `show(view)`
// draws one of: { type: "startPrompt" }, { type: "permissionCard" },
// { type: "open", note, openedByPage? }, { type: "lessonDraft", page, editTitle? }
// (a fresh page for the website's Lesson Note) or { type: "byHandDraft" } (a
// fresh page for a note by hand, with no Source).
//
// `getTabSettings()` returns the "Tabs and notes" settings (#53), read on every
// page change so a changed setting works at once: `keepUserOpenedNotes` is the
// old rule (notes the user opened themselves stay put when the page changes),
// `onNonWebsite` is "keep" or "newNoteForm" (a fresh page by hand) for a page
// that isn't a website.
import { decidePageOpen } from "./page-open.mjs";

export function createOpeningFlow({
  page,
  getOpenNote,
  lessonNoteForSource,
  show,
  getTabSettings = () => ({}),
}) {
  // Only http and https pages are lesson pages; anything else (chrome://,
  // file://, a new tab) counts as no page.
  async function readLessonPage() {
    const tab = await page.currentPage();
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return null;
    return { url: tab.url, title: tab.title || tab.url };
  }

  // Each page read is stamped; a result is dropped if a newer read has started
  // since, so the sidebar ends on the latest page, never the tab you left.
  let latestRead = 0;

  // `extra` is added to a fresh page for the website, e.g. `editTitle` when
  // the + menu asked for it.
  async function followCurrentPage(extra = {}) {
    const read = (latestRead += 1);
    const lessonPage = await readLessonPage();
    if (read !== latestRead) return;
    const { current, openedByPage } = getOpenNote();
    const decision = decidePageOpen({
      current,
      openedByPage,
      page: lessonPage,
      lessonNoteForSource,
      ...getTabSettings(),
    });
    if (decision.type === "lessonDraft") show({ ...decision, ...extra });
    else if (decision.type !== "keep") show(decision);
  }

  return {
    // The sidebar opened: follow the page if allowed, else the start prompt.
    async start() {
      if (await page.hasPermission()) await followCurrentPage();
      else show({ type: "startPrompt" });
    },

    // "+ Lesson note" on the start prompt, or "Lesson note for this page" in
    // the + menu, which passes `{ editTitle: true }`.
    async clickLessonNote(extra = {}) {
      if (await page.hasPermission()) await followCurrentPage(extra);
      else show({ type: "permissionCard" });
    },

    // "Allow" on the permission card. The request starts before any await
    // because both browsers require it to follow a click.
    async allow() {
      const granted = await page.requestPermission();
      if (granted) await followCurrentPage();
      else show({ type: "byHandDraft" });
    },

    // "Not now" on the permission card.
    decline() {
      show({ type: "byHandDraft" });
    },

    // The page behind the sidebar changed. Without the permission there is
    // nothing to read, so the change is ignored.
    async pageChanged() {
      if (!(await page.hasPermission())) return;
      await followCurrentPage();
    },

    // Whether the page behind the sidebar is a website, for the + menu. With no
    // permission the page can't be read, so it is taken as a website and the
    // Lesson note choice leads to the permission card.
    async onWebsite() {
      if (!(await page.hasPermission())) return true;
      return (await readLessonPage()) !== null;
    },

    // Esc on a fresh page before a note was made: back to the note that was
    // open before, else whatever the page shows (its note, or the empty paper
    // for it), else the start prompt.
    async cancelDraft(previous) {
      if (previous) {
        show({ type: "open", note: previous.note, openedByPage: previous.openedByPage });
        return;
      }
      if (await page.hasPermission()) await followCurrentPage();
      else show({ type: "startPrompt" });
    },

    // Start listening for page changes from the port.
    listen() {
      page.onPageChange(() => this.pageChanged());
    },
  };
}
