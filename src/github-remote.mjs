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
      throw Object.assign(new Error("Couldn't reach GitHub", { cause: error }), { reason: "offline" });
    }
  }

  async function getJson(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw failure(response.status);
    return response.json();
  }

  return {
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

    // One commit per file, on the default branch. `version` is the sha this
    // browser last saw (none for a new file); GitHub refuses the write if the
    // file has changed since.
    async writeFile(path, text, version) {
      const body = { message: `Update ${path}`, content: encodeBase64(text), sha: version };
      const { content } = await getJson(contentsPath(path), { method: "PUT", body });
      return content.sha;
    },

    async deleteFile(path, version) {
      const body = { message: `Delete ${path}`, sha: version };
      await getJson(contentsPath(path), { method: "DELETE", body });
    },
  };
}
