# Glacier v1 checklist

Three lists in one place: what's left to do before v1, what Glacier must do (requirements), and the ways people use it (workflows), each with its test result. Written 2026-10-12 after a full test run by Claude in a test Chrome (method in [browser-tests.md](browser-tests.md)); detailed hand checks are in [manual-tests.md](manual-tests.md).

**Legend:** ✅ tested by Claude and works · 👤 only the user can test it (needs websites, the permission prompts, GitHub sync, the print window or Firefox) · ⚠️ works, small polish open · ❌ broken

## 1. To do before v1

| # | What | Who | Status |
|---|---|---|---|
| T1 | Hand test of the 👤 items below, starting with Settings beside the sidebar (full height again after fix `8c719a6`) and Sync now with the pen | You | open |
| T2 | Push `main` to GitHub (74 commits since `d8d30ff`), delete the `sandcastle/*` branches, move checked items in `manual-tests.md` from section 1 to section 2 | Claude, after T1 | open |
| T3 | Second code review from `d8d30ff`, findings into tickets | Claude, you decide | open |
| T4 | Docs check: `scope.md`, `CONTEXT.md`, ADRs match Collections, the welcome and the menus; update ticket #41's text (still says Lesson Note, Import, Course) | Claude | open |
| T5 | v1 release #41: version 1.0.0, a clean zip, Firefox unlisted signing on AMO, an everyday Chrome copy, final check, release notes in the README | You with Claude | open |
| P1 | Polish (optional): noisy white pixels on the welcome's water line; the welcome's wrapped second line starts at the margin; Start writing and the tip sit a little off the rules | Robot ticket if you want it | open |
| P2 | Polish (optional): without the page permission, reopening shows the start prompt instead of the last note | Robot ticket if you want it | open |

## 2. Requirements

### Opening and pages

