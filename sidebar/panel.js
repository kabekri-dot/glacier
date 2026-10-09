// The Zen panel. It shows the Glacier page and, as you type, saves the note
// into this browser's own IndexedDB copy of the Notebook (ADR 0003) — no save
// button. The write-through storage persists each keystroke's text, so notes
// are still there after closing the sidebar, the tab or the browser.
//
// Opening the Lesson Note for the page you're on (needs the tab's title and
// Source) and the pill that switches notes arrive in later slices (#5, #12);
// for now the panel shows the current note, or a read-only empty page when the
// Notebook has none yet. The page stays read-only until the Notebook has
// loaded, so nothing typed is ever overwritten or dropped (issue #23); the
// cursor then lands in the note.

import { createNotebook } from "../src/notebook.mjs";
import { openIndexedDbStorage } from "../src/indexeddb-storage.mjs";
import { createSaveScheduler } from "../src/save-scheduler.mjs";
import { editorTextToBody } from "../src/editor-model.mjs";

const noteEl = document.querySelector(".note");
const saveErrorEl = document.querySelector(".save-error");

// A write to this browser's copy failed (aborted or threw). Tell the user so
// they don't trust a save that didn't happen (issue #25); their text is still
// on screen to copy out, and Sync (a later slice) is the cross-browser backup.
function reportSaveError(error) {
  console.error("Glacier: could not save", error);
  if (saveErrorEl) {
    saveErrorEl.hidden = false;
  }
}

async function start() {
  if (!noteEl) return;

  // Keep the page read-only until the Notebook has loaded (issue #23). Making
  // it editable first lost text two ways: keystrokes typed before the load
  // finished were overwritten when the stored body arrived, and typing on a
  // fresh install — where no note exists and no save listener is attached —
  // went nowhere. So we open storage first, then decide.
  let notebook;
  try {
    const storage = await openIndexedDbStorage({
      onPersistError: reportSaveError,
    });
    notebook = createNotebook({ storage });
  } catch (error) {
    // Without storage there is nowhere to save, so the page stays read-only
    // rather than inviting text that can't be kept. Sync (a later slice) is
    // the cross-browser backup.
    console.error("Glacier: could not open storage", error);
    return;
  }

  // The note currently shown. Until the note-opening UI exists (#5, #12) this
  // is the most recently created one, so edits land on a real note and persist.
  const openNote = notebook
    .notes()
    .slice()
    .sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""))
    .pop();

  // A fresh install has no note yet, and the panel has no note-creating UI
  // until the Lesson Note flow is wired in (#3, #5, #12). Leaving the page
  // read-only means nothing typed can be silently dropped for lack of
  // somewhere to save it (issue #23).
  if (!openNote) return;

  // The paper is `white-space: pre-wrap`, so the `\n` in the body render as
  // line breaks and textContent is enough to show it. Fill the note before
  // making it editable, so the cursor lands in text that is already settled.
  noteEl.textContent = openNote.body ?? "";
  noteEl.setAttribute("contenteditable", "true");
  noteEl.focus();

  // Read the edited note with innerText, not textContent: innerText keeps the
  // line breaks Enter makes (`<div>` in Chrome, `<br>` in Firefox) that
  // textContent drops, so a multi-line note survives a reload (issue #24).
  const readBody = () => editorTextToBody(noteEl.innerText);

  // Debounce writes so a burst of typing opens one transaction, not one per
  // keystroke, and flush any pending write before the sidebar goes away so
  // the last keystrokes aren't lost (issue #25).
  const scheduler = createSaveScheduler({
    save: (body) => notebook.saveBody(openNote.title, body),
  });
  noteEl.addEventListener("input", () => scheduler.schedule(readBody()));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") scheduler.flush();
  });
  window.addEventListener("pagehide", () => scheduler.flush());
}

start();
