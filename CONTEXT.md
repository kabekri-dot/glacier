# Glacier

A personal notebook that lives in the browser's sidebar, for taking and connecting notes while following online courses.

## Notes

**Note**:
A titled piece of Markdown text, and the only kind of note there is. Two details are optional: its page (the Source it belongs to) and its Course. A page can have several notes; visiting it opens the one edited most recently. A note without a page is a blank note, e.g. one idea in your own words, or notes from a book. Its title is unique across the whole Notebook.
_Avoid_: Lesson Note, Concept Note (two kinds of note, merged into one, ADR 0010), document, entry, card

**Course**:
A named group of notes from the same learning path, e.g. "The Odin Project – Foundations" or "Khan – Algebra 1". Chosen by hand, not derived from a website.
_Avoid_: Folder, category, website

**Source**:
The website address (`http` or `https` only) of the page a note belongs to, called "page" on screen. It is compared without its `#fragment` and without known tracking parameters (`utm_…`, `fbclid`, `gclid`, `ref`…). Other query parameters stay part of it, because on sites like YouTube (`watch?v=…`) they identify the lesson.
_Avoid_: URL, origin, link (reserved for Links between notes)

**Sketch**:
A drawing inside a note, made of shapes and free text, kept as a picture file next to the note and shown where its embed line sits.
_Avoid_: Canvas, diagram, whiteboard, image

**Notebook**:
All of one person's Notes and Courses together.
_Avoid_: Vault, workspace, library

## Connections

**Link**:
A reference from one note to another, written as `[[Title]]` in the text.
_Avoid_: Wikilink, reference, hyperlink

**Missing Link**:
A Link whose title matches no note yet. Following it creates a note with that title, without a page or Course.
_Avoid_: Broken link, dead link

**Backlink**:
A Link seen from the target's side: the notes that link *to* the note you are viewing.
_Avoid_: Reverse link, mention, inbound link

## Look

**Theme**:
A named look for the Notebook (paper colour, paper pattern, ink colour, accent, default font), e.g. Blank Page, School Notebook, Chalkboard, Moleskine, Engineer.
_Avoid_: Skin, paper preset, style

**Font Override**:
A font chosen by the user that replaces the Theme's default font and stays in place when the Theme changes.
_Avoid_: Custom font, font setting

## Keeping notes safe

**Notes Repo**:
The private GitHub repository holding the shared copy of the Notebook as Markdown files.
_Avoid_: Backup, remote, cloud

**Sync**:
Bringing a browser's copy of the Notebook and the Notes Repo into agreement, by pulling changes in and pushing changes out.
_Avoid_: Save, upload, backup

**Conflict Copy**:
A second note created when the same note was changed in two places before Sync, so that neither version is lost and the user can merge them by hand.
_Avoid_: Duplicate, merge conflict

**Export**:
Markdown files made by hand from the Notebook: one note as a `.md` file, or a Course, the Archive or the whole Notebook as a zip. Restore from backup file turns a zip back into notes without overwriting any.
_Avoid_: Backup, snapshot, Import

**Archive**:
Where a note goes when it's put away but kept. An archived note is still a Note, and Links to it still work, but it leaves the lists, search and recent notes, and its page no longer opens it. In the Notes Repo it sits under `archive/`. Unarchive puts it back.
_Avoid_: Trash, bin, hidden note

**Delete**:
Removing a note for good, from the Notebook and from the Notes Repo. Links to it become Missing Links.
_Avoid_: Remove, trash
