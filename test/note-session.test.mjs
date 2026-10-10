import { test } from "node:test";
import assert from "node:assert/strict";

import { createNoteSession } from "../src/note-session.mjs";
import { createNotebook } from "../src/notebook.mjs";
import { memoryStorage } from "../src/memory-storage.mjs";

// The Note session owns saving the open note: each edit is bound to the note it
// was typed in, so a delayed save can never land in a different note. Tested
// through its public interface with the in-memory storage and injected timers.

function manualTimer() {
  let fn = null;
  return {
    setTimer: (callback) => {
      fn = callback;
      return 1;
    },
    clearTimer: () => {
      fn = null;
    },
    fire: () => {
      const callback = fn;
      fn = null;
      callback?.();
    },
  };
}

function setup({ onSaveError = () => {} } = {}) {
  const notebook = createNotebook({ storage: memoryStorage() });
  const first = notebook.createConceptNote({ title: "First" });
  const second = notebook.createConceptNote({ title: "Second" });
  const timer = manualTimer();
  const session = createNoteSession({
    notebook,
    onSaveError,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });
  return { notebook, first, second, timer, session };
}

test("an edit followed by opening another note is saved to the first note", () => {
  const { notebook, first, second, session } = setup();
  const secondBody = notebook.note("Second").body;

  session.open(first);
  session.edit("typed in first");
  session.open(second);

  assert.equal(notebook.note("First").body, "typed in first");
  assert.equal(notebook.note("Second").body, secondBody);
});

test("a timer firing after switching notes writes nothing more", () => {
  const { notebook, first, second, timer, session } = setup();
  session.open(first);
  session.edit("a");
  session.open(second);
  session.edit("b");
  timer.fire();

  assert.equal(notebook.note("First").body, "a");
  assert.equal(notebook.note("Second").body, "b");
});

test("typing is written once per pause, with the latest text", () => {
  const { notebook, first, timer, session } = setup();
  session.open(first);
  session.edit("a");
  session.edit("ab");
  assert.notEqual(notebook.note("First").body, "ab", "nothing written mid-typing");

  timer.fire();
  assert.equal(notebook.note("First").body, "ab");
});

test("closing writes a pending edit immediately", () => {
  const { notebook, first, session } = setup();
  session.open(first);
  session.edit("last keystrokes");
  session.close();
  assert.equal(notebook.note("First").body, "last keystrokes");
});

test("flush (sidebar hiding) writes a pending edit and keeps the note open", () => {
  const { notebook, first, session } = setup();
  session.open(first);
  session.edit("one");
  session.flush();
  assert.equal(notebook.note("First").body, "one");

  session.edit("two");
  session.flush();
  assert.equal(notebook.note("First").body, "two");
});

test("editing with no note open is ignored", () => {
  const { notebook, first, timer, session } = setup();
  const before = notebook.note("First").body;

  session.edit("nowhere");
  timer.fire();
  session.open(first);
  session.close();
  session.edit("still nowhere");
  timer.fire();
  session.flush();

  assert.equal(notebook.note("First").body, before);
});

test("a failing save reaches the save-error callback", () => {
  const errors = [];
  const { first } = setup();
  const boom = new Error("disk full");
  const failing = createNoteSession({
    notebook: {
      saveBody() {
        throw boom;
      },
    },
    onSaveError: (e) => errors.push(e),
  });
  failing.open(first);
  failing.edit("x");
  failing.close();

  assert.deepEqual(errors, [boom]);
});
