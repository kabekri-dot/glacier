// The real Notes Repo: a private GitHub repository reached through the GitHub
// REST API with a fine-grained token limited to that one repo, Contents read
// and write (ADR 0003). It answers the same questions as the in-memory
// stand-in the tests use (memory-remote.mjs). The token only lives here and
// in this browser's extension storage; it is never handed to the Notebook.
//
// This module only runs in the browser; tests use the in-memory stand-in.

const API = "https://api.github.com";

// GitHub's answer turned into one of the reasons the Notebook core explains
// (syncErrorMessage). A fine-grained token without access to a private repo
// gets 404, just like a repo that doesn't exist.
function failure(status) {
  const reason =
    status === 401 ? "unauthorized"
    : status === 403 ? "forbidden"
    : status === 404 ? "not-found"
    : status === 409 || status === 422 ? "conflict"
    : "unknown";
  return Object.assign(new Error(`GitHub answered ${status}`), { reason });
}

// GitHub sends file contents as base64 of UTF-8 bytes.
function decodeBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function contentsPath(path) {
  return `/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// One file names itself; a commit with several (a rename) lists them all.
function commitMessage(writes, deletes) {
  const lines = [...writes.map(({ path }) => `Update ${path}`), ...deletes.map(({ path }) => `Delete ${path}`)];
  if (lines.length === 1) return lines[0];
  return `Update ${lines.length} notes\n\n${lines.join("\n")}`;
}

export function githubRemote({ repo, token, fetch = globalThis.fetch }) {
  let branch = null;

  async function request(path, { method = "GET", body } = {}) {
    try {
      return await fetch(`${API}/repos/${repo}${path}`, {
        method,
        // GitHub lets answers be cached for a minute; a pull must see what
        // the other browser pushed just now.
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: body && JSON.stringify(body),
      });
    } catch (error) {
      // A request the browser cut off (the sidebar closing) isn't a network
      // problem; the next sync catches up.
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("The request was cut off", { cause: error }), { reason: "aborted" });
      }
      const why = `${error?.name ?? "Error"}: ${error?.message ?? error}`;
      throw Object.assign(new Error(`Couldn't reach GitHub (${why})`, { cause: error }), { reason: "offline" });
    }
  }

  async function getJson(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw failure(response.status);
    return response.json();
  }

  function branchPath() {
    return branch.split("/").map(encodeURIComponent).join("/");
  }

  // GitHub's Git data API refuses a repo with no commits yet, so the first
  // file goes in through the one-file Contents API and the rest follow as
  // one commit on top of it.
  async function commitToEmptyRepo(writes) {
    if (writes.length === 0) return {};
    const [first, ...rest] = writes;
    const body = { message: `Add ${first.path}`, content: encodeBase64(first.text), branch };
    const { content } = await getJson(contentsPath(first.path), { method: "PUT", body });
    return { [first.path]: content.sha, ...(rest.length > 0 ? await remote.commit({ writes: rest }) : {}) };
  }

  const remote = {
    // Checks the repo and token by reading the repo, and learns its branch.
    async connect() {
      branch = (await getJson("")).default_branch;
    },

    // Every file in the repo, with its version (the blob's sha). A repo with
    // no commits yet answers 409 (or 404 for the branch) and has no files.
    async listFiles() {
      const response = await request(`/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      if (response.status === 409 || response.status === 404) return [];
      if (!response.ok) throw failure(response.status);
      const { tree } = await response.json();
      return tree
        .filter((entry) => entry.type === "blob")
        .map((entry) => ({ path: entry.path, version: entry.sha }));
    },

    async readFile(path) {
      const file = await getJson(`${contentsPath(path)}?ref=${encodeURIComponent(branch)}`);
      return { text: decodeBase64(file.content), version: file.sha };
    },

    // Several writes and deletes as one commit on the default branch (ADR
    // 0005), through GitHub's Git data API: new blobs, a tree built on the
    // branch's current one, a commit, then the branch is moved to it. Nothing
    // shows in the repo until that last step, and GitHub refuses it if the
    // branch moved in the meantime, so a failure leaves the repo as it was.
    // `version` is the sha this browser last saw (none for a new file); a
    // file that changed since is refused as stale before anything is sent.
    async commit({ writes = [], deletes = [] }) {
      const ref = await request(`/git/ref/heads/${branchPath()}`);
      if (ref.status === 409 || ref.status === 404) return commitToEmptyRepo(writes);
      if (!ref.ok) throw failure(ref.status);
      const head = (await ref.json()).object.sha;
      const baseTree = (await getJson(`/git/commits/${head}`)).tree.sha;
      const { tree } = await getJson(`/git/trees/${baseTree}?recursive=1`);
      const current = new Map(tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]));
      for (const { path, version } of [...writes, ...deletes]) {
        if (current.get(path) !== version) {
          throw Object.assign(new Error(`Stale version of ${path}`), { reason: "conflict" });
        }
      }
      const versions = {};
      for (const { path, text } of writes) {
        const blob = await getJson("/git/blobs", { method: "POST", body: { content: encodeBase64(text), encoding: "base64" } });
        versions[path] = blob.sha;
      }
      const entries = [
        ...writes.map(({ path }) => ({ path, mode: "100644", type: "blob", sha: versions[path] })),
        ...deletes.map(({ path }) => ({ path, mode: "100644", type: "blob", sha: null })),
      ];
      const newTree = await getJson("/git/trees", { method: "POST", body: { base_tree: baseTree, tree: entries } });
      const message = commitMessage(writes, deletes);
      const newCommit = await getJson("/git/commits", { method: "POST", body: { message, tree: newTree.sha, parents: [head] } });
      await getJson(`/git/refs/heads/${branchPath()}`, { method: "PATCH", body: { sha: newCommit.sha, force: false } });
      return versions;
    },
  };
  return remote;
}
