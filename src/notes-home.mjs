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

// What went wrong talking to a Notes Home, in one sentence for the screen,
// in that home's own words. A remote marks its errors with a `reason`;
// anything else is unexpected. `repo` names the GitHub repo.
export const FOLDER_NEEDS_OK = "Chrome needs your OK to write to your notes folder again.";

const SYNC_ERRORS = {
  github: {
    unauthorized: () => "GitHub didn't accept this token. Check that you pasted all of it, or make a new one.",
    "not-found": (repo) => `Couldn't find ${repo} on GitHub. Check the name, and that the token is made for this repo.`,
    forbidden: (repo) => `This token can't open ${repo}. Give it Contents access, read and write, on this repo.`,
    offline: () => "Couldn't reach GitHub. Check your connection and try again.",
    other: () => "Something went wrong talking to GitHub. Please try again in a moment.",
  },
  // Only signing in can go wrong with Google Drive (#95).
  "google-drive": {
    unauthorized: () => "Google Drive didn't let Glacier in. Sign in with Google again under Where your notes are saved.",
    forbidden: () => "Google Drive didn't let Glacier in. Sign in with Google again under Where your notes are saved.",
    offline: () => "Couldn't reach Google Drive. Check your connection and try again.",
    other: () => "Something went wrong talking to Google Drive. Please try again in a moment.",
  },
  // A folder on this computer (#97).
  folder: {
    unauthorized: () => FOLDER_NEEDS_OK,
    "not-found": () => "Couldn't find your notes folder. Choose it again under Where your notes are saved.",
    other: () => "Something went wrong writing to your notes folder. Please try again in a moment.",
  },
};

export function syncErrorMessage(error, { home = "github", repo = "" } = {}) {
  const words = SYNC_ERRORS[home] ?? SYNC_ERRORS.github;
  return (words[error?.reason] ?? words.other)(repo);
}

// The place as a sentence names it: "GitHub", "your notes folder", or
// GitHub by its repo where the sentence knows it.
export function notesHomeName(id, { repo = "" } = {}) {
  if (id === "github" && repo) return repo;
  const home = NOTES_HOMES.find((each) => each.id === id);
  return home ? (home.place ?? home.name) : id;
}

// The place's pixel icon; with no place chosen, the browser's.
export function notesHomeIcon(id) {
  return NOTES_HOMES.find((home) => home.id === id)?.icon ?? "browser";
}

// Where else deleting takes the notes from (#117): null for notes only in
// this browser, or with no Notes Home yet.
export function alsoDeletedFrom(id) {
  if (!id || id === "browser") return null;
  return id === "github" ? "your GitHub repo" : notesHomeName(id);
}

// What the sync box says once a place that let Glacier in stops doing so.
const SIGN_IN_LOST = {
  github: "GitHub no longer accepts your token. It may have expired. Make a new one and paste it under Where your notes are saved.",
  "google-drive": "Google asks you to sign in again. Your changes are kept in this browser until you do.",
  folder: FOLDER_NEEDS_OK,
};

export function signInLostText(id) {
  return SIGN_IN_LOST[id] ?? SIGN_IN_LOST.github;
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

// Switching's progress (#94): the steps the screen shows while the notes
// move, each "done", "now" or "" for still to come. nextSwitchStep takes
// what the Notebook reports, `{ step }`, with `done` and `total` while it
// downloads, and returns the steps to show next.
const SWITCH_STEPS = ["connecting", "downloading", "linking", "ready"];

export function switchSteps(id) {
  const text = {
    connecting: `Connecting to ${notesHomeName(id)}`,
    downloading: "Downloading notes",
    linking: "Combining notes",
    ready: "Ready",
  };
  return {
    heading: `Moving to ${notesHomeName(id)}`,
    steps: SWITCH_STEPS.map((step) => ({ step, text: text[step], state: "" })),
  };
}

export function nextSwitchStep(shown, progress) {
  const at = SWITCH_STEPS.indexOf(progress.step);
  const steps = shown.steps.map((each, i) => {
    const state = i < at || progress.step === "ready" ? "done" : i === at ? "now" : "";
    if (each.step === "downloading" && progress.step === "downloading") {
      return { ...each, state, text: `Downloading ${progress.done} of ${progress.total} notes` };
    }
    return { ...each, state };
  });
  return { ...shown, steps };
}

export function switchDoneText(id, { repo = "", notes }) {
  const count = notes === 1 ? "1 note" : `${notes} notes`;
  return `Your notes are here. Brought in ${count} from ${notesHomeName(id, { repo })}.`;
}
