// The hidden games' shared frame (#129): `/break` starts the game of the
// paper in use, and every game plugs into the same round: ready, play, pause
// and over, the same start, pause and end panels and its own top 5 (ADR
// 0013). Pure, with no drawing: sidebar/game-frame.js draws it on a canvas
// and forwards the keys.
//
// A game is a plain object from its own module (src/<game>-game.mjs):
//   { id, title, how }                     its name in the top 5, on the start panel
//   newGame({ width, height, random })     a fresh world, seeded
//   press(world) / release(world)          Space, ↑, a click or a tap, and letting go
//   step(world, seconds)                   move on; returns what ended it, or a falsy value
//   resize(world, width, height)           the sidebar changed size
//   points(world) / summary(world)         the score, and the round in a few words
//   scoreBoxes(world)                      the small boxes at the top while playing
//
//   gameFor(paper, built)                  the game id `/break` starts on that paper
//   seededRandom(seed)                     the random every game is given
//   newFrame({ game, width, height, random, keepScore })
//   press / release / togglePause / pause / tick / resize
//   panel(frame)                           what the start, pause or end panel shows

// Every paper's game. Glacier's is the first one built (#128); a paper whose
// game isn't built yet starts it.
export const PAPER_GAMES = [
  { paper: "Glacier", id: "penguin", title: "Penguin break" },
  { paper: "Forest", id: "forest", title: "Squirrel jump" },
  { paper: "Ocean", id: "ocean", title: "Little fish" },
  { paper: "Desert", id: "desert", title: "Camel walk" },
  { paper: "Volcano", id: "volcano", title: "Stone blaster" },
  { paper: "Aurora", id: "aurora", title: "Northern light" },
  { paper: "Blank Page", id: "blank", title: "Paper plane" },
  { paper: "School Notebook", id: "school", title: "Doodle hop" },
  { paper: "Chalkboard", id: "chalkboard", title: "Chalk snake" },
  { paper: "Moleskine", id: "moleskine", title: "Block stack" },
  { paper: "Engineer", id: "engineer", title: "Brick breaker" },
];
const FIRST_GAME = "penguin";

// `built` lists the ids of the games there is a module for.
export function gameFor(paper, built) {
  const id = PAPER_GAMES.find((entry) => entry.paper === paper)?.id;
  return built.includes(id) ? id : FIRST_GAME;
}

// The panels' words.
const START_LINES = ["Space or a click to start.", "P pauses, Esc goes back to your note."];
const PAUSED_LINES = ["P or Space to go on.", "Esc goes back to your note."];
const AGAIN_LINE = "Space: again · Esc: back to your note";
const MEDALS = ["gold", "silver", "bronze"];

// The same seed always gives the same numbers, so a game's mix can be
// tested; a round is seeded from the clock.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `keepScore(id, score)` keeps a round's points and returns `{ top, best,
// place }`: the Notebook's, so the top 5 syncs with the notes.
export function newFrame({ game, width, height, random, keepScore }) {
  return {
    game,
    width,
    height,
    random,
    keepScore,
    world: game.newGame({ width, height, random }),
    mode: "ready",
    how: "",
    result: null,
  };
}

// The first press starts, one after the end starts again, one while paused
// goes on. Only while playing does the game itself get it.
export function press(frame) {
  if (frame.mode === "ready" || frame.mode === "pause") {
    frame.mode = "play";
    return;
  }
  if (frame.mode === "over") {
    const { game, width, height, random } = frame;
    Object.assign(frame, { world: game.newGame({ width, height, random }), mode: "play", how: "", result: null });
    return;
  }
  frame.game.press(frame.world);
}

export function release(frame) {
  frame.game.release(frame.world);
}

// P: pause while playing, go on while paused.
export function togglePause(frame) {
  if (frame.mode === "play") pause(frame);
  else if (frame.mode === "pause") frame.mode = "play";
}

// Leaving the tab or window: nothing stays held while away.
export function pause(frame) {
  frame.game.release(frame.world);
  if (frame.mode === "play") frame.mode = "pause";
}

// Move the round on by `seconds`. Returns true when it just ended and its
// points were kept, so they can be synced.
export function tick(frame, seconds) {
  if (frame.mode !== "play") return false;
  const how = frame.game.step(frame.world, seconds);
  if (!how) return false;
  const score = frame.game.points(frame.world);
  frame.mode = "over";
  frame.how = how;
  frame.result = { ...frame.keepScore(frame.game.id, score), score };
  return true;
}

export function resize(frame, width, height) {
  frame.width = width;
  frame.height = height;
  frame.game.resize(frame.world, width, height);
}

// The panel over the game, or null while playing. The start panel shows the
// game's icon; the end panel the top 5 with medals for places 1 to 3 and
// this round's row marked.
export function panel(frame) {
  const { game, mode } = frame;
  if (mode === "ready") return { kind: "start", icon: true, title: game.title, lines: [...game.how, ...START_LINES] };
  if (mode === "pause") return { kind: "pause", icon: false, title: "Paused", lines: PAUSED_LINES };
  if (mode !== "over") return null;
  const { top, best, place, score } = frame.result;
  return {
    kind: "end",
    icon: false,
    title: best ? "New best!" : frame.how,
    lines: [game.summary(frame.world), `${score} points`],
    top: top.map((entry, i) => ({
      place: i + 1,
      medal: MEDALS[i] ?? null,
      score: entry.score,
      word: "points",
      date: entry.date,
      mine: i === place,
    })),
    footer: AGAIN_LINE,
  };
}
