// The Notebook core: all note, Link, title, search, file-format and sync
// logic lives here as later slices add it. It has no screen code and no
// browser APIs; storage (and later GitHub) is plugged in from outside
// (ADR 0003), so the core can be tested with an in-memory stand-in.

export function createNotebook({ storage }) {
  if (!storage) {
    throw new Error("createNotebook needs a storage plug-in");
  }

  return {
    // Every Note currently in the Notebook.
    notes() {
      return storage.allNotes();
    },
    isEmpty() {
      return storage.allNotes().length === 0;
    },
  };
}
