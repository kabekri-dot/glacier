# Browser tests by Claude

What Claude tested itself by clicking, typing and pressing keys in a real Chrome, so it's clear what's covered, what changed between rounds and what's still missing. Hand checks for the user stay in [manual-tests.md](manual-tests.md).

## How

- Settings beside the sidebar can be checked without the permission prompt: open a website in the test Chrome and add the frame (`sidebar/beside.html?panel=settings`, a web-accessible page) with the same styles `sidebar/beside-frames.js` uses, then measure it.

- Chrome DevTools MCP starts its own test Chrome, separate from the user's Chrome and the Claude extension.
- `install_extension` loads the repo folder as an unpacked extension; the sidebar is opened as a tab at `chrome-extension://<id>/sidebar/panel.html`, sized 420 × 800 like a sidebar.
- A fresh start: clear `chrome.storage.local` and delete the `glacier` IndexedDB, then reload.
- Clicks go through the real mouse path (mousedown, focus, click). A scripted `.click()` is used only to check whether a bug is in the click path or in the code behind it.

**What this can't test:** following tabs on real websites (the sidebar page is its own tab, and the `tabs` permission prompt can't be clicked), sync with GitHub (no token in the test Chrome), the print and PDF window, notes with several versions (needs a real conflict), panels beside the sidebar (needs the permission prompt), Firefox.

## Rounds

| Round | Date | Code | Found |
|---|---|---|---|
| 1 | 2026-10-12 | after #80 to #82 | bugs → #83, look → #84 |
| 2 | 2026-10-12 | after #83 to #85 | bugs → #86 |
| 3 | 2026-10-12 | after #86 | open findings → #87 |
| 4 | 2026-10-12 | after #87, every user story | bugs → #88 |
| 5 | 2026-10-12 | after #88 | all fixes work; see Round 5 |
| 6 | 2026-10-12 | after #89, #90 | see Round 6 |
| 7 | 2026-10-12 | after the user's hand test, #91, #92 | see Round 7 |

## Workflows

✅ works, ❌ bug (ticket), ➖ not testable here.

