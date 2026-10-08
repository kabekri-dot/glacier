# Plain HTML, CSS and JavaScript with no build step and no npm

Glacier is written in plain HTML, CSS and JavaScript. It has no framework, bundler or npm dependencies, and any library (e.g. a Markdown renderer) is copied in as a single vendored file. The author is learning web development by building Glacier and must be able to read every file top to bottom. Each layer of tooling is something to learn first and something that breaks after months of not being touched.

Tests are the one exception to "no tooling", and they use only Node's built-in `node --test`, still with no npm packages. They cover only the logic that could silently damage notes: rewriting links on rename, frontmatter parsing, Source matching, title uniqueness and conflict detection. That logic therefore lives in plain functions separate from the UI.
