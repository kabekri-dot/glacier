// The Zen panel. For now it only shows an empty Glacier page; later slices
// wire it to the Notebook core and the editor model (see src/).
//
// The cursor should land in the note as soon as it opens, so the editable
// area takes focus. Real live-preview editing arrives in a later slice.
const note = document.querySelector(".note");
if (note) {
  note.setAttribute("contenteditable", "true");
  note.focus();
}
