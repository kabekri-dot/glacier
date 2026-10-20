// Secret notes on screen (#109, ADR 0012): the passcode card on the paper
// and the small pixel lock before a secret note's title. What is secret and
// whether a passcode opens it is the Notebook's; this only draws.

// Said before a passcode is set, and again where it is changed.
export const NO_RECOVERY = "If you forget this passcode, your secret notes can't be opened again. Nobody can recover it.";

function passcodeInput(label) {
  const input = document.createElement("input");
  input.type = "password";
  input.className = "form-input passcode-input";
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  input.placeholder = label;
  return input;
}

function cardButton(className, text) {
  const button = document.createElement("button");
  button.type = className === "card-button" ? "submit" : "button";
  button.className = className;
  button.textContent = text;
  return button;
}

// A card asking for the Glacier passcode: one field, or two (`twice`) when a
// new one is chosen. `onSubmit(passcode)` resolves to a line to show under
// the field when it didn't work, or null. With `onCancel` there is a Cancel
// button, and Esc is Cancel too. Returns the card, to put on the paper.
export function passcodeCard({ heading, lines = [], twice = false, submitLabel, onSubmit, onCancel = null }) {
  const card = document.createElement("form");
  card.className = "perm-card passcode-card";
  const title = document.createElement("h1");
  title.className = "card-heading";
  title.append(lockIcon(), heading);
  card.append(title);
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    card.append(p);
  }
  const first = passcodeInput(twice ? "New passcode" : "Glacier passcode");
  const again = twice ? passcodeInput("Type it again") : null;
  const problem = document.createElement("p");
  problem.className = "passcode-problem";
  problem.setAttribute("role", "alert");
  problem.hidden = true;
  const buttons = document.createElement("div");
  buttons.className = "perm-buttons";
  const submit = cardButton("card-button", submitLabel);
  buttons.append(submit);
  if (onCancel) {
    const cancel = cardButton("perm-cancel", "Cancel");
    cancel.addEventListener("click", onCancel);
    buttons.append(cancel);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    });
  }
  card.append(first, ...(again ? [again] : []), problem, buttons);

  function show(text) {
    problem.textContent = text;
    problem.hidden = false;
    first.focus();
  }

  card.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!first.value) return show("Type your passcode first.");
    if (again && first.value !== again.value) return show("The two passcodes are not the same. Type them again.");
    submit.disabled = true;
    const wrong = await onSubmit(first.value);
    submit.disabled = false;
    if (!wrong) return;
    first.value = "";
    if (again) again.value = "";
    show(wrong);
  });
  return card;
}

// The small pixel lock before a secret note's title, with its hover text.
export function lockIcon(mark = { hint: "Secret note" }) {
  const icon = document.createElement("img");
  icon.className = "secret-lock";
  icon.src = "../art/icon-lock.svg";
  icon.alt = "";
  icon.title = mark.hint;
  return icon;
}
