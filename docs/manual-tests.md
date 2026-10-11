# Manual tests

Everything in Glacier that only a person can check, by clicking and typing in the browser. The robots test the logic with `node --test`, but they can't open Chrome or Firefox.

**How to use this list**

- Reload Glacier first: ↻ in `chrome://extensions` and in Firefox `about:debugging`.
- Do each test in **both** Chrome and Firefox.
- Section 1 is what still needs a first check. Section 2 is the full list, for a check of everything before a release (#41) or after a big change.
- You need: two websites (an article and a video work well), a new tab, and a settings page (`chrome://settings` or `about:preferences`).

## 1. Still to test

### Rename by clicking the title (#54)

- [ ] Click the title in the pill. It becomes a text field with the whole title selected. Hovering the title shows "Click to rename".
- [ ] Type a new name and press Enter: the pill shows it, the note stays open, and links in other notes follow.
- [ ] Click the title, change it, then click elsewhere on the page: it is saved too.
- [ ] Click the title, change it, press Esc: the old title comes back.
- [ ] Rename to a name another note has: the field stays open and a hint under the pill says "That name is taken. Use ...?". Clicking the suggested name fills it in and saves.
- [ ] Clear the field and press Enter: the hint says "Type a name for this note."
- [ ] The small ▾ after the title opens the menu, and so does Ctrl+K and a click on the bare part of the pill. The menu has no Rename item.

### Export: this note, a course, or everything (#55)

- [ ] Open the pill menu: "Download this note" sits at the bottom, and under a small "Backup" heading are a Course list, "Export a course", "Export everything" and "Restore from backup file". Hovering each shows what it does.
- [ ] "Download this note" saves one `.md` file named after the note's title, with its text.
- [ ] Pick a Course and press "Export a course": the zip has only that Course's notes.
- [ ] "Export everything" downloads a zip of every note, as before.
- [ ] "Restore from backup file" works as before (see section 2).

### Connect GitHub and the first sync (#14)

You need a private GitHub repo for your notes and a fine grained token for it (GitHub, Settings, Developer settings, Fine grained tokens), limited to that repo with Contents set to read and write. Put a few notes in it first, for example from an Export zip, in `courses/` and `concepts/`.

- [ ] Open the pill menu: under a small "Sync" heading at the bottom there is a "Notes repo" button. It opens a form in the sidebar with Repo and Token fields and a short text about the token.
- [ ] "Back to my notes" returns to the note that was open.
- [ ] Type the repo as `yourname/notes` (pasting its GitHub address works too), paste the token, press "Connect and sync". A screen shows Connecting to GitHub, then Downloading 1 of N notes counting up, then Linking notes, then Ready, and says how many notes came in.
- [ ] "Start writing" goes back. Every note from the repo is in the menu, with its Course, text and backlinks.
- [ ] Typing just "notes" (no owner) says to type it as owner and name.
- [ ] A wrong token says GitHub didn't accept it. A repo name that doesn't exist says it couldn't find that repo. Nothing in the Notebook changes.
- [ ] With the network off (devtools, Offline), it says it couldn't reach GitHub.
- [ ] Open "Notes repo" again: it says which repo is connected, the repo is filled in and the token field says it is saved. Change the repo and sync again without pasting the token.
- [ ] A note you already had with different text is kept, and the repo's version shows up next to it as "Title (conflict date)".
- [ ] The token is in neither the repo nor an Export zip. It shows only in the extension's storage (devtools of the sidebar, Application or Storage, Extension storage).

### Automatic two way sync (#15)

Connect the same Notes repo in Chrome and in Firefox first (see #14).

- [ ] Type in a note in Chrome and stop. A few seconds later the dot in the pill turns green. Hovering it says "Synced" and when the last sync was. On GitHub the note's file has your text.
- [ ] While it syncs the dot pulses. Hovering it says "Syncing".
- [ ] Open Firefox's sidebar: the note shows the text from Chrome. If it was already open on screen, it shows the new text after a moment.
- [ ] Make a new note in Chrome, then open the sidebar in Firefox: the note is there. Rename it in Firefox, open Chrome's sidebar again: it has the new name, and on GitHub the old file is gone.
- [ ] Turn the network off (devtools, Offline) and type. The dot becomes an empty ring and hovering it says "Offline" and that your changes are kept. Turn the network on again: the dot turns green and GitHub has the text.
- [ ] Change the same note in both browsers while one of them is offline, then let both sync. The dot turns orange, hovering says "Conflict", and the other text is kept as "Title (conflict date)".
- [ ] Open the pill menu: under "Sync" is a short line with the status and the last sync, and a "Sync now" button. Pressing it shows "Synced just now." for a moment.
- [ ] Revoke or delete the token on GitHub, then type or press "Sync now": the dot turns red and the message says GitHub no longer accepts your token, it may have expired, and to paste a new one in Notes repo. Pasting a new token there makes it sync again.
- [ ] Without a Notes repo connected, the dot stays as before, hovering it says "Saved in this browser", and there is no "Sync now".

## 2. Everything

### Opening Glacier

- [ ] The toolbar button opens Glacier.
- [ ] Alt+Shift+G opens Glacier, and pressing it again closes it. Try it from the web page and while typing in a note.
- [ ] Type something, close with the shortcut right away, reopen: the text is still there.
- [ ] When the sidebar opens, the cursor is already in the note.

### Permission and first start

- [ ] Fresh start without the permission: only a "+ Lesson note" button shows.
- [ ] Click it: Glacier's own card explains the permission. **Allow** shows the browser's prompt, and then the page's note or form.
- [ ] **Not now** leads to a form for a note made by hand.

### Notes for the page you're on

- [ ] On a website without a note, "+ Lesson note" shows. The new note gets the page title, and the last used Course is already picked.
- [ ] Reopening the sidebar on that page opens the same note again.
- [ ] Two videos on the same site (different `?v=`) get different notes.
- [ ] The same page with `#part-2` or `?utm_source=mail` at the end opens the same note.

### Switching tabs

- [ ] Switching to another website shows its note, or its "+ Lesson note" form. That happens whatever note was open, including one you just made or opened from the pill.
- [ ] Switching back shows the first tab's note again.
- [ ] On a new tab or a settings page, the open note stays.
- [ ] Switching quickly between several tabs always ends on the note of the tab you're on.
- [ ] Text typed just before switching is saved in the right note.

### The pill at the top

- [ ] The pill shows the note's title and a sync dot. Its colour shows the sync status, and hovering it says the status in words (#15).
- [ ] Clicking the ▾ after the title, the bare part of the pill, or pressing Ctrl+K, opens the menu with the search box ready.
- [ ] Search finds words in titles and in the text, with the match highlighted. Clicking a result opens it and closes the menu.
- [ ] Recent notes are listed, including notes made by hand.
- [ ] The Notebook is listed: Courses with their Lesson notes, and Concepts.
- [ ] Esc closes the menu.
- [ ] `←` appears after the note changed. Hovering shows "Back to: <title>". Clicking goes back one note, and clicking again goes further back.
- [ ] `+` is always there. On a website it offers "Lesson note for this page" and "Concept note". On a settings page it offers "New note" and "Concept note".
- [ ] Hovering over Lesson note or Concept note (in `+` and in the menu) shows a short explanation.

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
- [ ] Clicking a link opens that note. Clicking a missing link creates a Concept note with that name and opens it.
- [ ] Concept notes have no Course.
- [ ] Note A contains `[[B]]`. Open B: a small button at the bottom left shows `1`.
- [ ] Click it: A is listed. Click A: it opens.

### Renaming

- [ ] Click the title in the pill, give B a new name and press Enter. In A the link now shows the new name.
- [ ] Renaming to a name that's already taken is refused, and a free name is suggested.
- [ ] After a rename the note stays open and its backlinks still work.

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

### Export and Import

- [ ] A Lesson note with a Course and a website shows a small "Course · source ↗" line above its text, and no `---` lines. Clicking "source ↗" opens the lesson in a new tab.
- [ ] A Lesson note made by hand (no website) shows only its Course. A Concept note shows no such line.
- [ ] Open the pill menu: "Export everything" and "Restore from backup file" sit at the bottom under "Backup", and hovering shows what they do.
- [ ] "Export everything" downloads a zip named "Glacier notes" with the date.
- [ ] Unzip it: Lesson notes are in `courses/<Course>/`, Concept notes in `concepts/`, each file named after its title with a short block of details at the top.
- [ ] In Obsidian, "Open folder as vault" on the unzipped folder: the notes open and clicking a Link goes to the other note.
- [ ] Restore from that zip again: a message says no notes were added and all were already here, and nothing changed.
- [ ] Change a note, then restore from the older zip: your note keeps your change, and the older text appears as a second note with "(imported" and the date in its title.
- [ ] Restore from a zip in a fresh Glacier (or another browser): every note comes back with its text, Course and website.
- [ ] Restore from a file that isn't a zip: a message says it couldn't be read, and nothing changed.
