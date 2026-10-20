# Glacier

A personal notebook that lives in the browser's sidebar, for taking and connecting notes while following online courses.

## Notes

**Note**:
A titled piece of Markdown text, and the only kind of note there is. Two details are optional: its page (the Source it belongs to) and its Collection. A page can have several notes; visiting it opens the one edited most recently. A note without a page is a blank note, e.g. one idea in your own words, or notes from a book. Its title is unique across the whole Notebook.
_Avoid_: Lesson Note, Concept Note (two kinds of note, merged into one, ADR 0010), document, entry, card

**Collection**:
A named group of notes chosen by hand, e.g. "The Odin Project – Foundations", "Khan – Algebra 1" or "Book: Clean Code". Not derived from a website. Its name ignores capital letters: "Testing Test" and "Testing test" are the same Collection.
_Avoid_: Course (its old name, which only fit learning paths), Folder, category, website

**Page group**:
The notes of one page that are in no Collection, shown together in the ▾ menu under "No collection" once there are two or more, named after the page's title as it was when its first note was made (`pageTitle`). Not something you make or name: it goes away when its notes move to a Collection, all at once from the group or one by one. A note only joins a Collection when you put it there; the one exception is a new note for a page whose other notes you already put in one.
_Avoid_: site folder, website Collection

**Source**:
The website address (`http` or `https` only) of the page a note belongs to, called "page" on screen. It is compared without its `#fragment` and without known tracking parameters (`utm_…`, `fbclid`, `gclid`, `ref`…). Other query parameters stay part of it, because on sites like YouTube (`watch?v=…`) they identify the lesson.
_Avoid_: URL, origin, link (reserved for Links between notes)

**Sketch**:
A drawing inside a note, made of shapes and free text, kept as a picture file next to the note and shown where its embed line sits.
_Avoid_: Canvas, diagram, whiteboard, image

**Page break**:
A line `%%page%%` that splits a note into pages, each as long as its text, shown one at a time when "Notes as pages" is on (#108). The note stays one file. Not to be confused with a note's page, its Source.
_Avoid_: Section, sheet, chapter

**Notebook**:
All of one person's Notes and Collections together.
_Avoid_: Vault, workspace, library

## Connections

**Link**:
A reference from one note to another, written as `[[Title]]` in the text.
_Avoid_: Wikilink, reference, hyperlink

**Missing Link**:
A Link whose title matches no note yet. Following it creates a note with that title, without a page or Collection.
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

**Notes Home**:
The one place outside the browser that holds a copy of the Notebook as Markdown files: a Glacier folder in Google Drive, a folder on this computer, or a GitHub repository (the Notes Repo). Called "Where your notes live" on screen. There is at most one; without it the notes live only in this browser (ADR 0011).
_Avoid_: cloud, server, remote, account

**Notes Repo**:
The private GitHub repository used as the Notes Home.
_Avoid_: Backup, remote, cloud

**Sync**:
Bringing a browser's copy of the Notebook and the Notes Home into agreement, by pulling changes in and pushing changes out.
_Avoid_: Save, upload, backup

**Conflict Copy**:
A second note created when the same note was changed in two places before Sync, so that neither version is lost and the user can merge them by hand.
_Avoid_: Duplicate, merge conflict

**Export**:
Markdown files made by hand from the Notebook: one note as a `.md` file, or a Collection, the Archive or the whole Notebook as a zip. Restore from backup file turns a zip back into notes without overwriting any.
_Avoid_: Backup, snapshot, Import

**Archive**:
Where a note goes when it's put away but kept. An archived note is still a Note, and Links to it still work, but it leaves the lists, search and recent notes, and its page no longer opens it. In the Notes Repo it sits under `archive/`. Unarchive puts it back.
_Avoid_: Trash, bin, hidden note

**Secret note**:
A note whose text is encrypted with the Glacier passcode, in the browser and in the Notes Home, so only someone who knows the passcode can read it. Its title stays visible. It is locked until the passcode is typed, and again after 10 minutes without typing or when the sidebar closes. A forgotten passcode can't be recovered (ADR 0012).
_Avoid_: Private note, hidden note, password, vault

**Delete**:
Removing a note for good, from the Notebook and from the Notes Repo. Links to it become Missing Links.
_Avoid_: Remove, trash
