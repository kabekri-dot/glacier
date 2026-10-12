# Browser tests by Claude

What Claude tested itself by clicking, typing and pressing keys in a real Chrome, so it's clear what's covered, what changed between rounds and what's still missing. Hand checks for the user stay in [manual-tests.md](manual-tests.md).

## How

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

## Open findings

- Quote lines (`> `) aren't formatted; the `>` stays visible.
- Code block rows don't line up with the ruled lines.
- After archiving a whole Collection, the pill shows "Glacier" with an "Archived" label although no note is open.
- Undo after archiving a Collection that holds the open note brings the notes back but doesn't reopen the note.
- Settings' close button has a hard white focus box in dark papers.
- The Shortcuts panel shows a sideways scrollbar at its bottom.

All of these went into #87.

## Still to test

- Round 4 after #87.
- By the user (not possible here): sync and the pen animation, tab following and several notes per page, print and PDF, several versions, Firefox.
