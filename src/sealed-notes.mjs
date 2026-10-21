// Secret notes (#109, ADR 0012): the notes in storage as the Notebook may
// read them, the passcode, and the encrypting. The passcode's record
// `{ salt, check }` is kept in storage, never the passcode. While unlocked,
// the key (`current`, with its record), the keys of any older salts the same
// passcode opened, and the opened notes' `{ body, sketches }` by title live
// only in memory. Plain notes pass straight through.
//
//   createSealedNotes({ storage, onSaveError })
//   .readable(title) / .reveal(note) / .readableNotes()
//                a note with its text, or a locked secret note with
//                `locked: true` and no text
//   .store(note) keep a note's new text; a secret one is encrypted just after
//   .opened(title) / .forget(title) / .putBack(title, opened)
//                the opened text of a note, for a rename, delete and undo
//   .reopen(changed)  after a sync or restore brought notes in
//   .settled()   waits until every change is encrypted into storage
//   and the Notebook's own secret methods, from hasPasscode to changePasscode.
//
// `onSaveError(error)` hears of a secret note's text that couldn't be
// encrypted into storage, so the sidebar can say the save failed (#25).
import { newPasscode, openPasscode, sealText, readSealed, openSealed } from "./secret.mjs";

const PASSCODE = "secretPasscode";

