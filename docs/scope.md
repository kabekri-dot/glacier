# Glacier – scope

What goes into which version. Terms are defined in [CONTEXT.md](../CONTEXT.md), and the bigger decisions are in [docs/adr](adr/).

## v1

- Sidebar in Chrome and Firefox, opened from the toolbar or a keyboard shortcut
- **One layout: Zen.** Only the page. One small pill at the top holds ← (back to the previous note), the title (click it to rename), ▾ (the Notebook menu: search, recent notes, the notebook, the Archive), ⋯ (This note: download as a file, archive, delete), the sync status, "1 of 3" when the page has more notes, and + (New note, blank, and on a website New note for this page, each explained on hover). A small button bottom-left shows what links here. The other nine layouts from the prototype wait until later (see below)
- One kind of note ([ADR 0010](adr/0010-one-kind-of-note.md)): a page and a Collection are both optional. A page can have several notes; the ▾ menu starts with Notes for this page, newest first, and "+ New note for this page"
- Opening the panel on a known page opens its most recently edited note. On an unknown page the empty paper shows, and the note is made with the page title and Source the moment you start writing (#61). No create form: + opens a fresh page with the title in the pill ready to type. Reading the current tab needs an optional permission, asked on the first click (ADR 0008); without it, notes are made without a page
- Switching tabs: the sidebar always shows the note of the tab you're on. On a browser page (new tab, settings, a PDF) it keeps the open note. Both can be changed in settings ([ADR 0009](adr/0009-the-sidebar-follows-the-tab.md))
- A note joins a Collection only when you put it there (#92); a new note for a page whose notes are in a Collection joins that one. The Collection is changed in place on the line above the text, for every note
- Note list: Collections → their notes, then the notes without a Collection, where a page with two or more notes is its own Page group named after the page, movable to a Collection as a whole
- Collections were called Courses until #73; their names ignore capital letters, so two that differ only in capitals show and sync as one
- Live-preview writing: no Edit/Preview switch, the cursor lands in the note when it opens, and Markdown shows as formatting while you write, including on the current line, where the Markdown marks stay visible but faded (see [ADR 0006](adr/0006-live-preview-block-editor.md)). A plain click follows a Link. Frontmatter hidden and shown as a small header (Collection · site ↗, the site switching to the page's tab when it's open; no site for a note without a page)
- `/` command menu at the start of a line, showing the Markdown for each command. A small + at the left of the current line opens the same menu
- A welcome on the first start (#85, #90, #91): a pixel-art scene, "Welcome to Glacier", three lines with pixel icons (a note, a website note, a Collection), Start writing and a tip. Opening a note or typing hides it for good; "How Glacier works" at the top of the Shortcuts panel shows it again
- The sync dot opens a small sync box: the status in words, when it last synced, Sync now (a pixel pencil writes "Just synced") and a line for notes with several versions (#75, #85)
- Shortcuts panel (Markdown cheat sheet): a drawer inside the sidebar on its right edge, on every page. Folded, it is a small tab in the top right corner next to +. Open, it slides in over the right part of the note; a click on the note or the tab closes it. It stays open or folded until you change it. Switched on or off in settings. Nothing extra in the note's top bar, which is kept for the title
- `[[` autocomplete for Links
- Selecting and copying across paragraphs: drag-select works over several lines (a plain click starts editing). Ctrl+A selects the line, Ctrl+A again the whole note. Copy keeps the Markdown, so it pastes back intact
- Renaming rewrites every Link. Missing Links render red, and clicking one creates a note without a page or Collection
- Backlinks: in Zen, the small link button bottom-left lists the notes that link here
- Search across titles and text (simple substring)
- Sync with the Notes Repo: pull on panel open, push after typing stops, Conflict Copies. Status indicator: synced · syncing · offline · conflict, plus "last synced". "Sync now" shows a short confirmation
- First sync: a progress screen (connecting → downloading n/total notes → linking → ready), then a confirmation
- Export by hand: this note (one `.md` file, from ⋯), a Collection, the Archive or everything (a zip of `.md` files). Restore from backup file brings an Export back and never overwrites a note you have
- Delete a note (asks first; the file leaves the Notes Repo too) or Archive it (hidden from lists and search, kept in `archive/` in the Notes Repo, Unarchive puts it back)
- Themes in two groups. **Nature**: Glacier (default), Forest, Ocean, Desert, Volcano, Aurora (dark), each with a faint pixel-art panorama along the bottom of the paper, from left to right. It keeps its height, so a wider sidebar shows more landscape, and it fades out upwards with room left below the last line, so text is never drawn over it. **Classics**: Blank Page, School Notebook, Chalkboard (dark), Moleskine, Engineer
- Text size slider (85–150 %). Line spacing grows with it, so ruled and grid paper still lines up
- The sidebar is resizable (Chrome and Firefox both let you drag the sidebar wider). Layouts must work from about 260 px up
- Font Override: Theme default / Shantell Sans / Patrick Hand / Kalam Light / Caveat / Architects Daughter / Montserrat, each shown in its own font in settings. Fonts bundled
- Glacier icon: pixel-art ice on smooth sky and water. Used as the toolbar icon in Chrome and Firefox, and as a large round button floating in the bottom-right corner of the sidebar. It opens settings as a panel that expands to the left of the sidebar, over the web page. The notebook keeps its size and shows changes live. Settings sections fold open and closed: Paper, Writing (font + text size), Shortcuts panel, Tabs and notes, Notes repo (token, Sync, Export, Restore from backup file; in v2 Where your notes live, ADR 0011)
- Settings beside the sidebar use an optional permission, asked for only when settings first open, behind Glacier's own explanation card. Declined: settings open inside the sidebar instead ([ADR 0008](adr/0008-optional-on-demand-host-permission.md))

### Themes

| Theme | Paper | Pattern | Default font | Ink / accent |
|---|---|---|---|---|
| Glacier | pale ice-blue | faint blue lines, sky tint, pixel glacier panorama along the bottom | Shantell Sans | deep navy / glacier blue |
| Forest | pale sage | faint green lines, pixel pine forest panorama | Patrick Hand | deep green / moss |
| Ocean | pale sea-blue | faint blue lines, pixel sea + sailboats panorama | Shantell Sans | navy / teal |
| Desert | warm sand | faint tan lines, pixel dunes + cacti panorama | Caveat | brown / terracotta |
| Volcano | warm ash | faint lines, pixel volcanoes + lava panorama | Kalam Light | charcoal / lava orange |
| Aurora (dark) | night navy | faint lines, pixel mountains under a smooth aurora | Shantell Sans | pale blue-white / aurora green |
| Blank Page | warm off-white | none | Shantell Sans (low informality) | charcoal / muted blue |
| School Notebook | white | faint blue lines + red margin line | Patrick Hand | dark blue / red |
| Chalkboard (dark) | slate green-grey | none | Kalam | chalk white / pale yellow |
| Moleskine | ivory/cream | none or very faint rules | Kalam Light | near-black / burgundy |
| Engineer | pale green | faint green grid, darker every 5th line | Architects Daughter | graphite / orange |

## v2

Decided in a grilling on 2026-10-13. For the user and a few people they know; nothing may block the browser stores later. Chrome first (Edge too); Firefox keeps working with the same notes, Chrome-only extras are fine. Built in this order, with a test zip after each step:

1. Split `sidebar/panel.js` (#93)
2. **Where your notes live** ([ADR 0011](adr/0011-where-your-notes-live.md)): Google Drive, a folder on this computer (Chrome only) or GitHub, one at a time; the same Markdown and `.svg` files in each; switching combines and deletes nothing; a pixel cloud reminder while notes live only in the browser
3. **Extract to a new note**: select text, then the `/` menu, a shortcut or ⋯ makes it a new note with the same page and Collection and leaves a `[[Link]]` in its place
4. **Clipping**: highlighted text on a web page, by right-click "Clip to Glacier" or a shortcut, lands at the end of the open note as a quote with its source link (or starts the page's note)
5. **Sketch blocks**: insert with + or `/sketch`, then drag circles, triangles, rectangles, squares, arrows, lines and free text into a drawing area inside a note. Hand-drawn by default, switchable to clean per sketch; no freehand pen. Saved as `.svg` next to the note ([ADR 0007](adr/0007-sketch-blocks-as-svg-files.md))

Also asked for on the way: a table of contents (#107), and **notes as pages** (#108): `%%page%%` lines (or `/page`) split a note into pages, each as long as its text; with "Notes as pages" on in settings one page shows at a time, turned with ‹ › or Ctrl PageUp / PageDown and a pixel-art page flip. The note stays one file. And **secret notes** (#109, [ADR 0012](adr/0012-secret-notes-with-one-passcode.md)): ⋯ → Make secret encrypts a note's text with one Glacier passcode, in the browser and in every Notes Home; the title stays visible, and a forgotten passcode can't be recovered.

Also: the open polish and the user's brother's feedback, as they come (bugs first).

## Next (the user's backlog, 2026-10-21)

Each of these gets a grilling with the user before it becomes a ticket, in
this order.

1. **Urgent: the top bar.** It is cluttered and hard to understand. Glacier
   should be usable with no tutorial at all. Part of it: deleting a note
   from the notes list opens that note and swaps the paper for the question.
   The question should appear right where Delete was clicked, just Keep or
   Delete, without opening anything.
   Decided so far in the grilling:
   - The notes list gets its own button on the left with a word: `☰ Notes`.
   - The title is where the name is edited: hovering shows a small pixel-art
     pen, and clicking the pen edits the title in place.
   - In the notes list, a note can be renamed too, not only deleted.
   - Clicking the title shows the note's headings; clicking one jumps
     there. With none: "No headings yet. Start a line with # to make one."
     The ≡ tab on the left goes (it wasn't found without being told).
   - The sync dot is hidden while all is well. When something needs the
     user, a short word shows in its place ("Offline", "Not synced");
     clicking it says what happened and what to do.
   - The pin leaves the bar and becomes a pixel-art pushpin in the top
     right corner of the paper: faint when off, stuck in and bright when on.
     One click pins or unpins. Feedback: the pin presses in (or pulls out)
     in one short smooth motion, and a notice says "Pinned. This note stays
     open when you change tabs." or "Unpinned. Glacier follows your tabs
     again."
   - `?` leaves the bar: "Keyboard shortcuts" goes into the `⋯` menu (and
     Settings), and menu items show their shortcut next to them.
   - No help button in the bar. "Help" is the last item in the `⋯` menu and
     opens a short page of common questions (later on the website). Empty
     places and first clicks explain themselves instead.
   - `←` stays on the far left, only when there is a note to go back to;
     hovering says "Back to <note title>". Click and hold goes (nobody finds
     it); the earlier notes are under Recent in the notes list.
   - `+` keeps its choice, made concrete: `Note for "<page title>"` (linked
     to this page) and `Blank note`, each with a pixel-art icon (a globe, a
     sheet of paper). The first is picked already, so `+` then Enter works.
     With no website open, `+` makes a blank note at once.
   - `⋯` drops down with the quick actions: a row of three big pixel-art
     icons with words (Rename, Download, Archive) | Delete on its own (asks
     Keep or Delete in place) | Note details, Keyboard shortcuts, Help.
   - "Note details" slides a drawer in from the right over the paper:
     Collection (click to change), Secret on or off with one sentence on
     what it means, the Page, Linked from (backlinks), then the stats as
     label and value lines (Words, Created, Edited), and Done. Prototype:
     https://claude.ai/artifact/CySDb3iB1Yj2MFgVbgp5ck
   - The line under the bar loses the collection (it is in Note details).
     The page arrows show only when a note has more than one page; with one
     page the paper starts right under the bar.
   - "New page": with one page, a faint New page button sits at the end of
     the paper (pixel-art sheet). An × on hover hides it; the notice says
     "Hidden. Type / and pick New page to add a page." with Show again.
     Settings has the same switch ("Show New page at the end of notes").
     From two pages on, the line under the bar shows ‹ 1 of 2 › and
     + New page, and the button at the end goes. New page is always in `/`.
   - `☰ Notes`: search field focused on open (results replace the list; no
     match offers a note with that name), Recent (at most 5), Collections
     folded with counts, Not in a collection, Archive folded at the bottom.
     ⤢ expands the list over the whole sidebar (all open, each note with
     "Edited …, in <collection>"); ⤡ makes it small, × or Esc closes.
   - A note's row on hover: ✎ rename in place, ⋯ opens a small menu under
     it: Move to collection… (collections shown right there), Download,
     Archive/Unarchive, Delete (Keep or Delete in place).
   - A collection's row on hover: ✎ rename in place, ⋯: New note in it,
     Download all (one zip), Archive all, Delete collection (in place:
     Keep, "Delete, keep notes", "Delete all").
   - "+ New" next to the Collections heading opens a name field there;
     Enter makes the collection, already open. An open collection ends with
     a faint "+ New note in <collection>".
   - "Extract to a new note" leaves the menu: it appears when text is
     selected. Whether selecting text shows more options is still open.
2. **Settings, more organized.** Keep the style; less at once.
   Decided so far (prototype: https://claude.ai/artifact/AUTtKjhT4mTC6CUedH8cKv):
   - Search on top in both layouts; typing shows every matching setting.
   - Inside the sidebar (Settings covers the paper): an icon rail on the
     left (Look, Pages, Tabs, Saving, Backup, Secret, Help), the chosen
     part on the right. On Look, a small paper preview shows the chosen
     paper, font and size.
   - Beside the sidebar (the real paper stays visible): the sections one
     under the other, each closed one showing its current value in a line,
     one open at a time. No preview there.
   - Plain names: How your notes look, Pages, When you change tabs, Where
     your notes are saved, Back up and restore, Secret notes, Help and
     shortcuts. Inside: "Split long notes into pages", "Show the New page
     button", "When you go to another website, Glacier opens the note for
     that website / keeps your note open", "On a new tab, Glacier keeps
     your note open / starts a new note", "Next to the sidebar" (one
     switch), "The paper's own font", "Download all notes", "Restore notes
     from a download".
   - The round glacier button stays and gets a small pixel-art gear badge
     on its top right edge, so it reads as Settings. Hover says "Settings";
     no spinning (pixel art stays still).
3. **Two more layouts** next to Zen (picked from the list under Later).
   Prototype: https://claude.ai/artifact/63je2UPGNeimnZ6pXJWZsV. The user
   liked Course path, Home and Index tabs. Proposed: one "Course" layout
   (Course path and Index tabs merged) and "Home". Course is explicitly
   for learning: a collection is marked as a course, its notes are its
   lessons (numbered tabs on the paper's edge, progress on top, Previous,
   Mark as done and Next lesson at the bottom, the lesson's page one click
   away). Course decided 2026-10-22 (#126); Home not grilled yet.
4. **Hidden games.** A secret command (for example `/takebreak`) starts a
   small pixel game in the note, with highscores. Each Theme has its own game
   that matches it. (Pixel art stays still or slow; no flicker.)
5. **Support Glacier.** Pay once, weekly or monthly, like "buy me a coffee";
   maybe it unlocks two extra Themes, but it doesn't have to.
6. **Codes for influencers.** A small creator gets a code that unlocks two
   custom Themes for their followers.
7. **A website with SEO** to promote Glacier.

## Later (maybe never)

Each of these gets a grilling with the user before it becomes a ticket.

- More layouts, added one at a time after using Zen for a few weeks. The prototype has all nine, grouped: Drawer (focus on writing); Course path, Breadcrumb, Home (always know where you are); Split, Index tabs, Icon rail (notebook in view); Bottom tabs, Note tabs (familiar app style)

- More Themes (Dot Journal, Legal Pad)
- Attaching the current page to a note made without one
- A link shortcut (Ctrl+K is kept for search; links are typed as `[text](url)`, #43)
- Pasting from a web page keeps its formatting (headings, bold, lists, links turned into Markdown); v1 pastes plain text
- Unlinked mentions
- Tags
- Flashcards / spaced repetition
- Graph view
- Pictures in notes (pasting a screenshot; synced as files next to the note, like sketches)
- Tables
