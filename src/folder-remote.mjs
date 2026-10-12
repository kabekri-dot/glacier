// A folder on this computer as the Notes Home (#97, ADR 0011): the notes are
// Markdown files in a folder the person picked with the browser's folder
// picker, laid out like the Notes Repo (`collections/`, `notes/`,
// `archive/`), so Obsidian can open the same folder. It answers the same four
// calls as every Notes Home (the contract is in memory-remote.mjs).
//
// The folder comes as a File System Access handle from `getFolder()`,
// plugged in by the sidebar (sidebar/folder-access.js), which keeps it in
// IndexedDB. A file's version is its `lastModified` time and size, so a
// file another editor changed since this browser read it is refused like a
// stale GitHub commit and the two-versions handling takes over.
//
// After a browser restart Chrome forgets that Glacier may write there.
// Asking again needs a click, so this module never asks: it fails as
// "unauthorized" and the sidebar asks on the next click.
//
// This module only runs in the browser; tests give it the in-memory folder
// (memory-folder.mjs).

function failure(reason, message) {
  return Object.assign(new Error(message), { reason });
}

// What the browser threw, turned into one of the reasons the Notebook core
// explains. A file gone between the listing and a read counts as changed.
function failureFor(error) {
  if (error?.reason) return error;
  const reason =
    error?.name === "NotAllowedError" || error?.name === "SecurityError" ? "unauthorized"
    : error?.name === "NotFoundError" || error?.name === "TypeMismatchError" ? "conflict"
    : "unknown";
  return Object.assign(failure(reason, `The notes folder answered ${error?.name ?? error}`), { cause: error });
}

function versionOf(file) {
  return `${file.lastModified}:${file.size}`;
}

// Hidden folders and files, such as Obsidian's `.obsidian` or a `.git`, are
// never notes.
function hidden(name) {
  return name.startsWith(".");
}

export function folderRemote({ getFolder }) {
  let root = null;

  async function folder() {
    if (root) return root;
    root = await getFolder();
    if (!root) throw failure("not-found", "The notes folder is no longer known to this browser");
    return root;
  }

  // The folder a path's file sits in, made along the way with `create`.
  async function parentOf(path, { create = false } = {}) {
    let dir = await folder();
    for (const part of path.split("/").slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  const fileName = (path) => path.split("/").at(-1);

  // The file at a path, or null when there is none.
  async function fileAt(path) {
    try {
      const dir = await parentOf(path);
      return await (await dir.getFileHandle(fileName(path))).getFile();
    } catch (error) {
      if (error?.name === "NotFoundError") return null;
      throw error;
    }
  }

  async function walk(dir, prefix, found) {
    for await (const entry of dir.values()) {
      if (hidden(entry.name)) continue;
      const path = `${prefix}${entry.name}`;
      if (entry.kind === "directory") await walk(entry, `${path}/`, found);
      else found.push({ path, version: versionOf(await entry.getFile()) });
    }
    return found;
  }

  // The whole text goes into Chrome's own scratch file first; the old file
  // is only replaced when it is closed, so a write cut off halfway never
  // leaves half a note.
  async function write(path, text) {
    const handle = await (await parentOf(path, { create: true })).getFileHandle(fileName(path), { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => {});
      throw error;
    }
    return versionOf(await handle.getFile());
  }

  // A deleted note's file goes, and so do the folders it leaves empty, such
  // as a Collection whose last note moved out. The top folders stay.
  async function remove(path) {
    const parts = path.split("/");
    const dirs = [await folder()];
    for (const part of parts.slice(0, -1)) dirs.push(await dirs.at(-1).getDirectoryHandle(part));
    await dirs.at(-1).removeEntry(parts.at(-1));
    for (let i = dirs.length - 1; i > 1; i -= 1) {
      const empty = (await dirs[i].values().next()).done;
      if (!empty) break;
      await dirs[i - 1].removeEntry(parts[i - 1]);
    }
  }

  async function run(work) {
    try {
      return await work();
    } catch (error) {
      throw failureFor(error);
    }
  }

  return {
    // The folder is known and the browser still lets Glacier write there.
    async connect() {
      const dir = await folder();
      const permission = await run(() => dir.queryPermission({ mode: "readwrite" }));
      if (permission !== "granted") throw failure("unauthorized", "The browser needs an OK to write to the notes folder again");
    },

    async listFiles() {
      return run(async () => walk(await folder(), "", []));
    },

    // The text and the version come from the same read, so they always match.
    async readFile(path) {
      return run(async () => {
        const file = await fileAt(path);
        if (!file) throw failure("conflict", `${path} is no longer in the notes folder`);
        return { text: await file.text(), version: versionOf(file) };
      });
    },

    // A folder can't take several files at once, so every version is checked
    // before anything is written, and the writes go before the deletes: a
    // commit cut off halfway leaves a renamed note twice rather than not at
    // all, and the next sync finishes it.
    async commit({ writes = [], deletes = [] }) {
      return run(async () => {
        for (const { path, version } of [...writes, ...deletes]) {
          const file = await fileAt(path);
          if ((file ? versionOf(file) : undefined) !== version) throw failure("conflict", `Stale version of ${path}`);
        }
        const versions = {};
        for (const { path, text } of writes) versions[path] = await write(path, text);
        for (const { path } of deletes) await remove(path);
        return versions;
      });
    },
  };
}
