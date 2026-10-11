import { test } from "node:test";
import assert from "node:assert/strict";

import { githubRemote } from "../src/github-remote.mjs";

// Every request of a commit (the Git data API, used by rename and archive
// moves) checked against GitHub's documented method, URL, headers and body,
// with a fake fetch standing in for GitHub.

function fakeGitHub() {
  const calls = [];
  const answers = {
    "GET /repos/me/notes": { default_branch: "main" },
    "GET /repos/me/notes/git/ref/heads/main": { object: { sha: "head1" } },
    "GET /repos/me/notes/git/commits/head1": { tree: { sha: "tree1" } },
    "GET /repos/me/notes/git/trees/tree1?recursive=1": {
      tree: [
        { path: "Old.md", type: "blob", sha: "oldsha" },
        { path: "Gone.md", type: "blob", sha: "gonesha" },
      ],
    },
    "POST /repos/me/notes/git/blobs": { sha: "blob1" },
    "POST /repos/me/notes/git/trees": { sha: "tree2" },
    "POST /repos/me/notes/git/commits": { sha: "commit2" },
    "PATCH /repos/me/notes/git/refs/heads/main": {},
  };
  const fetch = async (url, init) => {
    const key = `${init.method} ${url.replace("https://api.github.com", "")}`;
    calls.push({ key, init });
    return { ok: key in answers, status: key in answers ? 200 : 404, json: async () => answers[key] };
  };
  return { calls, fetch };
}

test("a commit sends each Git data API request the way GitHub documents it", async () => {
  const { calls, fetch } = fakeGitHub();
  const remote = githubRemote({ repo: "me/notes", token: "secret", fetch });
  await remote.connect();
  const versions = await remote.commit({
    writes: [{ path: "New.md", text: "hi" }, { path: "Old.md", text: "changed", version: "oldsha" }],
    deletes: [{ path: "Gone.md", version: "gonesha" }],
  });
  assert.deepEqual(versions, { "New.md": "blob1", "Old.md": "blob1" });

  for (const { init } of calls) {
    assert.equal(init.headers.Accept, "application/vnd.github+json");
    assert.equal(init.headers.Authorization, "Bearer secret");
    assert.equal(init.headers["X-GitHub-Api-Version"], "2022-11-28");
    if (init.method !== "GET") assert.equal(init.headers["Content-Type"], "application/json");
  }

  const sent = (key) => JSON.parse(calls.find((call) => call.key.endsWith(key)).init.body);
  assert.deepEqual(
    calls.map((call) => call.key.replace("/repos/me/notes", "")),
    [
      "GET ",
      "GET /git/ref/heads/main",
      "GET /git/commits/head1",
      "GET /git/trees/tree1?recursive=1",
      "POST /git/blobs",
      "POST /git/blobs",
      "POST /git/trees",
      "POST /git/commits",
      "PATCH /git/refs/heads/main",
    ],
  );
  assert.deepEqual(sent("POST /repos/me/notes/git/blobs"), { content: "aGk=", encoding: "base64" });
  assert.deepEqual(sent("/git/trees"), {
    base_tree: "tree1",
    tree: [
      { path: "New.md", mode: "100644", type: "blob", sha: "blob1" },
      { path: "Old.md", mode: "100644", type: "blob", sha: "blob1" },
      { path: "Gone.md", mode: "100644", type: "blob", sha: null },
    ],
  });
  assert.match(sent("/git/commits").message, /^Update 3 notes/);
  assert.deepEqual({ ...sent("/git/commits"), message: "" }, { message: "", tree: "tree2", parents: ["head1"] });
  assert.deepEqual(sent("/git/refs/heads/main"), { sha: "commit2", force: false });
});
