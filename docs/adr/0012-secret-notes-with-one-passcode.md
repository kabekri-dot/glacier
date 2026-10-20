# Secret notes: encrypted with one Glacier passcode, which can't be recovered

The user asked for "secret notes with passcode" (#109). Decided with the user on 2026-10-20.

## Decision

- **One Glacier passcode for every secret note.** ⋯ → **Make secret** asks for it the first time, typed twice, after one plain line: "If you forget this passcode, your secret notes can't be opened again. Nobody can recover it." **Make not secret** turns the note back into a plain one. **Change passcode** in Settings encrypts every secret note again under the new passcode.
- **Real encryption, everywhere the note is kept.** The note's text (and its sketches, so no drawing leaks as an `.svg` file) is encrypted with AES-GCM from Web Crypto, with a key derived from the passcode by PBKDF2-SHA-256 with 310 000 rounds and a random salt. The browser's IndexedDB copy, the Notes Home (Google Drive, the folder, GitHub) and every Export only ever hold the encrypted text. Web Crypto works the same in the browser and in Node, so the Notebook core does it itself (`src/secret.mjs`) and the tests use the real thing.
- **The file stays a note file** (ADR 0005): its normal frontmatter plus `secret: true`, then one fenced block, ` ```glacier-secret `, holding the salt, a check value and the encrypted text. The title stays visible, because it is the filename and Links need it; a small pixel lock shows before it in the pill and the menu.
- **The passcode is never stored.** The check value is a short known text encrypted with the key: if it opens, the typed passcode is right. The salt and the check value are kept in this browser and also travel inside each secret file, so another browser, or a restored backup, opens the notes with the same passcode and nothing else.
- **Unlocked only for a while, and only in memory.** Typing the passcode keeps the key and the opened text in the sidebar's memory, never in storage. They are forgotten when the sidebar closes or after 10 minutes without typing; then the notes lock again.
- **Locked notes keep their secret.** Search doesn't look inside them, their Links and Backlinks are not shown, Print and Download ask for the passcode first, and Extract and Clipping don't write into them. A note extracted from a secret note is secret too. Download gives the note's file as it is kept, still encrypted; Print shows the text, so it needs the note open.
- **No recovery.** Nobody, Glacier included, can open a secret note without its passcode. A forgotten passcode means those notes are lost; that is the price of the files holding only ciphertext.

## Consequences

- Renaming a note can't rewrite the Links inside a locked secret note, so those may become Missing Links until they are fixed by hand.
- A change of passcode in one browser reaches another browser through the re-encrypted files. Until that browser syncs, its secret notes still open with the old passcode.
- Each change to a secret note is encrypted just after it is typed. Words typed in the very moment the sidebar closes may not make it.
- Printing a whole Collection leaves its locked secret notes out.
- Each encryption is different even for the same text, so the same secret note found in two places that never synced with each other (a backup restored in a second browser, then synced) becomes two versions (ADR 0004), like any note that differs.

## Considered Options

- **A passcode per note**: more to remember and to type, for no real gain in a personal notebook.
- **Hiding the note only on screen** (a lock without encryption): Drive, the folder and GitHub would still show the text.
- **Encrypting the title too**: the filename would be meaningless, Links and Obsidian would break (ADR 0005).
- **A recovery key or a copy of the key somewhere**: there is no server (ADR 0011), and any copy kept next to the notes would undo the encryption.
