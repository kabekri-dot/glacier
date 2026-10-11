// The history behind the pill's ← button (issue #52), kept by the Screen
// (#65): the titles of the notes that have been on screen, in order, like a
// browser's back button. It lives for the sidebar session only and is never
// saved.
//
//   visit(title)  the note on screen changed (a tab switch, the menu, a Link,
//                 a new note); steps forward from a "back" are dropped
//   previous()    the title ← would open, or null
//   back()        step back and return that title, or null
export function createNoteHistory() {
  const titles = [];
  let position = -1;

  return {
    visit(title) {
      if (titles[position] === title) return;
      titles.length = position + 1;
      titles.push(title);
      position = titles.length - 1;
    },

    previous() {
      return position > 0 ? titles[position - 1] : null;
    },

    back() {
      if (position <= 0) return null;
      position -= 1;
      return titles[position];
    },
  };
}
