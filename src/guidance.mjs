// The short explanations of Notes and Collections (#85): the welcome on the
// first start (shown again by "How Glacier works" in the Shortcuts panel, #91)
// and the hints where you act. Pure, so it can be tested with node --test.
// Each line of the welcome names its pixel picture, art/icon-<icon>.svg (#90).
export const WELCOME_LINES = [
  { icon: "page", text: "A note is a page you write on." },
  { icon: "globe", text: "Notes for a website open by themselves when you come back." },
  { icon: "notebooks", text: "Collections keep notes on one topic together." },
];

export const WELCOME_GREETING = "Welcome to Glacier";
export const WELCOME_TIP = "Tip: open any website and just start writing.";

export const COLLECTIONS_HINT = "Collections hold notes that belong together. Make one with + New collection.";

// The banner after a save to this browser's copy failed (#25, #117): what
// happened, that the text is still on screen, and its one fix (Copy note).
// A full storage says so.
const STILL_HERE = "Your text is still here. Copy it somewhere safe.";

export function saveErrorText(error) {
  if (error?.name === "QuotaExceededError") {
    return `This browser's storage is full, so your last changes weren't saved. ${STILL_HERE}`;
  }
  return `Couldn't save your last changes to this browser. ${STILL_HERE}`;
}

// The welcome shows until it has been dismissed once. `saved` is what the
// extension's (not synced) storage holds under "welcomeSeen".
export function welcomeShown(saved) {
  return saved !== true;
}
