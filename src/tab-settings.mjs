// The "Tabs and notes" settings (#53). Defaults are the decisions from #29 and
// #50. Pure, so it can be tested with node --test; the panel keeps the choice
// per browser, next to the look.
export const TAB_DEFAULTS = {
  // false: the sidebar shows the note of the tab you are on.
  // true: a note you opened yourself stays when you switch tabs.
  keepUserOpenedNotes: false,
  // On a page that isn't a website: "keep" the open note or show an empty page
  // for a new note ("newNoteForm", the name kept so saved settings still work).
  onNonWebsite: "keep",
  // Whether the previous note button shows in the pill.
  showPreviousButton: true,
};

export function readTabSettings(saved) {
  return {
    keepUserOpenedNotes:
      typeof saved?.keepUserOpenedNotes === "boolean" ? saved.keepUserOpenedNotes : TAB_DEFAULTS.keepUserOpenedNotes,
    onNonWebsite: ["keep", "newNoteForm"].includes(saved?.onNonWebsite) ? saved.onNonWebsite : TAB_DEFAULTS.onNonWebsite,
    showPreviousButton:
      typeof saved?.showPreviousButton === "boolean" ? saved.showPreviousButton : TAB_DEFAULTS.showPreviousButton,
  };
}