| Workflow | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| First start: welcome, Start writing | ➖ (not built) | ❌ layout #86 | ✅ |
| `+` → New note, title skipped, first line becomes the name | ✅ | ✅ | |
| `+` → New note → Esc creates nothing, returns | ✅ | | |
| New note lands in the last used Collection | ❌ #83 | ✅ | |
| Collection line: mouse click opens the list | ❌ #83 | ✅ | |
| Collection list background | ❌ see-through #83 | ✅ | |
| + New collection from the line, from ▾ | ✅ | ✅ | |
| ⋯ Move to collection… | ✅ | | |
| ▾ menu: pencil or globe icons, row hover icons | ✅ | ✅ | |
| ▾ menu look (search box, + rows) | ❌ #84 | ✅ | |
| Search titles, `// word` searches text | ✅ | | |
| Rename by clicking the title, taken name hint, Esc | ✅ | | |
| `[[` autocomplete with Tab, missing link red, click creates note, backlinks | ✅ | | |
| ⋯ Archive → returns to the note before, Archived. Undo | ❌ empty page, no Undo #83 | ✅ | |
| Archive section, open, Unarchive | ✅ | | |
| Delete asks first, removes the note | ✅ (landed on empty page #83) | | |
| Collection heading: Download offers .md, PDF, Print | | ✅ | |
| Collection heading: Archive whole Collection, Undo | | ✅ (pill keeps "Archived", open note not reopened after Undo) | |
| Collection heading: Delete asks with the count | | ✅ | |
| ← box with the last notes | ✅ | | |
| Delete key at the end of a line pulls the next line up | ✅ | | |
| Ctrl+B on a word then Enter keeps it and starts a new bullet | ✅ | | |
| Shift+Enter in a bullet: plain line | ✅ | | |
| Ctrl+I, Ctrl+E on a selection | | ✅ | |
| `/` menu filter and pick a heading | ✅ | | |
| Quote `> ` formats | | ❌ shows raw `>` | |
| Code block: ``` auto closes | | ✅ (rows don't match the rules) | |
| Undo Ctrl+Z, redo Ctrl+Y | ✅ | | |
| Ctrl+A twice, Ctrl+C "Copied 6 lines" | | ✅ | |
| Glacier button size (52 px), below menus | ✅ size, ❌ on top #83 | ✅ | |
| ▾ menu and Shortcuts panel never open together | ❌ #83 | ✅ | |
| Shortcuts panel on the right, every key listed | ✅ | ✅ side by side, ❌ keys break #86 | ✅ keys whole, ❌ sideways scrollbar |
| How Glacier works in the Shortcuts panel | | ✅ | |
| Pill with no note open | ❌ "Click to rename" #83 | ✅ | |
| Permission card text | ❌ "both panels" #83 | ❌ "open them" #86 | ✅ |
| Settings: dark paper (Aurora) | | ✅ | |
| Notes repo: missing owner, wrong token messages | | ✅ | |
| Sync dot box (not connected) | ✅ | | |
| Sync now and the pen animation | ➖ | ➖ | |
| Following tabs, several notes per page, "1 of 3" | ➖ | ➖ | |
| Print and PDF window | ➖ | ➖ | |
| Several versions section and bar | ➖ | ➖ | |

## Open findings (round 3)

- Quote lines (`> `) aren't formatted; the `>` stays visible.
- Code block rows don't line up with the ruled lines.
- After archiving a whole Collection, the pill shows "Glacier" with an "Archived" label although no note is open.
- Undo after archiving a Collection that holds the open note brings the notes back but doesn't reopen the note.
- Settings' close button has a hard white focus box in dark papers.
- The Shortcuts panel shows a sideways scrollbar at its bottom.

All of these went into #87.

## User stories (round 4)

Every story in the spec (#1), judged against today's decisions. ✅ works, ❌ bug (ticket), ➖ for the user (not testable here), ⬜ not tested yet, ⤳ the story is outdated and was replaced (what replaced it is tested).

### Opening Glacier next to a lesson

| # | Story (short) | Result |
|---|---|---|
| 1 | Open from the toolbar or Alt+Shift+G | ➖ (user checked #47, #49) |
| 2 | Same in Chrome and Firefox | ➖ |
| 3 | The page's note opens by itself | ➖ |
| 4 | Address extras match the same note, different videos don't | ➖ (covered by `node --test`) |
| 5 | Clear prompt on a page without a note | ✅ "No note for this page yet." with "+ New note for this page" |
| 6 | New note takes the page title and Source | ➖ |
| 7 | Last used Course preselected | ⤳ Collection: a new note lands in the last used Collection ✅ |
| 8 | A taken title gets the Collection added | ✅ on rename ("Box model basics (Web Basics)") |
| 9 | Cursor in the note when it opens | ✅ |

### Writing

| # | Story (short) | Result |
|---|---|---|
| 10 | No Edit/Preview switch | ✅ |
| 11 | Markdown formats while writing | ✅ headings, bullets, quote (#87), bold, italic, code |
| 12 | Click lands exactly there | ✅ inside a word |
| 13 | Enter continues a list, empty bullet ends it | ✅ |
| 14 | Backspace at the start joins with the line above | ❌ in a bullet the `- ` ends up inside the line #88 |
| 15 | ↑ and ↓ move between lines | ✅ also through a code block |
| 16 | Pasting several lines keeps them as lines | ✅ plain text |
| 17 | `/` menu shows each command's Markdown | ✅ |
| 18 | `+` on the left opens the same menu | ❌ a mouse click doesn't open it #88 |
| 19 | Hint on empty lines | ✅ "Type / for commands, or click + on the left" |
| 20 | `[[` suggests titles | ✅ |
| 21 | Drag-select across paragraphs | ✅ |
| 22 | Ctrl+A once the line, twice the note | ✅ |
| 23 | Copy keeps the Markdown | ✅ exact Markdown on the clipboard |

### Connecting ideas

| # | Story (short) | Result |
|---|---|---|
| 24 | `[[Title]]` links | ✅ |
| 25 | Missing Links in red | ✅ |
| 26 | Clicking a Missing Link creates the note | ✅ (a plain note now, ⤳ Concept) |
| 27 | A click on a Link opens the note | ✅ |
| 28 | Backlinks | ✅ "1 backlink" |
| 29 | Rename rewrites every Link | ✅ `[[Box model]]` became `[[Box model guide]]` |
| 30 | A taken name is refused with a suggestion | ✅ |
| 31 | Concept Notes have no Course | ⤳ one kind of note (#68); notes without a Collection are listed under "No collection" ✅ |

### Finding notes

| # | Story (short) | Result |
|---|---|---|
| 32 | The note fills the sidebar | ✅ |
| 33 | One pill with title and sync status | ✅ (long titles cut without "…" #88) |
| 34 | Menu with search, recent notes, the Notebook | ✅ |
| 35 | Ctrl+K opens it with the search box focused | ✅ |
| 36 | Search titles and text, highlighted snippet | ✅ `//` searches text, the match is highlighted (snippet shows raw Markdown #88) |
| 37 | + Lesson note / + Concept in the menu | ⤳ "+ New note", "+ New collection" ✅ |
| 38 | Backlinks button bottom left | ✅ |
| 39 | Esc closes any menu | ✅ |

### Look and feel

| # | Story (short) | Result |
|---|---|---|
| 40 | 11 Themes in two groups | ✅ all switch, each with its default font and pattern |
| 41 | Glacier is the default | ✅ |
| 42 | Panorama shows more landscape when wider | ✅ at 420 and 700 px |
| 43 | Text never over the picture | ✅ |
| 44 | Writing on the ruled lines at every font and size | ✅ checked at 100 and 150 % on School Notebook |
| 45 | Font Override stays when switching Themes | ✅ |
| 46 | Text size 85 to 150 % | ✅ and it's kept after a reload |
| 47 | Fonts bundled | ✅ all five load from the extension |
| 48 | Round glacier button opens settings | ✅ |
| 49 | Settings beside the sidebar, live | ➖ needs the permission prompt |
| 50 | Settings sections fold | ✅ |
| 51 | Shortcuts panel, folds, stays as left | ⤳ inside on the right (#76) ✅, keeps open or folded ✅ |
| 52 | Same art as the toolbar icon | ➖ |

### Permissions

| # | Story (short) | Result |
|---|---|---|
| 53 | No warning at install | ➖ |
| 54 | Glacier's own card before the browser's prompt | ✅ card; ➖ the prompt |
| 55 | Declining still works, inside the sidebar | ✅ |
| 56 | Change it later in Settings, Panels | ➖ choosing beside asks the browser |

### Sync, safety and data

| # | Story (short) | Result |
|---|---|---|
| 57 | Saved while typing, works offline | ✅ survives a reload |
| 58 | Connect a private repo with a token | ✅ error messages; ➖ a real connection (user did it) |
| 59 | First sync progress | ➖ |
| 60 | Pull on open, push after typing | ➖ |
| 61 | Sync status | ✅ "Saved in this browser" (dot colour on School Notebook #88); ➖ the other states |
| 62 | Sync now with a confirmation | ➖ (pen animation) |
| 63 | Conflict Copies | ➖ |
| 64 | Plain Markdown files with frontmatter | ⤳ `collections/` and `notes/` (#68, #73); ✅ old `courses/` and `concepts/` files restore |
| 65 | Frontmatter hidden, small header | ✅ "Collection · 🌐 site ↗" |
| 66 | Git history as backup | ➖ |
| 67 | Export and Import | ⤳ Restore from backup file ✅ (old format, a changed note kept as a copy, a broken file refused); ➖ the downloaded file |
| 68 | Token only in this browser | ➖ |
| 69 | Clear error for an expired token | ➖ (wrong token ✅) |

### Added after the spec

| Feature | Result |
|---|---|
| One kind of note, several per page, "1 of 3" (#68) | ➖ needs websites |
| Collections: line above the text, + New collection, Move to collection (#73, #82) | ✅ |
| Archive, Unarchive, Undo, Archive section (#58, #71) | ✅ |
| Delete with a question (#57) | ✅ |
| Actions on a whole Collection (#74) | ✅ Download choice, Archive with Undo, Delete with the count |
| ▾ Notebook and ⋯ This note menus (#63) | ✅ |
| ← box with the last notes (#81) | ✅ |
| Globe and pencil icons (#81) | ✅ pencil; globe on the header of a restored note |
| Welcome once, hints, How Glacier works (#85) | ✅ |
| Sync box from the dot (#75) | ✅ not connected; ➖ connected |
| Several versions (#70, #81) | ➖ |
| Delete key, Enter after Ctrl+B, Shift+Enter (#77, #78) | ✅ |
| Ctrl+B, Ctrl+I, Ctrl+E (#44) | ✅ |
| Undo and redo (#42) | ✅ |
| Restore from backup file (#55) | ✅ |
| Download as .md, PDF or Print (#71, #74) | ✅ the choice; ➖ the files and the print window |
| Visible text rule (#51) | ✅ nothing in capitals or with dashes seen |

**Round 4 bugs, all in #88:** Backspace in bullets, the `+` menu click, the dot's colour on some papers, Markdown in snippets, "Imported" instead of "Restored", long pill titles without "…", and reopening on a browser page shows the empty page instead of the last note.

## Round 5 (after #88)

| #88 point | Result |
|---|---|
| 1. Backspace at the start of a bullet | ✅ first press: plain line, second press: clean join |
| 2. `+` on the left opens the command menu | ✅ on a real click, on a new line below text; Esc removes the untouched `/` |
| 3. Sync dot colour | ✅ quiet grey for "Saved in this browser" |
| 4. Search snippets without Markdown | ✅ |
| 5. "Restored" instead of "Imported" | ✅ (checked in the code; the upload path is unchanged) |
| 6. Long pill titles | ✅ ellipsis set, hover shows the whole title |
| 7. Reopening shows the last note | ➖ only applies with the page permission, which the test Chrome can't grant. Without it, the start prompt still shows (small gap, by design of #88) |

User stories 14 and 18 are now ✅. Every user story testable here works.

## Round 6 (after #89, #90)

| Point | Result |
|---|---|
| Welcome: pixel-art scene, greeting, three lines with pixel icons, Start writing, tip (#90) | ✅ fades in once; polish: noisy white pixels on the water line, the wrapped second line starts at the margin instead of under its text, button and tip sit a little off the rules |
| Welcome goes away when a note opens (#89) | ✅ Start writing; ➖ a website opening its note |
| Collection heading icons close together (#89) | ✅ 22 px apart, like note rows |
| Recent shows the last 5 (#89) | ✅ 5 of 6 notes |
| Just synced pen in the sync box and in Settings (#89) | ➖ needs a connected repo |
| Settings beside the sidebar fits, no page scroll (#89) | ❌ #89 made the frame 150 px high (an iframe doesn't stretch between top and bottom); fixed by hand in 8c719a6. ✅ checked on example.com by drawing the frame the same way: full window height (800 of 800 px), settings scroll inside. ➖ the real permission flow |
| New page note takes the page's Collection (#89) | ➖ needs websites |

## Round 7 (user hand test, #91, #92)

The robots couldn't build #91 and #92 (their GitHub key had expired), so Claude built them in the session, test-first.

| Point | Result |
|---|---|
| User: Settings beside the sidebar at full height | ✅ by the user |
| User: Sync now, the pen writes Just synced | ✅ by the user; the user wanted it more pixel-art → pixel pencil (1905d7d) |
| User: a popup with a download icon over the Settings heading | ❌ the Backup list shared the floating Collection list's class; fixed in a14cfa9. ✅ the list sits under Backup |
| Pixel pencil: six hops, words in chunks behind its tip, ink specks, fade in steps | ✅ frozen at 0.2, 1.25, 1.45, 1.8, 2.1 s; ➖ Aurora |
| How Glacier works opens the welcome (#91) | ✅ full welcome with picture over an open note, Collection line and backlinks hidden; Start writing and Esc return to the note with the cursor; welcomeSeen stays true |
| New note joins no Collection (#92) | ✅ + New note after using a Collection: "Add to a collection" |
| Page group under No collection (#92) | ✅ globe and page title, notes newest first; the move icon on hover lists the Collections and + New collection; a new name moves both notes and the group goes |

## Still to test

- Nothing left that Claude can test here.
- By the user (not possible here): sync and the pen animation, tab following and several notes per page, print and PDF, several versions, Firefox.
