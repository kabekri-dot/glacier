// The look of the Notebook (#18): which paper, which font and how big the
// text is. Each Theme is plain data; lookStyle turns the chosen look into the
// CSS custom properties the panel sets on the page. Pure, so it can be tested
// with node --test. The choice is kept per browser by the panel.

// Each paper: its colours, its pattern ("ruled", "margin" for ruled with a
// red margin line, "grid", or "none") and its default font. "top" is the
// tint at the top of the page.
export const PAPERS = [
  {
    name: "Glacier",
    group: "Nature",
    paper: "#eef4fb",
    top: "#dcebfb",
    rule: "#c7dcf2",
    ink: "#1b2a4a",
    accent: "#3f78c4",
    pattern: "ruled",
    font: "Shantell Sans",
  },
  {
    name: "Blank Page",
    group: "Classics",
    paper: "#faf7f0",
    top: "#faf7f0",
    rule: "#e6e0d3",
    ink: "#33363b",
    accent: "#4d6a8f",
    pattern: "none",
    font: "Shantell Sans",
  },
  {
    name: "School Notebook",
    group: "Classics",
    paper: "#ffffff",
    top: "#ffffff",
    rule: "#bcd0ee",
    margin: "#e8a09c",
    ink: "#1f2f6b",
    accent: "#c8372d",
    pattern: "margin",
    font: "Patrick Hand",
  },
  {
    name: "Chalkboard",
    group: "Classics",
    paper: "#3b4a44",
    top: "#34423c",
    rule: "#56665f",
    ink: "#eceee6",
    accent: "#f1e3a0",
    pattern: "none",
    font: "Kalam",
    dark: true,
  },
  {
    name: "Moleskine",
    group: "Classics",
    paper: "#f6efdc",
    top: "#f6efdc",
    rule: "#ebe2c9",
    ink: "#1e1b18",
    accent: "#7a1f2b",
    pattern: "ruled",
    font: "Kalam Light",
  },
  {
    name: "Engineer",
    group: "Classics",
    paper: "#eaf3e3",
    top: "#eaf3e3",
    rule: "#cfe2c4",
    major: "#a9cb98",
    ink: "#3a3d40",
    accent: "#e0731f",
    pattern: "grid",
    font: "Architects Daughter",
  },
];

// The bundled fonts. Ascent and descent are the fonts' own vertical metrics
// (in em), which decide where the browser puts the baseline in a row. Scale
// evens out how big the letters look: Caveat is small for its size.
const FONTS = [
  { name: "Shantell Sans", family: '"Shantell Sans"', weight: 400, ascent: 1.02, descent: 0.32, scale: 1 },
  { name: "Patrick Hand", family: '"Patrick Hand"', weight: 400, ascent: 1.042, descent: 0.312, scale: 1.05 },
  { name: "Kalam", family: "Kalam", weight: 400, ascent: 1.063, descent: 0.531, scale: 0.95 },
  { name: "Kalam Light", family: "Kalam", weight: 300, ascent: 1.063, descent: 0.531, scale: 0.95 },
  { name: "Caveat", family: "Caveat", weight: 400, ascent: 0.96, descent: 0.3, scale: 1.2 },
  { name: "Architects Daughter", family: '"Architects Daughter"', weight: 400, ascent: 0.986, descent: 0.403, scale: 1 },
];

export const FONT_OVERRIDES = [
  "Theme default",
  "Shantell Sans",
  "Patrick Hand",
  "Kalam Light",
  "Caveat",
  "Architects Daughter",
];

export const TEXT_SIZE = { min: 85, max: 150, step: 5, standard: 100 };

// At 100 %: the text size and the height of one ruled row, in pixels.
const BASE_TEXT = 16.8;
const BASE_ROW = 28.8;

// A saved look, cleaned up: anything unknown goes back to the default, and
// the text size stays within the slider's range.
export function readLook(saved) {
  const paper = PAPERS.some((p) => p.name === saved?.paper) ? saved.paper : "Glacier";
  const font = FONT_OVERRIDES.includes(saved?.font) ? saved.font : "Theme default";
  const size = Number(saved?.textSize);
  const textSize = Number.isFinite(size)
    ? Math.min(TEXT_SIZE.max, Math.max(TEXT_SIZE.min, Math.round(size)))
    : TEXT_SIZE.standard;
  return { paper, font, textSize };
}

// Everything the panel needs to draw a look. The row height is whole pixels
// so the ruled lines never drift away from the text further down the page,
// and the rule is moved up to sit just under the letters' baseline.
export function lookStyle(look) {
  const paper = PAPERS.find((p) => p.name === look.paper);
  const fontName = look.font === "Theme default" ? paper.font : look.font;
  const font = FONTS.find((f) => f.name === fontName);

  const textSize = Math.round(BASE_TEXT * font.scale * look.textSize * 10) / 1000;
  const lineHeight = Math.round((BASE_ROW * look.textSize) / 100);
  // The browser centres the font's ascent plus descent in the row, so the
  // baseline sits this far below the row's top.
  const baseline = lineHeight / 2 + ((font.ascent - font.descent) * textSize) / 2;
  const ruleTop = Math.ceil(baseline + 0.04 * textSize);
  // The pattern draws its rule on the row's last pixel; this lifts it.
  const ruleShift = lineHeight - 1 - ruleTop;

  const ink = rgb(paper.ink);
  return {
    paper: paper.name,
    pattern: paper.pattern,
    dark: Boolean(paper.dark),
    font: fontName,
    textSize,
    lineHeight,
    baseline,
    vars: {
      "--paper": paper.paper,
      "--paper-top": paper.top,
      "--rule": paper.rule,
      "--rule-major": paper.major ?? paper.rule,
      "--margin-line": paper.margin ?? paper.rule,
      "--ink": paper.ink,
      "--accent": paper.accent,
      "--tint": `rgba(${ink}, 0.07)`,
      "--shadow": paper.dark ? "rgba(0, 0, 0, 0.45)" : `rgba(${ink}, 0.18)`,
      "--field": paper.dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.7)",
      "--missing": paper.dark ? "#ff9e94" : "#b3261e",
      "--font-family": `${font.family}, "Comic Sans MS", cursive, sans-serif`,
      "--font-weight": String(font.weight),
      "--text-size": `${textSize}px`,
      "--line-height": `${lineHeight}px`,
      "--rule-shift": `${ruleShift}px`,
    },
  };
}

// The height a block needs to end on a ruled line: its own height rounded up
// to whole rows. Half a pixel of rounding is not a row.
export function wholeRows(height, lineHeight) {
  return Math.max(0, Math.ceil((height - 0.5) / lineHeight) * lineHeight);
}

function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
}
