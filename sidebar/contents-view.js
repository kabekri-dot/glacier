// The table of contents (#107): a small ≡ tab on the paper's left edge and a
// drawer of the note's headings, in the note's font. The headings come from
// src/contents.mjs; this only draws them and tells the panel which one was
// clicked.
//
//   createContentsView({ onJump })  onJump(line) is called for a clicked heading
//   .tab, .drawer                   elements for the panel to place
//   .update(headings, shown)        redraw; the tab hides when there is nothing to list
//   .toggle(), .close(), .isOpen()

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
