// Your top 5 (#128, ADR 0013): the best five scores of each hidden game,
// each with the date it was played. Kept with the notes as one small file in
// the Notes Home, `games/highscores.json`, shaped `{ "<game>": [{ score,
// date }] }`, best first. Two sides are merged, never kept as two versions:
// the best five of both.

export const HIGHSCORES_PATH = "games/highscores.json";
const KEPT = 5;

// Best first; of two equal scores the older one stays ahead.
function byScore(a, b) {
  return b.score - a.score || a.date.localeCompare(b.date);
}

// The list with a new score on `date` (YYYY-MM-DD) in its place, cut to the
// best five. `best` says it beat every score before it; `place` is where it
// went in the top 5 (0 for first), or -1 when it didn't make it (#129).
export function keepScore(list, score, date) {
  const best = list.every((entry) => score > entry.score);
  const entry = { score, date };
  const top = [...list, entry].sort(byScore).slice(0, KEPT);
  return { top, best, place: top.indexOf(entry) };
}

// The best five of two lists. A score both already share (from an earlier
// sync) counts once, while two equal rounds on one day both stay.
export function mergeTop(a, b) {
  const key = (entry) => `${entry.score} ${entry.date}`;
  const counted = new Map();
  for (const entry of a) counted.set(key(entry), (counted.get(key(entry)) ?? 0) + 1);
  const merged = [...a];
  const seen = new Map();
  for (const entry of b) {
    seen.set(key(entry), (seen.get(key(entry)) ?? 0) + 1);
    if (seen.get(key(entry)) > (counted.get(key(entry)) ?? 0)) merged.push(entry);
  }
  return merged.sort(byScore).slice(0, KEPT);
}

// Every game's top 5 from both sides.
export function mergeHighscores(a, b) {
  const merged = {};
  for (const game of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[game] = mergeTop(a[game] ?? [], b[game] ?? []);
  }
  return merged;
}

// The file's text as highscores. Anything that isn't a score is left out,
// so a file edited by hand or cut off can't break the game.
export function readHighscores(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const scores = {};
  for (const [game, list] of Object.entries(data)) {
    scores[game] = (Array.isArray(list) ? list : [])
      .filter((entry) => Number.isFinite(entry?.score) && typeof entry.date === "string")
      .map(({ score, date }) => ({ score, date }))
      .sort(byScore)
      .slice(0, KEPT);
  }
  return scores;
}

// The file's text: the games in name order, so the same scores always give
// the same text.
export function highscoresText(scores) {
  const sorted = Object.fromEntries(Object.keys(scores).sort().map((game) => [game, scores[game]]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function hasScores(scores) {
  return Object.values(scores).some((list) => list.length > 0);
}
