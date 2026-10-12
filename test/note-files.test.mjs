import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

import { createNotebook, importSummary, noteToFile, noteFromFile } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { zipFiles } from "../src/zip.mjs";

// Notes as Markdown files (#13, ADR 0005, ADR 0010): filename = title, a small
// YAML frontmatter (collection, source, created, edited) and the Markdown body,
// in collections/<Collection>/ for a note in a Collection and notes/ for every
// other note.
// Export zips them; Import reads them back.

const withCourse = {
  title: "Box model",
  course: "TOP Foundations",
  source: "https://odin.example/foundations/box-model?v=2",
  created: "2026-10-01T09:30:00.000Z",
  edited: "2026-10-01T10:00:00.000Z",
  body: "# Box model\n\nSee [[Margins]].\n",
};

const plain = {
  title: "Margins",
  created: "2026-10-02T10:00:00.000Z",
  body: "Space outside the border.",
};

test("a note in a Collection sits in its Collection folder and is named after its title", () => {
  assert.equal(noteToFile(withCourse).path, "collections/TOP Foundations/Box model.md");
});

test("a note without a Course sits in notes/, with or without a page", () => {
  assert.equal(noteToFile(plain).path, "notes/Margins.md");
  assert.equal(noteToFile({ ...plain, source: "https://e.example/a" }).path, "notes/Margins.md");
});

test("a note file starts with frontmatter and ends with the Markdown body", () => {
  const { text } = noteToFile(withCourse);
  assert.match(text, /^---\ncollection: TOP Foundations\nsource: .+\ncreated: .+\nedited: .+\n---\n/);
  assert.ok(text.endsWith("---\n# Box model\n\nSee [[Margins]].\n"));
});

test("note → file → note gives back the same note", () => {
  for (const note of [withCourse, plain]) {
    const { path, text } = noteToFile(note);
    assert.deepEqual(noteFromFile(path, text), note);
  }
});

