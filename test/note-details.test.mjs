import { test } from "node:test";
import assert from "node:assert/strict";

import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";
import { wordCount, shortDate, noteDetails } from "../src/note-details.mjs";

// Note details (#122): everything about the open note in the drawer from ⋯,
// as plain data the sidebar only has to draw.

const NOW = new Date(2026, 9, 21, 15, 0);
const at = (month, day, year = 2026) => new Date(year, month - 1, day, 9, 30).toISOString();

function notebookWith() {
  const notebook = createNotebook({ storage: memoryStorage() });
  notebook.createNote({
    title: "Flexbox notes",
    course: "Web Dev",
    source: "https://developer.mozilla.org/en-US/docs/Web/CSS/flexbox",
    pageTitle: "Flexbox, MDN",
    created: at(10, 19),
  });
  notebook.createNote({ title: "Week 2 summary" });
  notebook.saveBody("Week 2 summary", "See [[Flexbox notes]] for one direction.");
  notebook.createNote({ title: "Reading list" });
  notebook.saveBody("Reading list", "- [[Flexbox notes]]\n- [[Week 2 summary]]");
  notebook.createNote({ title: "Loose idea" });
  return notebook;
}

test("words are counted without the Markdown marks around them", () => {
  assert.equal(wordCount("# Flexbox basics\n- one direction\n- [ ] the parent gets **display flex**"), 9);
  assert.equal(wordCount("See [[CSS Grid]] for two directions."), 6);
  assert.equal(wordCount("1. first\n2. second"), 2);
});

test("an empty note has no words, and a page break or a sketch counts as none", () => {
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount("one\n%%page%%\ntwo\n![[Flexbox notes \u2013 sketch 1.svg]]"), 2);
  assert.equal(wordCount("```\nconst a = 1;\n```"), 3);
});

test("a date reads Today, Yesterday, a day and month, or with its year when another year", () => {
  assert.equal(shortDate(new Date(2026, 9, 21, 8).toISOString(), NOW), "Today");
  assert.equal(shortDate(new Date(2026, 9, 20, 23).toISOString(), NOW), "Yesterday");
  assert.equal(shortDate(at(10, 2), NOW), "2 October");
  assert.equal(shortDate(at(12, 30, 2025), NOW), "30 December 2025");
  assert.equal(shortDate(undefined, NOW), "Not known");
});

test("Note details shows the note's collection, with a way to move it", () => {
  const notebook = notebookWith();
  const details = noteDetails(notebook, notebook.note("Flexbox notes"), { now: NOW });
  assert.equal(details.title, "Flexbox notes");
  assert.deepEqual(details.collection, { label: "Web Dev", under: "Click to move it to another collection", course: "Web Dev" });
  const loose = noteDetails(notebook, notebook.note("Loose idea"), { now: NOW });
  assert.deepEqual(loose.collection, { label: "No collection", under: "Click to put it in a collection", course: "" });
});

test("Note details says a plain note is not secret and what that means", () => {
  const notebook = notebookWith();
  const { secret } = noteDetails(notebook, notebook.note("Flexbox notes"), { now: NOW });
  assert.deepEqual(secret, {
    on: false,
    label: "Off",
    under: "Anyone using this browser can read it. Click to lock it with your passcode.",
  });
});

test("Note details says a secret note is locked with the passcode", async () => {
  const notebook = notebookWith();
  await notebook.setPasscode("open sesame");
  await notebook.makeSecret("Loose idea");
  const { secret } = noteDetails(notebook, notebook.note("Loose idea"), { now: NOW });
  assert.deepEqual(secret, {
    on: true,
    label: "On",
    under: "Its text is locked with your Glacier passcode. Click to make it plain text again.",
  });
});

test("Note details names the page the note belongs to, or says it has none", () => {
  const notebook = notebookWith();
  const { page } = noteDetails(notebook, notebook.note("Flexbox notes"), { now: NOW });
  assert.deepEqual(page, {
    label: "Flexbox, MDN",
    under: "developer.mozilla.org",
    source: "https://developer.mozilla.org/en-US/docs/Web/CSS/flexbox",
    empty: null,
  });
  const loose = noteDetails(notebook, notebook.note("Loose idea"), { now: NOW });
  assert.deepEqual(loose.page, { label: null, under: null, source: null, empty: "This note doesn't belong to a website." });
});

test("Note details lists the notes that link here, or says how to link one", () => {
  const notebook = notebookWith();
  const linked = noteDetails(notebook, notebook.note("Flexbox notes"), { now: NOW });
  assert.deepEqual(linked.linkedFrom.titles.sort(), ["Reading list", "Week 2 summary"]);
  assert.equal(linked.linkedFrom.empty, null);
  const loose = noteDetails(notebook, notebook.note("Loose idea"), { now: NOW });
  assert.deepEqual(loose.linkedFrom, { titles: [], empty: "No notes link here yet. Type [[Loose idea]] in another note to link it." });
});

test("Note details ends with the words, when it was made and when it was last edited", () => {
  const notebook = notebookWith();
  notebook.saveBody("Flexbox notes", "# Introduction\nFlexbox lays things out in one direction.");
  const { stats } = noteDetails(notebook, notebook.note("Flexbox notes"), { now: new Date() });
  assert.deepEqual(stats, [
    { label: "Words", value: "8" },
    { label: "Created", value: shortDate(at(10, 19), new Date()) },
    { label: "Edited", value: "Today" },
  ]);
});

test("a locked secret note's words are not counted", () => {
  const notebook = notebookWith();
  const { stats } = noteDetails(notebook, notebook.note("Flexbox notes"), { now: NOW, locked: true });
  assert.deepEqual(stats[0], { label: "Words", value: "Locked" });
});
