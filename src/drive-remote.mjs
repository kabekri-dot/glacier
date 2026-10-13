// Google Drive as the Notes Home (#95, ADR 0011): the notes are Markdown
// files in a folder named Glacier at the top of the person's Drive, laid out
// like the Notes Repo (`collections/`, `notes/`, `archive/`). It answers the
// same four calls as every Notes Home (the contract is in memory-remote.mjs).
//
// Glacier asks only for the `drive.file` scope, so Drive shows it the files
// it made and nothing else. Drive has no paths, only files with a parent
// folder, so each listing rebuilds a map from path to file id. A file's
// version is Drive's `version`, which goes up with every change.
//
// The token comes from `getToken({ renew })`, plugged in by the sidebar
// (sidebar/google-sign-in.js), which signs in with Chrome or with Google's
// sign-in window. A token Drive no longer takes is renewed once, quietly;
// when that fails too the sync box asks to sign in again. The token never
// goes into notes or files (ADR 0003).
//
// This module only runs in the browser; tests give it the in-memory Drive
// (memory-drive.mjs) as its `fetch`.
import { fewAtATime } from "./few-at-a-time.mjs";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,parents,version";

function failure(reason, message) {
  return Object.assign(new Error(message), { reason });
}

// Drive's answer turned into one of the reasons the Notebook core explains.
// A file gone between the listing and a read or write counts as changed.
function failureFor(status) {
  const reason =
    status === 401 ? "unauthorized"
    : status === 403 ? "forbidden"
    : status === 404 ? "conflict"
    : "unknown";
  return failure(reason, `Google Drive answered ${status}`);
}

