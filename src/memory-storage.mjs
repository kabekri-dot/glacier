// An in-memory stand-in for the Notebook's storage. The real storage is
// IndexedDB (ADR 0003); this one lives only in memory and is used by tests
// and anywhere a throwaway Notebook is handy. It holds notes keyed by title,
// plus a small key/value meta store for settings like the last-used Course.

export function memoryStorage() {
  const notes = new Map();
  const meta = new Map();

  return {
    allNotes() {
      return [...notes.values()];
    },
    putNote(note) {
      notes.set(note.title, note);
    },
    getNote(title) {
      return notes.get(title);
    },
    deleteNote(title) {
      notes.delete(title);
    },
    getMeta(key) {
      return meta.get(key);
    },
    putMeta(key, value) {
      meta.set(key, value);
    },
  };
}
