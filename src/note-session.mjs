// The Note session owns saving the open note. Each edit is bound to the note it
// was typed in, so a delayed save always lands there, even if another note has
// been opened since. Opening another note, closing, or flush() (the panel
// calls it when the sidebar hides) writes a pending edit straight away.
//
// The save scheduler (one write per typing pause, issue #25) is an internal
// detail. Timers are injected for tests. No browser APIs here.

import { createSaveScheduler } from "./save-scheduler.mjs";

export function createNoteSession({ notebook, onSaveError, ...timers }) {
  let openTitle = null;

  const scheduler = createSaveScheduler({
    save: ({ title, body }) => {
      try {
        notebook.saveBody(title, body);
      } catch (error) {
        onSaveError?.(error);
      }
    },
    ...timers,
  });

  function flush() {
    scheduler.flush();
  }

  return {
    open(note) {
      flush();
      openTitle = note.title;
    },
    edit(body) {
      if (openTitle === null) {
        return;
      }
      scheduler.schedule({ title: openTitle, body });
    },
    close() {
      flush();
      openTitle = null;
    },
    flush,
  };
}
