import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SETTINGS_PARTS, partValue, matchingParts, nextOpenPart, homeLabel, NO_SETTING_MATCHES } from "../src/settings-parts.mjs";
import { readLook } from "../src/look.mjs";
import { readTabSettings } from "../src/tab-settings.mjs";

// Settings in plain names (#124): seven parts, each with its current value
// in one line while closed.
const state = (change = {}) => ({
  look: readLook(undefined),
  tabSettings: readTabSettings(undefined),
  home: "browser",
  hasPasscode: false,
  ...change,
});

test("Settings has seven parts in plain names, in order", () => {
  assert.deepEqual(
    SETTINGS_PARTS.map((part) => part.name),
    [
      "How your notes look",
      "Pages",
      "When you change tabs",
      "Where your notes are saved",
      "Back up and restore",
      "Secret notes",
      "Help and shortcuts",
    ],
  );
});

test("each part has a short name for the icon rail", () => {
  assert.deepEqual(
    SETTINGS_PARTS.map((part) => part.short),
    ["Look", "Pages", "Tabs", "Saving", "Backup", "Secret", "Help"],
  );
});

test("each part's pixel picture is drawn", () => {
  for (const { icon } of SETTINGS_PARTS) {
    assert.ok(existsSync(new URL(`../art/icon-${icon}.svg`, import.meta.url)), icon);
  }
});

test("a closed look part shows the paper, the font and the text size", () => {
  assert.equal(partValue("look", state()), "Glacier paper, its own font, text 100 %");
  const look = readLook({ paper: "Forest", font: "Caveat", textSize: 120 });
  assert.equal(partValue("look", state({ look })), "Forest paper, Caveat, text 120 %");
});

test("a closed pages part says whether long notes are split", () => {
  assert.equal(partValue("pages", state({ look: readLook({ pages: true }) })), "Long notes split into pages");
  assert.equal(partValue("pages", state()), "Each note on one long page");
});

test("a closed tabs part says what happens on another website", () => {
  assert.equal(partValue("tabs", state()), "Opens the note for each website");
  const tabSettings = readTabSettings({ keepUserOpenedNotes: true });
  assert.equal(partValue("tabs", state({ tabSettings })), "Keeps your note open");
});

test("a closed saving part names where the notes are saved", () => {
  assert.equal(partValue("saving", state()), "Only in this browser");
  assert.equal(partValue("saving", state({ home: "folder" })), "In a folder on this computer");
  assert.equal(partValue("saving", state({ home: "google-drive" })), "In Google Drive");
  assert.equal(partValue("saving", state({ home: "github" })), "On GitHub");
});

test("the places to save notes read as the end of a sentence", () => {
  assert.equal(homeLabel("browser"), "Only in this browser");
  assert.equal(homeLabel("github"), "On GitHub");
});

test("a closed secret part says when there are no secret notes yet", () => {
  assert.equal(partValue("secret", state()), "No secret notes yet");
  assert.equal(partValue("secret", state({ hasPasscode: true })), "Change your passcode");
});

test("the other closed parts say what is inside", () => {
  assert.equal(partValue("backup", state()), "Download all notes or restore them");
  assert.equal(partValue("help", state()), "Keyboard shortcuts and common questions");
});

test("opening a part closes the one that was open", () => {
  assert.equal(nextOpenPart(null, "look"), "look");
  assert.equal(nextOpenPart("look", "tabs"), "tabs");
});

test("opening the open part again closes it", () => {
  assert.equal(nextOpenPart("tabs", "tabs"), null);
});

test("an empty search shows every part as usual", () => {
  assert.equal(matchingParts(""), null);
  assert.equal(matchingParts("   "), null);
});

test("searching finds a part by its name, in any capitals", () => {
  assert.deepEqual(matchingParts("SECRET"), ["secret"]);
});

test("searching finds a part by the label of a setting inside it", () => {
  assert.deepEqual(matchingParts("split long"), ["pages"]);
  assert.deepEqual(matchingParts("passcode"), ["secret"]);
  assert.deepEqual(matchingParts("Next to the sidebar"), ["help"]);
});

test("searching finds a paper or a font by its name", () => {
  assert.deepEqual(matchingParts("forest"), ["look"]);
  assert.deepEqual(matchingParts("caveat"), ["look"]);
});

test("searching shows every part that matches", () => {
  assert.deepEqual(matchingParts("download"), ["backup"]);
  assert.deepEqual(matchingParts("glacier"), ["look", "tabs"]);
});

test("searching for something no setting has finds nothing", () => {
  assert.deepEqual(matchingParts("zebra"), []);
  assert.equal(NO_SETTING_MATCHES, "No setting matches.");
});
