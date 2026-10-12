// Where your notes live (#94, ADR 0011): the places to choose from in
// Settings, in order, each with its pixel icon (art/icon-<icon>.svg), and
// the line that asks before switching. Pure, so it can be tested with
// node --test. A folder joins this list in its own ticket.
export const NOTES_HOMES = [
  { id: "google-drive", name: "Google Drive", icon: "cloud", hint: "Your notes sync through a Glacier folder in your Google Drive" },
  { id: "browser", name: "Only in this browser", icon: "browser", hint: "Your notes stay in this browser and nowhere else" },
  { id: "github", name: "GitHub", icon: "github", hint: "Your notes sync through a private GitHub repo" },
];

// Whether Glacier's sign-in with Google is registered (src/google-config.mjs).
export function googleReady(config) {
  return Boolean(config.webClientId);
}

// The places as Settings draws them: Google Drive can't be chosen and says
// "Not set up yet" until its sign-in is registered (#95).
export function notesHomeChoices({ googleReady: ready }) {
  return NOTES_HOMES.map((home) => {
    if (home.id !== "google-drive") return { ...home, disabled: false };
    return ready ? { ...home, disabled: false } : { ...home, note: "Not set up yet", disabled: true };
  });
}

export function notesHomeName(id) {
  return NOTES_HOMES.find((home) => home.id === id)?.name ?? id;
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
