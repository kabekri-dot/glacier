// Where your notes live (#94, ADR 0011): the places to choose from in
// Settings, in order, each with its pixel icon (art/icon-<icon>.svg), and
// the line that asks before switching. Pure, so it can be tested with
// node --test. `place` is how a sentence names it, where that differs.
export const NOTES_HOMES = [
  { id: "google-drive", name: "Google Drive", icon: "cloud", hint: "Your notes sync through a Glacier folder in your Google Drive" },
  {
    id: "folder",
    name: "A folder on this computer",
    place: "your notes folder",
    icon: "folder",
    hint: "Your notes are Markdown files in a folder you pick, which Obsidian can open too",
  },
  { id: "browser", name: "Only in this browser", icon: "browser", hint: "Your notes stay in this browser and nowhere else" },
  { id: "github", name: "GitHub", icon: "github", hint: "Your notes sync through a private GitHub repo" },
];

// Whether Glacier's sign-in with Google is registered (src/google-config.mjs).
export function googleReady(config) {
  return Boolean(config.webClientId);
}

// Whether this browser has the folder picker a folder needs (#97): Chrome
// and Edge do, Firefox and Brave without its flag don't. `page` is the
// page's global object.
export function folderReady(page) {
  return typeof page.showDirectoryPicker === "function";
}

// The places as Settings draws them: Google Drive can't be chosen and says
// "Not set up yet" until its sign-in is registered (#95), and a folder says
// "Only in Chrome and Edge" where there is no folder picker (#97).
export function notesHomeChoices({ googleReady: google, folderReady: folder }) {
  const unavailable = {
    "google-drive": !google && "Not set up yet",
    folder: !folder && "Only in Chrome and Edge",
  };
  return NOTES_HOMES.map((home) => {
    const note = unavailable[home.id];
    return note ? { ...home, note, disabled: true } : { ...home, disabled: false };
  });
}

// The place as a sentence names it: "GitHub", "your notes folder".
export function notesHomeName(id) {
  const home = NOTES_HOMES.find((each) => each.id === id);
  return home ? (home.place ?? home.name) : id;
}

export function switchQuestion(id) {
  if (id === "browser") return "Your notes will stay in this browser and stop syncing. Nothing is deleted.";
  return `Your notes will be combined with the ones in ${notesHomeName(id)}. Nothing is deleted.`;
}

// The Notes Home in use: the one saved in this browser's Notebook, or for a
// browser that connected GitHub before there was a choice, GitHub.
export function chosenNotesHome(saved, { repo, token }) {
  return saved ?? (repo && token ? "github" : "browser");
}
