# Glacier

A personal notebook that lives in the browser's sidebar, for taking and
connecting notes while following online courses. Glacier opens in Chrome's
side panel and Firefox's sidebar from one codebase (ADR 0001), and is written
in plain HTML, CSS and JavaScript with no build step and no npm (ADR 0002).

See [CONTEXT.md](CONTEXT.md) for the words Glacier uses, [docs/adr](docs/adr)
for the bigger decisions and [docs/scope.md](docs/scope.md) for what goes into
which version.

## Project shape

- `manifest.json` — one manifest for both browsers (`side_panel` for Chrome,
  `sidebar_action` for Firefox; each browser ignores the key it doesn't know).
- `background.js` — opens the sidebar from the toolbar button and the
  keyboard shortcut.
- `sidebar/` — the Zen panel: `panel.html`, `panel.css`, `panel.js`.
- `fonts/` — the bundled handwriting fonts (Latin subset, woff2), each with
  its SIL Open Font License.
- `icons/` — the glacier art: the toolbar icon (PNG) and the round settings
  button (SVG).
- `art/` — one pixel-art panorama (SVG) per Nature paper.
- `tools/draw-art.mjs` — a developer tool that draws `icons/` and `art/`.
  Run `node tools/draw-art.mjs` after changing the art; the extension never
  loads it.
- `src/` — the note logic, with no screen code (the first two files are the
  two test seams):
  - `notebook.mjs` — the **Notebook core** (all note logic; storage is plugged
    in from outside).
  - `editor-model.mjs` — the **editor model** (pure functions on one note's
    text).
  - `memory-storage.mjs` — an in-memory storage stand-in for tests.
  - `look.mjs` — the papers (Themes), the Font Override and the text size,
    and where the ruled lines go so the writing sits on them.
- `test/` — `node --test` tests for the two seams.

## Opening Glacier

Once loaded, open Glacier from the toolbar button or with the keyboard
shortcut **Alt+Shift+G** (free in both Chrome and Firefox). You'll see an
empty Zen page on Glacier paper.

## Loading the extension while developing

### Chrome (Load unpacked)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this project folder.
4. Pin Glacier from the puzzle-piece menu, then click it to open the side panel.

### Firefox (temporary add-on)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Choose the `manifest.json` in this project folder.
4. Click the Glacier toolbar button to open the sidebar.

A temporary add-on is removed when Firefox restarts.

## An everyday Firefox copy (signed, unlisted on AMO)

Regular Firefox only installs signed extensions permanently, so for daily use
sign Glacier as an **unlisted** add-on on
[addons.mozilla.org](https://addons.mozilla.org) (private, not published):

1. Create a free Firefox Add-on Developer account.
2. Zip the extension files (with `manifest.json` at the root of the zip).
3. On the AMO Developer Hub choose **Submit a New Add-on → On your own**
   (this keeps it unlisted and private).
4. Upload the zip; AMO validates and signs it and returns a signed `.xpi`.
5. Install the signed `.xpi` in your everyday Firefox — it stays after restart.

## Running the tests

The extension and its tests run with no npm install and no build step
(ADR 0002). Only the logic that could silently damage notes is tested, through
the two seams.

```sh
node --test
```
