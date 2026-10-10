# Glacier – scope

What goes into which version. Terms are defined in [CONTEXT.md](../CONTEXT.md), and the bigger decisions are in [docs/adr](adr/).

## v1

- Sidebar in Chrome and Firefox, opened from the toolbar or a keyboard shortcut
- **One layout: Zen.** Only the page. One small pill at the top holds the title, sync status, search, recent notes and the notebook, and a small button bottom-left shows what links here. The other nine layouts from the prototype wait until later (see below)
- Opening the panel on a known lesson page opens its Lesson Note. On an unknown page, "+ Lesson note" uses the page title and Source. Reading the current tab needs an optional permission, asked on the first click (ADR 0008); without it, "+ New note" creates a Lesson Note by hand
- Course picked when creating a Lesson Note, last-used Course preselected
- Note list: Courses → Lesson Notes, plus a Concepts section
- Live-preview writing: no Edit/Preview switch, the cursor lands in the note when it opens, and Markdown shows as formatting while you write, including on the current line, where the Markdown marks stay visible but faded (see [ADR 0006](adr/0006-live-preview-block-editor.md)). A plain click follows a Link. Frontmatter hidden and shown as a small header (Course · source ↗)
- `/` command menu at the start of a line, showing the Markdown for each command. A small + at the left of the current line opens the same menu
- Shortcuts panel (Markdown cheat sheet): docked to the left of the sidebar like settings, outside the notebook. Folds into a slim vertical tab on the sidebar's edge and stays open or folded until you change it. Switched on or off in settings. Nothing extra in the note's top bar, which is kept for the title
- `[[` autocomplete for Links
- Selecting and copying across paragraphs: drag-select works over several lines (a plain click starts editing). Ctrl+A selects the line, Ctrl+A again the whole note. Copy keeps the Markdown, so it pastes back intact
- Renaming rewrites every Link. Missing Links render red, and clicking one creates a Concept Note
- Backlinks: in Zen, the small link button bottom-left lists the notes that link here
- Search across titles and text (simple substring)
- Sync with the Notes Repo: pull on panel open, push after typing stops, Conflict Copies. Status indicator: synced · syncing · offline · conflict, plus "last synced". "Sync now" shows a short confirmation
- First sync: a progress screen (connecting → downloading n/total notes → linking → ready), then a confirmation
- Manual Export/Import (zip of `.md` files)
- Themes in two groups. **Nature**: Glacier (default), Forest, Ocean, Desert, Volcano, Aurora (dark), each with a faint pixel-art panorama along the bottom of the paper, from left to right. It keeps its height, so a wider sidebar shows more landscape, and it fades out upwards with room left below the last line, so text is never drawn over it. **Classics**: Blank Page, School Notebook, Chalkboard (dark), Moleskine, Engineer
- Text size slider (85–150 %). Line spacing grows with it, so ruled and grid paper still lines up
- The sidebar is resizable (Chrome and Firefox both let you drag the sidebar wider). Layouts must work from about 260 px up
- Font Override: Theme default / Shantell Sans / Patrick Hand / Kalam Light / Caveat / Architects Daughter. Fonts bundled
- Glacier icon: pixel-art ice on smooth sky and water. Used as the toolbar icon in Chrome and Firefox, and as a large round button floating in the bottom-right corner of the sidebar. It opens settings as a panel that expands to the left of the sidebar, over the web page. The notebook keeps its size and shows changes live. Settings sections fold open and closed: Paper, Writing (font + text size), Shortcuts panel, Notes repo (token, Sync, Export/Import)
- Panels beside the sidebar use an optional permission, asked for only when settings or shortcuts first open, behind Glacier's own explanation card. Declined: both panels open inside the sidebar instead ([ADR 0008](adr/0008-optional-on-demand-host-permission.md))

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

## v1.1

- Extract selected text into a new Concept Note, leaving a Link behind

## v2

- Sketch blocks: insert with + or `/sketch`, then drag circles, triangles, rectangles, squares, arrows, lines and free text into a drawing area inside a note. Saved as `.svg` next to the note ([ADR 0007](adr/0007-sketch-blocks-as-svg-files.md))

## Later (maybe never)

- More layouts, added one at a time after using Zen for a few weeks. The prototype has all nine, grouped: Drawer (focus on writing); Course path, Breadcrumb, Home (always know where you are); Split, Index tabs, Icon rail (notebook in view); Bottom tabs, Note tabs (familiar app style)

- Clipping highlighted page text into the current note (v2: reuses the optional permission from ADR 0008, and the explanation card gains one line for it)
- More Themes (Dot Journal, Legal Pad)
- Attaching the current page as the Source of a Lesson Note made without one
- A link shortcut (Ctrl+K is kept for search; links are typed as `[text](url)`, #43)
- Pasting from a web page keeps its formatting (headings, bold, lists, links turned into Markdown); v1 pastes plain text
- Unlinked mentions
- Tags
- Flashcards / spaced repetition
- Graph view
