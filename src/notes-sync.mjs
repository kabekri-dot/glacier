// Sync (#14, #15, #17, ADR 0004, 0005): the Notebook and its Notes Home kept
// the same, file by file. What each file held when last synced is kept in
// storage, so a change on either side is told from one on both; a note that
// changed on both sides is never overwritten but kept as a Conflict Copy.
// The remote is plugged in from outside (ADR 0003).
//
//   createNotesSync({ storage, sealed, highscores, uniqueTitle, mergeCollectionCases, numberTitleCases })
//   .firstSync(remote, onProgress)   .sync(remote)
//   .switchNotesHome(place, remote, onProgress)   .notesHome()
//   .lastSynced()   .conflictCopies()   .conflictCopyPairs()
//   .adoptSketch(note, n, incoming, known)  also used by Import
import { fewAtATime } from "./few-at-a-time.mjs";
import { isNoteFile, isNotebookFile, isSketchFile, nextSketchNumber, noteFiles, noteFromFile, noteToFile, sameNote, sketchEmbed } from "./note-file.mjs";
import { sketchFilePath, sketchFromSvg, sketchToSvg } from "./sketch-file.mjs";

export function createNotesSync({ storage, sealed, highscores, uniqueTitle, mergeCollectionCases, numberTitleCases }) {
  // What each Notes Repo file held when this browser last synced it, keyed by
  // path: `{ title, version, text }`. Comparing a note's file with it tells
  // which side changed since (#15).
  const SYNCED = "syncedFiles";
  const LAST_SYNCED = "lastSynced";
  // Where the notes live (ADR 0011): "browser" or a place such as "github".
  // Kept per browser in its own storage, never synced. Unset until chosen.
  const NOTES_HOME = "notesHome";
  // "Title (conflict 2026-10-11)", with a number after it for a second one.
  const CONFLICT_TITLE = / \(conflict \d{4}-\d{2}-\d{2}\)( \d+)?$/;

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function conflictCopy(note) {
    const copy = { ...note, title: uniqueTitle(`${note.title} (conflict ${today()})`) };
    storage.putNote(copy);
    return copy;
  }

  // Whether this note is still as it was when its file was last synced. The
  // note is compared with what the file said, not with its text, so a file
  // only written the old way (ADR 0010) still counts as unchanged.
  function unchangedSince(note, entry, path) {
    const was = noteFromFile(path, entry.text);
    return note.title === was.title && sameNote(note, was);
  }

  // Notes that came in with a title another note has in other capitals get
  // a number (#118), keeping the ones whose files are already there.
  function numberClashes(synced) {
    numberTitleCases(new Set(Object.values(synced).filter((entry) => !entry.sketch).map((entry) => entry.title)));
  }

  // Bring one changed or new Notes Repo file into this browser. A note that
  // changed here too is never overwritten (ADR 0004): the incoming version
  // becomes a Conflict Copy, and this browser's text is pushed over the file.
  function pullFile(path, version, text, synced, result) {
    const known = synced[path];
    const incoming = noteFromFile(path, text);
    const local = storage.getNote(known ? known.title : incoming.title);
    // A note moved to another folder (another Collection) comes in under a
    // new path: what its old file said tells whether it changed here since.
    const movedFrom = !known && Object.keys(synced).find((other) => !synced[other].sketch && synced[other].title === incoming.title);
    if (local && known?.text === text) {
      // Same text as last synced, only a new version (a folder synced by
      // OneDrive, or Drive, can do that): nothing changed there.
      synced[path] = { ...known, version };
    } else if (!local) {
      const note = { ...incoming, title: uniqueTitle(incoming.title) };
      storage.putNote(note);
      result.pulled.push(note.title);
      synced[path] = { title: note.title, version, text };
    } else if (
      unchangedSince(local, { text }, path) ||
      (known ? unchangedSince(local, known, path) : sameNote(local, incoming, { ignoreArchived: true })) ||
      (movedFrom && unchangedSince(local, synced[movedFrom], movedFrom))
    ) {
      if (local.title !== incoming.title) storage.deleteNote(local.title);
      // The note's file holds no drawings: its sketches stay as they are here
      // and come with their own files.
      storage.putNote(local.sketches ? { ...incoming, sketches: local.sketches } : incoming);
      if (!sameNote(local, incoming) || local.title !== incoming.title) result.pulled.push(incoming.title);
      synced[path] = { title: incoming.title, version, text };
    } else {
      result.pulled.push(conflictCopy(incoming).title);
      result.conflicts += 1;
      synced[path] = { title: local.title, version, text };
    }
  }

  // A file gone from the Notes Repo (deleted, or renamed in another browser)
  // takes its note with it, unless the note changed here since: then it is
  // kept and pushed back.
  function pullDeletion(path, synced, result) {
    const title = synced[path].title;
    const local = storage.getNote(title);
    // A file only moved to another folder (another browser moved courses/ to
    // collections/, #73) already came in under its new path: keep the note.
    const moved = Object.keys(synced).some(
      (other) => other !== path && synced[other].title === title && !synced[other].sketch,
    );
    if (local && !moved && unchangedSince(local, synced[path], path)) {
      storage.deleteNote(local.title);
      result.pulled.push(local.title);
    }
    delete synced[path];
  }

  // The note whose Markdown file is at this path, or undefined.
  function noteAtPath(path) {
    return storage.allNotes().find((note) => noteToFile(note).path === path);
  }

  // Put a sketch from a file into its note (#101). One the note doesn't have
  // yet, or has unchanged since `known` (the file's text when last synced),
  // is taken as it is. One that changed here as well is never overwritten
  // (ADR 0004): the incoming drawing becomes a new sketch below the note's
  // text. One whose file still says what it said when last synced is kept as
  // it is here. Returns "same", "taken" or "both".
  function adoptSketch(note, n, incoming, known) {
    const local = note.sketches?.[n];
    const localText = local && sketchToSvg(local);
    const incomingText = sketchToSvg(incoming);
    // Same text as last synced, only a new version (Drive does that to a
    // picture file): nothing changed there, what is here gets pushed.
    if (localText === incomingText || (local && incomingText === known)) return "same";
    if (!local || (known !== undefined && localText === known)) {
      storage.putNote({ ...note, sketches: { ...note.sketches, [n]: incoming } });
      return "taken";
    }
    const free = nextSketchNumber(note);
    const body = `${note.body ?? ""}\n${sketchEmbed(note.title, free)}`;
    storage.putNote({ ...note, body, sketches: { ...note.sketches, [free]: incoming } });
    return "both";
  }

  // Bring one changed or new sketch file into its note. A file whose note
  // isn't here is left for a later sync.
  function pullSketch(path, version, text, synced, result) {
    const { notePath, n } = sketchFilePath(path);
    const note = noteAtPath(notePath);
    const incoming = sketchFromSvg(text);
    if (!note || !incoming) return;
    const outcome = adoptSketch(note, n, incoming, synced[path]?.text);
    if (outcome !== "same" && !result.pulled.includes(note.title)) result.pulled.push(note.title);
    if (outcome === "both") result.conflicts += 1;
    synced[path] = { title: note.title, sketch: n, version, text };
  }

  // A sketch file gone from the Notes Repo takes the sketch with it, unless
  // it changed here since or only moved with its note to another folder.
  function pullSketchDeletion(path, synced, result) {
    const { title, sketch: n, text } = synced[path];
    const moved = Object.keys(synced).some(
      (other) => other !== path && synced[other].title === title && synced[other].sketch === n,
    );
    const note = storage.getNote(title);
    const local = note?.sketches?.[n];
    if (!moved && local && sketchToSvg(local) === text) {
      const { [n]: gone, ...sketches } = note.sketches;
      storage.putNote({ ...note, sketches });
      if (!result.pulled.includes(title)) result.pulled.push(title);
    }
    delete synced[path];
  }

  // Pull what changed in the Notes Repo since this browser last synced it.
  // Changed files are all downloaded before any note changes, so a lost
  // connection while pulling leaves the Notebook as it was. Returns every
  // file listed there, for the highscores.
  async function pull(remote, synced, result) {
    const listing = await remote.listFiles();
    const listed = listing.filter(({ path }) => isNotebookFile(path));
    const changed = [];
    const toRead = listed.filter(({ path, version }) => synced[path]?.version !== version);
    await fewAtATime(toRead, async ({ path }, at) => {
      changed[at] = { path, ...(await remote.readFile(path)) };
    });
    // Notes first, so each sketch finds its note where it now is.
    for (const { path, version, text } of changed) {
      if (isNoteFile(path)) pullFile(path, version, text, synced, result);
    }
    for (const { path, version, text } of changed) {
      if (isSketchFile(path)) pullSketch(path, version, text, synced, result);
    }
    const listedPaths = new Set(listed.map(({ path }) => path));
    for (const path of Object.keys(synced)) {
      if (listedPaths.has(path)) continue;
      if (synced[path].sketch) pullSketchDeletion(path, synced, result);
      else pullDeletion(path, synced, result);
    }
    storage.putMeta(SYNCED, { ...synced });
    mergeCollectionCases();
    numberClashes(synced);
    return listing;
  }

  // Send every note whose file differs from what was last synced, and delete
  // the files no note has any more, as one commit (ADR 0005): a rename's new
  // file, its old file and every rewritten Link land together or not at all.
  // Returns false when the Notes Repo refused a stale version: then what
  // changed there is pulled again (a note changed in both places becomes a
  // Conflict Copy, ADR 0004) and the push starts over.
  async function pushRound(remote, synced, result) {
    const wanted = new Map();
    for (const note of storage.allNotes()) {
      for (const { path, text, sketch } of noteFiles(note)) {
        wanted.set(path, { title: note.title, text, sketch });
      }
    }
    const writes = [];
    for (const [path, { title, text, sketch }] of wanted) {
      const known = synced[path];
      if (known && known.title === title && known.text === text) continue;
      writes.push({ path, title, text, sketch, version: known?.version });
    }
    const deletes = Object.keys(synced)
      .filter((path) => !wanted.has(path))
      .map((path) => ({ path, version: synced[path].version }));
    if (writes.length === 0 && deletes.length === 0) return true;
    let versions;
    try {
      versions = await remote.commit({
        writes: writes.map(({ path, text, version }) => ({ path, text, version })),
        deletes,
      });
    } catch (error) {
      if (error?.reason !== "conflict") throw error;
      await pull(remote, synced, result);
      return false;
    }
    for (const { path, title, text, sketch } of writes) {
      synced[path] = { title, version: versions[path], text, ...(sketch && { sketch }) };
    }
    for (const { path } of deletes) delete synced[path];
    storage.putMeta(SYNCED, { ...synced });
    result.pushed += writes.length + deletes.length;
    return true;
  }

  // A few rounds are plenty: each one takes in what the other browser wrote.
  // If files keep changing under us, the next sync carries on.
  async function push(remote, synced, result) {
    for (let round = 0; round < 3; round += 1) {
      if (await pushRound(remote, synced, result)) return;
    }
    throw Object.assign(new Error("The Notes repo kept changing during sync"), { reason: "conflict" });
  }

  // The Conflict Copies still listed in the Notebook, by their dated titles.
  // An archived copy is put away, so it no longer counts.
  function conflictCopies() {
    return storage
      .allNotes()
      .filter((note) => !note.archived)
      .map((note) => note.title)
      .filter((title) => CONFLICT_TITLE.test(title));
  }

  // Each Conflict Copy next to its original, which is null when the original
  // was renamed or removed since.
  function conflictCopyPairs() {
    return conflictCopies().map((copy) => {
      const original = copy.replace(CONFLICT_TITLE, "");
      const found = storage.getNote(original);
      return { copy, original: found && !found.archived ? original : null };
    });
  }

  // The first sync (#14): bring every note in the Notes Repo into this
  // browser. All files are downloaded before anything changes, so a wrong
  // token or a lost connection leaves the Notebook as it was. A note that is
  // already here is never overwritten (ADR 0004): if the Notes Repo's text
  // differs, it is kept next to it as a Conflict Copy. Nothing is written
  // to the Notes Repo. `onProgress` hears each step, for the progress screen.
  async function firstSync(remote, onProgress = () => {}) {
    onProgress({ step: "connecting" });
    await remote.connect();
    const paths = (await remote.listFiles()).map(({ path }) => path).filter(isNotebookFile);
    const notePaths = paths.filter(isNoteFile);
    const downloaded = [];
    const sketchFiles = [];
    onProgress({ step: "downloading", done: 0, total: notePaths.length });
    let done = 0;
    await fewAtATime(paths, async (path, at) => {
      const { text, version } = await remote.readFile(path);
      if (isSketchFile(path)) {
        sketchFiles.push({ path, version, text });
        return;
      }
      downloaded[at] = { path, version, text, note: noteFromFile(path, text) };
      done += 1;
      onProgress({ step: "downloading", done, total: notePaths.length });
    });
    onProgress({ step: "linking" });
    const synced = {};
    for (const { path, version, text, note } of downloaded.filter(Boolean)) {
      const existing = storage.getNote(note.title);
      if (!existing) {
        storage.putNote(note);
      } else if (!sameNote(existing, note)) {
        conflictCopy(note);
      }
      synced[path] = { title: note.title, version, text };
    }
    for (const { path, version, text } of sketchFiles) {
      pullSketch(path, version, text, synced, { pulled: [], conflicts: 0 });
    }
    storage.putMeta(SYNCED, synced);
    highscores.forgetSynced();
    storage.putMeta(LAST_SYNCED, new Date().toISOString());
    mergeCollectionCases();
    numberClashes(synced);
    await sealed.reopen();
    onProgress({ step: "ready", notes: notePaths.length });
    return { notes: notePaths.length };
  }

  // Where the notes live (#94): "browser", a place such as "github", or
  // null before anything was chosen.
  function notesHome() {
    return storage.getMeta(NOTES_HOME) ?? null;
  }

  // Switch the Notes Home (#94, ADR 0011). A new place is combined with
  // this browser like a first sync, then everything here is pushed to it,
  // so the notes end up in both; a note that differs gets two versions
  // (ADR 0004) and nothing is deleted. The old place is never touched.
  // "browser" just stops syncing. A place that can't be reached keeps the
  // place there was. Once combined the place is chosen; if the push then
  // fails (`pushed` is false), the next sync sends the notes.
  async function switchNotesHome(place, remote, onProgress = () => {}) {
    if (place === "browser") {
      storage.putMeta(NOTES_HOME, "browser");
      return { notes: 0 };
    }
    let ready = null;
    const result = await firstSync(remote, (progress) => {
      if (progress.step === "ready") ready = progress;
      else onProgress(progress);
    });
    storage.putMeta(NOTES_HOME, place);
    try {
      await sync(remote);
    } catch {
      return { ...result, pushed: false };
    }
    onProgress(ready);
    return { ...result, pushed: true };
  }

  // Sync (#15): pull what changed in the Notes Repo since this browser
  // last synced, then push what changed here as one commit (#17), then
  // merge the top 5 of the hidden games with the Notes Home's (#128).
  // `pulled` lists the notes that came in, changed or went, so the screen
  // can redraw them. With the notes living only in this browser there is
  // nothing to sync.
  async function sync(remote) {
    if (storage.getMeta(NOTES_HOME) === "browser") return { pulled: [], pushed: 0, conflicts: 0 };
    await sealed.settled();
    await remote.connect();
    const synced = { ...storage.getMeta(SYNCED) };
    const result = { pulled: [], pushed: 0, conflicts: 0 };
    const listing = await pull(remote, synced, result);
    await push(remote, synced, result);
    await highscores.sync(remote, listing);
    storage.putMeta(LAST_SYNCED, new Date().toISOString());
    await sealed.reopen(result.pulled);
    return result;
  }

  // When the last sync finished (an ISO date), or undefined before any.
  function lastSynced() {
    return storage.getMeta(LAST_SYNCED);
  }

  return { firstSync, notesHome, switchNotesHome, sync, lastSynced, conflictCopies, conflictCopyPairs, adoptSketch };
}
