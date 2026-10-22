// Your top 5 kept and synced (#128, ADR 0013). This browser's scores live in
// storage; on sync they meet the Notes Home's `games/highscores.json` and
// both sides end up with the best five of each. The file is merged, never
// kept as two versions, so it can't make a Conflict Copy.
//
//   createHighscores({ storage })
//   .top(game)   .keep(game, score)   .merge(scores)   .file()
//   .sync(remote, listing)   .forgetSynced()
import { HIGHSCORES_PATH, hasScores, highscoresText, keepScore, mergeHighscores, readHighscores } from "./highscores.mjs";

export function createHighscores({ storage }) {
  const SCORES = "highscores";
  // The file's `{ version, text }` when this browser last synced it, or null.
  const SYNCED = "syncedHighscores";

  function all() {
    return storage.getMeta(SCORES) ?? {};
  }

  function top(game) {
    return all()[game] ?? [];
  }

  // A round's points into the game's top 5, dated today. Returns the new
  // top 5 and whether it is a new best.
  function keep(game, score) {
    const kept = keepScore(top(game), score, new Date().toISOString().slice(0, 10));
    storage.putMeta(SCORES, { ...all(), [game]: kept.top });
    return kept;
  }

  function merge(scores) {
    storage.putMeta(SCORES, mergeHighscores(all(), scores));
  }

  // The file for an Export, or null before any game was played.
  function file() {
    return hasScores(all()) ? { path: HIGHSCORES_PATH, text: highscoresText(all()) } : null;
  }

  // A new Notes Home: the file there is new to this browser.
  function forgetSynced() {
    storage.putMeta(SYNCED, null);
  }

  // Take in the Notes Home's file when it changed, then write the merged
  // scores back when they differ from it. `listing` is the Notes Home's
  // `[{ path, version }]` from this sync. Another browser writing in between
  // only means reading and merging once more.
  async function sync(remote, listing) {
    let known = storage.getMeta(SYNCED) ?? null;
    let there = listing.find(({ path }) => path === HIGHSCORES_PATH);
    for (let round = 0; round < 3; round += 1) {
      if (!there) {
        known = null;
      } else if (there.version !== known?.version) {
        const { text, version } = await remote.readFile(HIGHSCORES_PATH);
        merge(readHighscores(text));
        known = { version, text };
      }
      const text = highscoresText(all());
      if (!hasScores(all()) || known?.text === text) break;
      try {
        const versions = await remote.commit({ writes: [{ path: HIGHSCORES_PATH, text, version: known?.version }] });
        known = { version: versions[HIGHSCORES_PATH], text };
        break;
      } catch (error) {
        if (error?.reason !== "conflict") throw error;
        there = (await remote.listFiles()).find(({ path }) => path === HIGHSCORES_PATH);
        known = null;
      }
    }
    storage.putMeta(SYNCED, known);
  }

  return { top, keep, merge, file, sync, forgetSynced };
}
