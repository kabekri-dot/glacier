# Manual tests

Everything in Glacier that only a person can check, by clicking and typing in the browser. The robots test the logic with `node --test`, but they can't open Chrome or Firefox.

**How to use this list**

- Reload Glacier first: ↻ in `chrome://extensions` and in Firefox `about:debugging`.
- Do each test in **both** Chrome and Firefox.
- Section 1 is what still needs a first check. Section 2 is the full list, for a check of everything before a release (#41) or after a big change.
- You need: two websites (an article and a video work well), a new tab, and a settings page (`chrome://settings` or `about:preferences`).

## 1. Still to test

### Sync lives in the dot; the Notebook menu holds only notes (#75)

- [ ] Reload the extension with the ↻ button first. Click the sync dot in the pill: a small box opens under it with the status in words (for example "Up to date") and a quiet line "Last synced 2 minutes ago". Leave it open for a minute: the time moves on by itself.
- [ ] Click "Sync now": the button reads "Syncing…", then for a few seconds the result ("Up to date", or "3 notes sent, 1 received"), then "Sync now" again. Turn the network off and try again: the result is "Offline. Your changes are kept here".
- [ ] Press Esc, or click anywhere outside the box: it closes.
- [ ] Make a note with two versions (see Conflict Copies below). The box shows "1 note has two versions. Check them" style text. Clicking it opens the ▾ menu with "Two versions (n)" at the very top, each original with its second version under it.
- [ ] Click "Notes repo settings" in the box: settings open at Notes repo. Without a Notes repo connected, the box says "Not connected to GitHub" and offers "Set up sync", which opens the same place.
- [ ] Open the ▾ menu: there is no Sync, no "Sync now" and no "Notes repo" in it. The order is search, Two versions (only while there are any), Notes for this page, Recent, Collections, Archive.
- [ ] Nothing in the menus or the box is bold.

### Actions on a whole Collection (#74)

- [ ] Reload with ↻ first. Open the ▾ menu and hover a Collection heading: Download, Archive and Delete icons show, and they also show when the heading has keyboard focus. Each hover text names the Collection and its note count, like "Archive 'Testing', 12 notes".
- [ ] Click Download on a Collection: a small choice shows Markdown (.md), PDF and Print. Markdown saves a zip. PDF and Print open the print window with every note of the Collection, each on a new page. Do the same from a note row and from ⋯ This note: the same three choices.
- [ ] Click Archive on a Collection: its notes leave the lists and "Archived 12 notes." shows with Undo. Undo puts them all back.
- [ ] Open the Archive section: the notes sit under their Collection, and hovering that heading offers Unarchive. It brings back every note of that Collection.
- [ ] Click Delete on a Collection: the question names the count, "Delete the collection 'Testing' and its 12 notes? They're also removed from your Notes repo." Keep (or Esc) leaves everything. Delete removes the notes, and after the next sync they are gone from the Notes repo too.

### Enter after Ctrl+B, and Shift+Enter as a plain new line (#78)

Reload with ↻ first.

- [ ] In a bullet list, select the last word, press Ctrl+B, then Enter: the word is bold and a new bullet starts. The same with Ctrl+I and Ctrl+E.
- [ ] Select a word and press Ctrl+B, then click inside the word and select it again by hand, then Enter: the selection is replaced by a line break, as before.
- [ ] Press Ctrl+Z after Ctrl+B and Enter: first the new line goes, then the bold.
- [ ] In a bullet line, press Shift+Enter: the new line has no bullet and stays in the same note.
- [ ] Inside bold, Shift+Enter still makes a new bold line. In a code block it makes a new line as before.

### Delete at the end of a line pulls the next line up (#77)

Reload with ↻ first.

- [ ] Type text on line 1 and line 4, leaving lines 2 and 3 empty. Put the caret at the end of line 1 and press Delete twice: the text from line 4 is now on line 2, and the caret has not moved.
- [ ] Press Ctrl+Z: the lines come back, in one step per press of Delete.
- [ ] Press Delete in the middle of a line: it removes the one character after the caret, as before. Ctrl+Delete in the middle of a line removes the next word. At the end of the last line, Delete does nothing.
- [ ] In a note with a code block, press Delete at the end of the line above the opening fence, and at the end of the closing fence: the fences stay, and the caret only moves to the start of the next line.

### Course becomes Collection, and capitals don't split Collections (#73)

Reload with ↻ first. You need a connected Notes repo for the last two checks.

- [ ] The line above the text says "No collection" on a note without one. Hover it: "Move to another collection". Click it: the list ends with "+ New collection".
- [ ] Open the ▾ menu: the Notebook lists Collections, then "No Collection" with the rest. Hover a Collection heading: three icons show, and Download names the Collection and its note count.
- [ ] Settings, Notes repo: the list under Backup holds Collections, and hovering a Download icon names the Collection. Nowhere in the sidebar, menus or settings does the word Course show.
- [ ] Put a note in "Testing Test", then click "+ New collection" on another note and type "testing test": the note joins "Testing Test", and the menu shows one Collection.
- [ ] If you had "Testing Test" and "Testing test" before this change: after the reload they show as one Collection, spelled like the one with more notes.
- [ ] Sync, then open the Notes repo on GitHub: the notes sit in `collections/`, the old `courses/` folder is gone, and both spellings ended up in one folder. The history shows the move as one commit.

### Shortcuts panel always on the left edge (#72)

Reload with ↻ first. Turn the Shortcuts panel on in settings.

- [ ] On a website, the cheat sheet sits beside the sidebar, against the sidebar's left edge. Fold it: the small tab is at the top, level with the note title. Unfold it: the sheet comes back.
- [ ] On a new tab (where beside is not allowed), the cheat sheet is a narrow strip over the left part of the note inside the sidebar. Fold it: the tab is at the top left, covering only a little of the title at the edge, never the title text.
- [ ] Close and reopen the sidebar: the panel is still open or folded as you left it.

### Hover actions on note rows; download as .md or PDF (#71)

Reload with ↻ first.

- [ ] Open the ▾ menu and hover a note row (also in Recent, search results and the Archive section): three small icons show on the right. Tab to a row: they show too. Each has a hover text naming the note, like "Archive 'Arrays basics'".
- [ ] Click Download: a small choice appears there, Markdown (.md), PDF or Print. Markdown saves the .md file. PDF and Print open the print window with only the title and text, where you pick Save as PDF.
- [ ] Click Archive: the note leaves the list at once and "Archived. Undo" shows at the bottom. Click Undo: it comes back.
- [ ] In the Archive section the middle icon is Unarchive and puts the note back.
- [ ] Click Delete: the usual question appears. Keep leaves it, Delete removes it.
- [ ] Hover a Collection heading: three icons show (see the Collection section above). Markdown gives a zip of .md files. PDF gives one document with every note of the Collection, each on a new page.
- [ ] In ⋯ This note, Download asks the same Markdown or PDF choice.
- [ ] Settings, Notes repo: a list of every Collection (it scrolls when long), each with a Download icon that asks the same choice. Export everything and Export archive are still there.

### Conflict line you can close, guided second versions, sync dot explained (#70)

Reload with ↻ first. Make a conflict first (see Conflict Copies, #16).

- [ ] The line under the pill says "A note has two versions. Check it". With two conflicts it says "2 notes have two versions. Check them".
- [ ] Click the × on the line: it goes away and stays away, even after you type or sync. The dot stays orange.
- [ ] Make a new conflict: the line comes back.
- [ ] Click the line: the ▾ menu opens with each original and its second version under it. Click the second version to open it.
- [ ] The second version shows a bar above its text: "This is a second version of 'Title'. Copy what you want to keep into 'Title', then delete this version."
- [ ] Click Open 'Title' in the bar: the original opens.
- [ ] Click Delete this version: the usual question appears. Keep brings the note back, Delete removes it. When the last second version is gone, the line and the orange dot go away.
- [ ] Hover the dot when everything is saved: "All saved to GitHub". While syncing: "Saving to GitHub". With the network off: "Offline. Your changes are kept here and sync later".
- [ ] Hover the orange dot: "A note has two versions. Click to see them". Click it: the list of pairs opens.
- [ ] Break the token on purpose and sync: hovering the dot gives the error's short text.
- [ ] Before connecting GitHub, hover the dot: "Not connected to GitHub. Set it up in Settings".

### Search titles, or // to search inside notes (#69)

- [ ] Reload with the reload button first. Open the menu: the search box says "Search titles, or // to search inside notes", and hovering it says the same.
- [ ] Type a word from a note's title: that note is listed with the word highlighted.
- [ ] Type a word that is only inside a note's text, without //: nothing is found.
- [ ] Type `// ` and that word: the note is listed with a short piece of its text and the word highlighted.
- [ ] Type `// ` and two words from one note in the opposite order, in capitals: the note is still found, both words highlighted.
- [ ] Archive a note, then search for its title and for `// ` and a word in it: it does not appear.

### One kind of note: several notes per page, blank notes (#68)

Reload with ↻ first.

- [ ] On a website with no note, write something: a note for the page is made. Then + and "New note for this page": a fresh page with the page's title ready to type. Press Enter and write: a second note for the same page.
- [ ] The pill now says "1 of 2" after the title. Hover it: "Other notes for this page".
- [ ] Switch to another tab and back, or reopen the sidebar: the note you wrote in last opens, and the pill says "1 of 2".
- [ ] Click "1 of 2": the ▾ menu opens with "Notes for this page" at the top, both notes newest first, the open one in bold, and "+ New note for this page" under them. Click the other note: it opens and the pill says "2 of 2".
- [ ] Write a word in that note, switch tabs and come back: now it opens first, with "1 of 2".
- [ ] + and "New note": a blank note with "Title" faded in the pill. Name it and write: the line above the text shows only "No collection", no site link. Click "No collection" to give it a Collection.
- [ ] Hover the two + choices: "A blank note, not tied to any page." and "A note for the page you're on. It opens again when you visit the page."
- [ ] On a settings page, + offers only "New note".
- [ ] Click a Missing Link: the new note has no site link and "No collection".
- [ ] Look through the pill, both menus, the + menu, the start prompt, the permission card and settings: nothing says Lesson or Concept.
- [ ] With a Notes repo that still has a `concepts/` folder, sync: on GitHub one commit moves those files to `notes/`, and the notes still open with their text and backlinks.
- [ ] Restore from an older Export zip (with `concepts/` in it): every note comes back.

### Menu contents as data (#67)

Nothing should look or work differently. Reload with ↻ first, then run these groups from section 2 again:

- [ ] The pill at the top
- [ ] Two menus: Notebook and This note
- [ ] Archive
- [ ] A short conflict message with Show them

### Panel placement behind a browser port (#66)

Nothing should look or work differently. Reload with ↻ first, then run these groups from section 2 again:

- [ ] Settings, Classic papers and handwriting
- [ ] Shortcuts panel
- [ ] Panels beside the sidebar
- [ ] Why a panel opens inside the sidebar

### One module owns what's on screen (#65)

Nothing should look or work differently. Reload with ↻ first, then run these groups from section 2 again:

- [ ] Switching tabs
- [ ] The pill at the top
- [ ] Saving
- [ ] Making a note: write straight away, no form
- [ ] Two menus: Notebook and This note
- [ ] Archive
- [ ] Delete this note
- [ ] Rename by clicking the title
- [ ] The Collection and site line

## 2. Everything

### Opening Glacier

- [ ] The toolbar button shows the glacier picture and opens Glacier.
- [ ] Alt+Shift+G opens Glacier, and pressing it again closes it. Try it from the web page and while typing in a note.
- [ ] Type something, close with the shortcut right away, reopen: the text is still there.
- [ ] When the sidebar opens, the cursor is already in the note.

### Permission and first start

- [ ] Fresh start without the permission: one faded line, "No note for this page yet.", and a quiet "+ New note for this page" under it.
- [ ] Click it: Glacier's own card explains the permission. **Allow** shows the browser's prompt, and then the page's note or the empty paper for it.
- [ ] **Not now** leads to the empty paper, where typing makes a note without a page.
- [ ] Installing shows no permission warning. The first time settings open, Glacier's own card explains drawing beside the sidebar, and the browser asks only after **Allow** (#21).
- [ ] Allowed, settings and the cheat sheet open beside the sidebar on websites and inside it on browser pages. Declined, they open inside. Settings, Panels changes it later.

### Notes for the page you're on

- [ ] On a website without a note, the empty paper shows with "No note for this page yet. Just start writing." Typing makes the note, with the page title and the last used Collection.
- [ ] Clicking the paper without typing, or leaving, makes no note.
- [ ] Reopening the sidebar on that page opens the same note again. With several notes for the page, the one you wrote in last opens, and the pill says "1 of 2" or more.
- [ ] Two videos on the same site (different `?v=`) get different notes.
- [ ] The same page with `#part-2` or `?utm_source=mail` at the end opens the same note.

### Switching tabs

- [ ] Switching to another website shows its note, or the empty paper for it. That happens whatever note was open, including one you just made or opened from the pill.
- [ ] Switching back shows the first tab's note again.
- [ ] On a new tab or a settings page, the open note stays.
- [ ] Switching quickly between several tabs always ends on the note of the tab you're on.
- [ ] Text typed just before switching is saved in the right note.

### The pill at the top

- [ ] The pill shows the note's title and a sync dot. Its colour shows the sync status, and hovering it says the status in words (#15).
- [ ] Clicking the ▾ after the title, the bare part of the pill, or pressing Ctrl+K, opens the menu with the search box ready.
- [ ] Search finds words in titles and in the text, with the match highlighted. Clicking a result opens it and closes the menu.
- [ ] Recent notes are listed, including notes made by hand.
- [ ] The Notebook is listed: Collections with their notes, then "No Collection" with the rest.
- [ ] On a note with a page, the menu starts with "Notes for this page", newest first, and "+ New note for this page" under them.
- [ ] Esc closes the menu.
- [ ] `←` appears after the note changed. Hovering shows "Back to: <title>". Clicking goes back one note, and clicking again goes further back.
- [ ] `+` is always there. It offers "New note", and on a website also "New note for this page". On a settings page it offers only "New note".
- [ ] Hovering over each `+` choice, and "+ New note" in the menu, shows a short explanation.
- [ ] Each `+` choice opens a fresh page with the title in the pill ready to type. Enter makes the note, Esc goes back to the note from before and makes nothing.

### Saving

- [ ] There's no save button. Type, reload the page: the text is still there.
- [ ] Type, close the sidebar right away, reopen: the text is still there.
- [ ] Several lines and an empty line in between survive a reload exactly.
- [ ] Notes are still there after closing and restarting the whole browser.
- [ ] Type in note A, follow a link to B straight away, go back: each note has its own text.

### Writing

- [ ] Click anywhere on the paper, even far below the text: you can write there at once.
- [ ] Click to the right of a short line: the cursor goes to the end of that line.
- [ ] Click far below and then somewhere else without typing: no empty lines are left behind.
- [ ] Clicking on a word, also in a list line or a heading, puts the cursor exactly there.
- [ ] Enter makes a new line and continues a list. Enter on an empty list line ends the list.
- [ ] Backspace at the start of a line joins it with the line above.
- [ ] ↑ and ↓ move between lines, also through code blocks.
- [ ] Pasting from a website gives plain text, and several lines become several lines.
- [ ] The text sits on the ruled lines everywhere.

### Formatting while typing

- [ ] `## ` turns the line into a heading at once, with `##` faded.
- [ ] `- ` makes a list line, `> ` a quote, three backticks a code block.
- [ ] `**key**` turns bold the moment the second `**` is typed, and the cursor doesn't jump.
- [ ] `*italic*`, `***both***`, `` `code` `` and `[Google](https://google.com)` format with faded marks.
- [ ] `**word` without the closing marks stays plain.
- [ ] `snake_case` and `2*3` stay plain.
- [ ] Every line you're not on shows finished formatting, with the marks hidden.

### Formatting shortcuts

- [ ] Select a word, Ctrl+B: bold. Then Ctrl+I: bold and italic. Ctrl+B again removes the bold.
- [ ] Nothing selected: Ctrl+B, type "hello", Ctrl+B, type more. Only "hello" is bold.
- [ ] Select partly bold text, Ctrl+B: all of it is bold, with no leftover marks inside.
- [ ] Select three list lines, Ctrl+B: each line is bold, and the bullets stay.
- [ ] Ctrl+E makes `code`, and pressing it again removes it.
- [ ] In a code block, Ctrl+B and Ctrl+I do nothing.
- [ ] Firefox's bookmarks sidebar doesn't open on Ctrl+B, and the search bar doesn't jump on Ctrl+E.

### Enter inside formatting

- [ ] Type `**key`, so the cursor is inside bold. Enter jumps out past `**` on the same line. A second Enter makes a new line.
- [ ] Inside bold, Shift+Enter starts a new line that is still bold.
- [ ] In a bullet line, Shift+Enter starts a line without a bullet. Select a word, Ctrl+B, Enter: the word stays and a new bullet starts.

### Undo and redo

- [ ] Ctrl+Z steps back through your writing, also through Enter, Backspace and formatting.
- [ ] Ctrl+Shift+Z and Ctrl+Y step forward again.
- [ ] Text and faded marks look right at every step.

### The `/` menu and the `+` on the left

- [ ] `/` at the start of a line opens the menu. Every command shows its Markdown.
- [ ] Typing `/he` filters to the headings. ↑/↓ and Enter or Tab pick, Esc closes, and the mouse wheel scrolls.
- [ ] `/` in the middle of a line or in a code block opens nothing.
- [ ] The `+` on the left opens the same menu, on a new line when the line already has text.
- [ ] `+` and then Esc, Enter, a paste or following a link leaves no stray `/` behind.
- [ ] Empty lines show the hint "Type / for commands, or click + on the left".

### Links

- [ ] `[[` plus the first letters of a title shows matching notes. ↑/↓ and Enter or Tab complete the link, and Esc closes the list.
- [ ] A link to an existing note looks different from a link to a missing one.
- [ ] Clicking a link opens that note. Clicking a missing link creates a note with that name and opens it.
- [ ] A note made from a missing link has no Collection and no site link.
- [ ] Note A contains `[[B]]`. Open B: a small button at the bottom left shows `1`.
- [ ] Click it: A is listed. Click A: it opens.

### Renaming

- [ ] Click the title in the pill, give B a new name and press Enter. In A the link now shows the new name.
- [ ] Renaming to a name that's already taken is refused, and a free name is suggested.
- [ ] After a rename the note stays open and its backlinks still work.
- [ ] With a Notes repo connected, a rename shows on GitHub as one commit with the renamed file and every changed link (#17).

### Selecting and copying

- [ ] Drag over several lines: they get selected. A single click still puts the cursor there.
- [ ] Ctrl+A once selects the line, twice the whole note, never the web page.
- [ ] Ctrl+C shows a short message with the number of lines copied.
- [ ] Paste into another note: headings, lists, links and code come back as the same Markdown.

### Code blocks

- [ ] Backspace at the start of a code block keeps both ``` lines intact.
- [ ] Backspace on the line after a code block doesn't merge into it.

### How it reads

- [ ] No text in Glacier uses dashes as punctuation, words in capitals, or emoji.

### The Collection and site line

- [ ] A note with a Collection and a website shows a small "Collection · site ↗" line above its text (for example "youtube.com ↗"), and no `---` lines. Clicking the site switches to the page's tab when it is open, otherwise opens it in a new tab.
- [ ] Clicking the Collection opens a small list to move the note to another Collection or a new one.
- [ ] A note without a page shows only its Collection, or "No collection".

### Export and Restore from backup file

- [ ] Open settings, then Notes repo: "Export everything" and "Restore from backup file" sit under "Backup", and hovering shows what they do.
- [ ] "Export everything" downloads a zip named "Glacier notes" with the date.
- [ ] Unzip it: notes with a Collection are in `collections/<Collection>/`, all others in `notes/`, each file named after its title with a short block of details at the top.
- [ ] In Obsidian, "Open folder as vault" on the unzipped folder: the notes open and clicking a Link goes to the other note.
- [ ] Restore from that zip again: a message says no notes were added and all were already here, and nothing changed.
- [ ] Change a note, then restore from the older zip: your note keeps your change, and the older text appears as a second note with "(imported" and the date in its title.
- [ ] Restore from a zip in a fresh Glacier (or another browser): every note comes back with its text, Collection and website.
- [ ] Restore from a file that isn't a zip: a message says it couldn't be read, and nothing changed.

### A rename syncs as one commit

Connect a Notes repo first (see #14).

- [ ] Make two notes that link to a third with [[Its title]]. Wait for the dot to turn green.
- [ ] Rename the third note by clicking its title in the pill. When the dot is green again, open the repo's commits on GitHub: there is one new commit with the renamed file, the old file gone, and both notes with the new Link.
- [ ] Type in a single note and let it sync: that change is one commit too.
- [ ] In a new empty repo, connect and let your notes sync: everything arrives, in at most two commits.
- [ ] Turn the network off (devtools, Offline) and rename a linked note. On GitHub nothing changes. Turn the network on again: the rename arrives as one commit.

### Conflict Copies

Connect the same Notes repo in Chrome and in Firefox first (see #14).

- [ ] Turn the network off in Firefox (devtools, Offline). Change the same note in both browsers, with different text. Turn Firefox's network on again and let it sync. Both texts are kept: the note has Firefox's text, and a second note "Title (conflict date)" with today's date has Chrome's text. Both files are on GitHub.
- [ ] The dot turns orange. Hovering it says "A note has two versions. Click to see them". Clicking it opens the sync box, which says "A note has two versions. Check it" and opens the list.
- [ ] Type something or press "Sync now" in the dot's box: the dot stays orange while the copy is there.
- [ ] Open Chrome's sidebar: it also has both notes and an orange dot.
- [ ] Rename the copy by clicking its title in the pill (for example to "Margins old"). A few seconds later the dot turns green.
- [ ] Make another conflict, then delete the copy's file on GitHub and press "Sync now": the copy is gone from the menu and the dot turns green.
- [ ] Change the same note in both browsers to exactly the same text: no copy appears.

### Automatic two way sync

Connect the same Notes repo in Chrome and in Firefox first (see #14).

- [ ] Type in a note in Chrome and stop. A few seconds later the dot in the pill turns green. Hovering it says "Synced" and when the last sync was. On GitHub the note's file has your text.
- [ ] While it syncs the dot pulses. Hovering it says "Syncing".
- [ ] Open Firefox's sidebar: the note shows the text from Chrome. If it was already open on screen, it shows the new text after a moment.
- [ ] Make a new note in Chrome, then open the sidebar in Firefox: the note is there. Rename it in Firefox, open Chrome's sidebar again: it has the new name, and on GitHub the old file is gone.
- [ ] Turn the network off (devtools, Offline) and type. The dot becomes an empty ring and hovering it says "Offline" and that your changes are kept. Turn the network on again: the dot turns green and GitHub has the text.
- [ ] Change the same note in both browsers while one of them is offline, then let both sync. The dot turns orange, hovering says "Conflict", and the other text is kept as "Title (conflict date)".
- [ ] Click the dot: the box has the status, the last sync and a "Sync now" button. Pressing it shows "Syncing…" and then the result for a moment.
- [ ] Revoke or delete the token on GitHub, then type or press "Sync now": the dot turns red and the message says GitHub no longer accepts your token, it may have expired, and to paste a new one in Notes repo. Pasting a new token there makes it sync again.
- [ ] Without a Notes repo connected, the dot stays as before, hovering it says "Saved in this browser", and the box offers "Set up sync" instead of "Sync now".

### Connect GitHub and the first sync

You need a private GitHub repo for your notes and a fine grained token for it (GitHub, Settings, Developer settings, Fine grained tokens), limited to that repo with Contents set to read and write. Put a few notes in it first, for example from an Export zip, in `collections/` and `notes/`.

- [ ] Click the sync dot and then "Notes repo settings" (or "Set up sync" when not connected). It opens settings at Notes repo, with Repo and Token fields and a short text about the token.
- [ ] The × in the settings header returns to the note that was open.
- [ ] Type the repo as `yourname/notes` (pasting its GitHub address works too), paste the token, press "Connect and sync". A screen shows Connecting to GitHub, then Downloading 1 of N notes counting up, then Linking notes, then Ready, and says how many notes came in.
- [ ] "Start writing" closes settings. Every note from the repo is in the menu, with its Collection, text and backlinks.
- [ ] Typing just "notes" (no owner) says to type it as owner and name.
- [ ] A wrong token says GitHub didn't accept it. A repo name that doesn't exist says it couldn't find that repo. Nothing in the Notebook changes.
- [ ] With the network off (devtools, Offline), it says it couldn't reach GitHub.
- [ ] Open "Notes repo" again: it says which repo is connected, the repo is filled in and the token field says it is saved. Change the repo and sync again without pasting the token.
- [ ] A note you already had with different text is kept, and the repo's version shows up next to it as "Title (conflict date)".
- [ ] The token is in neither the repo nor an Export zip. It shows only in the extension's storage (devtools of the sidebar, Application or Storage, Extension storage).

### Export: this note, a collection, or everything

- [ ] Open the ⋯ This note menu after the title: "Download as a file" is there. Open settings (the round glacier button), then Notes repo: under a small "Backup" heading are a Collection list, "Export a collection", "Export everything" and "Restore from backup file". Hovering each shows what it does.
- [ ] "Download as a file" saves one `.md` file named after the note's title, with its text.
- [ ] Pick a Collection and press "Export a collection": the zip has only that Collection's notes.
- [ ] "Export everything" downloads a zip of every note, as before.
- [ ] "Restore from backup file" works as before (see section 2).

### Rename by clicking the title

- [ ] Click the title in the pill. It becomes a text field with the whole title selected. Hovering the title shows "Click to rename".
- [ ] Type a new name and press Enter: the pill shows it, the note stays open, and links in other notes follow.
- [ ] Click the title, change it, then click elsewhere on the page: it is saved too.
- [ ] Click the title, change it, press Esc: the old title comes back.
- [ ] Rename to a name another note has: the field stays open and a hint under the pill says "That name is taken. Use ...?". Clicking the suggested name fills it in and saves.
- [ ] Clear the field and press Enter: the hint says "Type a name for this note."
- [ ] The small ▾ after the title opens the menu, and so does Ctrl+K and a click on the bare part of the pill. The menu has no Rename item.

### Settings, Classic papers and handwriting

- [ ] With "Inside the sidebar" chosen under Panels (#21): a round glacier button sits in the bottom right corner. Clicking it opens settings over the lower part of the sidebar, with the note still showing above. Clicking it again, the × in the header, or Esc closes them.
- [ ] Paper, Writing and Notes repo fold open and closed when you click their names. Open all three and scroll: the "Settings" header stays on top.
- [ ] Under Paper, Classics, choose each one in turn: Blank Page, School Notebook (blue lines and a red margin line), Chalkboard (dark, chalk white writing), Moleskine (very faint lines) and Engineer (a green grid, darker every fifth line). The note changes at once.
- [ ] Close the sidebar and open it again: the paper you chose is still there. In the other browser it is its own choice.
- [ ] On Chalkboard, the pill, the menu, the search box and the settings are all readable.
- [ ] Under Writing, pick each font: Shantell Sans, Patrick Hand, Kalam Light, Caveat, Architects Daughter. The note changes at once.
- [ ] With School Notebook and each font, set the text size to 85 %, 100 % and 150 %: the letters sit just on the ruled lines, from the top of the note down to the last line, also in a long note.
- [ ] Write a heading, a line with `inline code`, a code block and a bullet list, then a few plain lines below them: the plain lines are still on the ruled lines. Same on Engineer.
- [ ] Choose Caveat, then switch the paper a few times: Caveat stays. Pick "Theme default": each paper uses its own font again (the list shows which, for example "Theme default (Patrick Hand)").
- [ ] Drag the text size slider: the note grows and shrinks while you drag, and the line spacing grows with it. It goes from 85 % to 150 %.
- [ ] Turn the network off (devtools, Offline) and reload the sidebar: every font still shows. In devtools, Network, the fonts come from the extension itself.
- [ ] Clicking in the note while settings are open closes them and puts the cursor where you clicked. Ctrl+K and the pill menu also close them.

### Tabs and notes settings

- [ ] Open settings and fold open "Tabs and notes". It has three choices: when I switch tabs, on a page that isn't a website, and the previous note button.
- [ ] Leave "When I switch tabs" on "Show the note of the tab I'm on". Open a note from the menu, then switch to a website tab: the note of that tab shows.
- [ ] Choose "Keep a note I opened myself", open a note without a page from the menu, then switch tabs: the note stays, without reopening the sidebar.
- [ ] Leave "On a page that isn't a website" on "Keep the open note", then switch to a new tab: the note stays. Choose "Show an empty page for a new note" and switch to a new tab again: the empty paper shows, and typing makes a note without a page.
- [ ] Choose "Hidden" for the previous note button: the ← button leaves the pill at once. Choose "Shown": it comes back when there is a note to go back to.
- [ ] Close the sidebar and open it again: all three choices are still as you left them.

### Nature papers and pixel art

- [ ] The toolbar button shows the glacier picture: white ice on a blue sky above blue water. Same in Chrome and Firefox.
- [ ] The round button in the bottom right corner shows the same glacier, and so does the "Settings" header next to its title.
- [ ] Open settings, then Paper: two groups, "Nature" (Glacier, Forest, Ocean, Desert, Volcano, Aurora (dark)) and "Classics" below it. Each Nature paper's swatch shows a bit of its picture.
- [ ] On a fresh start (or after removing the extension's storage) the paper is Glacier.
- [ ] Choose each Nature paper in turn. Along the bottom of the page sits a faint pixel landscape that fades out upwards: glaciers and ice on water, pine forest by a lake, sailboats and islands on the sea, dunes and cacti, smoking volcanoes with lava, mountains under a green aurora at night. Each one changes as it goes to the right, it doesn't repeat the same picture.
- [ ] Each Nature paper uses its own font with "Theme default": Glacier, Ocean and Aurora Shantell Sans, Forest Patrick Hand, Desert Caveat, Volcano Kalam Light.
- [ ] Make the sidebar wider and narrower: the landscape stays the same height and a wider sidebar shows more of it.
- [ ] Change the text size from 85 % to 150 %: the landscape keeps its height.
- [ ] Write a long note and scroll to the end: the last line sits above the landscape, with some room between them. No text is ever drawn on it.
- [ ] Click on the landscape below the last line: you can write there, and the new line still sits above the landscape.
- [ ] On Aurora, the pill, the menu, the search box and settings are all readable.
- [ ] Choose a Classic paper: the landscape goes away and the note ends near the bottom again.

### Shortcuts panel

- [ ] Open settings, then Shortcuts panel. It starts as Off, and no cheat sheet shows.
- [ ] Choose On: a Shortcuts sheet appears on the right edge of the sidebar (or beside it, with "Beside the sidebar" chosen under Panels, #21). It lists the start of a line (/, #, ##, ###, -, three backticks), anything in a line ([[Title]], bold, code) and the keys (Enter, Backspace, up and down, Esc, Ctrl A twice, Ctrl C, Ctrl K).
- [ ] Click the arrow in its header: it folds into a slim tab on the edge. Click the tab: the sheet opens again.
- [ ] Fold it, close and reopen the sidebar: it is still folded. Open it, reopen the sidebar: it is still open.
- [ ] Choose Off in settings: the sheet and the tab both go away. Choose On again: it comes back as you left it.

### Panels beside the sidebar

- [ ] Remove Glacier and load it again: installing shows no permission warning. In Chrome, `chrome://extensions`, Details, Site access shows no sites.
- [ ] Open a website and click the round glacier button: Glacier's own card shows in the sidebar first, saying what it is for and that Glacier never reads, saves or sends anything from the pages you visit. No browser prompt yet.
- [ ] Press Esc on the card: it closes and nothing is chosen. Click the glacier button again: the card shows again.
- [ ] Click Allow: now the browser's prompt shows. Accept it: settings open next to the sidebar, over the right edge of the web page. The note in the sidebar keeps its full width.
- [ ] With settings beside the sidebar, change the paper, the font and drag the text size: the note changes at once, also while you drag.
- [ ] Change "Tabs and notes", the previous note button and the Shortcuts panel beside the sidebar: each one works at once in the sidebar.
- [ ] Turn the Shortcuts panel on: the cheat sheet shows beside the sidebar too, to the left of settings. Close settings: the cheat sheet moves to the edge of the page.
- [ ] Fold the cheat sheet with its arrow: a slim Shortcuts tab stays on the edge of the page. Click the tab: it opens again.
- [ ] Close settings with the ×, with Esc, with the glacier button and by clicking in the note. Each way closes them.
- [ ] Under Notes repo beside the sidebar: Sync now, Export a collection, Export everything and Restore from backup file all work, and the downloads and messages show in the sidebar. With no repo connected, connecting one shows the first sync steps beside the sidebar.
- [ ] Switch to another website tab with settings or the cheat sheet open: they go with you. Go back: they are there and not left behind on the other tab.
- [ ] Follow a link in the page: after it loads, the panels come back beside the sidebar.
- [ ] On a new tab, a browser settings page (`chrome://settings` or `about:preferences`) and a PDF, open settings: they open inside the sidebar. Switch back to a website: they move beside it.
- [ ] Close the sidebar with settings or the cheat sheet beside it: within a few seconds they are gone from the page.
- [ ] In settings, under Panels, choose "Inside the sidebar": settings and the cheat sheet move inside at once. Choose "Beside the sidebar": they move out again.
- [ ] Take the permission back in the browser (Chrome: Details, Site access; Firefox: Permissions tab of the add-on). Open settings: they open inside the sidebar. Choose "Beside the sidebar" under Panels: the browser asks again.
- [ ] Fresh start again, and this time click "Not now, open them inside" on the card: settings open inside the sidebar, no browser prompt shows, and everything else works as before. Reopen the sidebar: the card doesn't come back.
- [ ] Fresh start, decline the browser's prompt after Allow: settings open inside the sidebar.
- [ ] After allowing, + and "New note for this page" on a new page doesn't ask for the tabs permission again: the page's title fills in.
- [ ] Firefox with the sidebar on the left (View, Sidebar, Move sidebar to left): the panels open on the left edge of the page, next to the sidebar.
- [ ] With the panels beside the sidebar, in devtools for the web page, Network: nothing is sent anywhere by Glacier. Elements: Glacier added only its own `glacier-panels` element.

### Delete this note

- [ ] Open a note and open the ⋯ This note menu after the title: "Delete" is there, and hovering shows "Remove this note for good".
- [ ] Click it: the sidebar asks "Delete 'title'? It is also removed from your Notes repo." with Delete and Keep. No browser dialog shows.
- [ ] Click Keep: the note comes back as it was. Do it again and press Esc: same result.
- [ ] Click Delete: the sidebar shows the note of the tab you are on, or the empty paper for a new note if that page has none.
- [ ] The deleted note is gone from the menu, recent notes and search, and the previous note button skips it.
- [ ] Another note that linked to it now shows that link as a Missing Link.
- [ ] After a sync, the note's file is gone from the Notes repo on GitHub, and it does not come back after another sync.

### Archive

- [ ] Open a note and open the ⋯ This note menu after the title: "Archive" is there, and hovering shows "Hide this note from your lists. You can bring it back any time".
- [ ] Click it: the note leaves the Notebook list, recent notes and search. On a page that had only this note, the empty paper for a new note shows.
- [ ] Open the pill menu: an "Archive" section is at the bottom, folded shut. Open it and the archived note is listed.
- [ ] Click the archived note: a small "Archived" label shows in the pill, and the ⋯ This note menu has "Unarchive" instead of "Archive".
- [ ] Click Unarchive: the label goes, and the note is back in its Collection (or No Collection) in the list.
- [ ] A link to an archived note in another note still opens it.
- [ ] After a sync, the archived note's file is under the archive folder on GitHub (for example archive/collections/Collection name/Title.md), and it moves back out after Unarchive and a sync.
- [ ] In Settings, Notes repo, under Backup: "Export archive" downloads a zip with only the archived notes.
- [ ] "Export everything" includes archived notes, and "Restore from backup file" brings them back as archived.

### A short conflict message with Check them

Make a conflict first (see Conflict Copies, #16).

- [ ] A short line shows under the pill: "A note has two versions. Check it". It does not mention files or the Notes repo. With two conflicts it says "2 notes have two versions. Check them". The × closes it until a new conflict (#70).
- [ ] The dot in the pill is orange while the line shows.
- [ ] Hover the line: "See each note next to its second version".
- [ ] Click the line: the pill menu opens with only the notes with two versions, each original with its second version under it. Click one to open it.
- [ ] Delete the last copy (the ⋯ This note menu, "Delete"): the line goes away and the dot turns normal.
- [ ] Make another conflict and archive the copy instead: the line goes away and the dot turns normal.

### Why a panel opens inside the sidebar

Reload the extension with the reload button first. In Settings, Panels, choose "Beside the sidebar".

- [ ] On a new tab, open Settings: it opens inside the sidebar with the line "This page doesn't allow panels beside the sidebar, so it opens here." at its top.
- [ ] On a new tab, open the shortcuts panel: it shows the same line at its top.
- [ ] On a website such as the Odin Project, Settings and the shortcuts panel open beside the sidebar with no line.
- [ ] Choose "Inside the sidebar": on a website and on a new tab, no line shows.
- [ ] Take the permission back in the browser's extension settings: no line shows on a new tab.

### Making a note: write straight away, no form

Reload the extension with the reload button first.

- [ ] Open a website that has no note: the sidebar shows the ruled paper with one faded line, "No note for this page yet. Just start writing." The pill shows the page's title, faded. Nothing looks like a web form: no boxes, no big buttons, no heading.
- [ ] Click the paper and type a letter: the note exists now, with the page's title in the pill (no longer faded) and the line "Collection · site ↗" above the text, with the last used Collection.
- [ ] On another website with no note, click the paper but type nothing, then switch tabs and back: no note was made (it is not in the pill menu).
- [ ] Open a note, then + and "New note": the pill shows "Title" faded, ready to type. Type a name and press Enter: the caret drops onto the first line. Write something, and the note is in the menu under that name, never "Untitled".
- [ ] + and "New note" again, then press Esc: the note from before comes back and nothing was made.
- [ ] On a website, + and "New note for this page": the page's title is in the pill, all selected. Press Enter to keep it, and the note is made.
- [ ] On a settings page, + and "New note": type a name, press Enter, write. The note has no site link.
- [ ] Make a note for a page whose title another note already has: it gets the Collection in brackets after the title.
- [ ] Hover the Collection above the text: "Move to another collection". Click it: a small list opens right there, the last used Collection first and "+ New collection" at the bottom. Pick another Collection: the line shows it and the note is under that Collection in the menu.
- [ ] Click the Collection, then "+ New collection": the line turns into a field. Type a name and press Enter: the note moves to that new Collection. Esc in the field changes nothing.
- [ ] After a sync, the note's file moved to the new Collection's folder in the Notes repo, and the old one is gone.
- [ ] The link shows the site, for example "youtube.com ↗" (no www). Hover it: the full address shows.
- [ ] With the page open in a tab (also in another window), click the link: Glacier switches to that tab. Close the page's tab and click again: it opens in a new tab.
- [ ] Without the permission to see pages, the link always opens a new tab.
- [ ] The pill menu's "+ New note" also opens a fresh page with the title ready to type, filled in with what was in the search box.

### Sync cut off when the sidebar closes

- [ ] Reload the extension with the reload button, then press "Clear all" in the errors list.
- [ ] Type in a note, close the sidebar at once, then open it again. No "sync failed" shows in the errors list, and the change arrives on GitHub.
- [ ] Rename a note and archive a note. Both arrive on GitHub.
- [ ] Turn the network off and type. The pill says Offline and the console shows one warning with the cause, not one per retry. Turn it back on and the change syncs.

### Two menus: Notebook and This note

- [ ] Reload the extension with the reload button first. Open a note: the pill shows the title, ▾, ⋯ and the dot. Hovering ⋯ shows "Actions for this note".
- [ ] Open ▾ (or press Ctrl+K): it has only notebook things (search, recent notes, the lists, Archive, Sync). There is no Download, Archive or Delete for the open note.
- [ ] Open ⋯: the first line is the open note's name, then "Download as a file", "Archive" and "Delete". Each works on the open note.
- [ ] On an archived note, ⋯ shows "Unarchive" instead of "Archive".
- [ ] Click Delete: the question names the note, with Delete and Keep.
- [ ] With no note open (empty paper for a new note), ⋯ is not shown.
- [ ] Esc closes either menu. Opening ▾ closes ⋯, and opening ⋯ closes ▾.

### Fixes from the code review

- [ ] Open a note, press + and "New note", then click the paper and write "Box model basics" without typing a title: the note in the pill menu is called "Box model basics", never "Untitled".
- [ ] Do the same with a first line that starts with "# " and a bold word: the title has no marks in it.
- [ ] Make a conflict, then open the copy and delete it from ⋯ This note: the conflict line goes away and the dot turns normal at once, before any sync. Do the same with Archive.
- [ ] Close the sidebar while it says Syncing, then open it again: it ends on Synced, Offline or Conflict, never stays on Syncing.
- [ ] Rename a note and archive a note, then sync: both arrive on GitHub as one commit each.
