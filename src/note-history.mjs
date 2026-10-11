// The history behind the pill's ← button (issue #52), kept by the Screen
// (#65): the titles of the notes that have been on screen, in order, like a
// browser's back button. It lives for the sidebar session only and is never
// saved.
//
//   visit(title)  the note on screen changed (a tab switch, the menu, a Link,
//                 a new note); steps forward from a "back" are dropped
//   previous()    the title ← would open, or null
//   recent(count) the last notes you were on before this one, newest first
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

    // The note on screen got a new title.
    rename(title) {
      if (position >= 0) titles[position] = title;
    },

    previous() {
      return position > 0 ? titles[position - 1] : null;
    },

    recent(count) {
      const seen = new Set([titles[position]]);
      const found = [];
      for (let at = position - 1; at >= 0 && found.length < count; at--) {
        if (seen.has(titles[at])) continue;
        seen.add(titles[at]);
        found.push(titles[at]);
      }
      return found;
    },

    back() {
      if (position <= 0) return null;
      position -= 1;
      return titles[position];
    },
  };
}
