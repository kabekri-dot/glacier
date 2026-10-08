# Spec: Glacier v1

> Status: ready-for-agent (draft). It goes into GitHub Issues on the `glacier` code repo once that repo exists and is linked (see docs/agents/issue-tracker.md).
> Terms follow [CONTEXT.md](../CONTEXT.md); decisions follow [docs/adr](adr/); feature boundaries follow [scope.md](scope.md).

## Problem Statement

While following online courses (The Odin Project, Khan Academy) I need to take notes without leaving the lesson. Switching to a separate app breaks my flow, scattered notes don't connect, and notes kept in one browser are missing in the other (I use Chrome and Firefox equally). Most note apps are either bloated or look generic and machine-made. I'm also learning web development, so the tool has to be something I can build, understand and keep working myself for years.

## Solution

Glacier is a browser extension that lives in the sidebar of Chrome and Firefox, right next to the lesson. Opening it on a lesson page opens that lesson's **Lesson Note**, or offers to start one. I write straight away on paper that looks like a real notebook, with a slightly handwritten font and Markdown that turns into formatting as I type. Ideas get their own **Concept Notes**, connected with `[[Links]]`, and every note shows its **Backlinks**. Everything is saved in the browser, so it works offline, and syncs through a private GitHub repository (the **Notes Repo**) as plain Markdown files, so Chrome and Firefox share one **Notebook** and the notes outlive the app. v1 uses a single layout, **Zen**: only the page, plus one small pill on top that holds everything else.

## User Stories

### Opening Glacier next to a lesson
1. As a learner, I want to open Glacier in my browser's sidebar from the toolbar or a keyboard shortcut, so that my notes sit next to the lesson without switching windows.
2. As a learner, I want Glacier to work the same in Chrome and Firefox, so that it doesn't matter which browser I study in.
3. As a learner, I want the sidebar to open the Lesson Note for the page I'm on, so that I can continue writing without searching.
4. As a learner, I want the same lesson to match its note even when the address has extra bits like `?utm=…` or `#section-2`, so that I never get a duplicate note for the same lesson.
5. As a learner, I want a clear "No note for this page yet · + Lesson note" prompt on a new lesson, so that starting a note is one click.
6. As a learner, I want a new Lesson Note to take the page's title (editable) and remember the page as its Source, so that I can always go back to the lesson.
7. As a learner, I want to pick the Course for a new Lesson Note, with the last-used Course preselected, so that studying one course for weeks costs me a single Enter.
8. As a learner, I want a title that already exists to get the Course added automatically, e.g. "Introduction (TOP Foundations)", so that every title stays unique and every Link stays unambiguous.
9. As a learner, I want the cursor to be in the note as soon as it opens, so that I can start typing immediately.

### Writing
10. As a learner, I want to write without an Edit/Preview switch, so that nothing gets between me and my notes.
11. As a learner, I want Markdown to turn into formatting as I write (headings grow, `- ` becomes a bullet, `**bold**` becomes bold, code becomes a code font), with only the line I'm on showing its raw Markdown, so that my notes look finished while staying plain text.
12. As a learner, I want to click anywhere in my text and have the cursor land exactly there, so that editing feels like a normal text field.
13. As a learner, I want Enter to start a new line, continuing a list when I'm in one and ending it on an empty bullet, so that lists feel natural.
14. As a learner, I want Backspace at the start of a line to join it with the line above, so that I can undo a line break.
15. As a learner, I want ↑ and ↓ to move between lines, so that I can navigate with the keyboard.
16. As a learner, I want pasting several lines to keep them as separate lines, so that pasted notes keep their structure.
17. As a beginner who doesn't know Markdown yet, I want typing `/` at the start of a line to open a menu that shows each command next to its Markdown, so that I learn the syntax by using it.
18. As a beginner, I want a small + at the left of the current line that opens the same menu, so that I can find the commands without knowing about `/`.
19. As a learner, I want a hint like "Type / for commands — or click + on the left" on empty lines, so that I'm reminded the menu exists.
20. As a learner, I want typing `[[` to suggest matching note titles, so that linking is fast and the titles are spelled correctly.
21. As a learner, I want to drag-select across several paragraphs, so that I can copy more than one paragraph.
22. As a learner, I want Ctrl+A once to select the current line and twice to select the whole note (not the whole web page), so that I can copy a full note.
23. As a learner, I want copying to keep the Markdown (headings, lists, Links, code), so that pasting into another note or into Obsidian keeps the formatting.