export function createSealedNotes({ storage, onSaveError }) {
  let current = null;
  const keys = new Map();
  const unlocked = new Map();
  // Encrypting is asynchronous: each change waits its turn here, so the last
  // one typed is the one kept.
  let writing = Promise.resolve();

  // A note as the Notebook reads it. An unlocked secret note has its text
  // and sketches; a locked one has neither, and says so.
  function reveal(note) {
    if (!note?.secret) return note;
    const open = unlocked.get(note.title);
    if (open) return { ...note, ...open };
    return { ...note, body: "", locked: true };
  }

  function readable(title) {
    return reveal(storage.getNote(title));
  }

  // Keep a note's new text or sketches. A secret note keeps them in memory at
  // once and is encrypted into storage just after.
  function store(note) {
    if (!note.secret) {
      storage.putNote(note);
      return note;
    }
    const { body, sketches, locked, ...rest } = note;
    unlocked.set(note.title, { body, ...(sketches && { sketches }) });
    storage.putNote({ ...rest, body: storage.getNote(note.title)?.body ?? "" });
    seal(note.title);
    return readable(note.title);
  }

  // Encrypt an unlocked secret note's text into storage, after the changes
  // before it. The text and key are taken now, so a lock meanwhile loses nothing.
  function seal(title) {
    const open = unlocked.get(title);
    const { key, record } = current;
    writing = writing
      .then(async () => {
        const body = await sealText(key, record, JSON.stringify(open));
        const stored = storage.getNote(title);
        if (stored?.secret) storage.putNote({ ...stored, body });
      })
      .catch((error) => onSaveError(error));
  }

  // The passcode records found in secret notes, the latest edited first
  // (edited, or else created, as the Notebook counts it).
  function secretRecords() {
    const edited = (note) => note.edited ?? note.created ?? "";
    return storage
      .allNotes()
      .filter((note) => note.secret)
      .sort((a, b) => edited(b).localeCompare(edited(a)))
      .map((note) => readSealed(note.body)?.record)
      .filter(Boolean);
  }

  // Open the secret notes not opened yet with the keys held, after
  // forgetting the ones that `changed` (pulled or restored) or went.
  async function reopen(changed = []) {
    for (const title of changed) unlocked.delete(title);
    for (const title of [...unlocked.keys()]) {
      if (!storage.getNote(title)?.secret) unlocked.delete(title);
    }
    if (!current) return;
    for (const note of storage.allNotes()) {
      if (!note.secret || unlocked.has(note.title)) continue;
      const sealed = readSealed(note.body);
      const key = sealed && keys.get(sealed.record.salt);
      const text = key ? await openSealed(key, sealed) : null;
      if (text !== null) unlocked.set(note.title, JSON.parse(text));
    }
  }

  // Whether a Glacier passcode exists: set here, or brought in with secret
  // notes from the Notes Home or a backup. Then it is asked for, not set.
  function hasPasscode() {
    return Boolean(storage.getMeta(PASSCODE)) || storage.allNotes().some((note) => note.secret);
  }

  function isUnlocked() {
    return current !== null;
  }

  function usePasscode(made) {
    storage.putMeta(PASSCODE, made.record);
    current = made;
    keys.set(made.record.salt, made.key);
  }

  // Open the secret notes with the passcode. It is checked against the
  // records in the secret notes, the latest first, then this browser's,
  // so a passcode changed in another browser works once its notes are
  // here. False, with nothing changed, when it is the wrong one.
  async function unlock(passcode) {
    const records = [];
    for (const record of [...secretRecords(), storage.getMeta(PASSCODE)]) {
      if (record && !records.some((seen) => seen.salt === record.salt)) records.push(record);
    }
    const opened = new Map();
    for (const record of records) {
      const key = await openPasscode(passcode, record);
      if (key) opened.set(record.salt, { key, record });
    }
    if (opened.size === 0) return false;
    current = opened.values().next().value;
    for (const [salt, { key }] of opened) keys.set(salt, key);
    if (storage.getMeta(PASSCODE)?.salt !== current.record.salt) storage.putMeta(PASSCODE, current.record);
    await reopen();
    return true;
  }

  // Make a note secret: its text and sketches are encrypted together.
  // Needs the passcode open; undefined otherwise.
  async function makeSecret(title) {
    const note = storage.getNote(title);
    if (!note || note.secret || !current) return undefined;
    const { sketches, ...rest } = note;
    const open = { body: note.body ?? "", ...(sketches && { sketches }) };
    const body = await sealText(current.key, current.record, JSON.stringify(open));
    // Typed into meanwhile: start again with the newer text.
    if (storage.getNote(title) !== note) return makeSecret(title);
    storage.putNote({ ...rest, secret: true, body });
    unlocked.set(title, open);
    return readable(title);
  }

  return {
    reveal,
    readable,
    readableNotes: () => storage.allNotes().map(reveal),
    store,
    reopen,
    settled: () => writing,
    opened: (title) => unlocked.get(title),
    forget: (title) => unlocked.delete(title),
    // A deleted note put back: open again if it was open and the passcode
    // still is.
    putBack(title, opened) {
      if (!opened || !current) return;
      unlocked.set(title, opened);
      seal(title);
    },

    hasPasscode,
    isUnlocked,

    isSecret(title) {
      return Boolean(storage.getNote(title)?.secret);
    },

    // A secret note whose text can't be read now.
    isLocked(title) {
      return readable(title)?.locked === true;
    },

    // Set the Glacier passcode the first time; it unlocks at once. False when
    // there already is one.
    async setPasscode(passcode) {
      if (hasPasscode()) return false;
      usePasscode(await newPasscode(passcode));
      return true;
    },

    unlock,

    // Forget the key and every opened text: the secret notes are locked.
    lock() {
      current = null;
      keys.clear();
      unlocked.clear();
    },

    makeSecret,

    // Make an unlocked secret note a plain note again.
    async makeNotSecret(title) {
      const note = readable(title);
      if (!note?.secret || note.locked) return undefined;
      const { secret, ...plain } = note;
      unlocked.delete(title);
      storage.putNote(plain);
      return plain;
    },

    // Change the passcode (#109): every secret note this passcode opens is
    // encrypted again under the new one. There is no recovery, so the
    // current passcode is needed. `locked` counts the secret notes it didn't
    // open, which keep their old passcode.
    async changePasscode(passcode, next) {
      if (!(await unlock(passcode))) return { ok: false };
      usePasscode(await newPasscode(next));
      for (const title of unlocked.keys()) seal(title);
      await writing;
      return { ok: true, locked: storage.allNotes().filter((note) => note.secret && !unlocked.has(note.title)).length };
    },
  };
}
