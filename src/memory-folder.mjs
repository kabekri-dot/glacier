// The in-memory stand-in for a folder on this computer that the tests use
// (#97). It has the same shape as the File System Access handles Chrome
// gives for a picked folder (folder-remote.mjs uses only these): a folder
// handle with getDirectoryHandle, getFileHandle, removeEntry, values,
// queryPermission and requestPermission, and file handles with getFile and
// createWritable. A file's `lastModified` moves on with every write, like a
// real disk's. Like Chrome, a writable only replaces the file when it is
// closed, so a write cut off halfway never leaves half a note.

function notFound(name) {
  return new DOMException(`${name} was not found`, "NotFoundError");
}

export function memoryFolder({ name = "Notes" } = {}) {
  let clock = Date.parse("2026-10-13T09:00:00.000Z");
  let permission = "granted";
  let grantOnRequest = true;
  let failWrites = false;
  let permissionRequests = 0;

  function tick() {
    clock += 1000;
    return clock;
  }

  function checkPermission() {
    if (permission !== "granted") throw new DOMException("The folder needs permission again", "NotAllowedError");
  }

  function fileHandle(entry) {
    return {
      kind: "file",
      name: entry.name,
      async getFile() {
        checkPermission();
        const { text, lastModified } = entry;
        return { name: entry.name, lastModified, size: new TextEncoder().encode(text).length, text: async () => text };
      },
      async createWritable() {
        checkPermission();
        let pending = "";
        let open = true;
        return {
          async write(data) {
            if (failWrites) throw new DOMException("The disk is full", "QuotaExceededError");
            pending += data;
          },
          async close() {
            if (!open) return;
            open = false;
            entry.text = pending;
            entry.lastModified = tick();
          },
          async abort() {
            open = false;
          },
        };
      },
    };
  }

  function folderHandle(folder) {
    return {
      kind: "directory",
      name: folder.name,
      async getDirectoryHandle(child, { create = false } = {}) {
        checkPermission();
        let entry = folder.entries.get(child);
        if (!entry) {
          if (!create) throw notFound(child);
          entry = { kind: "directory", name: child, entries: new Map() };
          folder.entries.set(child, entry);
        }
        if (entry.kind !== "directory") throw new DOMException(`${child} is a file`, "TypeMismatchError");
        return folderHandle(entry);
      },
      async getFileHandle(child, { create = false } = {}) {
        checkPermission();
        let entry = folder.entries.get(child);
        if (!entry) {
          if (!create) throw notFound(child);
          entry = { kind: "file", name: child, text: "", lastModified: tick() };
          folder.entries.set(child, entry);
        }
        if (entry.kind !== "file") throw new DOMException(`${child} is a folder`, "TypeMismatchError");
        return fileHandle(entry);
      },
      async removeEntry(child) {
        checkPermission();
        const entry = folder.entries.get(child);
        if (!entry) throw notFound(child);
        if (entry.kind === "directory" && entry.entries.size > 0) {
          throw new DOMException(`${child} is not empty`, "InvalidModificationError");
        }
        folder.entries.delete(child);
      },
      async *values() {
        checkPermission();
        for (const entry of [...folder.entries.values()]) {
          yield entry.kind === "directory" ? folderHandle(entry) : fileHandle(entry);
        }
      },
      async queryPermission() {
        return permission;
      },
      async requestPermission() {
        permissionRequests += 1;
        if (grantOnRequest) permission = "granted";
        return permission;
      },
    };
  }

  const root = { kind: "directory", name, entries: new Map() };

  function find(path) {
    let folder = root;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      folder = folder.entries.get(part);
      if (!folder) return null;
    }
    return { folder, name: parts.at(-1) };
  }

  function put(path, text) {
    let folder = root;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) {
      if (!folder.entries.has(part)) folder.entries.set(part, { kind: "directory", name: part, entries: new Map() });
      folder = folder.entries.get(part);
    }
    folder.entries.set(parts.at(-1), { kind: "file", name: parts.at(-1), text, lastModified: tick() });
  }

  function walk(folder, prefix, found) {
    for (const entry of folder.entries.values()) {
      const path = `${prefix}${entry.name}`;
      if (entry.kind === "directory") {
        found.folders.push(path);
        walk(entry, `${path}/`, found);
      } else found.files[path] = entry.text;
    }
    return found;
  }

  return {
    // The picked folder, as showDirectoryPicker resolves to.
    handle: folderHandle(root),

    // For tests: another editor writing a file, or putting one in place.
    editFile(path, text) {
      put(path, text);
    },
    // For tests: another editor deleting a file.
    deleteFile(path) {
      const place = find(path);
      place?.folder.entries.delete(place.name);
    },
    // For tests: the browser forgetting the permission, as Chrome does on a
    // restart. With `grant: false`, asking again is refused.
    forgetPermission({ grant = true } = {}) {
      permission = "prompt";
      grantOnRequest = grant;
    },
    // For tests: how many times the permission was asked for.
    permissionRequests: () => permissionRequests,
    // For tests: every write fails before it is closed, like a full disk.
    failWrites(fail = true) {
      failWrites = fail;
    },
    // For tests: the files as they are now, path to text.
    files() {
      return walk(root, "", { files: {}, folders: [] }).files;
    },
    // For tests: every folder inside the picked one.
    folders() {
      return walk(root, "", { files: {}, folders: [] }).folders;
    },
  };
}
