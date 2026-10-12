// The in-memory stand-in for Google Drive that the tests use (#95). It answers
// the few Drive REST calls the Drive Notes Home makes (drive-remote.mjs)
// through a `fetch` of its own: listing files page by page, making a folder,
// uploading a file with its text, reading a file, and putting one in the
// trash. Every file has a `version` that goes up with each change, like
// Drive's. Only requests with a token it handed out get in.

const FOLDER = "application/vnd.google-apps.folder";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Drive's search language, only as much as Glacier uses: conditions such as
// `name = 'Glacier'`, `mimeType = '…'`, `'root' in parents` and
// `trashed = false`, joined by "and".
function matches(file, query) {
  if (!query) return true;
  return query.split(" and ").every((condition) => {
    const value = (text) => text.trim().slice(1, -1).replace(/\\'/g, "'");
    let found = condition.match(/^\s*'(.*)' in parents\s*$/);
    if (found) return file.parents.includes(value(`'${found[1]}'`));
    found = condition.match(/^\s*(name|mimeType) = ('.*')\s*$/);
    if (found) return file[found[1]] === value(found[2]);
    found = condition.match(/^\s*trashed = (true|false)\s*$/);
    if (found) return file.trashed === (found[1] === "true");
    throw new Error(`The Drive stand-in can't search for ${condition}`);
  });
}

// A multipart upload: the file's details as JSON, then its text.
function readMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)[1];
  const [details, text] = body
    .split(`--${boundary}`)
    .slice(1, 3)
    .map((part) => part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, ""));
  return { details: JSON.parse(details), text };
}

export function memoryDrive({ pageLimit = 1000 } = {}) {
  const files = new Map();
  const tokens = new Set();
  let made = 0;
  let failure = null;
  let requests = 0;

  function add({ name, mimeType = "text/plain", parents = ["root"], text = "" }) {
    made += 1;
    const file = { id: `file${made}`, name, mimeType, parents, version: 1, text, trashed: false };
    files.set(file.id, file);
    return file;
  }

  function described(file) {
    const { text, ...details } = file;
    return { ...details, version: String(file.version) };
  }

  function list(url) {
    const query = url.searchParams.get("q");
    const size = Math.min(Number(url.searchParams.get("pageSize") ?? 100), pageLimit);
    const start = Number(url.searchParams.get("pageToken") ?? 0);
    const found = [...files.values()].filter((file) => matches(file, query));
    const page = found.slice(start, start + size).map(described);
    const next = start + size < found.length ? { nextPageToken: String(start + size) } : {};
    return json({ files: page, ...next });
  }

  function change(file, update) {
    Object.assign(file, update);
    file.version += 1;
    return json(described(file));
  }

  async function answer(url, method, headers, body) {
    const [, upload, id] = url.pathname.match(/^\/(upload\/)?drive\/v3\/files(?:\/([^/]+))?$/) ?? [];
    if (url.pathname.match(/^\/(upload\/)?drive\/v3\/files/) === null) return json({ error: "no such call" }, 404);
    if (!id && method === "GET") return list(url);
    if (!id && method === "POST" && upload) {
      const { details, text } = readMultipart(body, headers["Content-Type"]);
      return json(described(add({ ...details, text })));
    }
    if (!id && method === "POST") return json(described(add(JSON.parse(body))));
    const file = files.get(id);
    if (!file) return json({ error: "not found" }, 404);
    if (method === "GET" && url.searchParams.get("alt") === "media") return new Response(file.text);
    if (method === "GET") return json(described(file));
    if (method === "PATCH" && upload) return change(file, { text: body });
    if (method === "PATCH") return change(file, JSON.parse(body));
    return json({ error: "no such call" }, 404);
  }

  // The path of every file in the folder named Glacier at the top of Drive.
  function pathsIn() {
    const glacier = [...files.values()].find((file) => file.name === "Glacier" && file.parents.includes("root") && !file.trashed);
    const paths = new Map();
    const walk = (folderId, prefix) => {
      for (const file of files.values()) {
        if (file.trashed || !file.parents.includes(folderId)) continue;
        if (file.mimeType === FOLDER) walk(file.id, `${prefix}${file.name}/`);
        else paths.set(`${prefix}${file.name}`, file);
      }
    };
    if (glacier) walk(glacier.id, "");
    return paths;
  }

  return {
    async fetch(address, { method = "GET", headers = {}, body } = {}) {
      if (failure === "offline") throw new TypeError("Failed to fetch");
      requests += 1;
      const url = new URL(address);
      if (url.hostname !== "www.googleapis.com") return json({ error: "no such host" }, 404);
      const token = (headers.Authorization ?? "").replace(/^Bearer /, "");
      if (!tokens.has(token)) return json({ error: "unauthorized" }, 401);
      if (failure === "forbidden") return json({ error: "forbidden" }, 403);
      return answer(url, method, headers, body);
    },

    // For tests: a token Drive accepts, as a sign-in gives one.
    signIn() {
      const token = `token${tokens.size + 1}`;
      tokens.add(token);
      return token;
    },
    // For tests: every token so far stops working, as after an hour.
    expireTokens() {
      tokens.clear();
    },
    // For tests: make every call fail ("offline" or "forbidden"), or null.
    failWith(reason) {
      failure = reason;
    },
    // For tests: a file someone put there by hand, outside Glacier's folder
    // unless `parents` says otherwise.
    addFile(details) {
      return add(details).id;
    },
    // For tests: the id of the file at a path in the Glacier folder.
    idOf(path) {
      return pathsIn().get(path)?.id;
    },
    // For tests: the files in the Glacier folder, path to text.
    files() {
      return Object.fromEntries([...pathsIn()].map(([path, file]) => [path, file.text]));
    },
    // For tests: the names of everything in the trash.
    trash() {
      return [...files.values()].filter((file) => file.trashed).map((file) => file.name);
    },
    // For tests: how many folders named Glacier there are at the top.
    glacierFolders() {
      return [...files.values()].filter((file) => file.name === "Glacier" && file.mimeType === FOLDER && !file.trashed).length;
    },
    // For tests: how many calls reached Drive.
    requests() {
      return requests;
    },
  };
}
