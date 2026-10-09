# Drawings are sketch blocks inside a note, saved as SVG files next to it

Notes stay Markdown. A drawing (circles, triangles, rectangles, squares, arrows, lines, free text) lives in a **sketch block** between lines of a note. The block is written into the note as an embed line, `![[<Note title> – sketch <n>.svg]]`, and saved as that `.svg` file in the same folder as the note in the Notes Repo. The shapes are also stored as JSON inside the file's `<metadata>`, so Glacier can re-open and edit them while GitHub, Obsidian and any browser just show the picture. Sketch blocks come in v2, after notes, links and sync work, because a drawing tool (select, drag, resize, endpoints) is roughly as much work as the editor.

## Considered Options

- **Every note is a free canvas** (like OneNote): very flexible, but notes stop being Markdown, which breaks Links, search and Obsidian compatibility ([ADR 0005](0005-obsidian-compatible-note-files.md)).
- **Shapes inline in the text**: too limited for real diagrams.
- **Shapes as JSON in a fenced code block inside the note**: one file per note, but unreadable everywhere except Glacier.
