// Secret notes on screen (#109, ADR 0012): the passcode card on the paper,
// the small pixel lock before a secret note's title, and createSecrets
// (below), which locks, asks and opens in the sidebar. What is secret and
// whether a passcode opens it is the Notebook's.

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

// --- The secret notes in the sidebar -----------------------------------------
//
// A locked secret note shows one passcode field on the paper instead of its
// text. The passcode opens every secret note until the sidebar closes or 10
// minutes pass without typing; then they lock again.
//
//   createSecrets({ notebook, screen, noteEl, draw, render, showNotice,
//                   settingsOpen, onCard, onChanged })
//     draw(view), render()  the panel's drawing of a Screen view, of the paper
//     settingsOpen()        whether settings are open (a card then leaves the
//                           focus where it is)
//     onCard()              a card took the paper's place
//     onChanged()           every secret note was encrypted again
//   .showIfLocked()          the card instead of a locked note; true when shown
//   .keepUnlocked()          typing happened: the 10 minutes start again
//   .askPasscode(heading)    resolves to true once the notes are open
//   .makeSecret(), .makeNotSecret()   the ⋯ menu's two entries
//   .changePasscode(passcode, next)   Settings' Change passcode
const LOCK_AFTER_MS = 10 * 60 * 1000;

export function createSecrets({ notebook, screen, noteEl, draw, render, showNotice, settingsOpen, onCard, onChanged }) {
  let lockTimer = null;

  function keepUnlocked() {
    clearTimeout(lockTimer);
    if (notebook.isUnlocked()) lockTimer = setTimeout(lock, LOCK_AFTER_MS);
  }

  function lock() {
    screen.flush();
    notebook.lock();
    if (screen.note()?.secret) draw(screen.reopen());
  }

  function lockedOnScreen() {
    const note = screen.note();
    return Boolean(note && notebook.isLocked(note.title));
  }

  // A card on the paper in place of the note, its field focused.
  function showCard(card) {
    noteEl.replaceChildren(card);
    onCard();
    if (!settingsOpen()) card.querySelector("input").focus();
  }

  function showIfLocked() {
    if (!lockedOnScreen()) return false;
    const title = screen.note().title;
    showCard(
      passcodeCard({
        heading: "This note is secret",
        lines: ["Type your Glacier passcode to read it."],
        submitLabel: "Open",
        onSubmit: async (passcode) => {
          if (!(await notebook.unlock(passcode)) || notebook.isLocked(title)) return "That passcode doesn't open this note.";
          keepUnlocked();
          if (screen.note()?.title === title) draw(screen.reopen());
          return null;
        },
      }),
    );
    return true;
  }

  // Put back what the paper showed before a passcode card.
  function restorePaper(wasLocked) {
    if (wasLocked && screen.note()) draw(screen.reopen());
    else if (screen.note() || screen.freshPage()) render();
    else draw({ type: "followPage" });
  }

  // Ask for the passcode on the paper before something that needs the
  // secret notes open. Resolves to true once they are, false on Cancel.
  function askPasscode(heading) {
    const wasLocked = lockedOnScreen();
    screen.flush();
    return new Promise((resolve) => {
      const done = (opened) => {
        restorePaper(wasLocked);
        resolve(opened);
      };
      showCard(
        passcodeCard({
          heading,
          submitLabel: "Open",
          onSubmit: async (passcode) => {
            if (!(await notebook.unlock(passcode))) return "That isn't your Glacier passcode.";
            keepUnlocked();
            done(true);
            return null;
          },
          onCancel: () => done(false),
        }),
      );
    });
  }

  // The first secret note: choose the passcode, typed twice, after the line
  // that says it can't be recovered.
  function choosePasscode() {
    screen.flush();
    return new Promise((resolve) => {
      const done = (chosen) => {
        restorePaper(false);
        resolve(chosen);
      };
      showCard(
        passcodeCard({
          heading: "Choose your Glacier passcode",
          lines: ["One passcode opens all your secret notes.", NO_RECOVERY],
          twice: true,
          submitLabel: "Make secret",
          onSubmit: async (passcode) => {
            await notebook.setPasscode(passcode);
            done(true);
            return null;
          },
          onCancel: () => done(false),
        }),
      );
    });
  }

  async function makeSecret() {
    if (!notebook.hasPasscode()) {
      if (!(await choosePasscode())) return;
    } else if (!notebook.isUnlocked() && !(await askPasscode("Type your Glacier passcode"))) {
      return;
    }
    const view = await screen.makeSecret();
    if (!view) return;
    draw(view);
    keepUnlocked();
    showNotice("This note is secret now.");
  }

  async function makeNotSecret() {
    if (lockedOnScreen() && !(await askPasscode("Type your Glacier passcode"))) return;
    const view = await screen.makeNotSecret();
    if (!view) return;
    draw(view);
    showNotice("This note is not secret any more.");
  }

  // Change passcode encrypts every secret note again, and opens them.
  async function changePasscode(passcode, next) {
    const wasLocked = lockedOnScreen();
    screen.flush();
    const result = await notebook.changePasscode(passcode, next);
    if (!result.ok) return result;
    keepUnlocked();
    onChanged();
    if (wasLocked) draw(screen.reopen());
    return result;
  }

  return { showIfLocked, keepUnlocked, askPasscode, makeSecret, makeNotSecret, changePasscode };
}
