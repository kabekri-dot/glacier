// The pixel cloud reminder (#98, ADR 0011): while the notes live only in
// this browser, the sync box opens by itself once after the 3rd note, and
// once more two weeks later, then never. The saved state is `{ opened,
// lastOpened }` (how many times, and when last, as an ISO string), kept per
// browser and not synced. Pure, so it can be tested with node --test.
export const REMINDER_AFTER_NOTES = 3;
const REMINDER_GAP_DAYS = 14;
const MAX_OPENINGS = 2;

export function reminderDue({ home, noteCount, saved, now }) {
  if (home !== "browser" || noteCount < REMINDER_AFTER_NOTES) return false;
  const { opened = 0, lastOpened = null } = saved ?? {};
  if (opened === 0) return true;
  if (opened >= MAX_OPENINGS) return false;
  return now - new Date(lastOpened) >= REMINDER_GAP_DAYS * 24 * 60 * 60 * 1000;
}

export function reminderOpened(saved, now) {
  return { opened: (saved?.opened ?? 0) + 1, lastOpened: now.toISOString() };
}

// The tiny cloud on the sync dot stays until a place is chosen.
export function showsDotCloud(home) {
  return home === "browser";
}

// `driveReady`: whether Google Drive can be chosen in this build yet.
export function reminderText(driveReady) {
  const home = driveReady ? "Give them a safe home in your Google Drive." : "Give them a safe home.";
  return `Your notes live only in this browser for now. ${home}`;
}

export const KEEP_THEM_SAFE = "Keep them safe";
export const NOT_NOW = "Not now";
