# Where your notes live: Google Drive, a folder or GitHub, one at a time

v1 synced only to a GitHub repo with a fine-grained token. That works for developers, but people like the user's brother have no GitHub account and gave up at the token. v2 (decided in a grilling on 2026-10-13) lets everyone keep their notes safe and on their own devices with one click, while staying a personal notebook: notes are never shared between people.

## Decision

- **Three places, one at a time**: **Google Drive** (shown first, "Sign in with Google"), **a folder on this computer** (Chrome family only) and **GitHub** (as in v1). "Only in this browser" stays the default until one is chosen. Settings has a section **Where your notes live** with these four choices, each with a small pixel icon, and Backup (Download everything, Restore from backup file) under it.
- **The same files everywhere**: one Markdown file per note in `collections/<Collection>/`, `notes/` and `archive/` (ADR 0005, ADR 0010), plus sketch `.svg` files next to their notes (ADR 0007). Moving between places is copying the same files, and Obsidian can open any of them.
- **Switching combines**: the notes in the browser and the notes already in the new place are combined like the GitHub first sync; a note that differs gets two versions (ADR 0004). Nothing is deleted. The old place is left untouched and keeps a frozen copy.
- **Google Drive**: Glacier only sees files it made (`drive.file` scope, non-sensitive, so no Google security review). It is registered under a separate Gmail account for Glacier, in Production status (Testing would ask everyone to sign in again every 7 days). Chrome signs in with `chrome.identity.getAuthToken` and renews quietly; Edge and Firefox use `launchWebAuthFlow` and renew quietly every hour while the person is signed in to Google. The extension gets a fixed ID (manifest `key`, Firefox `gecko.id`) so the sign-in redirect stays valid.
- **A folder**: picked with the browser's folder picker (File System Access API), which only Chrome-family browsers have; Firefox shows the choice as not available there. Chrome forgets folder access on restart; the first click in Glacier after a restart reconnects it quietly, and if Chrome still asks, the sync box says so with one **Reconnect** button. Notes keep saving in the browser meanwhile.
- **A reminder, once or twice**: while notes live only in the browser, after the third note the sync box opens once with a pixel cloud: "Your notes live only in this browser for now. Give them a safe home in your Google Drive." with **Keep them safe** and **Not now**. After Not now it comes back once, two weeks later, then never. A tiny pixel cloud on the sync dot stays until a place is chosen.

## Considered Options

- **Our own server with Glacier accounts**: someone has to run and pay for it and look after other people's notes and passwords. Too much for a personal notebook; the person's own cloud storage gives the same result.
- **Several places at once** (Drive plus a folder copy): every change would have several "truths", and conflicts would multiply. Export everything covers an extra copy.
- **One data file in Drive instead of Markdown files**: faster to sync, but the notes would be unreadable without Glacier, against ADR 0005.
- **Dropping GitHub**: it works, is tested and keeps a history; it stays as a choice.
