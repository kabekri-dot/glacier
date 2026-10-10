# Notes are written in a live-preview block editor, built by hand

There is no Edit/Preview switch: the cursor lands in the note when it opens, and the Markdown shows as its finished formatting while you write, like Obsidian's live preview. A note is edited as a list of blocks, one per line, except a fenced code block, which stays together. Every block is rendered except the one you're on, which shows its raw Markdown in a small `<textarea>`. Enter splits a line (and continues a list), Backspace at the start of a line joins it with the line above, ↑/↓ move between lines, and clicking puts the caret where you clicked. Typing `/` at the start of a line opens a command menu that shows each command's Markdown, so the syntax is learned by using it.

This is the most complex part of Glacier, and it is still written without libraries ([ADR 0002](0002-plain-js-no-build-step.md)). The block logic (splitting, merging, list continuation, mapping a click to a raw offset) is plain functions, covered by `node --test`. It is built late in v1, once notes, links and sync work.

## Considered Options

- **Textarea plus a preview toggle**: simplest, but the extra click got in the way of writing.
- **Textarea over a coloured mirror** (tried in the prototype): always editable, but Markdown stays visible (`###` doesn't become a heading), because the mirror may only change colours, never size.
- **CodeMirror**: real live preview, but large and impractical without a build step.

## Addition (2026-10-10): the line you're on is formatted too (#36)

Waiting until you leave a line before its formatting appears broke the writing flow. So the focused line is now styled while you type, like Obsidian's live preview. `## ` becomes a heading as soon as the space is typed, and `**word**` turns bold when the closing `**` is typed. The Markdown marks stay on that line but faded, all of them, wherever the caret is (not just around it), so nothing shifts sideways as the caret moves. Half-typed formatting (`**word` with no closing `**` yet) stays plain until it's closed. Every other line stays fully rendered with its marks hidden, as before.

The focused line stops being a `<textarea>` and becomes a plain-text `contenteditable` element whose content is re-drawn as styled spans after each edit. Because every mark stays visible, the element's text is exactly the raw Markdown line, so a caret offset in the element is a raw offset, and the editor session keeps owning text and caret as before. Paste and drop insert plain text only.

### Considered Options

- **Convert and hide the marks** (like Notion): cleanest look, but the Markdown disappears, which undoes the `/` menu's job of teaching the syntax.
- **Redraw the line when you pause typing**: cheapest, but the formatting still arrives late and jumps into place.
- **Show marks only around the caret** (exact Obsidian behaviour): text shifts as marks appear and disappear, and it's harder to build.

## Addition (2026-10-10): formatting shortcuts (#43, #44)

Text you've already written is formatted by selecting it and pressing **Ctrl+B** (bold), **Ctrl+I** (italic) or **Ctrl+E** (inline code); Cmd on a Mac. Typing the marks by hand keeps working, and the `/` menu stays a start-of-line menu. With nothing selected, a shortcut turns the formatting on for what you type next, and a second press steps out of it. A partly formatted selection becomes fully formatted; only a fully formatted one loses it. A selection over several lines gets marks on each line, with the line's start (`- `, `## `, `> `) outside them, because Markdown marks can't span lines. In code, bold and italic do nothing. The selection stays after formatting, so bold and italic combine by pressing both.

### Considered Options

- **Ctrl+K for links**: the usual writing-app key, but it's also the common search key, and Glacier's search will want it. Links are typed as `[text](url)`.
- **Applying `/` menu commands to a selection**: would make the menu do two jobs; shortcuts are what people already know.
- **Formatting the word under the caret when nothing is selected**: surprising at a word's edge; turning formatting on for the next typing matches Word and Google Docs.

## Addition (2026-10-10): Enter inside formatting (#45)

With the caret inside a pair of inline marks (`**key|**`, or `**ke|y**`), Enter jumps past the closing marks instead of starting a new line, so leaving bold is one key press, like a second Ctrl+B. A second Enter makes the new line. Shift+Enter inside formatting does start a new line and carries the formatting over: the marks are closed at the end of the line and reopened on the next, with the caret inside, because Markdown marks can't span lines.

## Addition (2026-10-10): selecting and copying as Markdown (#7)

A drawn line starts editing on a plain click, not on the press, so a press that drags selects across lines like on any page. (While the `/` menu is open a press still acts at once, so the menu's dismissal can't redraw the note mid-click.) Ctrl+A selects the line you're on, and a second Ctrl+A the whole note, never the rest of the panel. Copying puts the Markdown on the clipboard, not the drawn text: each edge of the selection is mapped back to the raw line, taking in the marks of everything it covers whole (`## `, `- `, `**`, `[[ ]]`, code fences) and none of its neighbours'. So the whole note copies back exactly, and a note pasted into Obsidian keeps its headings, lists, Links and code.
