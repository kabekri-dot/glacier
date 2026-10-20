# Manual tests

Everything in Glacier that only a person can check, by clicking and typing in the browser. The robots test the logic with `node --test`, but they can't open Chrome or Firefox.

**How to use this list**

- Reload Glacier first: ↻ in `chrome://extensions` and in Firefox `about:debugging`.
- Do each test in **both** Chrome and Firefox.
- Section 1 is what still needs a first check. Section 2 is the full list, for a check of everything before a release (#41) or after a big change.
- You need: two websites (an article and a video work well), a new tab, and a settings page (`chrome://settings` or `about:preferences`).

## 1. Still to test

### Find in the open note (#111)

- [ ] With the caret in a note, press Ctrl F (Cmd F on a Mac): a small find line shows under the pill with a text field, no count yet, and ↑ ↓ buttons. The field is ready to type in.
- [ ] Type a word that appears several times, in capitals or not: every match gets a soft mark, the current one a little stronger, and the line says "1 of 4". A word inside bold, a heading or a link is found too.
- [ ] Type a word that is not in the note: the line says "No match".
- [ ] Press Enter or ↓: the next match becomes the current one and the paper scrolls to it. Shift Enter or ↑ goes back. After the last match it goes round to the first.
- [ ] Words inside a sketch are not found.
- [ ] Press Ctrl F again with the box open: the text in the field is selected.
- [ ] Press Esc: the box and the marks go, and the caret is at the current match. Do it again with a word that has no match: the caret stays where it was.
- [ ] Open the find box, then open the ▾ menu, or open another note: the box closes.
- [ ] On a web page (not in Glacier), Ctrl F still opens the browser's own find.

### Numbered lists and checkboxes (#110)

- [ ] Type `1. first`, Enter: a new line starts with `2. `. Type `second`, Enter, Enter on the empty item: the list ends. Click away: the items show as 1. and 2.
- [ ] Type `5. a`, Enter, `b`, then click away: the list shows 1. and 2. while the note file keeps what you typed.
- [ ] At the start of a numbered item, press Backspace: the number goes and the words stay.
- [ ] Type `- [ ] milk`, Enter: a new `- [ ] ` starts. Enter on the empty one ends the list.
- [ ] Click away from a checkbox line: a small hand-drawn empty box shows, with no system checkbox look. Click the box: it shows a tick and the words turn a little fainter. Click again: it is empty again. The caret does not jump there, and the change is saved.
- [ ] Type `/` on an empty line: the menu has "Numbered list" and "Checkbox list". Pick each one.
- [ ] Select some list lines and copy: the Markdown (`1. ` and `- [x] `) is what you paste. Export keeps it too.
- [ ] In the Shortcuts panel, under Start of a line, "1." and "- [ ]" are listed.

### Secret notes with a passcode (#109)

- [ ] Open a note with some text, ⋯, Make secret. A card asks you to choose your Glacier passcode, typed twice, with the line "If you forget this passcode, your secret notes can't be opened again. Nobody can recover it."
- [ ] Type two different passcodes: it says they are not the same. Type the same one twice and press Enter: the note stays on screen as it was, "This note is secret now." shows, and a small pixel lock sits before the title in the pill.
- [ ] Ctrl K: the note has the lock before its title in the menu, in search results and in the ← box.
- [ ] Make a second note secret: it doesn't ask for the passcode again.
- [ ] Close the sidebar and open it again, then open a secret note: the paper shows "This note is secret" with one passcode field and Open, and no text.
- [ ] Type a wrong passcode: "That passcode doesn't open this note." Type the right one: the note opens with its text.
- [ ] Leave the sidebar open without typing for 10 minutes: the open secret note locks again and shows the passcode field.
- [ ] While it is locked: Ctrl K and `//` with a word from inside it finds nothing; its title still finds it. The backlinks button doesn't show, and a note it links to doesn't list it as a backlink.
- [ ] While it is locked: ⋯, Download as a file, Print. It asks for the passcode first; Cancel puts the paper back. After the passcode the print window shows the text, and Markdown saves the file still encrypted.
- [ ] Clip text from a page while a locked secret note is open: nothing goes in, and a line says to type the passcode, then clip again.
- [ ] Select text in an open secret note and Extract it: the new note has the lock too.
- [ ] Sync, then look at the note's file in Google Drive, the folder or GitHub: `secret: true` in the frontmatter and one ```` ```glacier-secret ```` block with no readable text. Same in a Download everything zip.
- [ ] In the other browser, after it syncs, the note is locked; your passcode opens it.
- [ ] Settings, Secret notes: type a wrong current passcode, it says so. Type the right one and a new one twice: "Done. Your secret notes now open with the new passcode." Close the sidebar and open it: the old passcode doesn't open the note, the new one does.
- [ ] ⋯, Make not secret: the lock goes away, and after a sync the file shows the text again.
- [ ] Do this in Chrome and Firefox, with settings inside and beside the sidebar.

### Notes as pages, turned with a pixel page flip (#108)

- [ ] Type `/page` at the start of a line: the menu shows Page break with `%%page%%`. Pick it: a dotted line with "page 2" on it appears, and the caret is on the line under it.
- [ ] With the setting off (the start), every page shows one after the other, each break a quiet dotted line with its page number. Click the dotted line: it shows `%%page%%` to edit.
- [ ] Backspace at the start of the line under a break takes the break out and joins the two pages. Delete at the end of the line above a break does the same.
- [ ] A `%%page%%` line inside a code block stays code and makes no new page.
- [ ] Settings, Writing, Notes as pages: choose "On, one page at a time". The paper shows only the page with the caret, as long as its text, and at the top, on the right of the "Add to a collection" line, a quiet ‹ 1 of 3 › and a small bin.
- [ ] Click › and ‹: the page turns. ‹ is faded on page 1. On the last page › reads "+ New page", and clicking it adds an empty page with the caret on it.
- [ ] Click the bin on page 2 of 3: the bar asks "Delete page 2?" with Delete and Keep. Keep changes nothing; Delete takes the page and its text away and shows the page before. Ctrl Z brings it back. A note of one page shows no bin.
- [ ] Ctrl PageDown and Ctrl PageUp turn the page too (Cmd on a Mac). Note whether the browser lets them through or switches tabs instead, in Chrome and in Firefox.
- [ ] The turn: the old page folds up from the bottom right corner and over to the left in eight frames, its edge a pixel staircase with a hard pixel shadow, in under half a second. Turning back runs it the other way, the page before coming down over the old one.
- [ ] Switch on reduce motion in the system settings (or the browser's): the page just changes, with no turn.
- [ ] ↑ on the first line of page 2 goes to the end of page 1; ↓ on the last line of page 1 goes to the start of page 2.
- [ ] Clicking on the paper under a page that isn't the last puts the caret at the end of that page.
- [ ] In a note with a heading on page 3, open the ≡ contents and click that heading: page 3 shows, with the caret at the heading.
- [ ] Ctrl K, search `//` and a word that is only on page 3 of a note, open the result: the note opens on page 3, with no turn.
- [ ] Follow a Link to a note with pages: it opens on page 1.
- [ ] Switch the setting off again: every page shows again, the bar is gone. The note is still one file, on GitHub or Drive and in Obsidian, where the `%%page%%` lines are hidden.
- [ ] The Shortcuts panel lists `%%page%%` and Ctrl PageUp and Ctrl PageDown.
- [ ] Do this in Chrome and Firefox, on Glacier, School Notebook and Aurora.

### Table of contents (#107)

- [ ] In a note with no headings there is no ≡ tab on the left edge of the paper. Type `# First` on a line: the tab appears. Hover text: Contents.
- [ ] Click the tab: a drawer slides in from the left with the headings in order, indented by level (# ## ###), in the note's font. Code blocks with a # line inside add nothing.
- [ ] In a long note, click a heading: the paper scrolls so the heading sits near the top and the caret is at its start. The drawer closes, so the heading is in view.
- [ ] With the drawer open, type a new heading or change one: the list follows as you type. Delete the last heading: the tab and the drawer go away.
- [ ] The drawer closes with a click on the paper, a click on the tab again, or Esc.
- [ ] Ctrl Shift O (Cmd on a Mac) opens and closes the drawer. It is listed in the Shortcuts panel under Keys.
- [ ] Do this in Chrome and Firefox, on a light and a dark paper.

### Montserrat, each font in its own lettering (asked for 2026-10-14)

- [ ] Settings, Writing: every font is one line written in that font (Caveat looks like Caveat, and so on); Theme default shows the paper's font. The last one is Montserrat, a clean sans-serif.
- [ ] Pick Montserrat: the note, the pill and the Collection line switch to it at once, with ä, ö, ü and ß.
- [ ] In a note that has only a drawing, click on the paper under the drawing and type: the text goes on the line under it.

### Sketch blocks: colours and fill (#106)

- [ ] Pick a sketch: after the tools the toolbar shows six round dots (the paper's ink, blue, green, red, orange, purple) and a small half-filled square. The colours look muted, like pencil.
- [ ] Choose blue and draw a box, a circle, an arrow and a text: all four are blue. Choose the first dot: new shapes use the paper's ink again.
- [ ] Pick a shape and choose another dot: that shape changes colour and the others stay.
- [ ] Click the half-filled square, then draw a box, a circle and a triangle: each has a light wash of its colour inside. A line, an arrow and a text get no wash. Click the square again with a shape picked: its wash goes.
- [ ] Do this on Glacier, School Notebook and Aurora: on Aurora the colours are lighter and still easy to read.
- [ ] Reload Glacier and sync: the colours and washes are still there, here and in the other browser.
- [ ] Open the sketch's svg file on GitHub or Drive: the shapes show their colours and washes.
- [ ] Make the sidebar narrow: the dots hide behind one colour button, and clicking it opens them.

### Sketch blocks: a hand-drawn look that feels hand-drawn (#105)

- [ ] Draw a box, a circle, a triangle and an arrow in a sketch on Glacier, School Notebook and Aurora: each looks like a quick pen sketch, every line drawn twice, sides running a little past the corners.
- [ ] The circle is still one smooth round stroke, drawn twice, and the two passes do not quite meet.
- [ ] The lines bow gently and do not zigzag. An arrow head is two quick strokes.
- [ ] Reload Glacier or move a shape: it looks exactly the same as before.
- [ ] Switch to Clean: the lines are exact and unchanged.

### Sketch blocks: hand-drawn or clean look (#103)

- [ ] Draw a rectangle, a circle, a triangle, a line and an arrow in a new sketch: the strokes are slightly wobbly, like a pen.
- [ ] Click outside the sketch and pick it again, or reload Glacier: the wobble looks exactly the same, nothing jitters. Move a shape: its wobble stays the same.
- [ ] In the picked sketch's toolbar, choose Clean in the list at the right: every shape turns into exact straight lines. Choose Hand-drawn: the wobble comes back.
- [ ] Set one sketch to Clean, sync, and open the note in the other browser: it is still clean there. Opening the svg file on GitHub shows the same look.
- [ ] Check both looks on the Glacier, School Notebook and Aurora Themes, in their light and dark papers: the strokes use each Theme's ink colour and stay easy to read.

### Sketch blocks: lines, arrows, text and resizing (#102)

- [ ] Pick a sketch: the toolbar shows Line, Arrow and Text after the four shapes, each with its own small picture and hover text.
- [ ] Draw two boxes. With Arrow, drag from inside the first box to inside the second: an arrow with a head at the second box appears. Do the same with Line.
- [ ] Select one of the boxes and drag it around: the arrows and lines stuck to it follow it. Delete the box: the arrows stay where they were.
- [ ] Draw a line that starts on empty paper: moving a box does not move that end.
- [ ] Pick an arrow: a small square shows on each end. Drag an end onto another box, then move that box: the arrow follows. Drag the end onto empty paper, then move the box: the arrow stays.
- [ ] With Text, click in the sketch and type a label: it is written in the note's handwriting font. Press Enter: the label stays. Press Esc while typing a new label: nothing is added.
- [ ] Double click a label, change the words and click elsewhere: the label shows the new words. Empty a label this way: it goes.
- [ ] Pick a box: a small square shows on each corner. Drag a corner: the box changes size while the opposite corner stays put. Hold Shift while dragging: it keeps its proportions. A square stays square and a label grows with its letters.
- [ ] Draw a small diagram with boxes, arrows and labels, sync, then open the svg file on GitHub: the picture shows the arrows and labels. Open the note in the other browser after a sync: the arrows still follow a moved box.
- [ ] The Shortcuts panel lists Shift for resizing in a sketch, and `/sketch` mentions lines, arrows and text.

### Sketch blocks: the drawing, selection and empty ones (#104)

- [ ] Open a note that starts with a sketch: the caret is on the first line and you see the drawing, not the text between double square brackets.
- [ ] Draw a shape, then click on the text below or press the arrow key down: the grey area, toolbar and dashed frame go and the sketch looks like a drawing on the paper.
- [ ] Press the arrow keys up and down through a note with a sketch: the caret steps over the sketch like over one block. Press Enter on a sketch: an empty line appears after it.
- [ ] Put the caret at the start of the line after a sketch and press Backspace: the sketch is picked. Press Backspace again: it is removed, after a question when it has shapes. Say no to the question: it stays.
- [ ] Press Esc in a picked sketch, or open another note: the sketch is no longer picked.
- [ ] Insert an empty sketch with `/sketch`: it shows a faint dashed outline and the words Click to draw in the middle. Draw a shape: the outline and words go.
- [ ] Insert an empty sketch, leave it empty and open another note, then come back: the sketch is gone from the note.

### Sketch blocks: boxes and circles (#101)

- [ ] In a note, click + at the left of an empty line and pick Sketch: a drawing area appears between the lines, as wide as the text and a few ruled rows high, and the caret goes to the line below. Type `/sketch` and press Enter on another line: a second one appears. The text after them still sits on the ruled lines.
- [ ] Click the drawing area: a small toolbar shows above it with rectangle, square, circle, triangle, select and delete. Hover each button: its name shows.
- [ ] Pick the rectangle and drag in the area: a rectangle is drawn. Do the same with square, circle and triangle. The square and the circle keep equal sides however you drag.
- [ ] Drag a shape: it moves and stays inside the area. Click a shape and press Delete: it goes. Pick another shape and click the delete button in the toolbar: it goes too.
- [ ] Drag the small bar at the bottom of the area down and up: the area gets taller or lower in whole rows, and the text below stays on the lines.
- [ ] Click the text next to the sketch: the toolbar goes away. Press Esc in a picked sketch: the same.
- [ ] Switch to a dark paper such as Chalkboard: the shapes are still easy to see.
- [ ] Open another note and come back, or close and reopen the sidebar: the drawing is still there.
- [ ] Sync, then open the Notes Repo on GitHub: next to the note is a file named like the note with "sketch 1.svg" after it, and opening it shows the picture. The note's text holds a line like `![[My note – sketch 1.svg]]`.
- [ ] In the other browser, sync: the sketch shows in the same note. Move a shape there, sync both: the move arrives.
- [ ] Rename the note: the sketch still shows, and after a sync the svg file on GitHub has the new name. Move the note to a Collection, archive it and unarchive it: the svg file moves with the note each time. Delete the note: the svg file goes too.
- [ ] ⋯ then Download as a file on a note with a sketch: a zip comes with the note and its svg. Export everything, then Restore from backup file in a fresh browser profile: the sketches come back.
- [ ] `/sketch` is listed in the Shortcuts panel, and Delete there mentions removing the picked shape.

### Pin a note, ← in one click (asked for 2026-10-13)

- [ ] Open a website's note: a faint grey pin sits after the title. Click it (or ⋯ → Pin this note): it turns red and the menu does not open. Switch to other tabs and websites (with Tabs and notes set to follow the tab): the pinned note stays. Click the pin again: it turns grey, and the sidebar shows the note of the tab you are on. With no note open there is no pin.
- [ ] Pinned, open another note from the menu: the pin goes with it. Rename the pinned note: it stays pinned.
- [ ] Let a tab switch change the note, then click ← once: you are back on the note before, in one click. Right-click ← (or hold it): the list of your last notes opens.

### Clip highlighted text from a web page (#100)

- [ ] Select a sentence on a web page, right-click and choose Clip to Glacier. With a note open in the sidebar, the sentence appears at its end as a quote, with a line under it linking to the page. A short message says Clipped.
- [ ] Select two or three lines and press Alt Shift C: every line is quoted.
- [ ] Close the sidebar, select text and use the right-click menu: the sidebar opens and the clip is in the note. Do the same with Alt Shift C.
- [ ] Clip on a page you have no note for, with no note open: a new note for that page is made with the clip in it.
- [ ] Right-click with nothing selected: Clip to Glacier is not offered. Alt Shift C with nothing selected does nothing.
- [ ] The clip is saved and synced like typing. Alt Shift C is listed in the Shortcuts panel.

### Extract to a new note (#99)

- [ ] Select one line of text in a note and press Ctrl Shift E (Cmd Shift E on a Mac): the text turns into a link in its place, and a new note with that title exists. You stay in the note you were writing.
- [ ] Select several lines, including a bold or italic word, and use ⋯ then Extract to a new note: one link replaces them, and the new note has all the lines with the formatting kept.
- [ ] Type `/ex` at the start of a line with some text after it and pick Extract to a new note: the text after it becomes the new note and a link replaces it.
- [ ] The new note has the same page and Collection as the note it came from. Open it from the link to check.
- [ ] Extract text whose first line is the title of a note that already exists: the new note gets a free name instead of overwriting.
- [ ] Press Ctrl Z right after: the text comes back and the new note stays.
- [ ] Nothing floats next to the selection. Hover over Extract to a new note in ⋯ with nothing selected: the hover text says to select some text first. Clicking it with nothing selected shows a short message.
- [ ] Ctrl Shift E is listed in the Shortcuts panel.

### Pixel cloud reminder (#98)

Needs a browser where the notes live only in this browser (the default). To start again, clear `cloudReminder` from the extension's storage.

- [ ] With fewer than 3 notes, the sync dot is a tiny pixel cloud and the sync box does not open by itself.
- [ ] Write a 3rd note and wait a few seconds: the sync box opens by itself with a small pixel cloud and "Your notes live only in this browser for now. Give them a safe home." (with "in your Google Drive" once Google Drive is set up), and two buttons, Keep them safe and Not now.
- [ ] Keep them safe closes the box and opens Settings at Where your notes live.
- [ ] Not now closes the box. Write more notes or reopen the sidebar: the box does not open again by itself.
- [ ] Two weeks later (set `lastOpened` in `cloudReminder` back by 15 days) the box opens once more after a change. After that it never opens by itself again.
- [ ] Choose any place under Where your notes live: the cloud on the dot goes and the reminder does not come back.

### A folder on this computer as a Notes Home (#97)

Chrome or Edge only. Have Obsidian (or any text editor) at hand.

- [ ] Open Settings, Where your notes live: "A folder on this computer" is the second choice, with a small pixel folder. In Firefox it is greyed and says "Only in Chrome and Edge", and can't be picked.
- [ ] In Chrome click it: a short text says each note becomes a Markdown file in a folder you pick, with a "Choose a folder" button. Click it: the browser's folder picker opens. Close the picker: nothing changes.
- [ ] Click "Choose a folder" again and pick an empty folder. Chrome may ask to let Glacier edit files there; allow it. One line asks "Your notes will be combined with the ones in your notes folder. Nothing is deleted." Keep leaves the old place chosen. Switch shows Connecting to your notes folder, Downloading, Combining notes and Ready.
- [ ] Open the folder in your file manager: `notes/`, `collections/<Collection>/` and, with archived notes, `archive/` hold one `.md` file per note.
- [ ] Hover the sync dot: "All saved to your notes folder".
- [ ] Edit a note's file in another editor and save it, then press Sync now in the sync box (or close and open the sidebar): the edit comes in.
- [ ] Type in the same note in Glacier and edit its file in another editor before Glacier syncs: after the sync the note has two versions and nothing is lost.
- [ ] Move a note to another Collection: its file moves to the new Collection's folder, and the old Collection's folder goes once it is empty.
- [ ] Open the folder in Obsidian as a vault: the notes and Links show, and Obsidian's own `.obsidian` folder is left alone by Glacier.
- [ ] Close Chrome completely and start it again, open the sidebar and type: the first click or key reconnects the folder without asking, and the note reaches the folder.
- [ ] If Chrome still asks or refuses after a restart: the sync dot becomes a small pixel folder, and its box says "Chrome needs your OK to write to your notes folder again." with one Reconnect button. Notes keep saving in the browser meanwhile. Reconnect asks and syncs.
- [ ] Choose a folder with Settings open beside the sidebar: clicking "Choose a folder" moves Settings inside the sidebar with the folder choice shown; click "Choose a folder" there to pick it. Closing Settings and opening them again puts them beside the sidebar again.
- [ ] Choose "Only in this browser" or GitHub: the folder keeps every file, and Glacier stops writing to it.

### Google Drive as a Notes Home (#95)

Before reloading in Chrome: Glacier now has a fixed extension ID, so Chrome sees it as a new extension with an empty Notebook. Sync or press Export everything first, then after the reload connect the same place again or use Restore from backup file.

- [ ] Open Settings, Where your notes live: "Google Drive" is the first choice, with a small pixel cloud. While `src/google-config.mjs` is still empty it is greyed and says "Not set up yet", and can't be picked.
- [ ] Fill in `src/google-config.mjs` (and the manifest's `oauth2` for Chrome), reload, and click Google Drive: a short text says the notes go into a folder named Glacier and that Glacier only sees its own files, with a "Sign in with Google" button.
- [ ] Click "Sign in with Google": one line asks "Your notes will be combined with the ones in Google Drive. Nothing is deleted." Switch opens Google's sign-in (Chrome may sign in straight away), then shows Connecting to Google Drive, Downloading, Combining notes and Ready.
- [ ] Open drive.google.com: there is one folder named Glacier with `notes/` and `collections/` inside, and each note is a `.md` file you can open.
- [ ] Do the same in Firefox with the same Google account: the notes from Chrome show up. Edit a note in Firefox, then open Chrome's sidebar: the edit comes in. Rename a note: the old file is in Drive's trash and the new one in its folder.
- [ ] Hover the sync dot: "All saved to Google Drive".
- [ ] Close the browser and start it again, open the sidebar: it still syncs without asking to sign in. In Firefox wait more than an hour, then type: it still syncs without asking.
- [ ] Sign out of Google in the browser (or remove Glacier's access at myaccount.google.com, Security, Third party access), wait an hour in Firefox, then type: the dot turns red, the box says Google asks you to sign in again and has one "Sign in with Google" button. Clicking it signs in and syncs.
- [ ] Choose "Only in this browser" or GitHub: after the switch Glacier is signed out of Google, and the Glacier folder in Drive still has every file.
- [ ] Do the same switches in Settings beside the sidebar.

### Where your notes live (#94)

Reload with ↻ first.

- [ ] Open Settings: the last section is called "Where your notes live". It shows the choices "Google Drive", "A folder on this computer", "Only in this browser" and "GitHub", each with a small pixel icon, and Backup under them. It looks calm, with no "For developers" text.
- [ ] With GitHub connected from before, GitHub is chosen and its repo and token form shows right under it. Type a note: it still syncs, and the sync dot says "All saved to GitHub" on hover.
- [ ] Click "Only in this browser": one line asks "Your notes will stay in this browser and stop syncing. Nothing is deleted." with Switch and Keep. Keep leaves GitHub chosen. Switch: the dot turns quiet and says your notes live only in this browser; type a note and check GitHub: nothing new arrives.
- [ ] Close the sidebar and open it again: "Only in this browser" is still chosen.
- [ ] Click "GitHub", press "Connect and sync": the line "Your notes will be combined with the ones in GitHub. Nothing is deleted." asks first. Switch shows Connecting to GitHub, Downloading, Combining notes and Ready. Afterwards the note you typed while only in this browser is on GitHub too, and nothing on GitHub was deleted.
- [ ] Connect another, empty repo the same way: every note shows up there, and the first repo stays as it was.
- [ ] With only this browser chosen, click the sync dot: the box says "Only in this browser" and "Choose where they live" opens this section. Connected, the box's link reads "Where your notes live".
- [ ] Do the same switches in Settings beside the sidebar.

### The sidebar code split into parts (#93)

Nothing should look or work differently. Check each in Chrome and Firefox:

- [ ] ▾ menu: search titles, then `//` and a word inside a note. Collections and page groups fold open and shut. Hover a note row and a Collection heading: the icons show.
- [ ] ▾ menu: click Delete on a Collection, then Keep, then Esc on the question. Click "+ New collection", type a name, press Enter.
- [ ] ⋯ menu: Move to collection…, Download as a file, Archive (then Undo) and Delete (then Keep) each still work. On an archived note it says Unarchive.
- [ ] Download as .md, PDF and Print for a note (row icon and ⋯), for a Collection, and for a Collection inside the Archive section.
- [ ] On a website with two notes and no Collection, hover the page group under No collection, click the move icon and pick a Collection: both notes move.
- [ ] ←, + and the sync dot each open their box, Esc closes it, and opening one closes the one that was open.

### Collections only by choice, page groups (#92)

- [ ] Use a Collection, then on a new website write a note: it is in no Collection (the line above the text says "Add to a collection"). `+` → New note: also none.
- [ ] Put that page's note in a Collection, then make a second note for the same page: it joins that Collection.
- [ ] On another website with no Collection, make two notes. ▾ menu, under No collection: one group with a globe and the page's title, its notes under it, newest first. A page with one note stays a plain row.
- [ ] Hover the group: a move icon on the right. Click it: the Collections and "+ New collection". Pick one: both notes move there and the group is gone. Try "+ New collection" with a new name too. Esc or a click elsewhere closes the list.
- [ ] Sync, then look at the note file on GitHub: it has a `pageTitle:` line under `source:`.

### How Glacier works opens the welcome page (#91)

- [ ] Open a note, open the Shortcuts panel with `?` and click "How Glacier works" (dotted underline): the panel folds and the full welcome shows on the paper, with the pixel picture, greeting, three lines with icons, Start writing and the tip. The note's Collection line and backlinks are hidden while it shows.
- [ ] Click Start writing: you are back in the same note with the cursor in it. Show it again and press Esc: the same.
- [ ] Do it on School Notebook and Aurora: the day and the night picture. Do it with no note open: Start writing gives the fresh page.

### Just synced with a pixel pencil (hand fix)

- [ ] Click Sync now in the sync box and in Settings: a small pixel pencil (blue, with a pink eraser, hard pixel edges) hops across in six little jumps, "Just synced" appears a few letters at a time behind its tip, two specks of ink flick off at the end and the pencil fades in steps. Try it on Aurora too: the pencil is easy to see on dark paper. With reduce motion on, the words just appear.

### Collections to download stay in Settings (hand fix)

- [ ] In Settings, open Where your notes live and click Sync now: under Backup the Collections with their download icon sit in the list, not floating over the Settings heading. Click a note's Collection line: its list of Collections still opens under it and scrolls when long.

### A welcoming first page (#90)

- [ ] Reload with ↻, then open Glacier in a fresh profile (or after clearing "welcomeSeen") on the Glacier paper: at the top of the paper a small pixel picture of a glacier and a little iceberg on calm water, about four ruled rows high, across the full width, fading softly into the paper. Nothing of it is under the pill.
- [ ] Under the picture, "Welcome to Glacier" in the handwriting, a little bigger than the text, standing on a ruled line.
- [ ] Then three lines, each on its own ruled line with a small pixel picture before it: a page for "A note is a page you write on.", a globe for "Notes for a website open by themselves when you come back." and a stack of notebooks for "Collections keep notes on one topic together."
- [ ] One empty row, then a soft rounded "Start writing" button in the paper's colour, and under it a quiet "Tip: open any website and just start writing."
- [ ] The welcome fades in gently once. With reduce motion on in the system, it just appears.
- [ ] Do the same on School Notebook (day picture on white paper) and Aurora (the picture at night, with stars): everything sits on the rules, looks calm and hand made, and nothing overlaps the pill.
- [ ] Click Start writing: the welcome goes for good. Open the Shortcuts panel with `?`: it starts with the link "How Glacier works" (#91).

### Collection icons, welcome overlap, Just synced, beside frame, Recent 5, page note Collection (#89)

- [ ] Open the ▾ menu and hover a Collection heading: Download, Archive and Delete sit together on the right, as close as the icons on a note row.
- [ ] On a fresh install (or after clearing "welcomeSeen"), visit a website that already has a note: the note opens and the welcome is gone, with no text on top of the note. Reload: the welcome does not come back.
- [ ] With the welcome showing, type a letter, press +, or open a note from the menu: the welcome goes in each case.
- [ ] Click the sync dot, then "Sync now": the box stays open and the pen writes "Just synced". Press it again when nothing changed: the pen writes it again.
- [ ] In Settings, Where your notes live, press "Sync now": the status line is written out as "Just synced" by the pen, then returns to normal. With reduce motion on, the words just appear. With the network off you read the plain error text.
- [x] With Settings beside the sidebar: the frame touches the sidebar's edge with no overlap and no gap, fits the window height, and has no scrollbar of its own on the outside. Scroll its list to the end and keep scrolling: the web page behind does not move.
- [ ] Open the ▾ menu: Recent lists at most 5 notes.
- [ ] On a page whose notes are in no Collection, press "New note for this page" while another Collection was used last: the new note is in no Collection. On a page with a note in a Collection, the new note joins it. On a page with no notes yet, it is in no Collection (#92).

### Round 4 bugs: Backspace in bullets, plus click, dot colour, snippets, Restore text, long titles, reopen (#88)

- [ ] Type `- first`, Enter, `second`. Put the caret at the start of the second bullet and press Backspace: the bullet mark goes and the words stay. Press Backspace again: it joins the line above, with no `- ` left in the middle.
- [ ] Do the same on a heading line and a quote line: the first Backspace removes the mark only.
- [ ] Click the + on the left of an empty line with the mouse: the command menu opens. Do it again on a line with text.
- [ ] On the School Notebook paper with no GitHub connection, the dot in the pill is grey, not red. Check another paper: the dot looks the same.
- [ ] Search with `//` for a word that sits in a heading, a quote or a code block: the snippet shows plain words, no `##`, `>` or backticks, and a link shows its title.
- [ ] Restore from a backup file: the message starts with "Restored", for example "Restored 2 notes, 1 kept as a copy next to yours."
- [ ] Give a note a very long title: the pill ends it with "…", and hovering it shows the whole title.
- [ ] Open a browser page (new tab or settings), close and reopen Glacier: the last note you were on opens, not the empty page. On a website with no note you still get its empty page.

### Quotes, code block rows, Archived label, Undo reopen, focus ring, sideways scroll (#87)

- [ ] Type a line starting with `> ` and move to another line: it shows as a quote with a quiet bar on the left and no `>`. Click back into it: the `>` shows faded.
- [ ] Type a code block (three backticks, a few lines, three backticks) and a normal line after it: the code lines and the line after the block sit on the ruled lines, also while the caret is inside the block.
- [ ] Open a note that is in a Collection, then archive the whole Collection from the ▾ menu: the pill shows "Glacier" and no "Archived" label.
- [ ] Click Undo in the notice: the notes come back and the note that was open is on screen again.
- [ ] Choose the Aurora paper, open settings and tab to the close button: the focus ring is the soft accent colour, not a white box.
- [ ] Open the Shortcuts panel: there is no sideways scrollbar at its bottom, and a long key wraps to its own line.

### Welcome layout, unbroken shortcut keys, card button text (#86)

- [ ] Reload with ↻, then start in a fresh profile: the welcome's first line is fully visible below the pill, every line sits on a ruled line in the handwriting font, and "No note for this page yet." does not show at the same time.
- [ ] The sidebar has no extra scrollbar while the welcome shows.
- [ ] Click Start writing: the welcome goes away and the note shows.
- [ ] Open the Shortcuts panel: every key is on one piece (for example the link key and the bold italic key), short keys sit beside their description, and a long key takes its own line above its description.
- [ ] Fresh start: the second button on the card says "Not now, open it inside".

### Explaining Notes and Collections, and the pen that writes Just synced (#85)

- [ ] In a fresh profile, open Glacier: three lines in the handwriting font explain notes, website notes and Collections, with a quiet "Start writing" button. Click it: the welcome goes and the caret is on the paper. Reload the extension and open Glacier again: the welcome does not come back.
- [ ] With no Collections, open the ▾ menu: under "Notebook" a quiet line says "Collections hold notes that belong together. Make one with + New collection." Make a Collection: the line is gone.
- [ ] On a note without a Collection, hover "Add to a collection" above the text: it explains what Collections are. Hover the `+` in the pill: it says "New note".
- [ ] Open the Shortcuts panel with `?`: it starts with the link "How Glacier works" (#91).
- [ ] Click the sync dot, then "Sync now": a small pen moves across the box and writes "Just synced" in the handwriting font, left to right. After a few seconds the box shows its normal status again. With the network off you get the plain words and no pen.
- [ ] With "reduce motion" turned on in your system, "Just synced" just appears, with no pen.

### Calmer menus: compact Shortcuts panel, quiet search box and plus entries (#84)

Reload with ↻ first. Try Aurora and Chalkboard too.

- [ ] Open the Shortcuts panel: each key sits on the left and its description on the right, on one row. The panel is narrow and still readable at a sidebar width of 260 px.
- [ ] Open ▾ and click in the search box: no black border, a quiet line that turns to the accent colour while you type.
- [ ] In ▾, "+ New note" and "+ New collection" look like the other rows, with the same hover look. Click "+ New collection": the name field has a quiet border too.
- [ ] Compare ▾, ⋯, the ← box, the sync box, the + menu and the Collection list: same row height, padding, font weight and hover look.

### Bugs from the browser test: Collection click, overlaps, after archive or delete (#83)

Reload with ↻ first.

- [ ] Click in the text of a note, then click "Add to a collection" with the mouse: the list opens every time. Do it also right after pressing Enter or typing.
- [ ] The Collection list has a solid background: the note's text does not show through it.
- [ ] Open ▾, ⋯, the ← box, the sync box and the Shortcuts panel one after another: the round Glacier button is always under them, and opening one closes the one that was open.
- [ ] With the Shortcuts panel open, open ▾: the panel closes. With ▾ open, open the Shortcuts panel: the menu closes. A Collection heading's Archive and Delete icons are never hidden.
- [ ] Choose a Collection on a note, then press + and "New note" and type: the new note is already in that Collection, shown above the text. The same from ▾ and "+ New note".
- [ ] Without permission for the page, press "New note for this page" and decline: the card says settings open inside the sidebar, and does not talk about two panels.
- [ ] With no note open, the pill shows a quiet "Glacier". Hovering shows no text and no pointer, and clicking does nothing.
- [ ] Open note A, then note B. In ⋯ choose Archive: note A shows, with "Archived. Undo". Undo puts B back in the Notebook, not archived.
- [ ] Open note A, then note B, and delete B from ⋯ or from the trash icon on its row: note A shows. With no earlier note, you see the page's note or the empty page.
- [ ] The ▾ menu heading reads "No collection".

### Putting a note into a Collection (#82)

Reload with ↻ first.

- [ ] A note without a Collection shows a faded "Add to a collection" above the text. Hover it: "Click to choose a collection".
- [ ] Click it: a list shows your Collections and "+ New collection" at the bottom. Choose "+ New collection", type a name, press Enter: the note is in it and the name shows above the text.
- [ ] On a note with a Collection, click the name: the list also has "No collection". Choose it: the line goes back to "Add to a collection".
- [ ] Open ⋯ and choose "Move to collection…": the same list opens above the text.
- [ ] Open ▾: under Notebook, click "+ New collection", type a name, press Enter: an empty Collection appears in the list. Hover it: only the Delete icon shows.
- [ ] Choose that empty Collection from "Add to a collection" on a note: the note shows under it in ▾.
- [ ] Type an existing name in other capitals as a new Collection: no second Collection appears.
- [ ] Sync, then look at the Notes repo: a moved note's file is in its new folder, in one commit.

### Several versions, last 3 notes on ←, website or own icons, handwritten Just synced (#81)

- [ ] With a note that has a second version, open the ▾ menu: the heading reads "Several versions (1)". Hovering it explains why Glacier kept every version.
- [ ] Hover a row under that heading: Download, Archive and Delete icons show, like on the other rows.
- [ ] Open four or five different notes one after another, then click `←`: a small box opens under it with the last 3 notes, newest first, each with a small icon. Hovering `←` says "Your last notes".
- [ ] In that box, ↑ and ↓ move between the notes and Enter opens one. A click on a note opens it. Esc, or a click outside, closes the box.
- [ ] In the ▾ menu lists, in search results and in the `←` box, a note from a website has a small globe, and a note you made yourself has a small pencil. Hovering says "From a website" or "Your own note". The line above the text of a website note shows the globe before the site link.

### A new note's name follows its first line (#80)

- [ ] Reload the extension with the ↻ button first. Press + and "New note", click the paper and type "Box model basics" slowly. The pill reads the whole line, not "B". Marks like "# " or bold stars are left out of the name.
- [ ] Press Enter after the first line and then change the first line. The name stays as it was.
- [ ] Start another new note, type a few words, press the down arrow or click a second line, then change the first line. The name does not change.
- [ ] Start another new note, type a few letters, rename it by hand in the pill, then keep typing the first line. The name stays what you chose.
- [ ] Type the first line of a new note so it matches an existing note's name: it gets a free name such as "Box model 2", with no error.
- [ ] After the next sync, the file in the Notes repo has the final name, not a half typed one.
- [ ] With a conflict: notes that have no second version show no message and no bar. The original and its second version each show the bar above their text.

### Shortcuts panel lists every key (#79)

- [ ] Reload the extension with the ↻ button first. Open the Shortcuts panel. Start of a line lists `/`, `#`, `##`, `###`, `-`, `>` and the code block.
- [ ] Anywhere in a line lists the note link, the web link, bold, both italics, bold italic and inline code.
- [ ] Keys lists Enter, Shift Enter, Backspace, Delete, Ctrl B, Ctrl I, Ctrl E (with "press again to remove"), undo, redo, Tab or Enter for the list, Ctrl K and //, Alt Shift G, Esc and a line about Cmd on a Mac.
- [ ] Every line is short and readable, with no dashes or capitals shouting.

### Sync lives in the dot; the Notebook menu holds only notes (#75)

- [ ] Reload the extension with the ↻ button first. Click the sync dot in the pill: a small box opens under it with the status in words (for example "Up to date") and a quiet line "Last synced 2 minutes ago". Leave it open for a minute: the time moves on by itself.
- [ ] Click "Sync now": the button reads "Syncing…", then a pen writes "Just synced" across the box for a few seconds, then the box shows its status again. Turn the network off and try again: the result is "Offline. Your changes are kept here".
- [ ] Press Esc, or click anywhere outside the box: it closes.
- [ ] Make a note with two versions (see Conflict Copies below). The box shows "1 note has two versions. Check them" style text. Clicking it opens the ▾ menu with "Several versions (n)" at the very top, each original with its second version under it.
- [ ] Click "Where your notes live" in the box: settings open at Where your notes live. With the notes only in this browser, the box says "Only in this browser" and offers "Choose where they live", which opens the same place.
- [ ] Open the ▾ menu: there is no Sync, no "Sync now" and no "Notes repo" in it. The order is search, Several versions (only while there are any), Notes for this page, Recent, Collections, Archive.
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

- [ ] The line above the text says "Add to a collection" on a note without one. Hover it: "Click to choose a collection". Click it: the list ends with "+ New collection".
- [ ] Open the ▾ menu: the Notebook lists Collections, then "No collection" with the rest. Hover a Collection heading: three icons show, and Download names the Collection and its note count.
- [ ] Settings, Where your notes live: the list under Backup holds Collections, and hovering a Download icon names the Collection. Nowhere in the sidebar, menus or settings does the word Course show.
- [ ] Put a note in "Testing Test", then click "+ New collection" on another note and type "testing test": the note joins "Testing Test", and the menu shows one Collection.
- [ ] If you had "Testing Test" and "Testing test" before this change: after the reload they show as one Collection, spelled like the one with more notes.
- [ ] Sync, then open the Notes repo on GitHub: the notes sit in `collections/`, the old `courses/` folder is gone, and both spellings ended up in one folder. The history shows the move as one commit.

### Shortcuts panel on the right, inside the sidebar (#76)

Reload with ↻ first. Turn the Shortcuts panel on in settings.

- [ ] On a website and on a new tab, a small tab with a question mark sits top right, next to the + button.
- [ ] Click the tab: the cheat sheet slides in from the right edge of the sidebar over the right part of the note. The pill and the tab stay visible above it.
- [ ] Click in the note: the cheat sheet closes. Click the tab to open it, then the tab again: it closes. The arrow in its header closes it too.
- [ ] Close and reopen the sidebar: the cheat sheet is still open or closed as you left it.
- [ ] On a website, open Settings: it still opens beside the sidebar on the left. On a new tab, Settings open inside the sidebar with the line about the page not allowing panels. The cheat sheet shows no such line.
- [ ] Under Panels in settings, the choice is named "Settings open". Choosing Inside the sidebar or Beside the sidebar moves only Settings.

### Hover actions on note rows; download as .md or PDF (#71)

Reload with ↻ first.

- [ ] Open the ▾ menu and hover a note row (also in Recent, search results and the Archive section): three small icons show on the right. Tab to a row: they show too. Each has a hover text naming the note, like "Archive 'Arrays basics'".
- [ ] Click Download: a small choice appears there, Markdown (.md), PDF or Print. Markdown saves the .md file. PDF and Print open the print window with only the title and text, where you pick Save as PDF.
- [ ] Click Archive: the note leaves the list at once and "Archived. Undo" shows at the bottom. Click Undo: it comes back.
- [ ] In the Archive section the middle icon is Unarchive and puts the note back.
- [ ] Click Delete: the usual question appears. Keep leaves it, Delete removes it.
- [ ] Hover a Collection heading: three icons show (see the Collection section above). Markdown gives a zip of .md files. PDF gives one document with every note of the Collection, each on a new page.
- [ ] In ⋯ This note, Download asks the same Markdown or PDF choice.
- [ ] Settings, Where your notes live: a list of every Collection (it scrolls when long), each with a Download icon that asks the same choice. Export everything and Export archive are still there.

### Conflict line you can close, guided second versions, sync dot explained (#70)

Reload with ↻ first. Make a conflict first (see Conflict Copies, #16).

- [ ] No line shows under the pill. The dot is orange, and hovering it says "A note has two versions. Click to see them".
- [ ] Only the original and its second version show a bar above their text. Every other note shows nothing.
- [ ] Click the line: the ▾ menu opens with each original and its second version under it. Click the second version to open it.
- [ ] The second version shows a bar above its text: "This is a second version of 'Title'. Copy what you want to keep into 'Title', then delete this version."
- [ ] Click Open 'Title' in the bar: the original opens.
- [ ] Click Delete this version: the usual question appears. Keep brings the note back, Delete removes it. When the last second version is gone, the line and the orange dot go away.
- [ ] Hover the dot when everything is saved: "All saved to GitHub". While syncing: "Saving to GitHub". With the network off: "Offline. Your changes are kept here and sync later".
- [ ] Hover the orange dot: "A note has two versions. Click to see them". Click it: the list of pairs opens.
- [ ] Break the token on purpose and sync: hovering the dot gives the error's short text.
- [ ] Before connecting GitHub, hover the dot: "Your notes live only in this browser. Choose where they live in Settings".

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
- [ ] + and "New note": a blank note with "Title" faded in the pill. Name it and write: the line above the text shows only "Add to a collection", no site link. Click it to give it a Collection.
- [ ] Hover the two + choices: "A blank note, not tied to any page." and "A note for the page you're on. It opens again when you visit the page."
- [ ] On a settings page, + offers only "New note".
- [ ] Click a Missing Link: the new note has no site link and "Add to a collection".
- [ ] Look through the pill, both menus, the + menu, the start prompt, the permission card and settings: nothing says Lesson or Concept.
- [ ] With a Notes repo that still has a `concepts/` folder, sync: on GitHub one commit moves those files to `notes/`, and the notes still open with their text and backlinks.
- [ ] Restore from an older Export zip (with `concepts/` in it): every note comes back.

### Menu contents as data (#67)

Nothing should look or work differently. Reload with ↻ first, then run these groups from section 2 again:

- [ ] The pill at the top
- [ ] Two menus: Notebook and This note
- [ ] Archive
- [ ] The bar on notes with two versions

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
- [ ] The first start shows the welcome: a pixel picture of a glacier (at night on dark papers), "Welcome to Glacier", three lines with small pictures, a soft "Start writing" button and a tip, all on the ruled lines and clear of the pill (#90). Start writing or opening a note makes it go for good.
- [ ] Installing shows no permission warning. The first time settings open, Glacier's own card explains drawing beside the sidebar, and the browser asks only after **Allow** (#21).
- [ ] Allowed, settings open beside the sidebar on websites and inside it on browser pages. Declined, they open inside. Settings, Panels changes it later.

### Notes for the page you're on

- [ ] On a website without a note, the empty paper shows with "No note for this page yet. Just start writing." Typing makes the note, with the page title and no Collection (#92).
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
- [ ] The Notebook is listed: Collections with their notes, then "No collection" with the rest.
- [ ] On a note with a page, the menu starts with "Notes for this page", newest first, and "+ New note for this page" under them.
- [ ] Esc closes the menu.
- [ ] `←` appears after the note changed. Hovering shows "Your last notes". Clicking opens a box with the last 3 notes, newest first.
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
- [ ] Backspace at the start of a line joins it with the line above. Under a page break, it takes the break out.
- [ ] ↑ and ↓ move between lines, also through code blocks. With notes as pages, on to the page before or after.
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
- [ ] `/page` puts in a page break: a dotted line with the page number, or with notes as pages, a new page.
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
- [ ] A note without a page shows only its Collection, or "Add to a collection".

### Export and Restore from backup file

- [ ] Open settings, then Where your notes live: "Export everything" and "Restore from backup file" sit under "Backup", and hovering shows what they do.
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
- [ ] Revoke or delete the token on GitHub, then type or press "Sync now": the dot turns red and the message says GitHub no longer accepts your token, it may have expired, and to paste a new one under Where your notes live. Pasting a new token there makes it sync again.
- [ ] Without a Notes repo connected, the dot stays as before, hovering it says your notes live only in this browser, and the box offers "Choose where they live" instead of "Sync now".

### Connect GitHub and the first sync

You need a private GitHub repo for your notes and a fine grained token for it (GitHub, Settings, Developer settings, Fine grained tokens), limited to that repo with Contents set to read and write. Put a few notes in it first, for example from an Export zip, in `collections/` and `notes/`.

- [ ] Click the sync dot and then "Where your notes live" (or "Choose where they live" when not connected). It opens settings at Where your notes live; choosing GitHub shows Repo and Token fields and a short text about the token.
- [ ] The × in the settings header returns to the note that was open.
- [ ] Type the repo as `yourname/notes` (pasting its GitHub address works too), paste the token, press "Connect and sync", then Switch. A screen shows Connecting to GitHub, then Downloading 1 of N notes counting up, then Combining notes, then Ready, and says how many notes came in.
- [ ] "Start writing" closes settings. Every note from the repo is in the menu, with its Collection, text and backlinks.
- [ ] Typing just "notes" (no owner) says to type it as owner and name.
- [ ] A wrong token says GitHub didn't accept it. A repo name that doesn't exist says it couldn't find that repo. Nothing in the Notebook changes.
- [ ] With the network off (devtools, Offline), it says it couldn't reach GitHub.
- [ ] Open "Where your notes live" again: it says which repo is connected, the repo is filled in and the token field says it is saved. Change the repo and sync again without pasting the token.
- [ ] A note you already had with different text is kept, and the repo's version shows up next to it as "Title (conflict date)".
- [ ] The token is in neither the repo nor an Export zip. It shows only in the extension's storage (devtools of the sidebar, Application or Storage, Extension storage).

### Export: this note, a collection, or everything

- [ ] Open the ⋯ This note menu after the title: "Download as a file" is there. Open settings (the round glacier button), then Where your notes live: under a small "Backup" heading are a Collection list, "Export a collection", "Export everything" and "Restore from backup file". Hovering each shows what it does.
- [ ] "Download as a file" saves one `.md` file named after the note's title, with its text. A note with a sketch comes as a zip with its svg files.
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
- [ ] Paper, Writing and Where your notes live fold open and closed when you click their names. Open all three and scroll: the "Settings" header stays on top.
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
- [ ] Choose On: a small tab appears top right next to +. Click it: a Shortcuts sheet slides in from the right edge of the sidebar. It lists the start of a line (/, #, ##, ###, -, three backticks), anything in a line ([[Title]], bold, code) and the keys (Enter, Backspace, up and down, Esc, Ctrl A twice, Ctrl C, Ctrl K).
- [ ] Click the arrow in its header, click in the note, or click the tab: the sheet closes. Click the tab: the sheet opens again.
- [ ] Fold it, close and reopen the sidebar: it is still folded. Open it, reopen the sidebar: it is still open.
- [ ] Choose Off in settings: the sheet and the tab both go away. Choose On again: the tab comes back, and the sheet is open or closed as you left it.

### Panels beside the sidebar

- [ ] Remove Glacier and load it again: installing shows no permission warning. In Chrome, `chrome://extensions`, Details, Site access shows no sites.
- [ ] Open a website and click the round glacier button: Glacier's own card shows in the sidebar first, saying what it is for and that Glacier never reads, saves or sends anything from the pages you visit. No browser prompt yet.
- [ ] Press Esc on the card: it closes and nothing is chosen. Click the glacier button again: the card shows again.
- [ ] Click Allow: now the browser's prompt shows. Accept it: settings open next to the sidebar, over the right edge of the web page. The note in the sidebar keeps its full width.
- [ ] With settings beside the sidebar, change the paper, the font and drag the text size: the note changes at once, also while you drag.
- [ ] Change "Tabs and notes", and the previous note button beside the sidebar: each one works at once in the sidebar.
- [ ] Close settings with the ×, with Esc, with the glacier button and by clicking in the note. Each way closes them.
- [ ] Under Where your notes live beside the sidebar: Sync now, Export a collection, Export everything and Restore from backup file all work, and the downloads and messages show in the sidebar. With no repo connected, connecting one shows the first sync steps beside the sidebar.
- [ ] Switch to another website tab with settings open: they go with you. Go back: they are there and not left behind on the other tab.
- [ ] Follow a link in the page: after it loads, settings come back beside the sidebar.
- [ ] On a new tab, a browser settings page (`chrome://settings` or `about:preferences`) and a PDF, open settings: they open inside the sidebar. Switch back to a website: they move beside it.
- [ ] Close the sidebar with settings beside it: within a few seconds they are gone from the page.
- [ ] In settings, under Panels, choose "Inside the sidebar": settings move inside at once. Choose "Beside the sidebar": they move out again.
- [ ] Take the permission back in the browser (Chrome: Details, Site access; Firefox: Permissions tab of the add-on). Open settings: they open inside the sidebar. Choose "Beside the sidebar" under Panels: the browser asks again.
- [ ] Fresh start again, and this time click "Not now, open it inside" on the card: settings open inside the sidebar, no browser prompt shows, and everything else works as before. Reopen the sidebar: the card doesn't come back.
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
- [ ] Click Unarchive: the label goes, and the note is back in its Collection (or No collection) in the list.
- [ ] A link to an archived note in another note still opens it.
- [ ] After a sync, the archived note's file is under the archive folder on GitHub (for example archive/collections/Collection name/Title.md), and it moves back out after Unarchive and a sync.
- [ ] In Settings, Where your notes live, under Backup: "Export archive" downloads a zip with only the archived notes.
- [ ] "Export everything" includes archived notes, and "Restore from backup file" brings them back as archived.

### The bar on notes with two versions

Make a conflict first (see Conflict Copies, #16).

- [ ] No line shows under the pill. The dot in the pill is orange.
- [ ] Open the second version: a bar shows above its text, with Open and Delete this version buttons.
- [ ] Open the original: a bar shows above its text saying it has a second version, with an Open button.
- [ ] Open any other note: no bar and no message.
- [ ] Delete the last second version (the ⋯ This note menu, "Delete"): the dot turns normal and the original's bar goes away.

### Why a panel opens inside the sidebar

Reload the extension with the reload button first. In Settings, Panels, choose "Beside the sidebar".

- [ ] On a new tab, open Settings: it opens inside the sidebar with the line "This page doesn't allow panels beside the sidebar, so it opens here." at its top.
- [ ] On a website such as the Odin Project, Settings open beside the sidebar with no line.
- [ ] Choose "Inside the sidebar": on a website and on a new tab, no line shows.
- [ ] Take the permission back in the browser's extension settings: no line shows on a new tab.

### Making a note: write straight away, no form

Reload the extension with the reload button first.

- [ ] Open a website that has no note: the sidebar shows the ruled paper with one faded line, "No note for this page yet. Just start writing." The pill shows the page's title, faded. Nothing looks like a web form: no boxes, no big buttons, no heading.
- [ ] Click the paper and type a letter: the note exists now, with the page's title in the pill (no longer faded) and the line "Add to a collection · site ↗" above the text (no Collection, #92).
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
