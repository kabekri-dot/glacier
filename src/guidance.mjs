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
export const ADD_TO_COLLECTION_HINT = "Collections hold notes that belong together, like a notebook for one topic.";

// The welcome shows until it has been dismissed once. `saved` is what the
// extension's (not synced) storage holds under "welcomeSeen".
export function welcomeShown(saved) {
  return saved !== true;
}
