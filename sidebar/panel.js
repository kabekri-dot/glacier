// The Zen panel. It shows the Glacier page and, as you type, saves the note
// into this browser's own IndexedDB copy of the Notebook (ADR 0003) — no save
// button. The write-through storage persists each keystroke's text, so notes
// are still there after closing the sidebar, the tab or the browser.
//
// Opening the Lesson Note for the page you're on (needs the tab's title and
// Source) and the pill that switches notes arrive in later slices (#5, #12);
// for now the panel shows the current note, or an empty page when the Notebook
// has none yet. The cursor lands in the note as soon as it opens.

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

  noteEl.setAttribute("contenteditable", "true");
  noteEl.focus();

  let notebook;
  try {
    const storage = await openIndexedDbStorage({
      onPersistError: reportSaveError,
    });
    notebook = createNotebook({ storage });
  } catch (error) {
    // Without storage the panel still opens as a scratch page; nothing is lost
    // that was never saved. Sync (a later slice) is the cross-browser backup.
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

  if (openNote) {
    // The paper is `white-space: pre-wrap`, so the `\n` in the body render as
    // line breaks and textContent is enough to show it.
    noteEl.textContent = openNote.body ?? "";

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
}

start();
