# Sidebar browser extension for Chrome and Firefox from one codebase

Glacier is a browser extension that opens in Chrome's side panel and Firefox's sidebar, rather than a web page or a desktop app, because it has to sit next to the course without leaving it and needs to know which lesson page is open. Both browsers are used equally, so one codebase serves both: a single `manifest.json` declares both `side_panel` (Chrome) and `sidebar_action` (Firefox), and each browser ignores the key it doesn't know.

## Considered Options

- **Web page in a snapped window**: simplest, but not a real sidebar and can't see the current tab.
- **Desktop app (Electron/Tauri)**: always-on-top and full disk access, but brings the heavy tooling ruled out in [ADR 0002](0002-plain-js-no-build-step.md).

## Consequences

Regular Firefox only installs signed extensions permanently, so the everyday Firefox copy is signed as an *unlisted* add-on on addons.mozilla.org (private, not published). Development uses temporary loading. Chrome uses "Load unpacked".
