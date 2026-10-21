import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PAPERS } from "../src/look.mjs";
import { WELCOME_LINES } from "../src/guidance.mjs";
import { noteMenu } from "../src/menu-contents.mjs";
import { newNoteChoices } from "../src/new-note-choices.mjs";

const path = (file) => new URL(`../${file}`, import.meta.url);
const manifest = JSON.parse(readFileSync(path("manifest.json"), "utf8"));

test("every Nature paper has its panorama drawn", () => {
  for (const paper of PAPERS.filter((p) => p.group === "Nature")) {
    assert.ok(existsSync(path(`art/${paper.art}.svg`)), `art/${paper.art}.svg`);
  }
});

test("the panel stylesheet shows each panorama", () => {
  const css = readFileSync(path("sidebar/panel.css"), "utf8");
  for (const paper of PAPERS.filter((p) => p.art)) {
    assert.ok(css.includes(`url("../art/${paper.art}.svg")`), paper.art);
  }
});

test("the welcome scene is drawn for light and dark papers", () => {
  const css = readFileSync(path("sidebar/panel.css"), "utf8");
  for (const file of ["welcome-day", "welcome-night"]) {
    assert.ok(existsSync(path(`art/${file}.svg`)), file);
    assert.ok(css.includes(`url("../art/${file}.svg")`), file);
  }
});

test("every welcome line's picture is drawn", () => {
  for (const { icon } of WELCOME_LINES) {
    assert.ok(existsSync(path(`art/icon-${icon}.svg`)), icon);
  }
});

test("every picture in the top bar and its menus is drawn", () => {
  const menu = noteMenu({ title: "A" });
  const icons = [
    "list",
    ...[...menu.big, menu.delete, ...menu.help].map((action) => action.icon),
    ...newNoteChoices({ website: { title: "A" } }).map((choice) => choice.icon),
  ];
  for (const icon of icons) assert.ok(existsSync(path(`art/icon-${icon}.svg`)), icon);
});

test("the toolbar icon is the glacier art in both browsers", () => {
  const icons = [manifest.icons, manifest.action.default_icon, manifest.sidebar_action.default_icon];
  for (const set of icons) {
    assert.ok(set && Object.keys(set).length > 0);
    for (const file of Object.values(set)) {
      assert.match(file, /^icons\/glacier-\d+\.png$/);
      assert.ok(existsSync(path(file)), file);
    }
  }
});

test("the round button and the settings header show the same glacier art", () => {
  // The settings header is drawn by settings-view.js, inside the sidebar and
  // beside it (#21).
  const html = readFileSync(path("sidebar/panel.html"), "utf8");
  const view = readFileSync(path("sidebar/settings-view.js"), "utf8");
  assert.match(html, /src="\.\.\/icons\/glacier\.svg"/);
  assert.match(view, /\.src = "\.\.\/icons\/glacier\.svg"/);
  assert.ok(existsSync(path("icons/glacier.svg")));
});
