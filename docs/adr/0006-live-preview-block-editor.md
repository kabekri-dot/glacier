# Notes are written in a live-preview block editor, built by hand

There is no Edit/Preview switch: the cursor lands in the note when it opens, and the Markdown shows as its finished formatting while you write, like Obsidian's live preview. A note is edited as a list of blocks, one per line, except a fenced code block, which stays together. Every block is rendered except the one you're on, which shows its raw Markdown in a small `<textarea>`. Enter splits a line (and continues a list), Backspace at the start of a line joins it with the line above, ↑/↓ move between lines, and clicking puts the caret where you clicked. Typing `/` at the start of a line opens a command menu that shows each command's Markdown, so the syntax is learned by using it.

This is the most complex part of Glacier, and it is still written without libraries ([ADR 0002](0002-plain-js-no-build-step.md)). The block logic (splitting, merging, list continuation, mapping a click to a raw offset) is plain functions, covered by `node --test`. It is built late in v1, once notes, links and sync work.

## Considered Options

- **Textarea plus a preview toggle**: simplest, but the extra click got in the way of writing.
- **Textarea over a coloured mirror** (tried in the prototype): always editable, but Markdown stays visible (`###` doesn't become a heading), because the mirror may only change colours, never size.
- **CodeMirror**: real live preview, but large and impractical without a build step.
