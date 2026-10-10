# Coding Standards

Glacier's rules come from its ADRs (`docs/adr/`) and glossary (`CONTEXT.md`). The reviewer checks every change against them.

## Stack (ADR 0002)

- Plain HTML, CSS and JavaScript (ES modules). **No build step, no bundler, no TypeScript, no framework.**
- **No npm packages inside the extension.** A library the extension needs is copied in as one vendored file. npm is only allowed for developer tools such as Sandcastle, and those never ship in the extension.
- One `manifest.json` that works unchanged in Chrome (side panel) and Firefox (sidebar) (ADR 0001).
- Code a beginner can read top to bottom: clear names, short functions, comments only where the *why* isn't obvious.

## Structure

- **Notebook core**: all note, Link, title, search, file-format and sync logic. **No screen code** (no DOM, no browser APIs). Browser storage (IndexedDB) and GitHub are **plugged in from outside**, so the core never imports them directly.
- **Editor model**: pure functions on one note's text (blocks, Enter/Backspace/paste, `/` commands, raw-offset mapping, copying as Markdown).
- **UI** (the Zen panel, settings, shortcuts) only calls these two and draws the result.

## Testing

- Test-first (red → green → refactor), with **`node --test` only**: no test frameworks, no npm.
- Test through the two seams only: the **Notebook core's public actions** (with in-memory stand-ins for storage and GitHub) and the **editor-model functions**. Never test private helpers or the DOM.
- One behaviour per test, named the way a user would describe it.
- The UI is checked by hand, so don't add browser test tools.

## Domain language and data

- Use the glossary's words exactly: Lesson Note, Concept Note, Course, Source, Link, Missing Link, Backlink, Sketch, Theme, Font Override, Notes Repo, Sync, Conflict Copy, Export. Don't use the synonyms it lists as "avoid".
- Note files are Obsidian-compatible: filename = title, YAML frontmatter (`type`, `course`, `source`, `created`), titles unique across the whole Notebook (ADR 0005).
- A sync conflict creates a Conflict Copy and never overwrites (ADR 0004).
- The GitHub token stays in the browser's extension storage and is **never** written into notes, files, logs or commits (ADR 0003).
- The optional host permission is only requested after a click, and the extension never reads, stores or sends page content (ADR 0008).

## If a change needs to break a rule

Don't silently break an ADR. Stop and leave a comment on the issue explaining why the rule might need to change.
