// Debounce note-body writes so typing opens one storage transaction after a
// pause, not one per keystroke (issue #25). The scheduler keeps the latest
// text and writes it once typing stops; flush() forces a pending write out
// immediately — the panel calls it when the sidebar is hidden or closing, so
// the last keystrokes are saved even when typing never paused.
//
// Timers are injected so the behaviour can be tested without the DOM or a real
// clock. This has no browser APIs; the panel wires it to the editor.

export function createSaveScheduler({
  save,
  delay = 400,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let handle = null;
  let pending = null;
  let hasPending = false;

  function flush() {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
    if (!hasPending) {
      return;
    }
    const value = pending;
    pending = null;
    hasPending = false;
    save(value);
  }

  function schedule(value) {
    pending = value;
    hasPending = true;
    if (handle !== null) {
      clearTimer(handle);
    }
    handle = setTimer(flush, delay);
  }

  return { schedule, flush };
}
