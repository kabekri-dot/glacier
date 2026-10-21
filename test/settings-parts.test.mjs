import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SETTINGS_PARTS, partValue, matchingParts, nextOpenPart, homeLabel, NO_SETTING_MATCHES, settingsLayout, FIRST_RAIL_PART, showsPreview, railMove, paperPreview } from "../src/settings-parts.mjs";
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

// Part 2 (#125): inside the sidebar Settings cover the paper, so they use an
// icon rail and show a small paper preview on Look.
test("inside the sidebar Settings show the icon rail, beside it the sections", () => {
  assert.equal(settingsLayout("inside"), "rail");
  assert.equal(settingsLayout("beside"), "sections");
});

test("the rail starts on Look", () => {
  assert.equal(FIRST_RAIL_PART, "look");
});

test("the paper preview shows on Look only when Settings cover the paper", () => {
  assert.equal(showsPreview("inside", "look"), true);
  assert.equal(showsPreview("inside", "pages"), false);
  assert.equal(showsPreview("beside", "look"), false);
});

test("Down and Up move through the rail and stop at its ends", () => {
  assert.equal(railMove("look", "ArrowDown"), "pages");
  assert.equal(railMove("pages", "ArrowUp"), "look");
  assert.equal(railMove("look", "ArrowUp"), "look");
  assert.equal(railMove("help", "ArrowDown"), "help");
});

test("other keys leave the rail where it is", () => {
  assert.equal(railMove("tabs", "Tab"), null);
});

test("the preview shows a heading and two lines", () => {
  const preview = paperPreview(readLook(undefined));
  assert.ok(preview.heading);
  assert.equal(preview.lines.length, 2);
});

test("the preview is drawn in the chosen paper", () => {
  const preview = paperPreview(readLook({ paper: "Aurora" }));
  assert.equal(preview.vars["--preview-paper"], "#151e35");
  assert.equal(preview.vars["--preview-ink"], "#e4ecfa");
  assert.equal(preview.pattern, "ruled");
  assert.equal(paperPreview(readLook({ paper: "Engineer" })).pattern, "grid");
});

test("the preview is written in the paper's own font or the chosen one", () => {
  assert.match(paperPreview(readLook({ paper: "Desert" })).vars["--preview-font"], /^Caveat/);
  assert.match(paperPreview(readLook({ paper: "Desert", font: "Montserrat" })).vars["--preview-font"], /^Montserrat/);
});

test("a bigger text size makes the preview's text bigger", () => {
  const size = (textSize) => Number.parseFloat(paperPreview(readLook({ textSize })).vars["--preview-text-size"]);
  assert.ok(size(150) > size(100));
  assert.ok(size(85) < size(100));
});

test("the look's line names the Course layout once it is chosen (#126)", () => {
  assert.equal(partValue("look", state({ look: readLook({ layout: "course" }) })), "Glacier paper, its own font, text 100 %, Course layout");
});

test("searching for course or layout finds How your notes look", () => {
  assert.deepEqual(matchingParts("course"), ["look"]);
  assert.deepEqual(matchingParts("layout"), ["look"]);
});