| ID | Glacier must… | Result |
|---|---|---|
| R1 | open in the sidebar from the toolbar button and Alt+Shift+G, and close again with Alt+Shift+G | 👤 (you checked #49) |
| R2 | work the same in Chrome and Firefox | 👤 |
| R3 | open the most recently edited note of the website you're on | 👤 |
| R4 | match a page despite `?utm_…` or `#section`, but keep different videos apart | 👤 (covered by `node --test`) |
| R5 | always follow the tab you're on; keep the open note on browser pages | 👤 |
| R6 | show a clear empty page with "+ New note for this page" where a page has no note | ✅ |
| R7 | ask for page access only after its own explanation card, and work when you decline | ✅ card and decline; 👤 the browser prompt |

### Notes

| ID | Glacier must… | Result |
|---|---|---|
| R8 | have one kind of note with an optional page and an optional Collection | ✅ |
| R9 | allow several notes per page and show "1 of 3" | 👤 |
| R10 | create a note the moment you write, with no form; the title follows the first line | ✅ |
| R11 | rename by clicking the title; refuse a taken name with a free suggestion; rewrite every Link | ✅ |
| R12 | put a note into a Collection from the line above the text, from ⋯, or make a new Collection | ✅ |
| R13 | give a new page note the Collection of that page's other notes | 👤 |
| R14 | archive, unarchive and delete a note or a whole Collection, with Undo for archive and a question for delete | ✅ |
| R15 | save while you type and keep everything after a reload | ✅ |

### Writing

| ID | Glacier must… | Result |
|---|---|---|
| R16 | format Markdown while you write (headings, lists, quotes, code blocks, bold, italic, code, links), raw marks faded on the line you're on | ✅ |
| R17 | handle Enter (continue or end a list, step out of bold), Shift+Enter (plain new line), Backspace (remove a line's formatting, then join), Delete (pull the next line up) | ✅ |
| R18 | apply Ctrl+B, Ctrl+I, Ctrl+E to a selection and keep the word when Enter follows | ✅ |
| R19 | open the command menu with `/` or the `+` on the left | ✅ |
| R20 | suggest titles after `[[`; show missing links in red; create the note on click; show backlinks | ✅ |
| R21 | undo and redo the whole note | ✅ |
| R22 | select across lines, Ctrl+A twice for the note, copy as Markdown, paste as plain lines | ✅ |

### Finding

| ID | Glacier must… | Result |
|---|---|---|
| R23 | have a pill with ←, the title, ▾ Notebook, ⋯ This note, the sync dot and + | ✅ |
| R24 | search titles, and the text with `//`, from the menu or Ctrl+K | ✅ |
| R25 | list Notes for this page, Recent (last 5), Collections, Archive and Several versions in ▾ | ✅ Recent, Collections, Archive; 👤 page notes and Several versions |
| R26 | show the last notes in the ← box | ✅ |
| R27 | show globe or pencil icons for website or own notes | ✅ pencil; 👤 globe |

### Look

| ID | Glacier must… | Result |
|---|---|---|
| R28 | offer 11 papers, a Font Override and text size 85 to 150 %, kept after a reload | ✅ |
| R29 | keep writing on the ruled lines at every size; never over the panorama | ✅ |
| R30 | welcome first-time users once, with pixel art and three plain sentences | ✅ ⚠️ P1 |
| R31 | explain itself: hover texts, How Glacier works, hints | ✅ |
| R32 | follow the visible-text rule (no dashes as punctuation, no all caps, no emoji) | ✅ |
| R33 | open Settings beside the sidebar on websites at full height, inside on browser pages with a short reason | ✅ size checked on example.com; 👤 the real flow |
| R34 | keep the Shortcuts panel on the right, listing every key | ✅ |

### Sync and safety

| ID | Glacier must… | Result |
|---|---|---|
| R35 | connect a private GitHub repo with a fine-grained token; clear errors for a wrong repo or token | ✅ errors; 👤 connecting |
| R36 | sync by itself (pull on open, push after typing) and on Sync now, where a pen writes "Just synced" | 👤 |
| R37 | keep both versions when a note changed in two places, and guide you through merging | 👤 |
| R38 | store notes as plain Markdown files Obsidian can read | 👤 |
| R39 | export a note, a Collection, the archive or everything (.md, PDF or Print), and restore a backup without overwriting | ✅ choices and restore; 👤 the files and print window |
| R40 | keep the token only in this browser | 👤 |

## 3. Workflows

Each workflow is a real way someone uses Glacier, from start to end.

| ID | Workflow | Steps | Claude | You |
|---|---|---|---|---|
| W1 | **First start** | Open Glacier → welcome → Start writing → write a first line → the note exists, named after the line; the welcome is gone for good | ✅ | |
| W2 | **Notes for a lesson** | Open a lesson website → write on the empty page → the note has the page's title and site link → leave and come back → the note opens by itself | | 👤 |
| W3 | **A second note for the same page** | On that page: + → New note for this page → write → pill shows "1 of 2" → ▾ Notes for this page lists both; it lands in the same Collection as the first | | 👤 |
| W4 | **A blank note** | + → New note → type a name, Enter → write; Esc before writing makes nothing | ✅ | |
| W5 | **Organise into Collections** | Click "Add to a collection" → + New collection → name → the note is in it; another note via ⋯ → Move to collection; ▾ shows the Collection with both | ✅ | |
| W6 | **Write and format** | Heading, list (Enter continues, empty bullet ends), Ctrl+B then Enter, quote, link, italic, code, Shift+Enter, Delete and Backspace at line edges, `/` and `+` menus, Ctrl+Z | ✅ | |
| W7 | **Connect ideas** | Type `[[Name]]` → red → click → new note → write → back with ← → link is blue now → "1 backlink" on the new note → rename it → the link follows | ✅ | |
| W8 | **Find a note** | Ctrl+K → type a title word → open it; `// word` finds text; Recent shows the last 5; ← box shows the last notes | ✅ | |
| W9 | **Tidy up** | Hover a note → Archive → "Archived. Undo" → Undo; Archive section → open → Unarchive; Delete asks first; a whole Collection the same way | ✅ | |
| W10 | **Copy and export** | Ctrl+A twice, Ctrl+C → "Copied n lines", Markdown on the clipboard; ⤓ on a note or Collection → .md, PDF or Print; Settings → Export everything, Export archive, Restore from backup file | ✅ choices, copy, restore | 👤 the files, the print window |
| W11 | **Make it yours** | Settings → paper, font, text size, Shortcuts panel on, Tabs and notes options, Panels | ✅ | 👤 Panels beside |
| W12 | **Sync with GitHub** | Settings → Notes repo → repo and token → Connect and sync → progress → Ready; type → it appears on GitHub; change on GitHub → Sync now → pen writes "Just synced" → change arrives | ✅ wrong token message | 👤 |
| W13 | **A second browser** | Connect Firefox to the same repo → notes arrive; edit the same note in both before syncing → orange dot → ▾ Several versions → open the copy → bar guides you → delete it | | 👤 |
| W14 | **Switch tabs while studying** | Two lesson tabs with notes → switch → the sidebar shows each tab's note; a browser tab keeps the note | | 👤 |
| W15 | **Open and close quickly** | Alt+Shift+G opens, again closes, from the page and while typing; text typed just before closing is kept | | 👤 |
| W16 | **When something goes wrong** | Wrong token, repo without owner, offline, a file that isn't a zip: each gives a plain message and changes nothing | ✅ token, owner, broken zip | 👤 offline |

**Result of this run:** every workflow Claude can test works (W1, W4 to W11, W16, plus the parts marked in W10 and W12). No new bugs. What's left for you is marked 👤 above: W2, W3, W12 to W15, and the 👤 parts of W10, W11 and W16.
