// The pixel page turn (#108): the frames of a page folding away from its
// bottom right corner to the top left, drawn in big square pixels so every
// edge steps like pixel art. Pure, so node --test can check it; the sidebar
// turns each frame into two clip-path outlines (sidebar/page-view.js).
//
// The fold is the line x + y = c. What lies above it (x + y <= c) is the
// part of the page still flat; what lies below has folded over, and its
// back shows mirrored across the fold: the mirror of a point (x, y) is
// (c - y, c - x).

// Round down to whole pixels.
const snap = (value, pixel) => Math.floor(value / pixel) * pixel;

// The flat part of the page: for each column of pixels, the page reaches
// down to the fold. An outline of points [x, y], or [] when nothing is left.
function sheetOutline(width, height, c, pixel) {
  const columns = [];
  for (let x = 0; x < width; x += pixel) {
    const reach = Math.min(height, Math.max(0, snap(c - (x + pixel / 2), pixel)));
    columns.push({ x, end: Math.min(x + pixel, width), reach });
  }
  if (columns.every(({ reach }) => reach === 0)) return [];
  const steps = columns.flatMap(({ x, end, reach }) => [[x, reach], [end, reach]]);
  return [[0, 0], ...steps, [width, 0]];
}

// The folded back of the corner: the columns from the fold's mirror of the
// page's bottom edge (x = c - height) up to the fold, each from the mirror of
// the right edge (y = c - width) down to the fold.
function backOutline(width, height, c, pixel) {
  const top = Math.max(0, snap(c - width, pixel));
  const columns = [];
  for (let x = Math.max(0, snap(c - height, pixel)); x < Math.min(width, c); x += pixel) {
    const bottom = Math.min(height, snap(c - (x + pixel / 2), pixel));
    if (bottom > top) columns.push({ x, end: Math.min(x + pixel, width), bottom });
  }
  if (columns.length === 0) return [];
  const first = columns[0].x;
  const last = columns.at(-1).end;
  const steps = columns.reverse().flatMap(({ x, end, bottom }) => [[end, bottom], [x, bottom]]);
  return [[first, top], [last, top], ...steps];
}

// The frames of a turn of a page `width` by `height`: `count` frames from the
// whole page (the first) to nothing left (the last), in pixels of `pixel`.
// Each frame is { sheet, back }, two outlines of points [x, y].
export function turnFrames(width, height, { count = 8, pixel = 8 } = {}) {
  return Array.from({ length: count }, (_, k) => {
    const c = (width + height) * (1 - k / (count - 1));
    return { sheet: sheetOutline(width, height, c, pixel), back: backOutline(width, height, c, pixel) };
  });
}
