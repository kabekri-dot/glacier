// The pixel cloud reminder (#98, ADR 0011): while the notes live only in
// this browser, the sync box opens by itself once after the 3rd note, and,
// after Not now, once more two weeks later, then never. The saved state is
// `{ opened, lastOpened, notNow }` (how many times, when last as an ISO
// string, and whether Not now was clicked then), kept per browser and not
// synced. Pure, so it can be tested with node --test.
export const REMINDER_AFTER_NOTES = 3;
const REMINDER_GAP_DAYS = 14;
const MAX_OPENINGS = 2;

export function reminderDue({ home, noteCount, saved, now }) {
  if (home !== "browser" || noteCount < REMINDER_AFTER_NOTES) return false;
  const { opened = 0, lastOpened = null } = saved ?? {};
  if (opened === 0) return true;
  if (opened >= MAX_OPENINGS || !saved.notNow) return false;
  return now - new Date(lastOpened) >= REMINDER_GAP_DAYS * 24 * 60 * 60 * 1000;
}

export function reminderOpened(saved, now) {
  return { opened: (saved?.opened ?? 0) + 1, lastOpened: now.toISOString(), notNow: false };
}

// Not now was clicked on the reminder now open.
export function reminderNotNow(saved) {
  return { ...saved, notNow: true };
}

// `driveReady`: whether Google Drive can be chosen in this build yet.
export function reminderText(driveReady) {
  const home = driveReady ? "Give them a safe home in your Google Drive." : "Give them a safe home.";
  return `Your notes live only in this browser for now. ${home}`;
}

export const KEEP_THEM_SAFE = "Keep them safe";
export const NOT_NOW = "Not now";
