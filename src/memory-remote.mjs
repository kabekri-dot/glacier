// The remote contract (#94, ADR 0011). Every Notes Home (GitHub now; Google
// Drive and a folder later) is plugged into the Notebook core as an object
// with these four calls, and nothing else:
//
//   connect()            Checks the place can be reached and the person may
//                        use it. Called before every first sync and sync.
//   listFiles()          Every file there, as `[{ path, version }]`. An empty
//                        place gives [].
//   readFile(path)       One file as `{ text, version }`.
//   commit({ writes, deletes })
//                        `writes` is `[{ path, text, version }]`, `deletes`
//                        `[{ path, version }]`, where `version` is the one
//                        this browser last saw (undefined for a new file).
//                        All land together or none do (ADR 0005). Returns the
//                        new version of each written file, by path.
//
// A path is any file path with text content ("notes/Margins.md", later a
// sketch's ".svg"), so a new kind of file needs no adapter change. A version
// is any string that changes with every write. A failure throws an Error
// with a `reason`: "unauthorized", "forbidden", "not-found", "offline",
// "aborted" (cut off as the sidebar closes) or "conflict" (a version is no
// longer the current one; the commit is refused as a whole).
//
// This file is the in-memory stand-in for the Notes Repo that the tests use.
// The real one is GitHub (github-remote.mjs); this one holds files in memory.
// Each file has a version that changes with every write; a commit that names
// an old version is refused as a whole, like GitHub does.

export function memoryRemote(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const versions = new Map([...files.keys()].map((path) => [path, "v0"]));
  let written = 0;
  let failure = null;
  let beforeWrite = null;
  const commits = [];

  // Every call fails the same way while a failure is set, like GitHub
  // refusing a wrong token or repo.
  function check() {
    if (failure) {
      throw Object.assign(new Error(`Remote failed: ${failure}`), { reason: failure });
    }
  }

  function checkVersion(path, version) {
    if (versions.get(path) !== version) {
      throw Object.assign(new Error(`Stale version of ${path}`), { reason: "conflict" });
    }
  }

  async function runBeforeWrite() {
    if (beforeWrite) {
      const hook = beforeWrite;
      beforeWrite = null;
      await hook();
    }
  }

  function put(path, text) {
    written += 1;
    files.set(path, text);
    versions.set(path, `v${written}`);
    return versions.get(path);
  }

  function remove(path) {
    files.delete(path);
    versions.delete(path);
  }

  return {
    async connect() {
      check();
    },
    async listFiles() {
      check();
      return [...files.keys()].map((path) => ({ path, version: versions.get(path) }));
    },
    async readFile(path) {
      check();
      return { text: files.get(path), version: versions.get(path) };
    },
    // `writes` is a list of `{ path, text, version }` and `deletes` of
    // `{ path, version }`, where `version` is the one this browser last saw
    // (undefined for a new file). Every version is checked before anything
    // changes. Returns the new version of each written file, by path.
    async commit({ writes = [], deletes = [] }) {
      await runBeforeWrite();
      check();
      for (const { path, version } of [...writes, ...deletes]) checkVersion(path, version);
      const newVersions = {};
      for (const { path, text } of writes) newVersions[path] = put(path, text);
      for (const { path } of deletes) remove(path);
      commits.push([...writes, ...deletes].map(({ path }) => path));
      return newVersions;
    },

    // For tests: another browser writing or deleting one file on its own.
    async writeFile(path, text, version) {
      await runBeforeWrite();
      check();
      checkVersion(path, version);
      return put(path, text);
    },
    async deleteFile(path, version) {
      check();
      checkVersion(path, version);
      remove(path);
    },

    // For tests: make every call fail with this reason ("unauthorized",
    // "not-found", "forbidden" or "offline"), or null to work again.
    failWith(reason) {
      failure = reason;
    },
    // For tests: run this once just before the next commit or write, e.g.
    // another browser syncing in between, so that one names a stale version.
    beforeNextWrite(hook) {
      beforeWrite = hook;
    },
    // For tests: the paths each commit touched, oldest first.
    commits() {
      return commits.map((paths) => [...paths]);
    },
    // For tests: the files as they are now, path to text.
    files() {
      return Object.fromEntries(files);
    },
  };
}
