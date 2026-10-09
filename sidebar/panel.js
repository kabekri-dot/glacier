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

const noteEl = document.querySelector(".note");

async function start() {
  if (!noteEl) return;

  noteEl.setAttribute("contenteditable", "true");
  noteEl.focus();

  let notebook;
  try {
    notebook = createNotebook({ storage: await openIndexedDbStorage() });
  } catch (error) {
    // Without storage the panel still opens as a scratch page; nothing is lost
    // that was never saved. Sync (a later slice) is the cross-browser backup.
    console.error("Glacier: could not open storage", error);
    return;
  }

  // The note currently shown. Until the note-opening UI exists (#5, #12) this
  // is the most recently created one, so edits land on a real note and persist.
  const open = notebook
    .notes()
    .slice()
    .sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""))
    .pop();

  if (open) {
    noteEl.textContent = open.body ?? "";
    noteEl.addEventListener("input", () => {
      notebook.saveBody(open.title, noteEl.textContent);
    });
  }
}

start();
