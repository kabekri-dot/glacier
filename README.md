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
- `sidebar/` — the Zen panel: `panel.html`, `panel.css` and `panel.js`, which
  wires the note, the top bar and settings together. The parts it draws with
  live beside it: `menu-view.js` (the notes list behind ☰ Notes, the ✎ and
  ⋯ of its rows and the questions asked in a row), `pill-menus.js` (the headings
  under the title, + and ⋯), `title-edit.js` (renaming in place),
  `sync-box-view.js` (the sync word and its box),
  `note-details-view.js` (the Note details drawer from ⋯),
  `second-version-view.js` (the bar above a second version), `cards.js`,
  `downloads.js` (download and print) and `settings-view.js` (settings and the
  Shortcuts panel, also drawn beside the sidebar by `beside.js`).
- `fonts/` — the bundled handwriting fonts (Latin subset, woff2), each with
  its SIL Open Font License.
- `icons/` — the glacier art: the toolbar icon (PNG) and the round settings
  button (SVG).
- `art/` — one pixel-art panorama (SVG) per Nature paper, and the small
  pixel pictures of the welcome and the top bar.
- `tools/draw-art.mjs` — a developer tool that draws `icons/` and `art/`.
  Run `node tools/draw-art.mjs` after changing the art; the extension never
  loads it.
- `src/` — the note logic, with no screen code (the first two files are the
  two test seams):
  - `notebook.mjs` — the **Notebook core** (all note logic; storage is plugged
    in from outside). It hands on the parts kept in their own files:
    `note-file.mjs` (notes as Markdown files), `sketch-file.mjs` (sketches as
    `.svg` files), `sealed-notes.mjs` (secret notes) and `notes-sync.mjs`
    (sync with the Notes Home).
  - `editor-model.mjs` — the **editor model** (pure functions on one note's
    text).
  - `memory-storage.mjs` — an in-memory storage stand-in for tests.
  - `look.mjs` — the papers (Themes), the Font Override and the text size,
    and where the ruled lines go so the writing sits on them.
- `test/` — `node --test` tests for the seams named in `.sandcastle/CODING_STANDARDS.md`.

## Opening Glacier

Once loaded, open Glacier from the toolbar button or with the keyboard
shortcut **Alt+Shift+G** (free in both Chrome and Firefox). You'll see an
empty Zen page on Glacier paper.

## Clipping

Select text on a web page, then right-click and choose **Clip to Glacier**, or
press **Alt+Shift+C**. The text is added at the end of the open note as a quote
with a link back to the page. With no note open, it starts the note for that
page. If the sidebar is closed, it opens.

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
2. Make the release zip (see [Making a release](#making-a-release)).
3. On the AMO Developer Hub choose **Submit a New Add-on → On your own**
   (this keeps it unlisted and private).
4. Upload the zip; AMO validates and signs it and returns a signed `.xpi`.
5. Install the signed `.xpi` in your everyday Firefox. It stays after a restart.

## An everyday Chrome copy

Unpack the release zip into its own folder outside this project (for example
`Documents/Glacier`) and load that folder with **Load unpacked**. Development
changes in this folder then never touch your everyday notes. Chrome keeps
the notes per extension, so the everyday copy and the development copy each
have their own; sync both to the same Notes Repo to share them.

## Making a release

Every test version and release gets its own number, `major.minor.fix`:

| Change | Command | Example |
|---|---|---|
| small fixes | `node tools/new-version.mjs fix` | 1.1.0 → 1.1.1 |
| new features | `node tools/new-version.mjs feature` | 1.1.0 → 1.2.0 |
| a big new version | `node tools/new-version.mjs big` | 1.4.2 → 2.0.0 |

The command raises the version in `manifest.json`, commits it, and builds
`Glacier-<version>.zip` from the committed extension files only (no tests,
docs or robot files) in the `Glacier for testing` folder next to the project.
It refuses to run with uncommitted changes. Then:

1. `git push`, and for a release also `git tag v<version>` and `git push --tags`.
2. Firefox: upload the zip as a new version of the unlisted add-on on AMO and
   install the signed `.xpi`. Chrome: unpack the zip over the everyday copy's
   folder and press reload on `chrome://extensions`.

## Keeping notes in Google Drive

In Settings, **Where your notes live**, **Google Drive** keeps the notes as
Markdown files in a folder named `Glacier` in your Drive (ADR 0011). Glacier
asks only for the `drive.file` scope, so it sees only the files it made.

Until Glacier's sign-in is registered with Google, the choice says "Not set up
yet". Registering fills in `src/google-config.mjs`: a Web application client
(Edge and Firefox) with the redirects `https://<extension id>.chromiumapp.org/`
and Firefox's `http://127.0.0.1/mozoauth2/<id>`, and a Chrome extension client
whose ID also goes into the manifest's `oauth2` (`client_id`, and `scopes` with
the Drive scope). The manifest's `key` fixes the Chrome extension ID
(`hgcijcdlojpoichmknfepgllmkeopaak`) so the redirect stays the same; its
private key is not kept in the repo. Firefox's ID is the `gecko.id`.

## Keeping notes in a folder on this computer

In Chrome and Edge, **Where your notes live**, **A folder on this computer**
keeps the notes as Markdown files in a folder you pick with the browser's
folder picker (ADR 0011), laid out like the Notes Repo, so Obsidian can open
the same folder. Firefox has no folder picker, so there the choice is greyed.
The folder stays known to the browser in IndexedDB. After a restart Chrome
forgets that Glacier may write there; the first click in Glacier asks again,
and if Chrome still wants an answer the sync box offers **Reconnect**.

## Syncing notes with GitHub

Notes live in the browser and sync to a private GitHub repo of your own, the
Notes Repo (ADR 0003). It holds plain Markdown files, so Obsidian can open it
too (ADR 0005). Your code repo and your Notes Repo are separate.

1. Make a **private** repo for your notes, with a README so it isn't empty
   (for example `gh repo create yourname/glacier-notes --private --add-readme`).
2. Make a **fine-grained token** at
   <https://github.com/settings/personal-access-tokens/new>:
   - Repository access: **Only select repositories**, and pick the notes repo.
   - Permissions, Repository permissions, **Contents: Read and write**.
   - Copy the token (`github_pat_…`). GitHub shows it only once.
3. In Glacier open Settings (the round button bottom right), **Where your
   notes live**, choose **GitHub**, type the repo as `yourname/glacier-notes`,
   paste the token and press **Connect and sync**.
4. Do the same in every browser you use. A browser that already has notes with
   the same names gets Conflict Copies on its first sync (ADR 0004).

The token stays in that browser's storage and is never synced or exported.
When it expires, Glacier says so; make a new one and paste it in the same place.

## Running the tests

The extension and its tests run with no npm install and no build step
(ADR 0002). Only the logic that could silently damage notes is tested, through
the seams named in `.sandcastle/CODING_STANDARDS.md`.

```sh
node --test
```
