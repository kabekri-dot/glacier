// An in-memory stand-in for the Notes Repo. The real one is GitHub
// (github-remote.mjs); this one holds files in memory and is used by tests.
// It answers the same questions the Notebook core asks a remote: can we
// connect, which files are there, what does each one say, and it takes a
// commit: several writes and deletes that land together or not at all, like
// one Git commit (ADR 0005). Each file has a version that changes with every
// write; a commit that names an old version is refused as a whole, like
// GitHub does.

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
