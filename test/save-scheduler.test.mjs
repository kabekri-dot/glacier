import { test } from "node:test";
import assert from "node:assert/strict";

import { createSaveScheduler } from "../src/save-scheduler.mjs";

// Saving is debounced so typing opens one storage transaction after a pause,
// not one per keystroke (issue #25). flush() forces a pending write out at
// once — the panel calls it when the sidebar is hidden or closing, so the last
// keystrokes are never lost. Timers are injected so this is tested without the
// DOM or a real clock.

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

test("typing fast debounces into a single write of the latest text", () => {
  const saved = [];
  const timer = manualTimer();
  const scheduler = createSaveScheduler({
    save: (value) => saved.push(value),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  scheduler.schedule("a");
  scheduler.schedule("ab");
  scheduler.schedule("abc");
  assert.deepEqual(saved, [], "nothing is written mid-typing");

  timer.fire();
  assert.deepEqual(saved, ["abc"], "one write, with the latest text");
});

test("flush writes the pending text immediately (sidebar closing)", () => {
  const saved = [];
  const timer = manualTimer();
  const scheduler = createSaveScheduler({
    save: (value) => saved.push(value),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  scheduler.schedule("last keystrokes");
  scheduler.flush();
  assert.deepEqual(saved, ["last keystrokes"]);
});

test("flush with nothing pending writes nothing", () => {
  const saved = [];
  const scheduler = createSaveScheduler({ save: (value) => saved.push(value) });
  scheduler.flush();
  assert.deepEqual(saved, []);
});

test("flush after a debounced write doesn't write the same text again", () => {
  const saved = [];
  const timer = manualTimer();
  const scheduler = createSaveScheduler({
    save: (value) => saved.push(value),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  scheduler.schedule("x");
  timer.fire();
  scheduler.flush();
  assert.deepEqual(saved, ["x"]);
});
