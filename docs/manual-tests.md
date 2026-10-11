# Manual tests

Everything in Glacier that only a person can check, by clicking and typing in the browser. The robots test the logic with `node --test`, but they can't open Chrome or Firefox.

**How to use this list**

- Reload Glacier first: ↻ in `chrome://extensions` and in Firefox `about:debugging`.
- Do each test in **both** Chrome and Firefox.
- Section 1 is what still needs a first check. Section 2 is the full list, for a check of everything before a release (#41) or after a big change.
- You need: two websites (an article and a video work well), a new tab, and a settings page (`chrome://settings` or `about:preferences`).

## 1. Still to test

### Archive (#58)

- [ ] Open a note and open the pill menu: "Archive this note" is there, and hovering shows "Hide this note from your lists. You can bring it back any time".
- [ ] Click it: the note leaves the Notebook list, recent notes and search. On a page that had it as its Lesson note, the "+ Lesson note" button shows.
- [ ] Open the pill menu: an "Archive" section is at the bottom, folded shut. Open it and the archived note is listed.
- [ ] Click the archived note: a small "Archived" label shows in the pill, and the menu has "Unarchive" instead of "Archive this note".
- [ ] Click Unarchive: the label goes, and the note is back in its Course (or Concepts) in the list.
- [ ] A link to an archived note in another note still opens it.
- [ ] After a sync, the archived note's file is under the archive folder on GitHub (for example archive/courses/Course name/Title.md), and it moves back out after Unarchive and a sync.
- [ ] In Settings, Notes repo, Backup: "Export archive" downloads a zip with only the archived notes.
- [ ] "Export everything" includes archived notes, and "Restore from backup file" brings them back as archived.

### Delete this note (#57)

- [ ] Open a note and open the pill menu: "Delete this note" is there, and hovering shows "Remove this note for good".
- [ ] Click it: the sidebar asks "Delete 'title'? It is also removed from your Notes repo." with Delete and Keep. No browser dialog shows.
- [ ] Click Keep: the note comes back as it was. Do it again and press Esc: same result.
- [ ] Click Delete: the sidebar shows the note of the tab you are on, or the "+ Lesson note" button if that page has none.
- [ ] The deleted note is gone from the menu, recent notes and search, and the previous note button skips it.
- [ ] Another note that linked to it now shows that link as a Missing Link.
- [ ] After a sync, the note's file is gone from the Notes repo on GitHub, and it does not come back after another sync.

### A create form stays until you leave it (#56)

- [ ] Open a note, then a website with no note, and click "+ Lesson note": the form shows. Click on the paper, on empty space and on the pill: the form stays.
- [ ] Click Cancel: the note from before comes back. Do it again and press Esc: same result.
- [ ] Open the form with no note open before it: Cancel shows the page's note if it has one, otherwise the "+ Lesson note" button.
- [ ] Open the "New note" form from the + menu, click the paper, then Create note: the new note opens.
- [ ] With the form open, switch to another website tab: Glacier follows the tab as before.

### Panels beside the sidebar (#21)

- [ ] Remove Glacier and load it again: installing shows no permission warning. In Chrome, `chrome://extensions`, Details, Site access shows no sites.
- [ ] Open a website and click the round glacier button: Glacier's own card shows in the sidebar first, saying what it is for and that Glacier never reads, saves or sends anything from the pages you visit. No browser prompt yet.
- [ ] Press Esc on the card: it closes and nothing is chosen. Click the glacier button again: the card shows again.
- [ ] Click Allow: now the browser's prompt shows. Accept it: settings open next to the sidebar, over the right edge of the web page. The note in the sidebar keeps its full width.
- [ ] With settings beside the sidebar, change the paper, the font and drag the text size: the note changes at once, also while you drag.
- [ ] Change "Tabs and notes", the previous note button and the Shortcuts panel beside the sidebar: each one works at once in the sidebar.
- [ ] Turn the Shortcuts panel on: the cheat sheet shows beside the sidebar too, to the left of settings. Close settings: the cheat sheet moves to the edge of the page.
- [ ] Fold the cheat sheet with its arrow: a slim Shortcuts tab stays on the edge of the page. Click the tab: it opens again.
- [ ] Close settings with the ×, with Esc, with the glacier button and by clicking in the note. Each way closes them.
- [ ] Under Notes repo beside the sidebar: Sync now, Export a course, Export everything and Restore from backup file all work, and the downloads and messages show in the sidebar. With no repo connected, connecting one shows the first sync steps beside the sidebar.
- [ ] Switch to another website tab with settings or the cheat sheet open: they go with you. Go back: they are there and not left behind on the other tab.
- [ ] Follow a link in the page: after it loads, the panels come back beside the sidebar.
- [ ] On a new tab, a browser settings page (`chrome://settings` or `about:preferences`) and a PDF, open settings: they open inside the sidebar. Switch back to a website: they move beside it.
- [ ] Close the sidebar with settings or the cheat sheet beside it: within a few seconds they are gone from the page.
- [ ] In settings, under Panels, choose "Inside the sidebar": settings and the cheat sheet move inside at once. Choose "Beside the sidebar": they move out again.
- [ ] Take the permission back in the browser (Chrome: Details, Site access; Firefox: Permissions tab of the add-on). Open settings: they open inside the sidebar. Choose "Beside the sidebar" under Panels: the browser asks again.
- [ ] Fresh start again, and this time click "Not now, open them inside" on the card: settings open inside the sidebar, no browser prompt shows, and everything else works as before. Reopen the sidebar: the card doesn't come back.
- [ ] Fresh start, decline the browser's prompt after Allow: settings open inside the sidebar.
- [ ] After allowing, "+ Lesson note" on a new page doesn't ask for the tabs permission again: the page's title fills in.
- [ ] Firefox with the sidebar on the left (View, Sidebar, Move sidebar to left): the panels open on the left edge of the page, next to the sidebar.
- [ ] With the panels beside the sidebar, in devtools for the web page, Network: nothing is sent anywhere by Glacier. Elements: Glacier added only its own `glacier-panels` element.

### Shortcuts panel (#20)

- [ ] Open settings, then Shortcuts panel. It starts as Off, and no cheat sheet shows.
- [ ] Choose On: a Shortcuts sheet appears on the right edge of the sidebar (or beside it, with "Beside the sidebar" chosen under Panels, #21). It lists the start of a line (/, #, ##, ###, -, three backticks), anything in a line ([[Title]], bold, code) and the keys (Enter, Backspace, up and down, Esc, Ctrl A twice, Ctrl C, Ctrl K).
- [ ] Click the arrow in its header: it folds into a slim tab on the edge. Click the tab: the sheet opens again.
- [ ] Fold it, close and reopen the sidebar: it is still folded. Open it, reopen the sidebar: it is still open.
- [ ] Choose Off in settings: the sheet and the tab both go away. Choose On again: it comes back as you left it.

### Nature papers and pixel art (#19)

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

### Tabs and notes settings (#53)

- [ ] Open settings and fold open "Tabs and notes". It has three choices: when I switch tabs, on a page that isn't a website, and the previous note button.
- [ ] Leave "When I switch tabs" on "Show the note of the tab I'm on". Open a note from the menu, then switch to a website tab: the note of that tab shows.
- [ ] Choose "Keep a note I opened myself", open a Concept Note from the menu, then switch tabs: the note stays, without reopening the sidebar.
- [ ] Leave "On a page that isn't a website" on "Keep the open note", then switch to a new tab: the note stays. Choose "Show a new note form" and switch to a new tab again: the new note form shows.
- [ ] Choose "Hidden" for the previous note button: the ← button leaves the pill at once. Choose "Shown": it comes back when there is a note to go back to.
- [ ] Close the sidebar and open it again: all three choices are still as you left them.

### Settings, Classic papers and handwriting (#18)

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

### Rename by clicking the title (#54)

- [ ] Click the title in the pill. It becomes a text field with the whole title selected. Hovering the title shows "Click to rename".
- [ ] Type a new name and press Enter: the pill shows it, the note stays open, and links in other notes follow.
- [ ] Click the title, change it, then click elsewhere on the page: it is saved too.
- [ ] Click the title, change it, press Esc: the old title comes back.
- [ ] Rename to a name another note has: the field stays open and a hint under the pill says "That name is taken. Use ...?". Clicking the suggested name fills it in and saves.
- [ ] Clear the field and press Enter: the hint says "Type a name for this note."
- [ ] The small ▾ after the title opens the menu, and so does Ctrl+K and a click on the bare part of the pill. The menu has no Rename item.

### Export: this note, a course, or everything (#55)

- [ ] Open the pill menu: "Download this note" sits at the bottom. Open settings (the round glacier button), then Notes repo: under a small "Backup" heading are a Course list, "Export a course", "Export everything" and "Restore from backup file". Hovering each shows what it does.
- [ ] "Download this note" saves one `.md` file named after the note's title, with its text.
- [ ] Pick a Course and press "Export a course": the zip has only that Course's notes.
- [ ] "Export everything" downloads a zip of every note, as before.
- [ ] "Restore from backup file" works as before (see section 2).

### Connect GitHub and the first sync (#14)

You need a private GitHub repo for your notes and a fine grained token for it (GitHub, Settings, Developer settings, Fine grained tokens), limited to that repo with Contents set to read and write. Put a few notes in it first, for example from an Export zip, in `courses/` and `concepts/`.

- [ ] Open the pill menu: under a small "Sync" heading at the bottom there is a "Notes repo" button. It opens settings at Notes repo, with Repo and Token fields and a short text about the token.
- [ ] The × in the settings header returns to the note that was open.
- [ ] Type the repo as `yourname/notes` (pasting its GitHub address works too), paste the token, press "Connect and sync". A screen shows Connecting to GitHub, then Downloading 1 of N notes counting up, then Linking notes, then Ready, and says how many notes came in.
- [ ] "Start writing" closes settings. Every note from the repo is in the menu, with its Course, text and backlinks.
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

### Conflict Copies (#16)

Connect the same Notes repo in Chrome and in Firefox first (see #14).

- [ ] Turn the network off in Firefox (devtools, Offline). Change the same note in both browsers, with different text. Turn Firefox's network on again and let it sync. Both texts are kept: the note has Firefox's text, and a second note "Title (conflict date)" with today's date has Chrome's text. Both files are on GitHub.
- [ ] The dot turns orange. Hovering it says "Conflict" and names the note marked conflict. The Sync line in the pill menu says the same.
- [ ] Type something or press "Sync now": the dot stays orange while the copy is there.
- [ ] Open Chrome's sidebar: it also has both notes and an orange dot.
- [ ] Rename the copy by clicking its title in the pill (for example to "Margins old"). A few seconds later the dot turns green.
- [ ] Make another conflict, then delete the copy's file on GitHub and press "Sync now": the copy is gone from the menu and the dot turns green.
- [ ] Change the same note in both browsers to exactly the same text: no copy appears.

### A rename syncs as one commit (#17)

Connect a Notes repo first (see #14).

- [ ] Make two notes that link to a third with [[Its title]]. Wait for the dot to turn green.
- [ ] Rename the third note by clicking its title in the pill. When the dot is green again, open the repo's commits on GitHub: there is one new commit with the renamed file, the old file gone, and both notes with the new Link.
- [ ] Type in a single note and let it sync: that change is one commit too.
- [ ] In a new empty repo, connect and let your notes sync: everything arrives, in at most two commits.
- [ ] Turn the network off (devtools, Offline) and rename a linked note. On GitHub nothing changes. Turn the network on again: the rename arrives as one commit.

## 2. Everything

### Opening Glacier

- [ ] The toolbar button shows the glacier picture and opens Glacier.
- [ ] Alt+Shift+G opens Glacier, and pressing it again closes it. Try it from the web page and while typing in a note.
- [ ] Type something, close with the shortcut right away, reopen: the text is still there.
- [ ] When the sidebar opens, the cursor is already in the note.

### Permission and first start

- [ ] Fresh start without the permission: only a "+ Lesson note" button shows.
- [ ] Click it: Glacier's own card explains the permission. **Allow** shows the browser's prompt, and then the page's note or form.
- [ ] **Not now** leads to a form for a note made by hand.
- [ ] Installing shows no permission warning. The first time settings open, Glacier's own card explains drawing beside the sidebar, and the browser asks only after **Allow** (#21).
- [ ] Allowed, settings and the cheat sheet open beside the sidebar on websites and inside it on browser pages. Declined, they open inside. Settings, Panels changes it later.

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

### Export and Import

- [ ] A Lesson note with a Course and a website shows a small "Course · source ↗" line above its text, and no `---` lines. Clicking "source ↗" opens the lesson in a new tab.
- [ ] A Lesson note made by hand (no website) shows only its Course. A Concept note shows no such line.
- [ ] Open settings, then Notes repo: "Export everything" and "Restore from backup file" sit under "Backup", and hovering shows what they do.
- [ ] "Export everything" downloads a zip named "Glacier notes" with the date.
- [ ] Unzip it: Lesson notes are in `courses/<Course>/`, Concept notes in `concepts/`, each file named after its title with a short block of details at the top.
- [ ] In Obsidian, "Open folder as vault" on the unzipped folder: the notes open and clicking a Link goes to the other note.
- [ ] Restore from that zip again: a message says no notes were added and all were already here, and nothing changed.
- [ ] Change a note, then restore from the older zip: your note keeps your change, and the older text appears as a second note with "(imported" and the date in its title.
- [ ] Restore from a zip in a fresh Glacier (or another browser): every note comes back with its text, Course and website.
- [ ] Restore from a file that isn't a zip: a message says it couldn't be read, and nothing changed.
