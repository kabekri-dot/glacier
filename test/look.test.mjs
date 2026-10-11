import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAPERS,
  FONT_OVERRIDES,
  TEXT_SIZE,
  readLook,
  lookStyle,
  wholeRows,
} from "../src/look.mjs";

const px = (value) => Number.parseFloat(value);

test("Glacier is the paper until another one is chosen", () => {
  assert.deepEqual(readLook(undefined), { paper: "Glacier", font: "Theme default", textSize: 100 });
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

test("Chalkboard is the dark paper", () => {
  const dark = PAPERS.filter((paper) => paper.dark).map((paper) => paper.name);
  assert.deepEqual(dark, ["Chalkboard"]);
});

test("the Font Override offers the five fonts and Theme default", () => {
  assert.deepEqual(FONT_OVERRIDES, [
    "Theme default",
    "Shantell Sans",
    "Patrick Hand",
    "Kalam Light",
    "Caveat",
    "Architects Daughter",
  ]);
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