// A name inside a Drive search goes between single quotes.
function quoted(text) {
  return `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function mimeTypeOf(path) {
  return path.endsWith(".svg") ? "image/svg+xml" : "text/markdown";
}

export function driveRemote({ getToken, fetch = globalThis.fetch }) {
  let glacierId = null;
  // Path to `{ id, version }` for every file, and path to id for every
  // folder, inside the Glacier folder, as the last listing found them.
  let files = new Map();
  let folders = new Map();

  async function send(url, options, token) {
    try {
      return await fetch(url, {
        ...options,
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
      });
    } catch (error) {
      // A request cut off as the sidebar closes isn't a network problem.
      if (error?.name === "AbortError") throw Object.assign(failure("aborted", "The request was cut off"), { cause: error });
      const why = `${error?.name ?? "Error"}: ${error?.message ?? error}`;
      throw Object.assign(failure("offline", `Couldn't reach Google Drive (${why})`), { cause: error });
    }
  }

  // One call to Drive. A token Drive no longer takes (they last about an
  // hour) is renewed quietly and the call tried once more.
  async function request(url, options = {}) {
    let response = await send(url, options, await getToken());
    if (response.status === 401) response = await send(url, options, await getToken({ renew: true }));
    if (!response.ok) throw failureFor(response.status);
    return response;
  }

  async function getJson(url, options) {
    return (await request(url, options)).json();
  }

  // Every file matching a Drive search, through all the pages, oldest
  // first, so a name made twice at once always finds the same file.
  async function search(query) {
    const found = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({ q: query, fields: `nextPageToken,files(${FIELDS})`, pageSize: "1000", orderBy: "createdTime", spaces: "drive" });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await getJson(`${API}?${params}`);
      found.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return found;
  }

  async function makeFolder(name, parent) {
    const params = new URLSearchParams({ fields: FIELDS });
    const body = JSON.stringify({ name, mimeType: FOLDER, parents: [parent] });
    const folder = await getJson(`${API}?${params}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    return folder.id;
  }

  // Rebuild the path map from one listing of every file Glacier made. Only
  // what sits inside the Glacier folder counts.
  async function readListing() {
    const all = await search("trashed = false");
    const byId = new Map(all.map((file) => [file.id, file]));
    const pathOf = (file, seen = new Set()) => {
      const parent = file.parents?.[0];
      if (parent === glacierId) return file.name;
      const above = byId.get(parent);
      if (!above || above.mimeType !== FOLDER || seen.has(above.id)) return null;
      seen.add(above.id);
      const abovePath = pathOf(above, seen);
      return abovePath === null ? null : `${abovePath}/${file.name}`;
    };
    files = new Map();
    folders = new Map();
    for (const file of all) {
      const path = pathOf(file);
      if (path === null) continue;
      const map = file.mimeType === FOLDER ? folders : files;
      if (!map.has(path)) map.set(path, file.mimeType === FOLDER ? file.id : { id: file.id, version: file.version });
    }
  }

  // The folder a path's file goes in, made along the way if need be.
  async function folderFor(path) {
    const parts = path.split("/").slice(0, -1);
    let parent = glacierId;
    for (let i = 0; i < parts.length; i += 1) {
      const folderPath = parts.slice(0, i + 1).join("/");
      if (!folders.has(folderPath)) folders.set(folderPath, await makeFolder(parts[i], parent));
      parent = folders.get(folderPath);
    }
    return parent;
  }

  // A new file goes up in one request: its details, then its text.
  async function create(path, text) {
    const boundary = `glacier-${crypto.randomUUID()}`;
    const name = path.split("/").pop();
    const details = JSON.stringify({ name, mimeType: mimeTypeOf(path), parents: [await folderFor(path)] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${details}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeTypeOf(path)}; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
    const params = new URLSearchParams({ uploadType: "multipart", fields: FIELDS });
    return getJson(`${UPLOAD}?${params}`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  }

  async function update(id, path, text) {
    const params = new URLSearchParams({ uploadType: "media", fields: FIELDS });
    return getJson(`${UPLOAD}/${id}?${params}`, { method: "PATCH", headers: { "Content-Type": `${mimeTypeOf(path)}; charset=UTF-8` }, body: text });
  }

  // A deleted note's file goes to Drive's trash, so it can still be found
  // there for a while.
  async function trash(id) {
    const params = new URLSearchParams({ fields: "id" });
    await getJson(`${API}/${id}?${params}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  }

  return {
    // Finds the Glacier folder at the top of Drive, or makes it.
    async connect() {
      const query = `name = ${quoted("Glacier")} and mimeType = ${quoted(FOLDER)} and 'root' in parents and trashed = false`;
      const [found] = await search(query);
      glacierId = found ? found.id : await makeFolder("Glacier", "root");
    },

    async listFiles() {
      await readListing();
      return [...files].map(([path, { version }]) => ({ path, version }));
    },

    // The version comes from the listing, which was read before the text: a
    // file written in between only looks older than it is, so the next
    // commit is refused and the file read again, and nothing is lost.
    async readFile(path) {
      if (!files.has(path)) await readListing();
      const file = files.get(path);
      if (!file) throw failure("conflict", `${path} is no longer in Google Drive`);
      const text = await (await request(`${API}/${file.id}?alt=media`)).text();
      return { text, version: file.version };
    },

    // Drive can't write several files at once, so every version is checked
    // against a fresh listing before anything is sent, and the writes go
    // before the deletes: a commit cut off halfway leaves a renamed note
    // twice rather than not at all, and the next sync finishes it. Drive's
    // batch requests take no file contents, so each file is one request;
    // they go a few at a time, after the folders they need are made one by
    // one (so no folder is made twice).
    async commit({ writes = [], deletes = [] }) {
      await readListing();
      for (const { path, version } of [...writes, ...deletes]) {
        if (files.get(path)?.version !== version) throw failure("conflict", `Stale version of ${path}`);
      }
      for (const { path } of writes) {
        if (!files.has(path)) await folderFor(path);
      }
      const versions = {};
      await fewAtATime(writes, async ({ path, text }) => {
        const known = files.get(path);
        const written = known ? await update(known.id, path, text) : await create(path, text);
        files.set(path, { id: written.id, version: written.version });
        versions[path] = written.version;
      });
      await fewAtATime(deletes, async ({ path }) => {
        await trash(files.get(path).id);
        files.delete(path);
      });
      return versions;
    },
  };
}
