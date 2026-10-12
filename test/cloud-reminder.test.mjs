import { test } from "node:test";
import assert from "node:assert/strict";

import { reminderDue, reminderOpened, reminderText } from "../src/cloud-reminder.mjs";

const day = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-13T10:00:00Z");
const later = (days) => new Date(t0.getTime() + days * day);
const due = (noteCount, saved, now = t0, home = "browser") => reminderDue({ home, noteCount, saved, now });

test("the reminder never shows before the 3rd note", () => {
  assert.equal(due(0), false);
  assert.equal(due(2), false);
  assert.equal(due(3), true);
});

test("after it opened once it waits two weeks", () => {
  const saved = reminderOpened(undefined, t0);
  assert.equal(due(5, saved, later(1)), false);
  assert.equal(due(5, saved, later(13)), false);
  assert.equal(due(5, saved, later(14)), true);
});

test("it never shows a third time", () => {
  const saved = reminderOpened(reminderOpened(undefined, t0), later(14));
  assert.equal(due(9, saved, later(400)), false);
});

test("it never shows once a place is chosen", () => {
  for (const home of ["google-drive", "folder", "github"]) assert.equal(due(5, undefined, t0, home), false);
});

test("the wording names Google Drive only when it can be chosen", () => {
  assert.equal(reminderText(true), "Your notes live only in this browser for now. Give them a safe home in your Google Drive.");
  assert.equal(reminderText(false), "Your notes live only in this browser for now. Give them a safe home.");
});
