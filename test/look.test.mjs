import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAPERS,
  paperGroups,
  FONT_OVERRIDES,
  fontPreview,
  TEXT_SIZE,
  readLook,
  lookStyle,
  wholeRows,
  applyLook,
} from "../src/look.mjs";

const px = (value) => Number.parseFloat(value);

test("Glacier is the paper until another one is chosen", () => {
  assert.deepEqual(readLook(undefined), { paper: "Glacier", font: "Theme default", textSize: 100, pages: false, newPageAtEnd: true, layout: "zen" });
});

test("the layout is Zen until Course is chosen, and an unknown one goes back to Zen", () => {
  assert.equal(readLook({ paper: "Forest" }).layout, "zen");
  assert.equal(readLook({ layout: "course" }).layout, "course");
  assert.equal(readLook({ layout: "tabs" }).layout, "zen");
});

test("New page at the end of notes shows until it is hidden, and then stays hidden", () => {
  assert.equal(readLook({ paper: "Forest" }).newPageAtEnd, true);
  assert.equal(readLook({ newPageAtEnd: false }).newPageAtEnd, false);
  assert.equal(readLook({ newPageAtEnd: "no" }).newPageAtEnd, true);
});

test("notes as pages is off until it is switched on, and then stays on", () => {
  assert.equal(readLook({ paper: "Forest" }).pages, false);
  assert.equal(readLook({ pages: true }).pages, true);
  assert.equal(readLook({ pages: "yes" }).pages, false);
});

test("the five Classic papers can be chosen", () => {
  const classics = PAPERS.filter((paper) => paper.group === "Classics").map((paper) => paper.name);
  assert.deepEqual(classics, ["Blank Page", "School Notebook", "Chalkboard", "Moleskine", "Engineer"]);
  for (const name of classics) assert.equal(lookStyle(readLook({ paper: name })).paper, name);
});

test("a saved paper that no longer exists falls back to Glacier", () => {
  assert.equal(readLook({ paper: "Velvet" }).paper, "Glacier");
});

test("each Classic paper draws its own pattern and default font", () => {
  const style = (paper) => lookStyle(readLook({ paper }));
  assert.equal(style("Blank Page").pattern, "none");
  assert.equal(style("School Notebook").pattern, "margin");
  assert.equal(style("Chalkboard").pattern, "none");
  assert.equal(style("Moleskine").pattern, "ruled");
  assert.equal(style("Engineer").pattern, "grid");
  assert.equal(style("School Notebook").font, "Patrick Hand");
  assert.equal(style("Chalkboard").font, "Kalam");
  assert.equal(style("Moleskine").font, "Kalam Light");
  assert.equal(style("Engineer").font, "Architects Daughter");
});

test("Aurora and Chalkboard are the dark papers", () => {
  const dark = PAPERS.filter((paper) => paper.dark).map((paper) => paper.name);
  assert.deepEqual(dark, ["Aurora", "Chalkboard"]);
});

test("settings show the papers as two groups, Nature and then Classics", () => {
  const groups = paperGroups().map(({ group, papers }) => [group, papers.map((paper) => paper.name)]);
  assert.deepEqual(groups, [
    ["Nature", ["Glacier", "Forest", "Ocean", "Desert", "Volcano", "Aurora"]],
    ["Classics", ["Blank Page", "School Notebook", "Chalkboard", "Moleskine", "Engineer"]],
  ]);
});

test("the six Nature papers can be chosen, each with its own default font", () => {
  const style = (paper) => lookStyle(readLook({ paper }));
  for (const name of ["Glacier", "Forest", "Ocean", "Desert", "Volcano", "Aurora"]) {
    assert.equal(style(name).paper, name);
    assert.equal(style(name).pattern, "ruled");
  }
  assert.equal(style("Glacier").font, "Shantell Sans");
  assert.equal(style("Forest").font, "Patrick Hand");
  assert.equal(style("Ocean").font, "Shantell Sans");
  assert.equal(style("Desert").font, "Caveat");
  assert.equal(style("Volcano").font, "Kalam Light");
  assert.equal(style("Aurora").font, "Shantell Sans");
});

test("each Nature paper has its own panorama and the Classics have none", () => {
  const art = (paper) => lookStyle(readLook({ paper })).art;
  assert.deepEqual(
    ["Glacier", "Forest", "Ocean", "Desert", "Volcano", "Aurora"].map(art),
    ["glacier", "forest", "ocean", "desert", "volcano", "aurora"],
  );
  for (const paper of ["Blank Page", "School Notebook", "Chalkboard", "Moleskine", "Engineer"]) {
    assert.equal(art(paper), null);
  }
});

for (const paper of ["Glacier", "Aurora"]) {
  for (const textSize of [85, 150]) {
    test(`${paper} at ${textSize} % leaves room for the panorama below the last line`, () => {
      const style = lookStyle(readLook({ paper, textSize }));
      const panorama = px(style.vars["--panorama-height"]);
      assert.ok(panorama > 0);
      assert.ok(px(style.vars["--note-bottom"]) >= panorama + style.lineHeight);
    });
  }
}

