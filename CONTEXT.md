# Glacier

A personal notebook that lives in the browser's sidebar, for taking and connecting notes while following online courses.

## Notes

**Note**:
A titled piece of Markdown text. Every note is either a Lesson Note or a Concept Note, and its title is unique across the whole Notebook.
_Avoid_: Page, document, entry, card

**Lesson Note**:
A note written while following one lesson of a Course, tied to that lesson's Source.
_Avoid_: Course note, page note

**Concept Note**:
A note that captures one idea in your own words, independent of any Course, so it can be linked from lessons of many Courses.
_Avoid_: Atomic note, topic, permanent note

**Course**:
A named group of Lesson Notes from the same learning path, e.g. "The Odin Project – Foundations" or "Khan – Algebra 1". Chosen by hand, not derived from a website.
_Avoid_: Folder, category, website

**Source**:
The web address of the lesson a Lesson Note belongs to, compared without its query string or `#fragment`.
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
A Link whose title matches no note yet. Following it creates a Concept Note with that title.
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
A zip of the whole Notebook as Markdown files, made by hand, which Import can turn back into a Notebook.
_Avoid_: Backup, download, snapshot
