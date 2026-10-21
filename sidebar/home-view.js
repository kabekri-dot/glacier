// The Home layout (#127): the start screen on the paper, drawn from
// src/home-view.mjs where the empty page would show. A big card to continue
// the note edited last, a card per course with its progress, the other
// collections with + New, and the notes opened lately. An empty Notebook
// says so and offers Start writing.
//
//   createHomeView({ noteEl, notebook, openNote, startWriting, newNoteIn,
//     newCollection })
//   .draw()   draw Home on the paper, as the Notebook is now
import { homeView } from "../src/home-view.mjs";
import { isOpenedByPage } from "../src/page-open.mjs";
import { lockIcon } from "./secret-view.js";

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function card(className, hint, onClick) {
  const el = element("button", className);
  el.type = "button";
  el.title = hint;
  el.addEventListener("click", onClick);
  return el;
}

function progressBar({ done, of }) {
  const bar = element("span", "course-progress");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Lessons done");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(of));
  bar.setAttribute("aria-valuenow", String(done));
  const fill = element("span", "course-progress-fill");
  fill.style.width = `${(done / of) * 100}%`;
  bar.append(fill);
  return bar;
}

export function createHomeView({ noteEl, notebook, openNote, startWriting, newNoteIn, newCollection }) {
  function open(title) {
    const note = notebook.note(title);
    if (note) openNote(note, { byPage: isOpenedByPage(note) });
  }

  function resumeCard(resume) {
    const el = card("home-continue", `Open ${resume.title}`, () => open(resume.title));
    const title = element("strong", "home-continue-title");
    if (resume.locked) title.append(lockIcon({ hint: "Secret note, locked" }));
    title.append(resume.title);
    const where = [resume.collection, resume.when].filter(Boolean).join(" · ");
    el.append(element("small", "home-label", resume.label), title, element("span", "home-where", where));
    if (resume.firstLine) el.append(element("span", "home-first-line", resume.firstLine));
    return el;
  }

  function emptyNotebook(empty) {
    const box = element("div", "home-empty");
    const start = element("button", "card-button", empty.button);
    start.type = "button";
    start.addEventListener("click", startWriting);
    box.append(element("p", "", empty.text), start);
    return box;
  }

  function courseCard(course) {
    const el = card("home-card home-course", `Open ${course.open}`, () => open(course.open));
    el.append(element("strong", "", course.course), element("small", "", course.text), progressBar(course.progress));
    return el;
  }

  function collectionCard(collection) {
    const hint = collection.open ? `Open ${collection.open}` : `Start the first note in ${collection.name}`;
    const el = card("home-card", hint, () => (collection.open ? open(collection.open) : newNoteIn(collection.name)));
    el.append(element("strong", "", collection.name), element("small", "", collection.text));
    return el;
  }

  function newCollectionCard(add) {
    const el = card("home-card home-new", add.hint, newCollection);
    el.append(element("strong", "", add.label), element("small", "", add.text));
    return el;
  }

  function recentRow(recent) {
    const el = card("home-recent", `Open ${recent.title}`, () => open(recent.title));
    el.append(element("span", "home-recent-title", recent.title), element("small", "", recent.collection));
    return el;
  }

  function section(label, ...children) {
    const box = element("section", "home-section");
    box.append(element("h2", "home-heading", label), ...children);
    return box;
  }

  function draw() {
    const view = homeView(notebook);
    const home = element("div", "home");
    if (view.resume) home.append(resumeCard(view.resume));
    if (view.empty) home.append(emptyNotebook(view.empty));
    if (view.courses.length > 0) home.append(section(view.labels.courses, ...view.courses.map(courseCard)));
    const cards = element("div", "home-cards");
    cards.append(...view.collections.map(collectionCard), newCollectionCard(view.newCollection));
    home.append(section(view.labels.collections, cards));
    if (view.recent.length > 0) home.append(section(view.labels.recent, ...view.recent.map(recentRow)));
    noteEl.replaceChildren(home);
  }

  return { draw };
}
