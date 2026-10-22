# The hidden games' top 5: one merged file next to the notes

The hidden games (#128, `docs/scope.md`, Next, item 4) keep your own top 5 per game with the date. Decided with the user on 2026-10-22: the scores are synced with the notes, so every browser with the same Notes Home shows the same top 5.

## Decision

- **One small file in the Notes Home**: `games/highscores.json`, shaped `{ "penguin": [{ "score": 412, "date": "2026-10-22" }, …] }`, best first, at most five per game. It is not a note: `isNoteFile` keeps ignoring it, so it never shows in a list, in search or in Obsidian's notes.
- **Merged, never two versions.** On sync the file and this browser's scores become the best five of both. Unlike a note (ADR 0004) there is nothing to lose by merging: a score is a fact, and the lower ones only drop out of a top 5. So it never makes a Conflict Copy. A score both sides already share counts once; two equal rounds on one day both stay.
- **Written only when it changed**, as its own write after the notes' commit. Another browser writing it in between is read, merged and written again.
- **Kept in this browser's storage** as well, so the top 5 works with the notes living only in the browser.
- **In Export and Restore.** "Download all notes" puts the file into the zip; Restore merges it into this browser's scores.

## Considered Options

- **Scores in the browser's own storage only**: each browser would have its own top 5, against the decision that they sync.
- **A shared leaderboard**: needs a server (ADR 0011 has none). Maybe later, with the website.
- **Scores inside a note** (frontmatter of a hidden note): a note would show in lists and Obsidian, and a change on two sides would make a Conflict Copy.
