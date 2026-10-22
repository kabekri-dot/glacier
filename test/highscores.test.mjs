import { test } from "node:test";
import assert from "node:assert/strict";

import { keepScore, mergeTop, mergeHighscores, readHighscores, HIGHSCORES_PATH } from "../src/highscores.mjs";
import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { memoryRemote } from "../src/memory-remote.mjs";
import { isNoteFile } from "../src/note-file.mjs";
import { unzipFiles } from "../src/zip.mjs";

// Your top 5 (#128): the best five scores of each game with their dates,
// kept with the notes in `games/highscores.json` and merged on sync.

const at = (score, date = "2026-10-22") => ({ score, date });

test("a score joins the top 5 in its place, best first", () => {
  const { top } = keepScore([at(90), at(40)], 60, "2026-10-23");
  assert.deepEqual(top, [at(90), at(60, "2026-10-23"), at(40)]);
});

test("the top 5 keeps only the best five", () => {
  const { top } = keepScore([at(50), at(40), at(30), at(20), at(10)], 35, "2026-10-23");
  assert.deepEqual(top.map((entry) => entry.score), [50, 40, 35, 30, 20]);
});

test("a score below a full top 5 stays out", () => {
  const list = [at(50), at(40), at(30), at(20), at(10)];
  assert.deepEqual(keepScore(list, 5, "2026-10-23").top, list);
});

test("a score above every other is a new best", () => {
  assert.equal(keepScore([at(50)], 51, "2026-10-23").best, true);
  assert.equal(keepScore([at(50)], 50, "2026-10-23").best, false);
  assert.equal(keepScore([], 3, "2026-10-23").best, true);
});

test("two lists merge to the best five of both", () => {
  const merged = mergeTop([at(100), at(70), at(20)], [at(90), at(80), at(60, "2026-10-21")]);
  assert.deepEqual(merged.map((entry) => entry.score), [100, 90, 80, 70, 60]);
});

test("a score both lists already share counts once", () => {
  assert.deepEqual(mergeTop([at(100), at(50)], [at(100)]), [at(100), at(50)]);
});

test("two equal rounds on one day both stay", () => {
  assert.deepEqual(mergeTop([at(40), at(40)], [at(40)]), [at(40), at(40)]);
});

test("each game merges on its own", () => {
  const merged = mergeHighscores({ penguin: [at(10)] }, { penguin: [at(20)], squirrel: [at(5)] });
  assert.deepEqual(merged, { penguin: [at(20), at(10)], squirrel: [at(5)] });
});

test("a broken highscores file counts as empty", () => {
  assert.deepEqual(readHighscores("not json"), {});
  assert.deepEqual(readHighscores('{"penguin": "nope", "squirrel": [{"score": "x"}]}'), { penguin: [], squirrel: [] });
});

test("the highscores file is not a note", () => {
  assert.equal(isNoteFile(HIGHSCORES_PATH), false);
});

function browser() {
  return createNotebook({ storage: memoryStorage() });
}

test("the Notebook keeps a game's top 5", () => {
  const notebook = browser();
  assert.deepEqual(notebook.topScores("penguin"), []);
  const first = notebook.keepScore("penguin", 120);
  assert.equal(first.best, true);
  notebook.keepScore("penguin", 80);
  assert.deepEqual(notebook.topScores("penguin").map((entry) => entry.score), [120, 80]);
  assert.match(notebook.topScores("penguin")[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test("two browsers' top 5 merge to the best five through the Notes Home", async () => {
  const remote = memoryRemote({});
  const chrome = browser();
  const firefox = browser();
  await chrome.firstSync(remote);
  await firefox.firstSync(remote);
  for (const score of [100, 90, 30]) chrome.keepScore("penguin", score);
  for (const score of [95, 80, 70]) firefox.keepScore("penguin", score);
  await chrome.sync(remote);
  await firefox.sync(remote);
  await chrome.sync(remote);
  const best = [100, 95, 90, 80, 70];
  assert.deepEqual(chrome.topScores("penguin").map((entry) => entry.score), best);
  assert.deepEqual(firefox.topScores("penguin").map((entry) => entry.score), best);
  assert.deepEqual(readHighscores(remote.files()[HIGHSCORES_PATH]).penguin.map((entry) => entry.score), best);
});

test("highscores changed on both sides never make a Conflict Copy", async () => {
  const remote = memoryRemote({});
  const chrome = browser();
  const firefox = browser();
  chrome.keepScore("penguin", 10);
  await chrome.sync(remote);
  firefox.keepScore("penguin", 20);
  remote.beforeNextWrite(async () => {
    chrome.keepScore("penguin", 30);
    await chrome.sync(remote);
  });
  await firefox.sync(remote);
  assert.deepEqual(firefox.topScores("penguin").map((entry) => entry.score), [30, 20, 10]);
  assert.deepEqual(firefox.conflictCopies(), []);
  assert.deepEqual(firefox.notes(), []);
});

test("nothing is written to the Notes Home while no game was played", async () => {
  const remote = memoryRemote({});
  await browser().sync(remote);
  assert.equal(HIGHSCORES_PATH in remote.files(), false);
});

test("a sync with unchanged highscores writes nothing", async () => {
  const remote = memoryRemote({});
  const notebook = browser();
  notebook.keepScore("penguin", 10);
  await notebook.sync(remote);
  const commits = remote.commits().length;
  await notebook.sync(remote);
  assert.equal(remote.commits().length, commits);
});

test("Export takes the top 5 along and Restore merges it back", async () => {
  const chrome = browser();
  chrome.keepScore("penguin", 50);
  const zip = await chrome.exportZip();
  const files = await unzipFiles(zip);
  assert.ok(files.some(({ path }) => path === HIGHSCORES_PATH));
  const firefox = browser();
  firefox.keepScore("penguin", 70);
  const result = await firefox.importZip(zip);
  assert.deepEqual(firefox.topScores("penguin").map((entry) => entry.score), [70, 50]);
  assert.deepEqual(result, { added: 0, unchanged: 0, copies: 0 });
});
