// The table of contents (#107): a small ≡ tab on the paper's left edge and a
// drawer of the note's headings, in the note's font. The headings come from
// src/contents.mjs; this only draws them and tells the panel which one was
// clicked.
//
//   createContentsView({ onJump })  the tab and drawer alone (createContents,
//                                   below, is what the panel uses)
//                                   onJump(line) is called for a clicked heading
//   .tab, .drawer                   elements for the panel to place
//   .update(headings, shown)        redraw; the tab hides when there is nothing to list
//   .toggle(), .close(), .isOpen()

import { headingsOf } from "../src/contents.mjs";
import { isShortcut } from "../src/keys.mjs";

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createContentsView({ onJump }) {
  const drawer = element("aside", "contents");
  drawer.setAttribute("aria-label", "Contents");
  drawer.hidden = true;
  const list = element("ul", "contents-list");
  drawer.append(element("h1", "contents-title", "Contents"), list);

  const tab = element("button", "contents-tab", "≡");
  tab.type = "button";
  tab.setAttribute("aria-label", "Contents");
  tab.setAttribute("aria-expanded", "false");
  tab.title = "Contents";
  tab.hidden = true;

  function setOpen(open) {
    drawer.hidden = !open;
    tab.setAttribute("aria-expanded", String(open));
  }

  tab.addEventListener("click", () => setOpen(drawer.hidden));

  return {
    tab,
    drawer,

    update(headings, shown) {
      const visible = shown && headings.length > 0;
      tab.hidden = !visible;
      if (!visible) setOpen(false);
      list.replaceChildren(
        ...headings.map(({ level, text, line }) => {
          const item = document.createElement("li");
          const button = element("button", `contents-item contents-level-${level}`, text);
          button.type = "button";
          button.addEventListener("click", () => onJump(line));
          item.append(button);
          return item;
        }),
      );
    },

    toggle() {
      if (!tab.hidden) setOpen(drawer.hidden);
    },
    close: () => setOpen(false),
    isOpen: () => !drawer.hidden,
  };
}

// --- The table of contents in the sidebar -------------------------------------
//
// The tab and drawer above, filled from the open note's headings
// (src/contents.mjs). A click on the paper or Esc closes the drawer; the tab
// and Ctrl Shift O toggle it. A heading clicked closes it, so it doesn't
// cover the heading in a narrow sidebar.
//
//   createContents({ noteEl, editor, canOpen, beforeOpen, jumpToLine })
//     canOpen()        whether a note is on the paper
//     beforeOpen()     close the other boxes and menus
//     jumpToLine(line) put the caret at the start of a line, near the top
//   .update()   after a redraw: the headings of the note as it is now
//   .close()
export function createContents({ noteEl, editor, canOpen, beforeOpen, jumpToLine }) {
  const view = createContentsView({
    onJump: (line) => {
      view.close();
      jumpToLine(line);
    },
  });
  document.body.append(view.tab, view.drawer);

  function toggle() {
    const wasOpen = view.isOpen();
    beforeOpen();
    if (!wasOpen) view.toggle();
  }

  document.addEventListener("mousedown", (event) => {
    if (view.isOpen() && noteEl.contains(event.target)) view.close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.defaultPrevented && view.isOpen()) {
      event.preventDefault();
      view.close();
      return;
    }
    if (!isShortcut(event, "o", { shift: true }) || !canOpen()) return;
    event.preventDefault();
    toggle();
  });

  return {
    update: () => view.update(headingsOf(editor.body()), canOpen()),
    close: () => view.close(),
  };
}