test("awkward titles, Courses and bodies survive the round trip", () => {
  const note = {
    title: 'What is "this": a/b?',
    course: "Khan: Algebra 1",
    created: "2026-10-03T00:00:00.000Z",
    body: "---\nnot frontmatter\n---\n",
  };
  const { path, text } = noteToFile(note);
  assert.doesNotMatch(path.split("/").pop(), /[\\:*?"<>|]/);
  assert.equal(path.split("/").length, 3);
  assert.deepEqual(noteFromFile(path, text), note);
});

test("a note without a page or Course round-trips too", () => {
  const note = { title: "From a book", created: "2026-10-04T00:00:00.000Z", body: "" };
  const { path, text } = noteToFile(note);
  assert.deepEqual(noteFromFile(path, text), note);
});

test("a file without frontmatter becomes a note from its folder and filename", () => {
  assert.deepEqual(
    { ...noteFromFile("courses/CSS/Flexbox.md", "Rows and columns"), created: undefined },
    { title: "Flexbox", course: "CSS", created: undefined, body: "Rows and columns" },
  );
  assert.deepEqual(
    { ...noteFromFile("notes/Idea.md", "x"), created: undefined },
    { title: "Idea", created: undefined, body: "x" },
  );
});

test("an old file in concepts/ with a type line is read as a note without a page or Course", () => {
  const text = "---\ntype: concept\ncreated: 2026-10-05T00:00:00.000Z\n---\nAn idea";
  assert.deepEqual(noteFromFile("concepts/Idea.md", text), {
    title: "Idea",
    created: "2026-10-05T00:00:00.000Z",
    body: "An idea",
  });
});

test("an old file with type: lesson keeps its Course and page and loses the type", () => {
  const text =
    "---\ntype: lesson\ncourse: CSS\nsource: https://e.example/grid\ncreated: 2026-10-05T00:00:00.000Z\n---\nTwo axes";
  assert.deepEqual(noteFromFile("courses/CSS/Grid.md", text), {
    title: "Grid",
    course: "CSS",
    source: "https://e.example/grid",
    created: "2026-10-05T00:00:00.000Z",
    body: "Two axes",
  });
});

function sampleNotebook() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({
    title: "Box model",
    source: "https://odin.example/box",
    course: "TOP Foundations",
    created: "2026-10-01T09:30:00.000Z",
  });
  notebook.saveBody("Box model", "See [[Margins]] and [[Padding]].");
  notebook.createNote({ title: "Margins", created: "2026-10-02T10:00:00.000Z" });
  notebook.saveBody("Margins", "Space outside, näher am Rand.");
  return notebook;
}

const byTitle = (notes) => [...notes].sort((a, b) => a.title.localeCompare(b.title));

test("export then import gives back the same Notebook", async () => {
  const original = sampleNotebook();
  const zip = original.exportZip();
  const copy = createNotebook({ storage: memoryStorage() });
  await copy.importZip(zip);
  assert.deepEqual(byTitle(copy.notes()), byTitle(original.notes()));
});

test("Import adds the notes it doesn't have and reports them", async () => {
  const zip = sampleNotebook().exportZip();
  const other = createNotebook({ storage: memoryStorage() });
  other.createNote({ title: "Already here" });
  const result = await other.importZip(zip);
  assert.equal(result.added, 2);
  assert.equal(other.notes().length, 3);
});

test("importing the same Export twice changes nothing", async () => {
  const notebook = sampleNotebook();
  const before = byTitle(notebook.notes());
  const result = await notebook.importZip(notebook.exportZip());
  assert.equal(result.added, 0);
  assert.equal(result.unchanged, 2);
  assert.deepEqual(byTitle(notebook.notes()), before);
});

test("Import never overwrites a note whose text differs: the file becomes a copy", async () => {
  const zip = sampleNotebook().exportZip();
  const notebook = sampleNotebook();
  notebook.saveBody("Margins", "Changed here since the Export.");
  const result = await notebook.importZip(zip);
  assert.equal(result.copies, 1);
  assert.equal(notebook.note("Margins").body, "Changed here since the Export.");
  const copy = notebook.notes().find((note) => note.title.startsWith("Margins "));
  assert.equal(copy.body, "Space outside, näher am Rand.");
});

// A zip made by another tool (Obsidian, the system's "compress") is usually
// deflated and may hold the vault in a folder and extra files.
function deflatedZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

test("Import reads a deflated zip with the vault inside a folder and skips other files", async () => {
  const zip = deflatedZip([
    ["My vault/concepts/Idea.md", "---\ntype: concept\ncreated: 2026-10-05T00:00:00.000Z\n---\nAn idea"],
    ["My vault/.obsidian/app.json", "{}"],
    ["My vault/courses/CSS/Grid.md", "Two axes"],
  ]);
  const notebook = createNotebook({ storage: memoryStorage() });
  const result = await notebook.importZip(zip);
  assert.equal(result.added, 2);
  assert.equal(notebook.note("Idea").body, "An idea");
  assert.equal(notebook.note("Grid").course, "CSS");
});

test("a file that is not a zip is refused without touching the Notebook", async () => {
  const notebook = sampleNotebook();
  await assert.rejects(notebook.importZip(new TextEncoder().encode("hello")));
  assert.equal(notebook.notes().length, 2);
});

test("the Import message says what was added, what was already there and what was copied", () => {
  assert.equal(importSummary({ added: 1, unchanged: 0, copies: 0 }), "Restored 1 note.");
  assert.equal(
    importSummary({ added: 3, unchanged: 2, copies: 1 }),
    "Restored 3 notes, 2 already here, 1 kept as a copy next to yours.",
  );
});

test("exporting one note gives exactly its Markdown file", () => {
  const notebook = sampleNotebook();
  assert.deepEqual(notebook.exportNote("Margins"), noteToFile(notebook.note("Margins")));
});

test("exporting a Course contains only that Course's notes", async () => {
  const notebook = sampleNotebook();
  notebook.createNote({ title: "Flexbox", course: "CSS Basics", source: "https://css.example/flex" });
  const copy = createNotebook({ storage: memoryStorage() });
  await copy.importZip(notebook.exportCourseZip("TOP Foundations"));
  assert.deepEqual(copy.notes().map((note) => note.title), ["Box model"]);
});

test("an Export made before notes/ existed restores every note", async () => {
  const zip = zipFiles([
    { path: "concepts/Margins.md", text: "---\ntype: concept\ncreated: 2026-10-02T10:00:00.000Z\n---\nSpace" },
    {
      path: "courses/TOP/Box model.md",
      text: "---\ntype: lesson\ncourse: TOP\nsource: https://odin.example/box\ncreated: 2026-10-01T09:30:00.000Z\n---\nSee [[Margins]]",
    },
    { path: "courses/From a book.md", text: "---\ntype: lesson\ncreated: 2026-10-03T00:00:00.000Z\n---\nPage 12" },
  ]);
  const notebook = createNotebook({ storage: memoryStorage() });
  assert.equal((await notebook.importZip(zip)).added, 3);
  assert.deepEqual(notebook.note("Margins"), { title: "Margins", created: "2026-10-02T10:00:00.000Z", body: "Space" });
  assert.equal(notebook.note("Box model").course, "TOP");
  assert.equal(notebook.noteForPage("https://odin.example/box").title, "Box model");
  assert.equal(noteToFile(notebook.note("From a book")).path, "notes/From a book.md");
});
