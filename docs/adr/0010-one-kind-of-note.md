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
