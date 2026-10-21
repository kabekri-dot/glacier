// The Course layout (#126): around the open note, drawn from
// src/course-view.mjs. A lesson gets its course, place and progress under
// the top bar, a numbered tab per lesson on the paper's right edge (with +
// for a new lesson at the end), and at the bottom its page and ‹ Previous,
// Mark as done and Next lesson ›. A note whose Collection isn't a course
// gets a card to make it one. In Zen, or for any other note, nothing shows.
//
//   createLessonView({ els, notebook, screen, layout, draw, openNote,
//     newLesson, openSource, notice })
//   .update()        draw again for the note on screen
//   .step(direction) open the next (1) or previous (-1) lesson, if any
//   .makeCourse(course)  also used by ⋯ on a Collection in the notes list
import { courseView, madeCourseNotice, doneNotice } from "../src/course-view.mjs";

const NOTICE_MS = 6000;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(className, text, hint, onClick) {
  const el = element("button", className, text);
  el.type = "button";
  el.title = hint;
  el.addEventListener("click", onClick);
  return el;
}

export function createLessonView({ els, notebook, screen, layout, draw, openNote, newLesson, openSource, notice }) {
  const { head, ask, tabs, foot } = els;
  const root = document.documentElement;

  // The open note as stored now, so a lesson just marked done shows so.
  function openNoteNow() {
    const note = screen.note();
    return note ? notebook.note(note.title) ?? note : null;
  }

  function open(title) {
    const note = title && notebook.note(title);
    if (note) openNote(note);
  }

  function makeCourse(course) {
    notebook.makeCourse(course);
    draw(screen.refreshNote());
    notice(madeCourseNotice(course), NOTICE_MS, {
      label: "Undo",
      run: () => {
        notebook.unmakeCourse(course);
        draw(screen.refreshNote());
      },
    });
  }

  function toggleDone(title, done) {
    notebook.markDone(title, done);
    draw(screen.refreshNote());
    if (done) notice(doneNotice(notebook.lessonOf(title)));
  }

  function drawAsk(view) {
    ask.replaceChildren(
      element("strong", "course-ask-heading", view.heading),
      element("span", "course-ask-text", view.text),
      button("course-ask-make", view.button, `Number the notes of ${view.course} as lessons, oldest first`, () => makeCourse(view.course)),
    );
  }

  function drawHead(view) {
    const where = element("span", "course-head-place");
    where.append(element("strong", "", view.course), ` · ${view.place}`);
    const bar = element("div", "course-progress");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Lessons done");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(view.progress.of));
    bar.setAttribute("aria-valuenow", String(view.progress.done));
    const fill = element("span", "course-progress-fill");
    fill.style.width = `${(view.progress.done / view.progress.of) * 100}%`;
    bar.append(fill);
    head.replaceChildren(where, element("span", "course-head-done", view.doneText), bar);
  }

  function drawTabs(view) {
    const list = view.tabs.map((tab) => {
      const el = button(`lesson-tab${tab.done ? " is-done" : ""}`, tab.label, tab.hint, () => open(tab.title));
      el.setAttribute("aria-label", tab.hint);
      if (tab.open) el.setAttribute("aria-current", "page");
      return el;
    });
    const plus = button("lesson-tab lesson-tab-new", view.newTab.label, view.newTab.hint, () => newLesson(view.course));
    plus.setAttribute("aria-label", view.newTab.hint);
    tabs.replaceChildren(...list, plus);
    // With many lessons the tabs scroll: keep the open one in sight, without
    // moving the paper.
    const current = tabs.querySelector("[aria-current]");
    const hidden = current.offsetTop < tabs.scrollTop || current.offsetTop + current.offsetHeight > tabs.scrollTop + tabs.clientHeight;
    if (hidden) tabs.scrollTop = current.offsetTop - tabs.clientHeight / 2;
  }

  function drawFoot(view, title) {
    const row = element("div", "lesson-buttons");
    const previous = button("lesson-turn", view.previous.label, view.previous.hint, () => open(view.previous.title));
    previous.disabled = !view.previous.title;
    const done = button(`lesson-done${view.doneButton.pressed ? " is-done" : ""}`, view.doneButton.label, view.doneButton.hint, () =>
      toggleDone(title, !view.doneButton.pressed),
    );
    done.setAttribute("aria-pressed", String(view.doneButton.pressed));
    const next = button("lesson-turn", view.next.label, view.next.hint, () => open(view.next.title));
    next.disabled = !view.next.title;
    row.append(previous, done, next);
    if (!view.pageLink) return foot.replaceChildren(row);
    const link = button("lesson-page", view.pageLink.label, "Go to the lesson's page, in its tab if it is open", () => openSource(view.pageLink.source));
    foot.replaceChildren(link, row);
  }

  function update() {
    const note = openNoteNow();
    const view = courseView(notebook, note, layout());
    head.hidden = view?.kind !== "lesson";
    tabs.hidden = view?.kind !== "lesson";
    foot.hidden = view?.kind !== "lesson";
    ask.hidden = view?.kind !== "ask";
    if (view?.kind === "lesson") {
      drawHead(view);
      drawTabs(view);
      drawFoot(view, note.title);
    } else if (view?.kind === "ask") drawAsk(view);
    if (view) root.dataset.course = view.kind;
    else delete root.dataset.course;
    // The paper starts below what shows on top, and ends above the bottom row.
    const top = view?.kind === "lesson" ? head : view?.kind === "ask" ? ask : null;
    root.style.setProperty("--course-height", top ? `${top.offsetHeight}px` : "0px");
    root.style.setProperty("--lesson-foot", view?.kind === "lesson" ? `${foot.offsetHeight}px` : "0px");
  }

  return {
    update,
    makeCourse,

    step(direction) {
      const note = openNoteNow();
      const lesson = layout() === "course" && note ? notebook.lessonOf(note.title) : null;
      if (!lesson) return false;
      open(direction > 0 ? lesson.next : lesson.previous);
      return true;
    },
  };
}
