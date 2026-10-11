// The Shortcuts panel (#20): a Markdown cheat sheet. Pure, so it can be tested
// with node --test; the panel keeps whether it is switched on and whether it
// is folded, per browser, next to the look.
export const SHORTCUTS_PANEL_DEFAULTS = { on: false, folded: false };

export function readShortcutsPanel(saved) {
  return {
    on: typeof saved?.on === "boolean" ? saved.on : SHORTCUTS_PANEL_DEFAULTS.on,
    folded: typeof saved?.folded === "boolean" ? saved.folded : SHORTCUTS_PANEL_DEFAULTS.folded,
  };
}

// Each entry is [what you type or press, what it does].
export const SHORTCUT_GROUPS = [
  {
    title: "Start of a line",
    entries: [
      ["/", "Open the menu of commands"],
      ["#", "Heading 1"],
      ["##", "Heading 2"],
      ["###", "Heading 3"],
      ["-", "Bullet list"],
      ["```", "Code block"],
    ],
  },
  {
    title: "Anywhere in a line",
    entries: [
      ["[[Title]]", "Link to a note"],
      ["**bold**", "Bold"],
      ["`code`", "Inline code"],
    ],
  },
  {
    title: "Keys",
    entries: [
      ["Enter", "New line, or a new list item"],
      ["Backspace", "At the start of a line, removes its formatting or joins it to the line above"],
      ["Up and down", "Move between lines"],
      ["Esc", "Close a menu"],
      ["Ctrl A twice", "Select the line, then the whole note"],
      ["Ctrl C", "Copy the selection as Markdown"],
      ["Ctrl K", "Search your notes"],
    ],
  },
];
