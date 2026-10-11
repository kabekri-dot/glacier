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
- Test through these seams only: the **Notebook core's public actions** (with in-memory stand-ins for storage and GitHub), the **editor-model functions**, and the **Screen** (`src/screen.mjs`: what the sidebar shows, the fresh page, ← and saving the open note, through its public interface with the in-memory storage and injected timers; the Note session and the ← history sit behind it), the **Opening flow** (what the sidebar shows for the current page, through its public interface with a fake browser page), and the **Panel placement** (`src/panel-place.mjs`: where settings, the Shortcuts panel and the explanation card show, the frames beside the sidebar and the "page doesn't allow" line, through its public interface with a fake browser port). Never test private helpers or the DOM.
- One behaviour per test, named the way a user would describe it.
- The UI is checked by hand, so don't add browser test tools.

## Domain language and data

- Use the glossary's words exactly: Note (with an optional page and Course; no Lesson Note or Concept Note, ADR 0010), Course, Source, Link, Missing Link, Backlink, Sketch, Theme, Font Override, Notes Repo, Sync, Conflict Copy, Export. Don't use the synonyms it lists as "avoid".
- Note files are Obsidian-compatible: filename = title, YAML frontmatter (`course`, `source`, `created`, `edited`), `courses/<Course>/` or `notes/`, titles unique across the whole Notebook (ADR 0005, ADR 0010).
- A sync conflict creates a Conflict Copy and never overwrites (ADR 0004).
- The GitHub token stays in the browser's extension storage and is **never** written into notes, files, logs or commits (ADR 0003).
- The optional host permission is only requested after a click, and the extension never reads, stores or sends page content (ADR 0008).

## If a change needs to break a rule

Don't silently break an ADR. Stop and leave a comment on the issue explaining why the rule might need to change.

## Visible text

Every piece of text the app shows (sidebar, forms, menus, cards, hover text, the manifest's descriptions) follows these rules. `test/visible-text.test.mjs` checks the dash and capitals rules.

- **No dashes as punctuation**: no em dash, no en dash, no " - " between words. Rewrite the sentence (a full stop, a comma, or "or").
- **No all-caps words** and no `text-transform: uppercase`.
- **No AI look**: no emoji, no sparkles, no exclamation-heavy or salesy wording. Plain, short, friendly sentences.
- Markdown syntax Glacier teaches (`- ` for a bullet in the `/` menu and the cheat sheet) is syntax, not punctuation, and stays.
- Code comments are not visible text.