### Connecting ideas
24. As a learner, I want to write `[[Title]]` to link to another note, so that ideas connect across lessons and courses.
25. As a learner, I want Links to notes that don't exist yet shown in red (Missing Links), so that I can see which ideas still need a note.
26. As a learner, I want clicking a Missing Link to create a Concept Note with that title and open it, so that I can write the link first and the idea later.
27. As a learner, I want a plain click on a Link to open the linked note, so that following ideas is effortless.
28. As a learner, I want to see which notes link to the current note (Backlinks), so that a Concept Note shows every lesson where the idea came up.
29. As a learner, I want renaming a note to rewrite every Link to it everywhere, so that my connections never break.
30. As a learner, I want renaming to be refused, with a suggestion, when the new title is already taken, so that titles stay unique.
31. As a learner, I want Concept Notes to belong to no Course, so that one idea ("Box model") is shared by all my courses.

### Finding notes (Zen layout)
32. As a learner, I want the note to fill the whole sidebar, so that I can focus on writing.
33. As a learner, I want one small pill at the top showing the note's title and sync status, so that the essentials are always visible without clutter.
34. As a learner, I want clicking the pill to open a menu with search, recent notes and the Notebook (Courses → Lesson Notes, plus Concepts), so that everything else is one click away.
35. As a learner, I want Ctrl+K to open that menu with the search box focused, so that I can jump to any note from the keyboard.
36. As a learner, I want search to match both titles and text, with the match highlighted in a snippet, so that I find notes by what I wrote in them.
37. As a learner, I want "+ Lesson note" and "+ Concept" in that menu, so that I can create notes from anywhere.
38. As a learner, I want a small link button at the bottom-left showing how many notes link here, and listing them when clicked, so that Backlinks don't take space while I write.
39. As a learner, I want Esc to close any open menu, so that I get straight back to my page.

