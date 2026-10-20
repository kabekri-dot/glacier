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

// Every key the sidebar handles, in one list. The Keys group below is built from
// it, and a test checks the list against the panel, so a new key cannot be left
// out. Each entry is [what you press, what it does].
export const HANDLED_KEYS = [
  ["Enter", "New line, or a new list item. Inside bold or italic, steps out of it"],
  ["Shift Enter", "A plain new line, with no new bullet"],
  ["Backspace", "At the start of a line, removes its formatting or joins it to the line above. After a sketch, picks the sketch first, then removes it"],
  ["Delete", "At the end of a line, pulls the next line up. In a sketch, removes the picked shape"],
  ["Shift", "While resizing a shape in a sketch, keeps its proportions"],
  ["Up and down", "Move between lines"],
  ["Ctrl B", "Bold the selection. Press again to remove it"],
  ["Ctrl I", "Italic the selection. Press again to remove it"],
  ["Ctrl E", "Code the selection. Press again to remove it"],
  ["Ctrl Shift E", "Extract the selection to a new note, leaving a link"],
  ["Ctrl Shift O", "Open or close the contents of the note, its headings to jump to"],
  ["Ctrl Z", "Undo"],
  ["Ctrl Shift Z or Ctrl Y", "Redo"],
  ["Ctrl A twice", "Select the line, then the whole note"],
  ["Ctrl C", "Copy the selection as Markdown"],
  ["Tab or Enter", "Pick a note from the [[ list"],
  ["Ctrl K", "Search your notes"],
  ["//", "In the search, search inside notes"],
  ["Alt Shift G", "Open or close Glacier"],
  ["Alt Shift C", "Clip the selected text on a web page to the open note"],
  ["Esc", "Close a menu"],
  ["Cmd", "On a Mac, use Cmd instead of Ctrl"],
];

// Each entry is [what you type or press, what it does]. The first group has
// no entries: its title shows the welcome page again (#85, #91).
export const SHORTCUT_GROUPS = [
  { title: "How Glacier works", opensWelcome: true, hint: "Show the welcome page again", entries: [] },
  {
    title: "Start of a line",
    entries: [
      ["/", "Open the menu of commands"],
      ["#", "Heading 1"],
      ["##", "Heading 2"],
      ["###", "Heading 3"],
      ["-", "Bullet list"],
      [">", "Quote"],
      ["```", "Code block"],
      ["/sketch", "A drawing with boxes, circles, triangles, lines, arrows and text"],
    ],
  },
  {
    title: "Anywhere in a line",
    entries: [
      ["[[Title]]", "Link to a note"],
      ["[text](https://...)", "Link to a web page"],
      ["**bold**", "Bold"],
      ["*italic*", "Italic"],
      ["_italic_", "Italic"],
      ["***bold italic***", "Bold and italic"],
      ["`code`", "Inline code"],
    ],
  },
  { title: "Keys", entries: HANDLED_KEYS },
];
