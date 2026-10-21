// The bar above the text of a second version (#70, #80): where the original
// is, and a way to delete this version (which asks first, #57). The note's
// Collection and page used to sit on a line above the text (#13, #61); since
// #122 they are in Note details (sidebar/note-details-view.js).
//
// The sidebar (panel.js) plugs in the bar (`barEl`), the paper (`noteEl`),
// the Notebook, the Screen and these: openNote(note, options) and
// askDelete(), the question before deleting the open note.
import { secondVersionBar } from "../src/menu-contents.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";

export function createSecondVersionView({ barEl, noteEl, notebook, screen, openNote, askDelete }) {
  function update() {
    const bar = secondVersionBar(notebook, screen.note());
    barEl.hidden = !bar;
    barEl.replaceChildren();
    noteEl.classList.toggle("has-bar", Boolean(bar));
    if (!bar) return;
    const text = document.createElement("p");
    text.textContent = bar.text;
    const buttons = document.createElement("div");
    buttons.className = "second-version-buttons";
    if (bar.original) {
      buttons.append(barButton(bar.openLabel, () => {
        const original = notebook.note(bar.original);
        if (original) openNote(original, { byPage: isOpenedByPage(original) });
      }));
    }
    if (bar.deleteLabel) buttons.append(barButton(bar.deleteLabel, askDelete));
    barEl.append(text, buttons);
    noteEl.style.setProperty("--bar-height", `${barEl.offsetHeight}px`);
  }

  function barButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  return { update };
}
