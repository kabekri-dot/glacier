// The note's header (#13, #61) and the bar for a second version (#70).
//
// The note's file keeps its Collection and Source in a frontmatter (ADR 0005),
// but the editor never shows that YAML: every note gets a small
// "Collection · site ↗" line above its text instead, without the site when the
// note has no page (#68). Clicking the Collection opens a small list right there
// to move the note; the site switches to the page's tab, or opens it in a
// new one.
//
// The sidebar (panel.js) plugs in the line (`el`), the bar (`barEl`), the
// paper (`noteEl`), the Notebook, the Screen and these: draw(view),
// render(), openNote(note, options), openSource(url) and askDelete(), the
// question before deleting the open note.
import { sourceLabel } from "../src/notebook.mjs";
import { secondVersionBar, noteOrigin } from "../src/menu-contents.mjs";
import { ADD_TO_COLLECTION_HINT } from "../src/guidance.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { originIcon } from "./settings-view.js";

export function createNoteMetaView({ el, barEl, noteEl, notebook, screen, draw, render, openNote, openSource, askDelete }) {
  const isPicking = () => Boolean(el.querySelector(".course-list"));

  function update() {
    el.replaceChildren();
    el.classList.remove("is-picking");
    const note = screen.note();
    if (note) el.append(courseButton(note));
    if (note?.source) el.append(" · ", originIcon(noteOrigin(notebook, note.title)), sourceLink(note.source));
    el.hidden = !note;
    noteEl.classList.toggle("has-meta", Boolean(note));
    updateBar();
  }

  // The bar above a second version's text (#70): where the original is, and
  // a way to delete this version (which asks first, #57).
  function updateBar() {
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

  function courseButton(note) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "note-meta-course";
    button.classList.toggle("is-empty", !note.course);
    button.textContent = note.course || "Add to a collection";
    button.title = note.course ? "Click to choose a collection" : ADD_TO_COLLECTION_HINT;
    button.addEventListener("click", () => {
      if (isPicking()) update();
      else openCourseList();
    });
    return button;
  }

  function courseChoice(text, onClick) {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "course-choice";
    choice.textContent = text;
    choice.addEventListener("click", onClick);
    return choice;
  }

  // The Collections, the last used one first, and "+ New collection" at the bottom.
  function openCourseList() {
    const list = document.createElement("div");
    list.className = "course-list";
    if (screen.note()?.course) {
      list.appendChild(courseChoice("No collection", () => {
        draw(screen.removeFromCourse());
        render();
      }));
    }
    for (const course of notebook.courseChoices()) {
      list.appendChild(courseChoice(course, () => moveCurrentNote(course)));
    }
    const fresh = courseChoice("+ New collection", showCourseInput);
    fresh.classList.add("is-new");
    list.appendChild(fresh);
    el.classList.add("is-picking");
    el.appendChild(list);
    list.querySelector("button").focus();
  }

  // "+ New collection" turns the Collection into a text field on the same line.
  // Enter or clicking away moves the note (a name that matches a Collection in
  // other capitals picks that one, #73); Esc or an empty field changes nothing.
  function showCourseInput() {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "course-input";
    input.placeholder = "New collection";
    input.setAttribute("aria-label", "New collection");
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      if (keep && input.value.trim()) moveCurrentNote(input.value);
      else {
        update();
        render();
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    el.querySelector(".course-list")?.remove();
    el.classList.remove("is-picking");
    el.querySelector(".note-meta-course").replaceWith(input);
    input.focus();
  }

  function moveCurrentNote(course) {
    draw(screen.moveToCourse(course));
    render();
  }

  // A click anywhere else, or Esc, closes the Collection list.
  document.addEventListener("mousedown", (event) => {
    if (!isPicking()) return;
    if (event.target.closest(".course-list, .note-meta-course")) return;
    update();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !isPicking()) return;
      event.preventDefault();
      event.stopPropagation();
      update();
      if (screen.note()) render();
    },
    true,
  );

  // The site, e.g. "youtube.com ↗"; hovering shows the full address. A plain
  // click goes through the browser page port, which picks the page's tab.
  function sourceLink(source) {
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = source;
    link.textContent = `${sourceLabel(source)} ↗`;
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      openSource(source);
    });
    return link;
  }

  return {
    update,
    updateBar,

    // ⋯ "Move to collection…" opens the same list, unless it is open already.
    pickCollection() {
      if (!isPicking()) openCourseList();
    },
  };
}
