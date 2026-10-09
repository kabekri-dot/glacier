# Plain HTML, CSS and JavaScript with no build step and no npm

Glacier is written in plain HTML, CSS and JavaScript. It has no framework, bundler or npm dependencies, and any library (e.g. a Markdown renderer) is copied in as a single vendored file. The author is learning web development by building Glacier and must be able to read every file top to bottom. Each layer of tooling is something to learn first and something that breaks after months of not being touched.

Tests are the one exception to "no tooling", and they use only Node's built-in `node --test`, still with no npm packages. They cover only the logic that could silently damage notes: rewriting links on rename, frontmatter parsing, Source matching, title uniqueness and conflict detection. That logic therefore lives in plain functions separate from the UI.

## Clarification (2026-10-09): developer tools may use npm

The "no npm" rule is about **the extension and its tests**: they must still run with no npm install. Developer tools that never ship in the extension may use npm as dev dependencies. The first one is **Sandcastle**, which runs AI agents in Docker to work through the `ready-for-agent` issues. Its `node_modules/` is git-ignored, and its sandbox setup installs nothing for Glacier itself. The reasons above still hold for the extension: browsers run plain files directly, fewer dependencies means less rot, Firefox review is easier without bundled code, and there is less code from strangers inside an extension that can see the pages you visit. Agents now write most of the code, so "readable by the author" means readable by the person reviewing it.