### Look and feel
40. As a learner, I want to choose a Theme from two groups, Nature (Glacier, Forest, Ocean, Desert, Volcano, Aurora) and Classics (Blank Page, School Notebook, Chalkboard, Moleskine, Engineer), so that the notebook matches my mood.
41. As a learner, I want Glacier to be the default Theme, so that the app has a clear identity from the start.
42. As a learner, I want each Nature Theme to show a faint pixel-art panorama along the bottom of the paper that reveals more landscape when I widen the sidebar, so that the page feels alive without getting in the way.
43. As a learner, I want my text never to sit on top of that picture, so that it's always readable.
44. As a learner, I want my writing to sit on the ruled lines of the Classic papers, at every font and text size, so that it looks like a real notebook.
45. As a learner, I want a Font Override (Shantell Sans, Patrick Hand, Kalam Light, Caveat, Architects Daughter, or the Theme's default) that stays when I switch Themes, so that my favourite handwriting follows me.
46. As a learner, I want a text-size slider (85–150 %), so that I can read comfortably.
47. As a learner, I want all fonts to come bundled with the extension, so that it works offline and keeps working for years.
48. As a learner, I want a round glacier button in the corner of the sidebar to open settings, so that settings are easy to find but out of the way.
49. As a learner, I want settings to open beside the sidebar while my notebook keeps its size and shows every change live, so that I can judge a Theme on my real note.
50. As a learner, I want the settings sections (Paper, Writing, Shortcuts panel, Notes repo) to fold open and closed, with the settings header always visible, so that settings stay tidy.
51. As a beginner, I want a Markdown shortcuts panel that docks beside the sidebar, folds into a slim tab on its edge and stays as I left it, so that the cheat sheet is there while I learn.
52. As a learner, I want the same glacier art as my browser toolbar icon, so that I recognise Glacier at a glance.

### Permissions
53. As a user, I want installing Glacier to show no scary permission warning, so that I can trust it from the start.
54. As a user, I want Glacier to explain in its own words, the first time I open settings or the shortcuts panel, why it needs to draw on the page, and only then show the browser's prompt, so that I understand what I'm allowing.
55. As a user, I want to be able to decline and still use everything, with the panels opening inside the sidebar instead, so that saying no costs me nothing important.
56. As a user, I want to change that choice later in settings, so that I'm never locked in.

### Sync, safety and data
57. As a learner, I want my notes saved in the browser as I type, so that nothing is lost when I close the tab and everything works offline.
58. As a learner, I want to connect a private GitHub repository by pasting a fine-grained token once per browser, so that my notes sync without building a login.
59. As a learner, I want the very first sync to show progress (connecting → downloading n of N notes → linking → ready), so that I know what's happening.
60. As a learner, I want Glacier to pull changes when the sidebar opens and push a few seconds after I stop typing, so that I never have to remember to sync.
61. As a learner, I want a sync status (synced · syncing · offline · conflict, plus "last synced"), so that I always know where my notes stand.
62. As a learner, I want a "Sync now" button with a short confirmation, so that I can force a sync before switching browsers.
63. As a learner, I want edits made to the same note in both browsers to produce a Conflict Copy instead of overwriting either, so that I never lose text.
64. As a learner, I want my notes stored as plain Markdown files named after their titles, with a small frontmatter block (type, course, source, created), in `courses/<Course>/` and `concepts/`, so that they're readable in GitHub and Obsidian without Glacier.
65. As a learner, I want the frontmatter hidden in the editor and shown as a small "Course · source ↗" header, so that I never edit YAML by hand.
66. As a learner, I want the Git history of the Notes Repo to act as my backup, so that I can restore any earlier version of a note.
67. As a learner, I want to Export the Notebook as a zip of Markdown files and Import it again, so that I have a fallback if GitHub is unavailable or I set up a new browser.
68. As a learner, I want my GitHub token stored only in that browser and never synced into my notes, so that it can't leak through the Notes Repo.
69. As a learner, I want a clear error when my token has expired, so that I know to make a new one.

### Building and maintaining it (developer-learner)
70. As the developer, I want plain HTML, CSS and JavaScript with no build step and no npm, so that I can read every file and it still runs years from now.
71. As the developer, I want all note, link and sync logic behind one Notebook core that has no screen code, so that I can test it with `node --test` without a browser.
72. As the developer, I want the editor's line logic as separate pure functions, so that the trickiest behaviour is tested in small, readable tests.
73. As the developer, I want browser storage and GitHub plugged into the core from outside, so that tests can use simple in-memory stand-ins.
74. As the developer, I want a single manifest that works in both browsers, so that I maintain one codebase.
75. As the developer, I want to install my everyday Firefox copy through unlisted signing and load development copies temporarily, so that the version holding my notes is separate from the one I'm changing.

## Implementation Decisions

**Modules**
- **Notebook core** (test seam 1). This holds all domain behaviour, has no screen code, and is the only door tests use for it. Its actions, named in CONTEXT.md terms:
  - *note for a page* (Source matched without query string or fragment); *create Lesson Note* (with the title-clash suffix); *create Concept Note*;
  - *rename* (checks title uniqueness, then rewrites every Link and renames the file); *follow Link* (creates a Concept Note for a Missing Link);
  - *Backlinks*, *outgoing Links*, *search* (title and text, substring), *list Courses / Lesson Notes / Concepts*, *recent notes*;
  - *save note text*; *sync* (pull, push, Conflict Copy); *export* and *import*.
  - Turning a note into its file (YAML frontmatter + body, filename = title) and back lives inside the core.
- **Storage adapter**: implements the core's storage interface with IndexedDB. In tests it's an in-memory stand-in.
- **Remote adapter**: implements the core's remote interface with the GitHub contents API, a fine-grained token limited to the one Notes Repo with *Contents: read/write*. Writes carry the file's last known version, so a stale write is rejected, and the core turns that rejection into a Conflict Copy (ADR 0004). A rename is a single commit. In tests it's an in-memory stand-in that can simulate a stale write.
- **Editor model** (test seam 2). These are pure functions on one note's text:
  - splitting text into blocks (one per line; a fenced code block stays one block; a sketch embed line is one block);
  - Enter, Backspace and paste behaviour; the `/` command list and filtering; applying a command;
  - mapping a position in the rendered text back to a raw Markdown offset, used both for click-to-caret and for copying as Markdown.
- **Zen panel UI**: the screen code, i.e. rendering blocks, the pill and its menu, the Backlinks button, the first-sync screen, the toasts. It's tested by hand.
- **Settings and shortcuts panels**: drawn beside the sidebar by an on-demand content script when the optional permission is granted, and inside the sidebar otherwise (ADR 0008). These come late in v1; until then both open inside the sidebar.
- **Themes**: each Theme is data (colour tokens, paper pattern, default font). The Nature panoramas are generated once as pixel-art SVG (smooth sky and water, pixel subjects, a fixed-height strip anchored bottom-left, fading upwards). Ruled lines are shifted to sit just under the text baseline. Non-text blocks are padded to whole rows so the text stays on the lines.

**Decision-rich shapes from the prototype** (trimmed, for reference):

Editor blocks, as worked out in the prototype:
```
note text  ⇄  blocks: string[]        // join("\n") must give back the exact text
block kinds by its raw text:
  "```…```" (multi-line)  → code block (one block)
  "![[<name>.svg]]"       → sketch embed (v2 renders it; v1 shows the line)
  "#|##|### text"         → heading 1–3
  "<indent>- text"        → list item
  anything else           → paragraph line
rendered text pieces carry their offset in the raw line, so a click or a copy maps back to Markdown
```

Settings and layout state the UI keeps (only these need persisting per browser): Theme, Font Override, text scale, shortcuts panel on/folded, permission choice.

**Other decisions**
- Course detection is manual: the last-used Course is preselected (no URL-prefix rules).
- The `[[` autocomplete matches note titles, and the rename flow is the only place titles change.
- Sync timing: pull on panel open, push after typing stops for a few seconds. A status indicator with four states plus "last synced".
- Fonts are bundled as files. Libraries, if any (e.g. a zip writer for Export), are vendored as single files.
- Single manifest declaring both the Chrome side panel and the Firefox sidebar. The host permission is declared optional.

## Testing Decisions

- **What makes a good test:** it calls a public action of the Notebook core or an editor-model function and checks what comes out (notes, files, Links, clipboard text), never internal details. Tests are written first (`node --test`, no npm), one behaviour each, named the way the user would describe it.
- **Notebook core (seam 1)**, with in-memory storage and remote:
  - Source matching ignores query string and fragment;
  - title uniqueness and the Course suffix;
  - rename rewrites every Link (and only exact `[[Title]]` matches) and refuses taken titles;
  - following a Missing Link creates a Concept Note;
  - Backlinks and search results;
  - file round-trip: frontmatter + body → file → note gives the same note;
  - sync pull and push;
  - a stale write produces a Conflict Copy titled "<Title> (conflict <date>)" and loses no text;
  - export → import gives the same Notebook.
- **Editor model (seam 2):**
  - blocks round-trip to the exact text;
  - a code fence stays one block;
  - Enter splits and continues lists; Enter on an empty bullet ends the list;
  - Backspace at line start joins lines; pasting splits lines;
  - `/he` lists the headings and applying a command inserts its Markdown;
  - a `/` mid-line does nothing;
  - raw-offset mapping for headings, lists, bold, code and Links;
  - copying a selection gives exact Markdown, whole note and partial.
- **Not automated:** layout, themes, pixel art, panels, drag-and-drop. These are checked by hand (and by screenshots during development), per ADR 0002.
- **Prior art:** there is no code yet. The prototype's checks covered these same behaviours (round-trip, Enter/Backspace, `/` menu, Markdown copy via a headless-browser self-test). Rebuild them properly as `node --test` files.

## Out of Scope

- Sketch blocks (drawing shapes in a note) → v2, ADR 0007. v1 leaves an embed line as plain text.
- Extracting selected text into a new Concept Note → v1.1.
- Clipping highlighted page text → v2 (reuses ADR 0008's permission).
- The other nine layouts (Drawer, Course path, Breadcrumb, Home, Split, Index tabs, Icon rail, Bottom tabs, Note tabs) → added one at a time after v1.
- Unlinked mentions, tags, flashcards, graph view, real-time collaboration, mobile.
- Automatic Course rules by URL, real three-way merging, OAuth login.

## Further Notes

- The user is a beginner building Glacier as a learning project. The agent scaffolds and guides, and the user implements features. Suggested build order: scaffold (manifest, empty Zen panel, first test) → note for a page → create Lesson/Concept Notes → editor model → Links and Backlinks → rename → storage → file format → sync → Themes and settings → permission card and beside-the-sidebar panels.
- The prototype (`prototypes/sidebar-layout.prototype.html`) is the visual reference for every screen, but must not be built on (ADR 0002). It belongs on a throwaway branch once Git is set up.
- Firefox's everyday install uses unlisted signing on addons.mozilla.org (ADR 0001).
