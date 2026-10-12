# One kind of note, several notes per page

Glacier had two kinds of note: a Lesson Note, tied to one lesson's page and a Course, and a Concept Note for one idea, with neither. In UX testing (2026-10-11) the two names confused people, a page could only ever have one note, and there was no way to start a blank note: every new note had to pick a kind first.

So there is now one kind of note, the **Note** (CONTEXT.md). Two details are optional: its **page** (the Source) and its **Course**.

- **Several notes per page.** Any number of notes can have the same page. Opening the page opens the one edited most recently; the pill says "1 of 3" when there are more, and the ▾ menu starts with **Notes for this page**, newest first, with "+ New note for this page" under them.
- **+ in the pill** always offers **New note** (blank: no page, no Course) and, on a website, **New note for this page**, which takes the last used Course like before. The Course line above the text works for every note.
- **Following a Missing Link** makes a note without a page or Course, as a Concept Note was.
- **"Most recently edited"** is an `edited` time in the frontmatter, set whenever the text changes. It travels with the file, so the same note opens for a page in every browser. A note without it counts from `created`.

## Files in the Notes Repo

This changes the folder layout of ADR 0005. A note with a Course stays in `courses/<Course>/<Title>.md`; every other note, with or without a page, goes in `notes/<Title>.md`. The frontmatter keys are `course`, `source`, `created` and `edited`, all but `created` optional; filenames, unique titles and Links stay as they were.

Old files still load: a `type` line is ignored, and a file in `concepts/` is a note without a page or Course. The next sync writes every note to its new place, so `concepts/` files move to `notes/` and the `type` lines go, as one commit like a rename. Old Exports restore the same way.

The sidebar still follows the tab and keeps the open note on browser pages (ADR 0009); it now opens the page's most recently edited note.

## Considered Options

- **Keep both kinds and rename them**: still asks people to choose a kind before writing, which was the confusing part.
- **Keep `concepts/` for notes without a page**: the folder name would keep the old idea alive, and a note's folder would change when a page is added or removed.
- **Keep the edited time only in this browser**: simpler files, but two browsers could open different notes for the same page, and an Export would lose it.

## Addition: Course becomes Collection (#73, 2026-10-12)

With one kind of note, "Course" only fit learning paths, so it is now called **Collection** (CONTEXT.md; "Folder" was turned down as not fitting Glacier). Notes in a Collection sit in `collections/<Collection>/<Title>.md` and the frontmatter key is `collection`. Old `courses/` files, `course:` lines and old Export zips still load, and the next sync moves them to `collections/` as one commit, like the `concepts/` move above. Inside the code a note's Collection is still kept as `course`, so notes already stored in a browser need no change.

Collection names ignore capital letters. Two that differ only in capitals are one Collection, spelled like the one with the most notes (on a tie, the one with the oldest note), and their files move into that one folder in the same commit. Typing a name in other capitals picks the existing Collection.

## Addition: Collections only by choice, page groups (#92, 2026-10-12)

New notes no longer take the last used Collection (#83 had added that for every new note). People found their website notes in Collections they never picked. Now a note joins a Collection only when you put it there, with one exception: a new note for a page whose other notes are already in a Collection joins that one, since you put that page there yourself.

A page with two or more notes outside any Collection shows as its own **Page group** (CONTEXT.md) under "No collection" in the ▾ menu, named after the page's title. That title is kept as an optional `pageTitle` line in the frontmatter, after `source`, so it syncs and exports with the note; notes made before it show the site and the last part of the address instead. A hover icon on the group moves all its notes to a Collection at once. Inside a Collection, a page's notes stay a plain list.
