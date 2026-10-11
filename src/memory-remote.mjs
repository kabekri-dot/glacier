// An in-memory stand-in for the Notes Repo. The real one is GitHub
// (github-remote.mjs); this one holds files in memory and is used by tests.
// It answers the same questions the Notebook core asks a remote: can we
// connect, which files are there, what does each one say, and it takes
// writes and deletes. Each file has a version that changes with every write;
// a write or delete that names an old version is refused, like GitHub does.

export function memoryRemote(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  const versions = new Map([...files.keys()].map((path) => [path, "v0"]));
  let written = 0;
  let failure = null;
  let beforeWrite = null;

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
    // `version` is the one this browser last saw, or undefined for a new file.
    async writeFile(path, text, version) {
      check();
      if (beforeWrite) {
        const hook = beforeWrite;
        beforeWrite = null;
        await hook();
      }
      checkVersion(path, version);
      written += 1;
      files.set(path, text);
      versions.set(path, `v${written}`);
      return versions.get(path);
    },
    async deleteFile(path, version) {
      check();
      checkVersion(path, version);
      files.delete(path);
      versions.delete(path);
    },

    // For tests: make every call fail with this reason ("unauthorized",
    // "not-found", "forbidden" or "offline"), or null to work again.
    failWith(reason) {
      failure = reason;
    },
    // For tests: run this once just before the next write, e.g. another
    // browser syncing in between, so that write names a stale version.
    beforeNextWrite(hook) {
      beforeWrite = hook;
    },
    // For tests: the files as they are now, path to text.
    files() {
      return Object.fromEntries(files);
    },
  };
}
