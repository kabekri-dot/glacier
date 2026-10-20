// Glacier's shortcuts (the Shortcuts panel lists them): Ctrl, or Cmd on a
// Mac, plus a key, with Shift only where the shortcut has it, never with Alt.
// Pure, so node --test can check it with a plain object for the key press.

// Is this key press the shortcut for `key` ("f", "PageUp")? A letter matches
// in either case.
export function isShortcut(event, key, { shift = false } = {}) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey !== shift) return false;
  return key.length === 1 ? event.key.toLowerCase() === key : event.key === key;
}
