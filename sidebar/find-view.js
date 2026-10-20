// Find in the open note (#111): one quiet line under the pill with the text
// field, "2 of 5" and small ↑ ↓ buttons. The matches come from src/find.mjs;
// this only draws the box and tells the panel what was typed or pressed.
//
//   createFindView({ el, onQuery, onStep, onClose })
//   .open()            show the box and select its text
//   .close()           hide it
//   .isOpen()
//   .query()           what is typed in the field
//   .setStatus(text)   "2 of 5" or "No match"

export function createFindView({ el, onQuery, onStep, onClose }) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "find-input";
  input.placeholder = "Find in this note";
  input.setAttribute("aria-label", "Find in this note");
  input.autocomplete = "off";
  input.spellcheck = false;

  const status = document.createElement("span");
  status.className = "find-status";
  status.setAttribute("role", "status");

  const button = (label, text, step) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "find-step";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    b.title = label;
    // Keep the focus in the field, so Enter keeps walking the matches.
    b.addEventListener("mousedown", (event) => event.preventDefault());
    b.addEventListener("click", () => onStep(step));
    return b;
  };

  el.append(input, status, button("Previous match", "↑", -1), button("Next match", "↓", 1));

  input.addEventListener("input", () => onQuery(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onStep(event.key === "ArrowDown" ? 1 : -1);
    }
  });

  return {
    open() {
      el.hidden = false;
      input.focus();
      input.select();
    },
    close() {
      el.hidden = true;
    },
    isOpen: () => !el.hidden,
    query: () => input.value,
    setStatus(text) {
      status.textContent = text;
    },
  };
}