test("the panorama keeps its height when the text size changes", () => {
  const at = (textSize) => lookStyle(readLook({ textSize })).vars["--panorama-height"];
  assert.equal(at(85), at(150));
});

test("a Classic paper has no panorama to leave room for", () => {
  const style = lookStyle(readLook({ paper: "School Notebook" }));
  assert.equal(style.vars["--panorama-height"], "0px");
});

test("the Font Override offers the six fonts and Theme default", () => {
  assert.deepEqual(FONT_OVERRIDES, [
    "Theme default",
    "Shantell Sans",
    "Patrick Hand",
    "Kalam Light",
    "Caveat",
    "Architects Daughter",
    "Montserrat",
  ]);
});

test("Montserrat can be chosen as the Font Override", () => {
  const look = readLook({ paper: "Glacier", font: "Montserrat" });
  assert.equal(lookStyle(look).font, "Montserrat");
  assert.match(lookStyle(look).vars["--font-family"], /Montserrat/);
});

test("each font choice is shown in its own font, Theme default in the paper's", () => {
  assert.deepEqual(fontPreview("Caveat", "Glacier"), { family: "Caveat", weight: 400 });
  assert.deepEqual(fontPreview("Kalam Light", "Glacier"), { family: "Kalam", weight: 300 });
  assert.deepEqual(fontPreview("Montserrat", "Glacier"), { family: "Montserrat", weight: 400 });
  assert.deepEqual(fontPreview("Theme default", "Engineer"), { family: '"Architects Daughter"', weight: 400 });
});

test("a Font Override stays when the paper changes", () => {
  const look = readLook({ paper: "School Notebook", font: "Caveat" });
  const changed = readLook({ ...look, paper: "Engineer" });
  assert.equal(lookStyle(changed).font, "Caveat");
  assert.match(lookStyle(changed).vars["--font-family"], /Caveat/);
});

test("Theme default gives each paper its own font again", () => {
  const look = readLook({ paper: "Engineer", font: "Theme default" });
  assert.equal(lookStyle(look).font, "Architects Daughter");
});

test("Kalam Light is Kalam at its light weight", () => {
  const vars = lookStyle(readLook({ font: "Kalam Light" })).vars;
  assert.match(vars["--font-family"], /Kalam/);
  assert.equal(vars["--font-weight"], "300");
});

test("the text size runs from 85 to 150 percent", () => {
  assert.equal(TEXT_SIZE.min, 85);
  assert.equal(TEXT_SIZE.max, 150);
  assert.equal(readLook({ textSize: 40 }).textSize, 85);
  assert.equal(readLook({ textSize: 400 }).textSize, 150);
  assert.equal(readLook({ textSize: "big" }).textSize, 100);
});

test("bigger text gets more line spacing, so the rows grow with it", () => {
  const at = (textSize) => lookStyle(readLook({ textSize }));
  assert.ok(at(85).lineHeight < at(100).lineHeight);
  assert.ok(at(100).lineHeight < at(150).lineHeight);
  assert.ok(px(at(85).vars["--text-size"]) < px(at(150).vars["--text-size"]));
});

for (const font of FONT_OVERRIDES) {
  for (const textSize of [85, 100, 150]) {
    test(`${font} at ${textSize} % sits on the ruled line`, () => {
      const style = lookStyle(readLook({ paper: "School Notebook", font, textSize }));
      // Whole pixels, so the lines don't drift away from the text further down.
      assert.ok(Number.isInteger(style.lineHeight));
      assert.ok(Number.isInteger(px(style.vars["--rule-shift"])));
      assert.equal(style.vars["--line-height"], `${style.lineHeight}px`);
      // The rule is just under the letters: not above the baseline, and
      // closer to it than a descender's length.
      const ruleTop = style.lineHeight - 1 - px(style.vars["--rule-shift"]);
      assert.ok(ruleTop >= style.baseline, `rule at ${ruleTop}, baseline at ${style.baseline}`);
      assert.ok(ruleTop <= style.baseline + 0.15 * style.textSize, `rule at ${ruleTop}, baseline at ${style.baseline}`);
      // The letters fit in the row.
      assert.ok(ruleTop + 1 <= style.lineHeight);
    });
  }
}

test("a block that is not a whole number of rows is padded to the next row", () => {
  assert.equal(wholeRows(70, 29), 87);
  assert.equal(wholeRows(58, 29), 58);
  assert.equal(wholeRows(58.3, 29), 58);
  assert.equal(wholeRows(0, 29), 0);
});

test("applying a look sets the Theme's colours and its colour scheme on the page", () => {
  const set = {};
  const root = { style: { setProperty: (name, value) => (set[name] = value), colorScheme: "" } };
  const style = applyLook(root, readLook({ paper: "Chalkboard" }));
  assert.equal(set["--paper"], "#3b4a44");
  assert.equal(set["--ink"], "#eceee6");
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(style.paper, "Chalkboard");
});
