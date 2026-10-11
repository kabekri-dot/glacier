# The sidebar always shows the note of the tab you're on

Switching to a website, or a website loading in the active tab, shows that site's Lesson Note, or the empty paper ready to become one (#61). This happens whatever note was open and however you got there: from the page, the Notebook menu, a Link, or a note you just made. Switching to a page that isn't a website (a new tab, browser settings, a PDF) keeps the open note, because there's nothing better to show. Coming back to a tab shows its note again, and ← in the pill goes back through the notes you saw before (#50, #52).

This replaces the first rule (#29), under which a note you had opened yourself stayed put on tab switches. That rule protected a Concept Note while you glanced at another tab, but in use it felt stuck: after clicking a note, the sidebar no longer matched the tab, and it took a reopen to make it follow again. "The sidebar shows the note of the tab I'm on" is one rule that's easy to predict, and ← plus the recent notes cover the moment the old rule was for.

Both choices are defaults, not fixed: Settings, Tabs and notes, can switch back to "keep a note I opened myself" and to "show a new note form" on browser pages (#53).

## Considered Options

- **Keep the #29 rule and fix its bugs**: tried first (#46, #48). The extra "→ Note for this page" entry it needed was one more thing to understand.
- **Nothing follows; the sidebar only changes on reopen**: predictable, but you'd have to reopen for every lesson.

## Addition: archived notes live under `archive/`

Archiving (#58) moves a note's file to `archive/` in the Notes Repo, keeping its path below that (`archive/courses/<Course>/<Title>.md`), so Unarchive knows where it goes back and Obsidian still reads it as a normal note (ADR 0005). A move is one commit, like a rename. An archived Lesson Note no longer opens for its page; its page shows the empty paper instead. Delete (#57) removes the file for good; Git's history is the only way back.
