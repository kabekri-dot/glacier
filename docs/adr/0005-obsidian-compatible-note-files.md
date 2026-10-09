# Note files are Obsidian-compatible: filename = title, YAML frontmatter, globally unique titles

In the Notes Repo every note is a Markdown file whose filename is its title: `courses/<Course>/<Title>.md` for Lesson Notes and `concepts/<Title>.md` for Concept Notes. Metadata (`type`, `course`, `source`, `created`) is stored as YAML frontmatter. That way `[[Title]]` Links resolve the same way Obsidian resolves them, and the Notebook stays readable and usable without Glacier, which is the longevity escape hatch.

Titles are unique across the whole Notebook, not just within a folder, so a Link always points to exactly one note. On a clash (e.g. two Courses with an "Introduction" lesson), Glacier suggests appending the Course: "Introduction (TOP Foundations)". Renaming a note renames its file and rewrites every Link to it in one commit.

## Considered Options

- **Slug filenames (`box-model.md`) with the title inside**: tidier, but breaks Link resolution in Obsidian.
- **Hidden IDs in Links (`[[a3f9|Box model]]`)**: robust to renames, but makes the files ugly and Obsidian-incompatible.
- **Titles unique per folder with path Links**: Links become messy and harder to resolve.
