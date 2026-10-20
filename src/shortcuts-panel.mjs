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
  ["Backspace", "At the start of a line, removes its formatting or joins it to the line above. After a page break, joins the two pages. After a sketch, picks the sketch first, then removes it"],
  ["Delete", "At the end of a line, pulls the next line up. In a sketch, removes the picked shape"],
  ["Shift", "While resizing a shape in a sketch, keeps its proportions"],
  ["Up and down", "Move between lines, and on to the empty lines below the note. With notes as pages, on to the page before or after"],
  ["Ctrl PageUp and Ctrl PageDown", "With notes as pages, turn to the page before or after"],
  ["Arrow keys", "In a sketch, move the picked shape a little. With Shift, a bit more"],
  ["Ctrl B", "Bold the selection. Press again to remove it"],
  ["Ctrl I", "Italic the selection. Press again to remove it"],
  ["Ctrl E", "Code the selection. Press again to remove it"],
  ["Ctrl Shift E", "Extract the selection to a new note, leaving a link"],
  ["Ctrl Shift O", "Open or close the contents of the note, its headings to jump to"],
  ["Ctrl F", "Find in the open note. Enter for the next match, Esc to close"],
  ["Ctrl Z", "Undo, in the text or in a sketch"],
  ["Ctrl Shift Z or Ctrl Y", "Redo"],
  ["Ctrl A twice", "Select the line, then the whole note"],
  ["Ctrl C", "Copy the selection as Markdown"],
  ["Tab or Enter", "Pick a note from the [[ list"],
  ["Ctrl K", "Search your notes. Enter opens the first one found, up and down walk the list"],
  ["//", "In the search, search inside notes"],
  ["Alt Shift G", "Open or close Glacier"],
  ["Alt Shift C", "Clip the selected text on a web page to the open note"],
  ["Esc", "Close a menu. In a sketch, let go of the picked shape, then of the sketch"],
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
      ["1.", "Numbered list"],
      ["- [ ]", "Checkbox list, click the box to tick it"],
      [">", "Quote"],
      ["```", "Code block"],
      ["/sketch", "A drawing with boxes, circles, triangles, lines, arrows and text"],
      ["%%page%%", "A page break, or /page. With notes as pages, a new page starts here"],
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
