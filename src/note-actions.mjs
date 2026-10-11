// What the "This note" menu (the ⋯ after the title) offers for the open note.
// Pure, so it can be tested with node --test. No note open means no menu.
export function noteActions(note) {
  if (!note) return null;
  return {
    heading: note.title,
    actions: [
      { kind: "download", label: "Download as a file", hint: "Save this note as a Markdown file" },
      note.archived
        ? { kind: "unarchive", label: "Unarchive", hint: "Put this note back in your lists" }
        : { kind: "archive", label: "Archive", hint: "Hide this note from your lists. You can bring it back any time" },
      { kind: "delete", label: "Delete", hint: "Remove this note for good" },
    ],
  };
}
