// Where your notes live (#94, ADR 0011): the places to choose from in
// Settings, in order, each with its pixel icon (art/icon-<icon>.svg), and
// the line that asks before switching. Pure, so it can be tested with
// node --test. Google Drive and a folder join this list in their own tickets.
export const NOTES_HOMES = [
  { id: "browser", name: "Only in this browser", icon: "browser", hint: "Your notes stay in this browser and nowhere else" },
  { id: "github", name: "GitHub", icon: "github", hint: "Your notes sync through a private GitHub repo" },
];

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
