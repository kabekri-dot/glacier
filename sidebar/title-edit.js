// Rename in place (#54): the pen after the title, Rename in ⋯ (#121) or a
// click on a fresh page's title turns the title in the bar into a text
// field. Enter or clicking away saves, Esc puts the old title back. A refused
// title keeps the field open with a hint under the pill. On a fresh page a
// confirmed title makes the note (#61). A locked secret note opens first,
// since its sketches carry its title (#109). The Screen does the renaming,
// and the Notebook rewrites the Links (#11).
//
//   createTitleEdit({ titleEl, hintEl, screen, draw, render, askPasscode, beforeStart })
//     titleEl         the bar's title, which the field takes the place of
//     hintEl          the line under the pill for a refused title
//     draw(view), render()   the panel's drawing of a Screen view, of the paper
//     askPasscode(heading)   resolves to true once the secret notes are open
//     beforeStart()   close what a field in the pill would sit under (the menu)
//   .start()      the field, if a note or fresh page is open
//   .stop()       the title back, nothing saved
//   .isEditing()
export function createTitleEdit({ titleEl, hintEl, screen, draw, render, askPasscode, beforeStart }) {
  let input = null;

  function stop() {
    if (!input) return;
    // Forgotten before it goes, so the blur of removing it saves nothing.
    const field = input;
    input = null;
    field.remove();
    titleEl.hidden = false;
    hintEl.hidden = true;
    hintEl.replaceChildren();
  }

  function showHint(result) {
    hintEl.replaceChildren();
    if (!result.suggestion) {
      hintEl.textContent = "Type a name for this note.";
    } else {
      hintEl.append("That name is taken. Use ");
      const use = document.createElement("button");
      use.type = "button";
      use.className = "rename-suggestion";
      use.textContent = result.suggestion;
      // Keep the focus in the field, or the click away would save first.
      use.addEventListener("mousedown", (event) => event.preventDefault());
      use.addEventListener("click", () => {
        input.value = result.suggestion;
        save();
      });
      hintEl.append(use, "?");
    }
    hintEl.hidden = false;
  }

  async function save() {
    if (!input) return;
    // On a fresh page a confirmed title makes the note (#61), and the caret
    // drops onto the first line of the paper.
    const freshPage = screen.freshPage();
    let view = freshPage ? screen.confirmTitle(input.value) : screen.rename(input.value);
    if (view.type === "titleRefused") return showHint(view);
    // A locked secret note opens first, then the rename goes ahead. The field
    // closes first, so the passcode card taking the focus doesn't save it a
    // second time.
    if (view.type === "renameLocked") {
      const wanted = input.value;
      stop();
      if (!(await askPasscode("Type your Glacier passcode to rename it"))) return;
      view = screen.rename(wanted);
      if (view.type === "titleRefused") {
        start();
        input.value = wanted;
        return showHint(view);
      }
    }
    draw(view);
    if (freshPage) render();
  }

  function start() {
    const note = screen.note();
    if (input || !(note || screen.freshPage())) return;
    beforeStart();
    const field = document.createElement("input");
    field.type = "text";
    field.className = "pill-title-input";
    field.value = note ? note.title : screen.freshPage().title;
    field.placeholder = "Title";
    field.setAttribute("aria-label", "Note title");
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stop();
        if (screen.freshPage()) draw(screen.cancel());
        else if (screen.note()) render();
      }
    });
    // Clicking away from an empty title on a fresh page just leaves it unnamed.
    field.addEventListener("blur", () => {
      if (screen.freshPage() && !field.value.trim()) stop();
      else save();
    });
    input = field;
    titleEl.hidden = true;
    titleEl.after(field);
    field.focus();
    field.select();
  }

  return { start, stop, isEditing: () => input !== null };
}
