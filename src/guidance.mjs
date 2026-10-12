// The short explanations of Notes and Collections (#85): the welcome on the
// first start, the hints where you act, and "How Glacier works" in the
// Shortcuts panel. Pure, so it can be tested with node --test.
export const HOW_GLACIER_WORKS = [
  "A note is a page you write on.",
  "A note for a website opens by itself when you visit that site again.",
  "Collections hold notes that belong together, like a notebook for one topic.",
];

export const COLLECTIONS_HINT = "Collections hold notes that belong together. Make one with + New collection.";
export const ADD_TO_COLLECTION_HINT = "Collections hold notes that belong together, like a notebook for one topic.";

// The welcome shows until it has been dismissed once. `saved` is what the
// extension's (not synced) storage holds under "welcomeSeen".
export function welcomeShown(saved) {
  return saved !== true;
}
