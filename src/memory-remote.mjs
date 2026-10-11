// An in-memory stand-in for the Notes Repo. The real one is GitHub
// (github-remote.mjs); this one holds files in memory and is used by tests.
// It answers the same questions the Notebook core asks a remote: can we
// connect, which files are there, and what does each one say.

export function memoryRemote(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  let failure = null;

  // Every call fails the same way while a failure is set, like GitHub
  // refusing a wrong token or repo.
  function check() {
    if (failure) {
      throw Object.assign(new Error(`Remote failed: ${failure}`), { reason: failure });
    }
  }

  return {
    async connect() {
      check();
    },
    async listFiles() {
      check();
      return [...files.keys()].map((path) => ({ path }));
    },
    async readFile(path) {
      check();
      return { text: files.get(path) };
    },

    // For tests: make every call fail with this reason ("unauthorized",
    // "not-found", "forbidden" or "offline").
    failWith(reason) {
      failure = reason;
    },
    // For tests: the files as they are now, path to text.
    files() {
      return Object.fromEntries(files);
    },
  };
}
