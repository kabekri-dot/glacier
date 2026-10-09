# Notes live in IndexedDB and sync through a private GitHub repo

Each browser keeps its own copy of the Notebook in IndexedDB, which is fast and works offline. Chrome and Firefox can't share browser storage, so both Sync with a private GitHub repository (the Notes Repo) through the GitHub API. The Notes Repo also replaces a separate automatic backup, since its Git history keeps every version. A manual Export/Import (zip of `.md` files) stays as a fallback.

Authentication is a fine-grained personal access token that the user pastes in once per browser. It is limited to the Notes Repo with *Contents: read/write* and stored only in that browser's local extension storage, never synced. This avoids building an OAuth login.

Sync runs automatically: pull when the panel opens, push a few seconds after typing stops.

## Considered Options

- **Plain `.md` files on disk**: extensions can't freely write to a folder, and doing so would need a native helper program.
- **OneDrive (Microsoft Graph)**: needs app registration and an OAuth flow in two browsers, and has no usable history.
- **Supabase/Firebase**: notes would sit in a vendor's database format, and free tiers change, which hurts longevity.
- **Own server**: too much to host and secure for a first project.
